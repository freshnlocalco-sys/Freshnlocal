#!/usr/bin/env node
/**
 * Firestore `reviews` -> Supabase `web_reviews`.
 *
 * The one table the original migration never backfilled. It still has 0 rows,
 * which is why ProductReviews.tsx cannot be pointed at Supabase yet: moving the
 * reads first would silently empty every product's reviews.
 *
 * NO SERVICE ACCOUNT NEEDED. firestore.rules has `allow read, list: if true`
 * for reviews -- they are shown to anonymous visitors on product pages -- so
 * this reads them the same way a browser does, through the Firebase SDK with
 * the public config. (The Firestore REST API answers 403 for the same data,
 * which is a quirk of that API rather than a rules problem; the SDK path is
 * what the other scripts in here use too.)
 *
 * Firestore is only ever read.
 *
 * WHAT CAN GO WRONG, AND WHAT THIS DOES ABOUT IT
 *
 * web_reviews has two foreign keys and a unique index that Firestore never
 * had, so not every document can simply be inserted:
 *
 *   web_product_id -> web_products(id)   a review of a product that has since
 *                                        been deleted cannot be stored
 *   user_id        -> web_users(id)      nor one by an account that is gone
 *   uq_web_reviews_one_per_user_live     (web_product_id, user_id) where live:
 *                                        Firestore allowed the same shopper to
 *                                        review one product twice
 *
 * Orphans are reported and skipped -- never invented. Duplicates keep the
 * newest as the live review and store the older ones soft-deleted, so nothing a
 * customer wrote is thrown away.
 *
 * Output carries ids and counts, never names or comment text.
 *
 *   node scripts/backfillReviewsToSupabase.mjs            # report only
 *   node scripts/backfillReviewsToSupabase.mjs --apply    # write, then verify
 */

import { readFile } from 'fs/promises';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const APPLY = process.argv.includes('--apply');

