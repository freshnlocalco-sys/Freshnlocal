/**
 * One Firestore product document -> one web_products row plus its variant rows.
 *
 * Shared deliberately. scripts/syncCatalogueToSupabase.mjs uses it for the bulk
 * pass and server.ts uses it for the per-write mirror, and if those two ever
 * disagreed the catalogue would depend on which one happened to run last.
 *
 * The slug and id rules here MUST NOT drift. The variant `sku` they produce is
 * referenced by web_sku_components and the ERP's platform_item_mappings, so a
 * different slug mints parallel SKUs and orphans every existing mapping. They
 * are carried verbatim from the ERP's scripts/migrateFirestore.mjs.
 */

const isNum = v => typeof v === 'number' && Number.isFinite(v);
export const num = v => (isNum(v) ? v : null);
export const slug = s => String(s ?? '').trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'na';
const clean = v => (typeof v === 'string' ? v.trim() : v);

/** Epoch ms, Firestore Timestamp or ISO string -> ISO string, or null. */
export function ts(v) {
  if (v == null) return null;
  if (isNum(v)) return v < 1e11 ? null : new Date(v).toISOString();
  if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().toISOString();
  if (typeof v === 'object' && isNum(v._seconds)) return new Date(v._seconds * 1000).toISOString();
  if (typeof v === 'string') { const d = new Date(v); return Number.isNaN(+d) ? null : d.toISOString(); }
  return null;
}

/** The unit a variant is sold in. 37 products have neither unit nor quantityUnit. */
export function unitFor(p, v) {
  for (const c of [v?.unit, v?.quantityUnit, p.unit, p.quantityUnit]) {
    const s = String(c ?? '').trim();
    if (s) return s;
  }
  return 'Each';
}

/**
 * Did Firestore carry a real variants array, or will one be synthesised from the
 * product's own fields? The storefront renders [defaults, ...variants], so a
 * synthesised row rendered as a variant duplicates option 0. Cannot be inferred
 * later from variant count: 173 of the 174 real ones have exactly one entry.
 */
export const hasOwnVariants = d => Array.isArray(d.variants) && d.variants.length > 0;

/**
 * `{ product, variants }` for one Firestore document, or null when it has no
 * name (which web_products would refuse).
 *
 * `onNote(kind, message)` is optional and collects the things worth saying out
 * loud -- duplicate units, skipped documents -- so the bulk script can print a
 * report and the server can log.
 *
 * The JSDoc is load-bearing: server.ts imports this file, tsconfig has
 * allowJs, and without an annotation TypeScript infers onNote's type from the
 * `() => {}` default and rejects every caller that actually passes arguments.
 *
 * @param {Record<string, any>} d          one Firestore product document, id included
 * @param {(kind: string, message: string) => void} [onNote]
 * @returns {{ product: Record<string, any>, variants: Record<string, any>[] } | null}
 */
export function transformProduct(d, onNote = () => {}) {
  const id = String(d.id);
  const name = clean(d.name) ?? '';
  if (!name) { onNote('skipped', `${id} has no name`); return null; }

  const own = hasOwnVariants(d);

  const product = {
    id,
    name,
    category: clean(d.category) ?? '',
    sub_category: clean(d.subCategory) || null,
    description: d.description ?? '',
    meta_description: d.metaDescription ?? null,
    image_url: d.imageUrl ?? null,
    thumbnail_url: d.thumbnailUrl ?? null,
    order_index: num(d.orderIndex),
    use_base_pricing: d.useBasePricing === true,
    base_price: num(d.basePrice),
    base_unit: d.baseUnit ?? null,
    base_original_price: num(d.baseOriginalPrice),
    base_horeca_price: num(d.baseHorecaPrice),

    // Availability. The storefront gates its Add button on in_stock and nothing
    // else, so absent must mean in stock, matching how the site reads a document
    // with no inStock field.
    in_stock: d.inStock !== false,
    stock: num(d.stock),

    // The product's OWN retail option -- what the storefront shows as option 0.
    // For the 174 products with a real variants array this is a different size
    // from every variant, and the first backfill lost it entirely.
    unit: d.unit ?? null,
    quantity_value: num(d.quantityValue),
    quantity_unit: d.quantityUnit ?? null,
    pack_size: d.packSize ?? null,
    price: num(d.price),
    original_price: num(d.originalPrice),
    horeca_price: num(d.horecaPrice),
    horeca_unit: d.horecaUnit || null,

    has_own_variants: own,

    // `?? null` would not be enough: 8 products carry itemCode as an empty
    // string, and '' is a value the ERP could join other blank rows against,
    // where NULL correctly means "this product has no code". Stringified
    // because the column is TEXT and some documents hold the code as a number.
    item_code: (d.itemCode == null || String(d.itemCode).trim() === '')
      ? null
      : String(d.itemCode).trim(),

    // Read by nothing in either codebase. Carried for fidelity only; it is NOT
    // a visibility flag and must never reach a WHERE clause -- all 100 products
    // that have it set are live on the site.
    is_deactivated: d.isDeactivated === true,

    created_at: ts(d.createdAt) ?? new Date().toISOString(),
    updated_at: ts(d.updatedAt),
  };

  // Every product still gets at least one variant row, synthesised when there is
  // no array, because 259 web_sku_components key on those SKUs.
  const list = own
    ? d.variants
    : [{
        unit: d.unit, quantityValue: d.quantityValue, quantityUnit: d.quantityUnit,
        packSize: d.packSize, price: d.price, originalPrice: d.originalPrice,
        horecaPrice: d.horecaPrice, horecaUnit: d.horecaUnit,
        horecaQuantityValue: d.horecaQuantityValue, horecaQuantityUnit: d.horecaQuantityUnit,
      }];

  const variants = [];
  const usedSkus = new Set();
  list.forEach((v, i) => {
    const unit = unitFor(d, v);
    let sku = `${id}__${slug(unit)}`;
    if (usedSkus.has(sku)) {
      const alt = `${sku}-${i}`;
      onNote('duplicate-variant-unit',
        `${id} (${name}) has two variants in unit ${JSON.stringify(unit)}; second became ${alt}`);
      sku = alt;
    }
    usedSkus.add(sku);

    variants.push({
      id: `${id}__v${i}`,
      web_product_id: id,
      sku,
      unit,
      quantity_value: num(v.quantityValue),
      quantity_unit: v.quantityUnit ?? null,
      pack_size: v.packSize ?? null,
      price: num(v.price) ?? num(d.price) ?? 0,
      original_price: num(v.originalPrice),
      horeca_price: num(v.horecaPrice),
      horeca_unit: v.horecaUnit || null,
      horeca_quantity_value: num(v.horecaQuantityValue),
      horeca_quantity_unit: v.horecaQuantityUnit ?? null,
      is_primary: i === 0,
      position: i,
      created_at: ts(d.createdAt) ?? new Date().toISOString(),
    });
  });

  return { product, variants };
}

/**
 * One Firestore settings document (`{id, ...value}`) -> one web_settings row.
 *
 * @param {Record<string, any>} d
 * @param {string} [updatedBy]
 * @returns {{ key: string, value: Record<string, any>, updated_at: string, updated_by: string }}
 */
export function transformSetting(d, updatedBy = 'catalogue-sync') {
  const { id, ...value } = d;
  return {
    key: String(id),
    value,
    updated_at: ts(value.updatedAt) ?? new Date().toISOString(),
    updated_by: updatedBy,
  };
}

/** The six documents the storefront reads publicly. */
export const SETTINGS_KEYS = [
  'heroBanners', 'categoriesConfig', 'categoryImages',
  'spotlights', 'branding', 'promotions',
];
