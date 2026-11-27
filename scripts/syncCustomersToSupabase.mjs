#!/usr/bin/env node
/**
 * Firestore `users`, `users/{id}/savedRecipes` and `users/{id}/recipeChat` ->
 * Supabase web_users, web_addresses, web_saved_recipes and web_recipe_chats.
 *
 * Use this, not the ERP repo's migrateFirestore.mjs, for a customer refresh.
 * That script rewrites every table, which would blank erp_party_name and
 * erp_pushed_at on web_orders. This one touches the four tables above and
 * nothing else. Orders are deliberately out of scope.
 *
 * Needs a Firebase service account: firestore.rules deny anonymous reads of
 * `users`, so the anonymous path syncCatalogueToSupabase.mjs uses cannot work.
 * Writes with the service role key from .env. The merge rules are in
 * lib/customerTransform.mjs.
 *
 * Safe to run more than once, and it must be: the live site keeps writing points
 * to Firestore, so this is a snapshot until sign-in and checkout move over.
 * Firestore is only ever read.
 *
 * Output carries uids and counts, never names, emails, phones or addresses.
 *
 *   node scripts/syncCustomersToSupabase.mjs                  # Supabase state only
 *   node scripts/syncCustomersToSupabase.mjs --service-account=<key.json>
 *                                                             # report, no writes
 *   node scripts/syncCustomersToSupabase.mjs --service-account=<key.json> \
 *        --apply --backup=<path outside this repo>            # write, then verify
 *
 * GOOGLE_APPLICATION_CREDENTIALS works in place of --service-account.
 */

import { readFile, writeFile } from 'fs/promises';
import { resolve, sep } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { planSync, planIsEmpty, SYNC_ACTOR } from './lib/customerTransform.mjs';

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const APPLY = process.argv.includes('--apply');
const BACKUP = arg('backup');
const SERVICE_ACCOUNT = arg('service-account') ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;

// --- env --------------------------------------------------------------------
const env = {};
for (const line of (await readFile('.env', 'utf8')).split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const SB_URL = env.SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.');
  process.exit(1);
}
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

if (APPLY && !SERVICE_ACCOUNT) {
  console.error('--apply needs --service-account=<path>.');
  process.exit(1);
}
if (APPLY && !BACKUP) {
  console.error('--apply needs --backup=<path>: overwritten balances cannot be recovered otherwise.');
  process.exit(1);
}
if (BACKUP && (resolve(BACKUP) + sep).startsWith(resolve('.') + sep)) {
  console.error('--backup must be outside this repo: it is the customer list.');
  process.exit(1);
}

// --- Supabase ---------------------------------------------------------------
async function fetchAll(table) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?select=*&order=id&limit=1000&offset=${offset}`, { headers: H });
    if (!r.ok) throw new Error(`read ${table} failed: ${r.status} ${await r.text()}`);
    const page = await r.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const readLive = async () => ({
  users: await fetchAll('web_users'),
  addresses: await fetchAll('web_addresses'),
  recipes: await fetchAll('web_saved_recipes'),
  chats: await fetchAll('web_recipe_chats'),
});

async function upsert(table, rows, size) {
  for (let i = 0; i < rows.length; i += size) {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=id`, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + size)),
    });
    if (!r.ok) throw new Error(`upsert ${table} failed: ${r.status} ${await r.text()}`);
  }
}

async function patchIds(table, ids, body) {
  for (let i = 0; i < ids.length; i += 100) {
    const list = ids.slice(i, i + 100).map(id => `"${id}"`).join(',');
    const r = await fetch(`${SB_URL}/rest/v1/${table}?id=in.(${encodeURIComponent(list)})`, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`patch ${table} failed: ${r.status} ${await r.text()}`);
  }
}

const live = await readLive();
const liveSum = live.users.reduce((s, u) => s + Number(u.points), 0);
console.log('Supabase now:');
console.log(`  web_users           ${live.users.length}  (${live.users.filter(u => !u.is_deleted).length} live, ${liveSum} points)`);
console.log(`  web_addresses       ${live.addresses.length}  (${live.addresses.filter(a => !a.is_deleted).length} live)`);
console.log(`  web_saved_recipes   ${live.recipes.length}`);
console.log(`  web_recipe_chats    ${live.chats.length}`);

if (!SERVICE_ACCOUNT) {
  console.log('\nNo service account given, so Firestore was not read and nothing was compared.');
  console.log('Pass --service-account=<key.json> for the report.');
  process.exit(0);
}

// --- read Firestore ---------------------------------------------------------
const sa = JSON.parse(await readFile(SERVICE_ACCOUNT, 'utf8'));
const config = JSON.parse(await readFile('./firebase-applet-config.json', 'utf8'));
if (sa.project_id !== config.projectId) {
  console.error(`STOP: that key is for ${sa.project_id}, the storefront is ${config.projectId}.`);
  process.exit(1);
}
if (!config.firestoreDatabaseId) {
  console.error('STOP: no firestoreDatabaseId. The storefront does not use (default), which is empty.');
  process.exit(1);
}
const fdb = getFirestore(initializeApp({ credential: cert(sa) }), config.firestoreDatabaseId);