// --- env --------------------------------------------------------------------
const env = {};
for (const line of (await readFile('.env', 'utf8')).split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const SB_URL = (env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SB_URL || !SB_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.');
  process.exit(1);
}
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

async function sbGet(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`read ${path} failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function sbReadAll(table, select) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await sbGet(`${table}?select=${select}&order=id.asc&limit=1000&offset=${offset}`);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

// --- Firestore --------------------------------------------------------------
const cfg = JSON.parse(await readFile('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(cfg);
const fs = getFirestore(app, cfg.firestoreDatabaseId || '(default)');

console.log('Reading Firestore reviews…');
const snap = await getDocs(collection(fs, 'reviews'));
const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
console.log(`  ${docs.length} document(s)\n`);

if (docs.length === 0) {
  console.log('Nothing to backfill. web_reviews stays empty, and ProductReviews can move as soon as you like.');
  process.exit(0);
}

// --- what exists on the Supabase side ---------------------------------------
const [products, users, existing] = await Promise.all([
  sbReadAll('web_products', 'id'),
  sbReadAll('web_users', 'id'),
  sbReadAll('web_reviews', 'id'),
]);
const productIds = new Set(products.map(p => p.id));
const userIds = new Set(users.map(u => u.id));
const alreadyThere = new Set(existing.map(r => r.id));
console.log(`Supabase: ${productIds.size} products, ${userIds.size} users, ${alreadyThere.size} existing review(s).\n`);

// --- map and sort out the problems ------------------------------------------
const toIso = v => {
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return new Date(n).toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};

const skipped = { noProduct: [], noUser: [], badRating: [], alreadyThere: [] };
const mapped = [];

for (const d of docs) {
  if (alreadyThere.has(d.id)) { skipped.alreadyThere.push(d.id); continue; }
  if (!productIds.has(d.productId)) { skipped.noProduct.push({ id: d.id, productId: d.productId }); continue; }
  if (!userIds.has(d.userId)) { skipped.noUser.push({ id: d.id, userId: d.userId }); continue; }

  const rating = Math.round(Number(d.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    skipped.badRating.push({ id: d.id, rating: d.rating });
    continue;
  }

  mapped.push({
    id: d.id,
    web_product_id: d.productId,
    user_id: d.userId,
    user_name: String(d.userName ?? '').slice(0, 100),
    rating,
    comment: String(d.comment ?? ''),
    created_at: toIso(d.createdAt),
    is_deleted: false,
    deleted_on: null,
    deleted_by: null,
  });
}

// Duplicates: one live review per shopper per product. Newest wins; the rest
// are kept soft-deleted rather than dropped, because a customer wrote them.
const byPair = new Map();
for (const r of mapped) {
  const k = `${r.web_product_id}\u0000${r.user_id}`;
  if (!byPair.has(k)) byPair.set(k, []);
  byPair.get(k).push(r);
}
let demoted = 0;
for (const [, group] of byPair) {
  if (group.length < 2) continue;
  group.sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const older of group.slice(1)) {
    older.is_deleted = true;
    older.deleted_on = older.created_at;
    older.deleted_by = 'backfill: duplicate review';
    demoted++;
  }
}

// --- report -----------------------------------------------------------------
const live = mapped.filter(r => !r.is_deleted).length;
console.log(`Ready to write ${mapped.length} review(s): ${live} live, ${demoted} superseded duplicate(s).`);
if (skipped.alreadyThere.length) console.log(`  ${skipped.alreadyThere.length} already in web_reviews, skipped.`);
if (skipped.noProduct.length) {
  console.log(`  ${skipped.noProduct.length} skipped: the product no longer exists`);
  for (const s of skipped.noProduct.slice(0, 10)) console.log(`      review ${s.id} -> product ${s.productId}`);
  if (skipped.noProduct.length > 10) console.log(`      …and ${skipped.noProduct.length - 10} more`);
}
if (skipped.noUser.length) {
  console.log(`  ${skipped.noUser.length} skipped: no such account in web_users`);
  for (const s of skipped.noUser.slice(0, 10)) console.log(`      review ${s.id} -> user ${s.userId}`);
  if (skipped.noUser.length > 10) console.log(`      …and ${skipped.noUser.length - 10} more`);
}
if (skipped.badRating.length) {
  console.log(`  ${skipped.badRating.length} skipped: rating outside 1-5`);
}

const ratings = mapped.filter(r => !r.is_deleted).reduce((a, r) => (a[r.rating] = (a[r.rating] || 0) + 1, a), {});
console.log('  live ratings:', Object.keys(ratings).sort().map(k => `${k}★ ${ratings[k]}`).join('  ') || '(none)');

if (!mapped.length) { console.log('\nNothing to write.'); process.exit(0); }

if (!APPLY) {
  console.log('\nDry run. Nothing was written. Re-run with --apply.');
  process.exit(0);
}

// --- write ------------------------------------------------------------------
// Soft-deleted duplicates first: the unique index covers live rows only, so
// inserting them before their live sibling can never collide, whatever order
// Postgres applies a batch in.
const order = [...mapped.filter(r => r.is_deleted), ...mapped.filter(r => !r.is_deleted)];

let written = 0;
for (let i = 0; i < order.length; i += 200) {
  const batch = order.slice(i, i + 200);
  const r = await fetch(`${SB_URL}/rest/v1/web_reviews`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(batch),
  });
  if (!r.ok) {
    console.error(`\nFAILED on rows ${i}-${i + batch.length - 1}: ${r.status} ${(await r.text()).slice(0, 400)}`);
    console.error('Reviews already written stay; re-running skips them.');
    process.exit(1);
  }
  written += batch.length;
  console.log(`  wrote ${written}/${order.length}`);
}

// --- verify -----------------------------------------------------------------
const after = await sbReadAll('web_reviews', 'id,is_deleted');
const liveAfter = after.filter(r => !r.is_deleted).length;
console.log(`\nweb_reviews now holds ${after.length} row(s): ${liveAfter} live, ${after.length - liveAfter} soft-deleted.`);
console.log(liveAfter === live + 0 ? 'Live count matches the plan.' : `NOTE: expected ${live} live from this run; check if some already existed.`);
process.exit(0);
