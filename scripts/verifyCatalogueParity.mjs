#!/usr/bin/env node
/**
 * Does the Supabase catalogue match Firestore, product for product?
 *
 * Run this after syncCatalogueToSupabase.mjs --apply and BEFORE setting
 * VITE_CATALOGUE_SOURCE=supabase. It is the gate on flipping a live shop: it
 * shapes both sources exactly as the storefront does and reports every
 * difference, so "it looked fine" is replaced by a count.
 *
 *   node scripts/verifyCatalogueParity.mjs
 *
 * Exits 0 when the two agree, 1 when they do not.
 */

import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs } from 'firebase/firestore';
import { readFile } from 'fs/promises';

const env = {};
for (const line of (await readFile('.env', 'utf8')).split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const SB_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const SB_KEY = env.VITE_SUPABASE_ANON_KEY;
if (!SB_URL || !SB_KEY) {
  console.error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be in .env.');
  process.exit(1);
}

// --- Firestore, shaped the way useProducts shapes it ------------------------
const config = JSON.parse(await readFile('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const fdb = initializeFirestore(app, { experimentalForceLongPolling: true },
  config.firestoreDatabaseId || 'ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67');

const snap = await getDocs(collection(fdb, 'products'));
const fsProducts = snap.docs.map(d => {
  const data = d.data();
  const pPrice = Number(data.price) || 0;
  const pMrp = Number(data.originalPrice) || Number(data.mrp) || Number(data.MRP) || 0;
  return {
    id: d.id,
    ...data,
    // Trimmed on this side too, because the sync trims when it writes --
    // inherited from migrateFirestore.mjs, which has always normalised strings.
    // 14 product names carry a trailing space in Firestore ("Cut fansi "), and
    // comparing raw against trimmed reports 14 differences that are the
    // normalisation working rather than anything being wrong. Trailing spaces
    // are invisible in HTML, so trimming is a straight improvement and the
    // check should hold the sync to its own rule, not to Firestore's typos.
    name: String(data.name ?? '').trim(),
    price: pPrice,
    originalPrice: pMrp > pPrice ? pMrp : undefined,
    horecaPrice: data.horecaPrice ? Number(data.horecaPrice) : undefined,
  };
});

// --- Supabase, shaped the way src/lib/catalogue.ts shapes it ----------------
const SELECT = [
  'id', 'name', 'category', 'description', 'meta_description', 'image_url', 'order_index',
  'use_base_pricing', 'base_price', 'base_unit', 'base_original_price', 'base_horeca_price',
  'in_stock', 'stock', 'unit', 'quantity_value', 'quantity_unit', 'pack_size',
  'price', 'original_price', 'horeca_price', 'horeca_unit', 'has_own_variants',
  'web_product_variants(unit,quantity_value,quantity_unit,pack_size,price,original_price,horeca_price,horeca_unit,position)',
].join(',');

const r = await fetch(
  `${SB_URL}/rest/v1/web_products?select=${encodeURIComponent(SELECT)}&order=id.asc&limit=5000`,
  { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
if (!r.ok) {
  const body = await r.text();
  console.error(`Supabase read failed: ${r.status} ${body.slice(0, 300)}`);
  if (body.includes('does not exist')) {
    console.error('\nThe new columns are missing. Run, in order:');
    console.error('  1. fresh-n-local/supabase/updates/supabase_web_catalogue_stock.sql');
    console.error('  2. node scripts/syncCatalogueToSupabase.mjs --apply');
  }
  process.exit(1);
}
const opt = v => (v === null || v === undefined ? undefined : Number(v));
const sbProducts = (await r.json()).map(row => {
  const price = Number(row.price) || 0;
  const mrp = Number(row.original_price) || 0;
  return {
    id: row.id,
    name: row.name,
    price,
    originalPrice: mrp > price ? mrp : undefined,
    // Mirrors src/lib/catalogue.ts exactly, truthiness included -- this check is
    // only worth anything if it shapes the data the way production does.
    horecaPrice: row.horeca_price ? Number(row.horeca_price) : undefined,
    horecaUnit: row.horeca_unit ?? undefined,
    imageUrl: row.image_url ?? '',
    category: row.category ?? '',
    unit: row.unit ?? undefined,
    inStock: row.in_stock !== false,
    orderIndex: opt(row.order_index),
    useBasePricing: row.use_base_pricing ?? undefined,
    basePrice: opt(row.base_price),
    variants: row.has_own_variants
      ? (row.web_product_variants ?? []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map(v => ({
            unit: v.unit ?? '', price: Number(v.price) || 0,
            originalPrice: opt(v.original_price), horecaPrice: opt(v.horeca_price),
            horecaUnit: v.horeca_unit ?? undefined,
          }))
      : undefined,
  };
});

// --- compare ----------------------------------------------------------------
// Only the fields the storefront actually renders. Comparing everything would
// flag the description's whitespace and tell us nothing about the shop.
const norm = v => (v === undefined || v === null || v === '' ? null : v);
const FIELDS = ['name', 'price', 'originalPrice', 'horecaPrice', 'horecaUnit',
                'imageUrl', 'category', 'unit', 'inStock', 'orderIndex'];

const fsById = new Map(fsProducts.map(p => [p.id, p]));
const sbById = new Map(sbProducts.map(p => [p.id, p]));

const onlyFirestore = [...fsById.keys()].filter(id => !sbById.has(id));
const onlySupabase = [...sbById.keys()].filter(id => !fsById.has(id));

const diffs = [];
for (const [id, f] of fsById) {
  const s = sbById.get(id);
  if (!s) continue;
  for (const k of FIELDS) {
    if (norm(f[k]) !== norm(s[k])) {
      diffs.push({ id, name: f.name, field: k, firestore: f[k], supabase: s[k] });
    }
  }
  // Variant options are what the unit selector renders, so a count mismatch is
  // a visibly different product page.
  const fn = Array.isArray(f.variants) && f.variants.length ? f.variants.length : 0;
  const sn = Array.isArray(s.variants) ? s.variants.length : 0;
  if (fn !== sn) diffs.push({ id, name: f.name, field: 'variants.length', firestore: fn, supabase: sn });
}

console.log(`Firestore: ${fsProducts.length} products`);
console.log(`Supabase:  ${sbProducts.length} products`);
console.log(`Only in Firestore: ${onlyFirestore.length}`);
console.log(`Only in Supabase:  ${onlySupabase.length}`);
console.log(`Field differences:  ${diffs.length}`);

for (const id of onlyFirestore.slice(0, 20)) console.log(`   missing from Supabase: ${id} ${JSON.stringify(fsById.get(id).name)}`);
for (const id of onlySupabase.slice(0, 20)) console.log(`   extra in Supabase:     ${id} ${JSON.stringify(sbById.get(id).name)}`);

const byField = {};
for (const d of diffs) byField[d.field] = (byField[d.field] || 0) + 1;
if (diffs.length) {
  console.log('\nDifferences by field:', JSON.stringify(byField));
  console.log('\nFirst 25:');
  for (const d of diffs.slice(0, 25)) {
    console.log(`   ${d.name} [${d.field}]  firestore=${JSON.stringify(d.firestore)}  supabase=${JSON.stringify(d.supabase)}`);
  }
}

const ok = !diffs.length && !onlyFirestore.length && !onlySupabase.length;
console.log(ok
  ? '\nThe two agree. Safe to set VITE_CATALOGUE_SOURCE=supabase.'
  : '\nThey do not agree. Re-run syncCatalogueToSupabase.mjs --apply, then this again.');
process.exit(ok ? 0 : 1);
