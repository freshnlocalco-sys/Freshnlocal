/**
 * The catalogue, for the build-time scripts (sitemap, feed, meta).
 *
 * These run under plain node, so they cannot use import.meta.env. They read the
 * SAME variable the browser bundle does -- VITE_CATALOGUE_SOURCE out of .env --
 * so one setting moves the whole storefront, build artefacts included, and
 * there is no way to end up with a site on Supabase and a feed on Firestore.
 *
 * readProducts() returns documents in FIRESTORE shape whichever backend
 * answered, so the three scripts need no changes beyond calling it.
 */

import { readFile } from 'fs/promises';

/** .env as a plain object. No dependency, and these scripts never had dotenv. */
async function readEnvFile() {
  const env = {};
  try {
    for (const line of (await readFile('.env', 'utf8')).split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // No .env is not an error: the Firestore path needs nothing from it.
  }
  return env;
}

/** Firestore unless .env (or the environment) asks for Supabase. */
export async function catalogueSource() {
  const env = await readEnvFile();
  const want = (process.env.VITE_CATALOGUE_SOURCE ?? env.VITE_CATALOGUE_SOURCE ?? '').trim();
  if (want !== 'supabase') return { source: 'firestore', env };

  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn('[CATALOGUE] VITE_CATALOGUE_SOURCE=supabase but the Supabase URL / anon key are missing from .env. Falling back to Firestore.');
    return { source: 'firestore', env };
  }
  return { source: 'supabase', env, url, key };
}

const SELECT = [
  'id', 'name', 'category', 'sub_category', 'description', 'meta_description',
  'image_url', 'thumbnail_url', 'order_index',
  'use_base_pricing', 'base_price', 'base_unit', 'base_original_price', 'base_horeca_price',
  'in_stock', 'stock',
  'unit', 'quantity_value', 'quantity_unit', 'pack_size',
  'price', 'original_price', 'horeca_price', 'horeca_unit',
  'has_own_variants', 'item_code', 'is_deactivated', 'created_at', 'updated_at',
  'web_product_variants(sku,unit,quantity_value,quantity_unit,pack_size,price,original_price,horeca_price,horeca_unit,position,is_primary)',
].join(',');

const epoch = iso => {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : undefined;
};
const n = v => (v === null || v === undefined ? undefined : Number(v));

/** A web_products row back into the Firestore document shape. */
function rowToDoc(row) {
  const doc = {
    id: row.id,
    name: row.name,
    category: row.category ?? '',
    subCategory: row.sub_category ?? undefined,
    description: row.description ?? '',
    metaDescription: row.meta_description ?? undefined,
    imageUrl: row.image_url ?? undefined,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    orderIndex: n(row.order_index),
    useBasePricing: row.use_base_pricing === true,
    basePrice: n(row.base_price),
    baseUnit: row.base_unit ?? undefined,
    baseOriginalPrice: n(row.base_original_price),
    baseHorecaPrice: n(row.base_horeca_price),
    inStock: row.in_stock !== false,
    stock: n(row.stock),
    unit: row.unit ?? undefined,
    quantityValue: n(row.quantity_value),
    quantityUnit: row.quantity_unit ?? undefined,
    packSize: row.pack_size ?? undefined,
    price: n(row.price),
    originalPrice: n(row.original_price),
    horecaPrice: n(row.horeca_price),
    horecaUnit: row.horeca_unit ?? undefined,
    itemCode: row.item_code ?? undefined,
    // Shop, Home, Layout and OffersSettings all filter on this; a product that
    // comes back without it reappears on the shop.
    isDeactivated: row.is_deactivated === true,
    createdAt: epoch(row.created_at),
    updatedAt: epoch(row.updated_at),
  };

  // Only when Firestore genuinely had an array. The rows are present either
  // way, but for 275 products the single one is a synthesised copy of the
  // fields above and handing it back would invent a variant that never existed.
  if (row.has_own_variants) {
    doc.variants = (row.web_product_variants ?? [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map(v => ({
        unit: v.unit ?? '',
        quantityValue: n(v.quantity_value),
        quantityUnit: v.quantity_unit ?? undefined,
        packSize: v.pack_size ?? undefined,
        price: Number(v.price) || 0,
        originalPrice: n(v.original_price),
        horecaPrice: n(v.horeca_price),
        horecaUnit: v.horeca_unit ?? undefined,
      }));
  }

  return doc;
}

/**
 * Every product, in Firestore document shape, from whichever backend is
 * configured. `firebaseRead` is a callback that does the Firestore read, so
 * this module never imports the Firebase SDK on the Supabase path.
 */
export async function readProducts(firebaseRead) {
  const cfg = await catalogueSource();

  if (cfg.source === 'firestore') {
    return { source: 'firestore', products: await firebaseRead() };
  }

  const r = await fetch(
    `${cfg.url}/rest/v1/web_products?select=${encodeURIComponent(SELECT)}&order=id.asc&limit=5000`,
    { headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` } }
  );
  if (!r.ok) {
    throw new Error(`Supabase catalogue read failed: ${r.status} ${await r.text()}`);
  }
  const rows = await r.json();

  // Sorted by id the way Firestore orders document names -- UTF-8 bytes, so
  // uppercase before lowercase -- rather than the way Postgres returned them,
  // which uses the database collation and is broadly case-insensitive. Both
  // orderings contain exactly the same products; without this the generated
  // sitemap and feed come out correct but shuffled, which shows up as a
  // thousand-line diff on public/sitemap.xml every time the source changes.
  const products = rows.map(rowToDoc)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { source: 'supabase', products };
}