const docsOf = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
const userSnap = await fdb.collection('users').get();

// A failed read must stop the run. Treating it as an empty list would
// soft-delete that customer's saved rows.
const firestoreUsers = [];
for (const u of userSnap.docs) {
  const [savedRecipes, recipeChat] = await Promise.all([
    u.ref.collection('savedRecipes').get().then(docsOf),
    u.ref.collection('recipeChat').get().then(docsOf),
  ]);
  firestoreUsers.push({ ...u.data(), id: u.id, savedRecipes, recipeChat });
}
console.log(`\nFirestore: ${firestoreUsers.length} users`);

// Far fewer users than Supabase already knows is the signature of the wrong
// database, not of customers leaving.
if (firestoreUsers.length < live.users.length * 0.9) {
  console.error(`STOP: ${firestoreUsers.length} Firestore users against ${live.users.length} in Supabase. Wrong database?`);
  process.exit(1);
}

// --- plan -------------------------------------------------------------------
const plan = planSync(firestoreUsers, live, new Date().toISOString());
const { stats, softDeletes } = plan;

console.log('\nTo write:');
console.log(`  web_users           ${plan.users.length}  (${stats.pointsChanged} with a new balance)`);
console.log(`  web_addresses       ${plan.addresses.length}  + ${softDeletes.web_addresses.length} removed in Firestore`);
console.log(`  web_saved_recipes   ${plan.recipes.length}  + ${softDeletes.web_saved_recipes.length} removed in Firestore`);
console.log(`  web_recipe_chats    ${plan.chats.length}  + ${softDeletes.web_recipe_chats.length} removed in Firestore`);
console.log(`\nPoints: Firestore ${stats.firestorePoints}, Supabase ${stats.livePoints}`);
console.log(`  of which ${stats.newCustomerPoints} belong to ${stats.newCustomers} customers not yet in Supabase`);

if (Object.keys(stats.changedColumns).length) {
  console.log('\nWhat changes, by column:');
  for (const [col, n] of Object.entries(stats.changedColumns).sort()) console.log(`  ${col}  ${n}`);
}

if (stats.roleChanges.length) {
  console.log(`\nRole changes (${stats.roleChanges.length}), these change access and pricing:`);
  for (const c of stats.roleChanges) console.log(`  ${c.id}  ${c.from} -> ${c.to}`);
}
if (stats.supabaseOnly.length) {
  console.log(`\nIn Supabase but not Firestore, left untouched: ${stats.supabaseOnly.length}`);
}
if (Object.keys(stats.unmappedFields).length) {
  console.log('\nFirestore fields with NO Supabase column, not copied:');
  for (const [f, n] of Object.entries(stats.unmappedFields)) console.log(`  ${f}  on ${n} documents`);
}
if (plan.notes.length) {
  const byKind = Object.groupBy(plan.notes, n => n.kind);
  console.log('\nNotes:');
  for (const [kind, list] of Object.entries(byKind)) {
    console.log(`  ${kind}: ${list.length}`);
    list.slice(0, 5).forEach(n => console.log(`      ${n.detail}`));
  }
}

if (!APPLY) {
  console.log('\nDry run. Nothing was written.');
  process.exit(0);
}

// --- write ------------------------------------------------------------------
// 'wx' refuses an existing file: a re-run after a failed write must not replace
// the only copy of the original rows with half-written ones.
await writeFile(BACKUP, JSON.stringify(live), { mode: 0o600, flag: 'wx' });
console.log(`\nBackup of the rows as they were: ${BACKUP}`);

const removed = { is_deleted: true, deleted_on: new Date().toISOString(), deleted_by: SYNC_ACTOR };

// Parents first, and stale or outgoing defaults before the addresses that
// replace them, for uq_web_addresses_one_default_live.
await upsert('web_users', plan.users, 200);
for (const [table, ids] of Object.entries(softDeletes)) await patchIds(table, ids, removed);
await patchIds('web_addresses', plan.clearDefaults, { is_default: false });
await upsert('web_addresses', plan.addresses, 200);
await upsert('web_saved_recipes', plan.recipes, 50);
await upsert('web_recipe_chats', plan.chats, 20);

// --- verify -----------------------------------------------------------------
// The same comparison again, against what is really there now. An empty plan
// means every field of every customer matches, not just the row counts.
const after = planSync(firestoreUsers, await readLive(), new Date().toISOString());
if (!planIsEmpty(after) || after.stats.firestorePoints !== after.stats.livePoints) {
  console.error('\nVERIFY FAILED: rows still differ after the write.');
  console.error(`  users ${after.users.length}, addresses ${after.addresses.length}, recipes ${after.recipes.length}, chats ${after.chats.length}`);
  console.error(`  points: Firestore ${after.stats.firestorePoints}, Supabase ${after.stats.livePoints}`);
  process.exit(1);
}
console.log(`\nVerified: Supabase matches Firestore. ${after.stats.livePoints} points across ${firestoreUsers.length - stats.skippedDeleted} customers.`);
