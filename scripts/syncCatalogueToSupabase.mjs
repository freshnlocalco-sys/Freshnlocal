#!/usr/bin/env node
/**
 * Firestore `products` and `settings` -> Supabase web_products,
 * web_product_variants and web_settings. The bulk pass.
 *
 * Run the schema change first:
 *     fresh-n-local/supabase/updates/supabase_web_catalogue_stock.sql
 *
 * Reads Firestore ANONYMOUSLY through the same client-SDK path the website and
 * scripts/generate-sitemap.js already use, so it needs no service account. It
 * writes to Supabase with the service role key from .env.
 *
 * The row shaping lives in ../catalogueTransform.mjs, shared with the per-write
 * mirror in server.ts so the two can never disagree.
 *
 * Dry run by default. Nothing is written without --apply.
 *
 *   node scripts/syncCatalogueToSupabase.mjs            # report only
 *   node scripts/syncCatalogueToSupabase.mjs --apply    # write
 */

import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { readFile } from 'fs/promises';
import {
  transformProduct, transformSetting, SETTINGS_KEYS,
} from '../catalogueTransform.mjs';

const APPLY = process.argv.includes('--apply');

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

const notes = [];
const note = (kind, msg) => notes.push(`${kind}: ${msg}`);

// --- read Firestore ---------------------------------------------------------
const config = JSON.parse(await readFile('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const fdb = initializeFirestore(app, { experimentalForceLongPolling: true },
  config.firestoreDatabaseId || 'ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67');

const snap = await getDocs(collection(fdb, 'products'));
const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
console.log(`Firestore: ${docs.length} product documents`);

// --- transform --------------------------------------------------------------
const products = [];
const variants = [];
for (const d of docs) {
  const out = transformProduct(d, note);
  if (!out) continue;
  products.push(out.product);
  variants.push(...out.variants);
}

// --- settings ---------------------------------------------------------------
// The six settings documents the storefront reads publicly.
// to Firestore since the 27 Oct backfill.
const settings = [];
{
  let settingsDocs;
  try {
    const s = await getDocs(collection(fdb, 'settings'));
    settingsDocs = s.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    // Listing the collection may not be permitted even where reading a known
    // document is, so fall back to fetching the six by name.
    settingsDocs = [];
    for (const key of SETTINGS_KEYS) {
      const s = await getDoc(doc(fdb, 'settings', key));
      if (s.exists()) settingsDocs.push({ id: key, ...s.data() });
    }
    note('settings-listed-by-name', 'could not list settings/, fetched the six known keys instead');
  }
  for (const d of settingsDocs) settings.push(transformSetting(d));
}

// --- compare against what is there now --------------------------------------
const q = async (path) => {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: H });
  if (!r.ok) { console.error(`read ${path} failed: ${r.status} ${await r.text()}`); process.exit(1); }
  return r.json();
};

const liveProducts = await q('web_products?select=id&limit=5000');
const liveVariants = await q('web_product_variants?select=id,sku&is_deleted=eq.false&limit=5000');
const liveProdIds = new Set(liveProducts.map(p => p.id));
const liveSkus = new Set(liveVariants.map(v => v.sku));
const newSkus = new Set(variants.map(v => v.sku));

const added = products.filter(p => !liveProdIds.has(p.id));
const orphanedSkus = [...liveSkus].filter(s => !newSkus.has(s));
const brandNewSkus = [...newSkus].filter(s => !liveSkus.has(s));

console.log(`\nProducts to write:    ${products.length}  (${added.length} new, ${products.length - added.length} existing)`);
console.log(`Variants to write:    ${variants.length}`);
console.log(`Out of stock:         ${products.filter(p => p.in_stock === false).length}  <- in_stock=false, must not be buyable`);
console.log(`Own retail option:    ${products.filter(p => p.price != null).length} priced, ${products.filter(p => p.unit).length} with a unit`);
console.log(`has_own_variants:     ${products.filter(p => p.has_own_variants).length} real / ${products.filter(p => !p.has_own_variants).length} synthesised`);
console.log(`Deactivated flag:     ${products.filter(p => p.is_deactivated).length}  (carried, NOT a visibility flag)`);
console.log(`item_code present:    ${products.filter(p => p.item_code).length}`);

const liveSettings = Object.fromEntries(
  (await q('web_settings?select=key,value')).map(r => [r.key, r.value]));
// Key order is not a difference. Postgres jsonb does not preserve insertion
// order, so comparing JSON.stringify output against a Firestore object reports
// every nested document as changed -- which is exactly what it did, and is why
// an earlier version of this script claimed five of the six settings had
// drifted when all six were identical. Canonicalise before comparing.
const canon = (v) => {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    return Object.keys(v).sort().reduce((a, k) => { a[k] = canon(v[k]); return a; }, {});
  }
  return v;
};
const sameValue = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

const changedSettings = settings.filter(s => !sameValue(liveSettings[s.key], s.value));
console.log(`Settings to write:    ${settings.length}  (${changedSettings.length} changed${changedSettings.length ? ': ' + changedSettings.map(s => s.key).join(', ') : ''})`);

if (added.length) {
  console.log('\nNew products:');
  for (const p of added) console.log(`   ${p.id}  ${JSON.stringify(p.name)}  in_stock=${p.in_stock}`);
}
if (brandNewSkus.length) console.log(`\nNew SKUs: ${brandNewSkus.length}`);
if (orphanedSkus.length) {
  // Loud, because web_sku_components and the ERP's platform_item_mappings point
  // at these strings. A SKU vanishing here is a mapping quietly going dead.
  console.log(`\n*** ${orphanedSkus.length} SKU(s) exist in Supabase but would no longer be produced:`);
  for (const s of orphanedSkus.slice(0, 40)) console.log(`      ${s}`);
  console.log('    Check web_sku_components / platform_item_mappings before applying.');
}
if (notes.length) {
  console.log('\nNotes:');
  for (const n of notes.slice(0, 30)) console.log(`   ${n}`);
}

// Refuse to write until the new columns exist, so the failure names its own fix
// instead of surfacing as a PostgREST schema error mid-batch.
if (APPLY) {
  const probe = await fetch(
    `${SB_URL}/rest/v1/web_products?select=in_stock,stock,unit,price,has_own_variants,item_code,is_deactivated&limit=1`,
    { headers: H });
  if (!probe.ok) {
    console.error('\nweb_products does not have the new columns yet.');
    console.error('Run this first, in the Supabase SQL editor:');
    console.error('  fresh-n-local/supabase/updates/supabase_web_catalogue_stock.sql');
    console.error(`\n(probe said ${probe.status}: ${(await probe.text()).slice(0, 200)})`);
    process.exit(1);
  }
}

// --- write ------------------------------------------------------------------
if (!APPLY) {
  console.log('\nDry run. Nothing written. Re-run with --apply to write.');
  process.exit(0);
}

const upsert = async (table, rows, conflict) => {
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const r = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=${conflict}`, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch),
    });
    if (!r.ok) { console.error(`\n${table} batch ${i} failed: ${r.status} ${await r.text()}`); process.exit(1); }
    process.stdout.write(`\r  ${table}: ${Math.min(i + 200, rows.length)}/${rows.length}`);
  }
  process.stdout.write('\n');
};

console.log('\nWriting...');
await upsert('web_products', products, 'id');
await upsert('web_product_variants', variants, 'id');
await upsert('web_settings', settings, 'key');
console.log('Done.');
process.exit(0);
