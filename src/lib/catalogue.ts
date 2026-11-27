/**
 * Reading the catalogue out of Supabase.
 *
 * This is the Postgres half of Stage 1. Its one job is to hand back exactly
 * what the Firestore path hands back, so that flipping VITE_CATALOGUE_SOURCE
 * changes where the data comes from and nothing else. Every shaping decision
 * below mirrors a decision in useProducts.performActualFetch or in the
 * components; where that looks odd, the oddity is in the original and copying
 * it is the point.
 */

import { supabase } from './supabase';
import type { Product, ProductVariant } from '../store/useCart';

/** Row shape of web_products, as the columns actually come back. */
interface ProductRow {
  id: string;
  name: string;
  category: string | null;
  sub_category: string | null;
  description: string | null;
  meta_description: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  order_index: number | null;
  use_base_pricing: boolean | null;
  base_price: number | null;
  base_unit: string | null;
  base_original_price: number | null;
  base_horeca_price: number | null;
  in_stock: boolean | null;
  stock: number | null;
  unit: string | null;
  quantity_value: number | null;
  quantity_unit: string | null;
  pack_size: string | null;
  price: number | null;
  original_price: number | null;
  horeca_price: number | null;
  horeca_unit: string | null;
  has_own_variants: boolean | null;
  item_code: string | null;
  is_deactivated: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  web_product_variants: VariantRow[] | null;
}

interface VariantRow {
  sku: string;
  unit: string | null;
  quantity_value: number | null;
  quantity_unit: string | null;
  pack_size: string | null;
  price: number | null;
  original_price: number | null;
  horeca_price: number | null;
  horeca_unit: string | null;
  position: number | null;
  is_primary: boolean | null;
}

const PRODUCT_COLUMNS = `
  id, name, category, sub_category, description, meta_description,
  image_url, thumbnail_url, order_index,
  use_base_pricing, base_price, base_unit, base_original_price, base_horeca_price,
  in_stock, stock,
  unit, quantity_value, quantity_unit, pack_size,
  price, original_price, horeca_price, horeca_unit,
  has_own_variants, item_code, is_deactivated, created_at, updated_at,
  web_product_variants (
    sku, unit, quantity_value, quantity_unit, pack_size,
    price, original_price, horeca_price, horeca_unit, position, is_primary
  )
`.replace(/\s+/g, '');

/** A number or undefined -- never NaN, never null, which the UI renders raw. */
const optionalNumber = (v: number | null | undefined): number | undefined => {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Timestamps are epoch milliseconds throughout the storefront. */
const epoch = (iso: string | null | undefined): number => {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

const toVariant = (v: VariantRow): ProductVariant => ({
  unit: v.unit ?? '',
  quantityValue: optionalNumber(v.quantity_value),
  quantityUnit: v.quantity_unit ?? undefined,
  packSize: v.pack_size ?? undefined,
  price: Number(v.price) || 0,
  originalPrice: optionalNumber(v.original_price),
  horecaPrice: optionalNumber(v.horeca_price),
  horecaUnit: v.horeca_unit ?? undefined,
});

function toProduct(row: ProductRow): Product {
  const price = Number(row.price) || 0;

  // The Firestore path reads `originalPrice || mrp || MRP` and then keeps it
  // only when it is above the selling price, so a mis-entered "original" that
  // is cheaper never renders as a struck-through discount. Fresh Dill's own row
  // is one of these: base_original_price 25 against base_price 30. Only
  // original_price exists in Postgres; mrp and MRP were never Firestore fields.
  const mrp = Number(row.original_price) || 0;

  // web_product_variants rows exist for every product, but for the 275 that had
  // no variants array in Firestore the single row is a synthesised copy of this
  // product's own fields. The components render [defaults, ...variants] with
  // defaults built from those same fields, so handing back a synthesised row
  // would show the identical option twice. has_own_variants is recorded at sync
  // time precisely because variant count cannot tell the two cases apart: 173
  // of the 174 real ones have exactly one entry.
  const variants = row.has_own_variants
    ? [...(row.web_product_variants ?? [])]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map(toVariant)
    : undefined;

  return {
    id: row.id,
    name: row.name,
    price,
    originalPrice: mrp > price ? mrp : undefined,
    // Truthiness, not null-checking, and deliberately so: the Firestore path
    // reads `data.horecaPrice ? Number(data.horecaPrice) : undefined`, so a
    // literal 0 -- which 9 products carry -- arrives as absent rather than as a
    // price of zero. horecaUtils happens to guard on `> 0` before using it, so
    // nothing visible turned on this, but the two paths have to hand the
    // components the same value or the next reader inherits the discrepancy.
    horecaPrice: row.horeca_price ? Number(row.horeca_price) : undefined,
    horecaUnit: row.horeca_unit ?? undefined,
    imageUrl: row.image_url ?? '',
    category: row.category ?? '',
    description: row.description ?? '',
    metaDescription: row.meta_description ?? undefined,
    unit: row.unit ?? undefined,
    quantityValue: optionalNumber(row.quantity_value),
    quantityUnit: row.quantity_unit ?? undefined,
    packSize: row.pack_size ?? undefined,
    variants,
    stock: Number(row.stock) || 0,

    // The Add button is gated on this in nine places and `!inStock` disables
    // it, so the fallback has to be the safe direction. A row that somehow
    // arrives without the column reads as in stock, matching how the site
    // treats a Firestore document with no inStock field -- 157 products are
    // genuinely false and they stay false.
    inStock: row.in_stock !== false,

    itemCode: row.item_code ?? undefined,

    // Visibility, and the reason this is not optional: Shop, Home, Layout and
    // OffersSettings all drop products where isDeactivated is true. Leaving it
    // undefined makes `!p.isDeactivated` true for every row, which would put
    // all 100 deactivated products back on the shop.
    //
    // This column was added to web_products when nothing in either codebase
    // read the field -- carried for fidelity, and commented as explicitly NOT a
    // visibility flag. The storefront shipped deactivation in the meantime.
    // Keeping the data was what made this a one-line fix rather than another
    // backfill.
    isDeactivated: row.is_deactivated ?? undefined,

    orderIndex: optionalNumber(row.order_index),
    createdAt: epoch(row.created_at),
    updatedAt: epoch(row.updated_at),
    useBasePricing: row.use_base_pricing ?? undefined,
    basePrice: optionalNumber(row.base_price),
    baseUnit: row.base_unit ?? undefined,
    baseOriginalPrice: optionalNumber(row.base_original_price),
    baseHorecaPrice: optionalNumber(row.base_horeca_price),
  } as Product;
}

/**
 * Every live product, shaped and ordered as the Firestore path returns them.
 *
 * Throws on failure rather than returning an empty list, because the caller's
 * catch is what falls back to the IndexedDB/localStorage cache. An empty array
 * would look like a successful read of an empty shop and wipe that cache.
 */
export async function fetchCatalogue(): Promise<Product[]> {
  if (!supabase) throw new Error('Supabase client is not configured.');

  const { data, error } = await supabase
    .from('web_products')
    .select(PRODUCT_COLUMNS)
    // Ordered for a stable, repeatable response rather than for correctness:
    // the sort at the end of this function is fully determined by orderIndex
    // plus an id tiebreak, so nothing downstream depends on what order Postgres
    // returns. (The juice de-duplication below is first-one-wins, which would
    // depend on read order if two juices ever shared a name and category --
    // none do today, and the tiebreak means the surviving list is ordered the
    // same way regardless.)
    .order('id', { ascending: true })
    .limit(5000);

  if (error) throw error;

  const rows = (data ?? []) as unknown as ProductRow[];

  // Carried over from useProducts: among products whose category contains
  // "juice", keep the first of each name+category and drop the rest. The
  // Firestore version also deleted the losers from the database; this one does
  // not. Products are maintained in the ERP and the admin dashboard, and a
  // customer loading the shop is not an event that should delete a row.
  const seenJuice = new Set<string>();
  const seenId = new Set<string>();
  const products: Product[] = [];

  for (const row of rows) {
    if (!row?.id || seenId.has(row.id)) continue;

    const product = toProduct(row);

    if ((product.category || '').toLowerCase().includes('juice')) {
      const key = `${(product.name || '').toLowerCase()}|${(product.category || '').toLowerCase()}`;
      if (seenJuice.has(key)) continue;
      seenJuice.add(key);
    }

    seenId.add(row.id);
    products.push(product);
  }

  // orderIndex first, then id as a tiebreak -- and the tiebreak is not optional.
  //
  // 38 orderIndex values are shared by more than one product, `999` (the
  // default) by 88 of them. Array.prototype.sort is stable, so tied products
  // keep whatever order they arrived in, and the two backends do not agree on
  // that: Firestore orders document ids by UTF-8 bytes, where uppercase sorts
  // before lowercase, while Postgres uses the database collation, which is
  // broadly case-insensitive. Same set of products, different sequence -- it
  // showed up as a sitemap whose URLs matched exactly but in a different order.
  //
  // Comparing ids here with < and > reproduces the byte ordering, so the shop
  // keeps the product order it has today AND stops depending on what order the
  // database happened to return.
  products.sort((a, b) =>
    (a.orderIndex ?? 999) - (b.orderIndex ?? 999) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  return products;
}

/**
 * One product by id, for a direct link to a product page where the catalogue
 * list has not loaded (or no longer holds it).
 *
 * Returns null when there is no such row, which is what ProductDetail's
 * "product not found" branch expects. Reads the same columns and runs the same
 * mapper as the list, so a product looks identical whichever way it is reached.
 */
export async function fetchProductById(id: string): Promise<Product | null> {
  if (!supabase) throw new Error('Supabase client is not configured.');

  const { data, error } = await supabase
    .from('web_products')
    .select(PRODUCT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return toProduct(data as unknown as ProductRow);
}
