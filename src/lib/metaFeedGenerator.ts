/**
 * Meta Commerce Catalog Feed Generator
 *
 * Generates production-ready RSS 2.0 XML product catalog feeds adhering strictly
 * to Meta's (Facebook / Instagram) Commerce Catalog specifications:
 * - Namespace: xmlns="http://base.google.com/ns/1.0" and xmlns:g="http://base.google.com/ns/1.0"
 * - References:
 *   https://developers.facebook.com/documentation/ads-commerce/catalog/guides/feed-api
 *   https://developers.facebook.com/docs/marketing-api/catalog/reference/
 *   https://developers.facebook.com/documentation/ads-commerce/catalog/guides/scheduled-feeds
 */

export interface ProductVariant {
  unit: string;
  quantityValue?: number;
  quantityUnit?: string;
  packSize?: string;
  price: number;
  originalPrice?: number;
  horecaPrice?: number;
  horecaUnit?: string;
}

export interface ProductFeedInput {
  id: string;
  name: string;
  itemCode?: string;
  price: number | string;
  originalPrice?: number | string | null;
  mrp?: number | string | null;
  MRP?: number | string | null;
  imageUrl?: string;
  image?: string;
  thumbnailUrl?: string | null;
  category?: string;
  subCategory?: string | null;
  description?: string;
  metaDescription?: string;
  unit?: string;
  quantityValue?: number | string;
  quantityUnit?: string;
  packSize?: string;
  variants?: ProductVariant[];
  stock?: number;
  inStock?: boolean;
  isDeactivated?: boolean;
}

export interface FeedStats {
  totalProductsInDb: number;
  activeIncludedProducts: number;
  totalVariantsIncluded: number;
  totalFeedItems: number;
  skippedProducts: number;
  skipReasons: Record<string, number>;
  categoriesMapped: Record<string, string>;
  generationTimeMs: number;
}

export interface FeedGeneratorOptions {
  baseUrl?: string;
  brandName?: string;
  currency?: string;
  feedTitle?: string;
  feedDescription?: string;
  metaCategoryMapping?: Record<string, string>;
}

/**
 * Standard default Google / Meta Product Taxonomy mappings for Fresh N Local catalog
 */
export const DEFAULT_META_CATEGORY_MAPPINGS: Record<string, string> = {
  'in season fruits': 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Fresh & Cut Fruits',
  'indian fruits': 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Fresh & Cut Fruits',
  'exotic fruits': 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Fresh & Cut Fruits',
  'imported fruits': 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Fresh & Cut Fruits',
  'fresh & hygenic cut fruits': 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Fresh & Cut Fruits',
  'indian vegetable': 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Fresh & Cut Vegetables',
  'exotic vegetable': 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Fresh & Cut Vegetables',
  'imported vegetable': 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Fresh & Cut Vegetables',
  'super exotic vegetables': 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Fresh & Cut Vegetables',
  'fresh & hygenic cut vegetables': 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Fresh & Cut Vegetables',
  'indian cut vegetables': 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Fresh & Cut Vegetables',
  'leafy greens': 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Fresh & Cut Vegetables',
  'exotic mushroom': 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Fresh & Cut Vegetables',
  'mushroom': 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Fresh & Cut Vegetables',
  'sprouts and microgreens': 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Fresh & Cut Vegetables',
  'herbs & seasoning': 'Food, Beverages & Tobacco > Food Items > Cooking & Baking Ingredients > Herbs & Spices',
  'frozen fruits & vegetables': 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Frozen Fruits & Vegetables',
  'frozen items': 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Frozen Fruits & Vegetables',
  'marinateds': 'Food, Beverages & Tobacco > Food Items > Prepared Foods',
  'flowers and pooja': 'Home & Garden > Plants > Flowers',
  'fnl juices': 'Food, Beverages & Tobacco > Beverages > Juice',
  'juices': 'Food, Beverages & Tobacco > Beverages > Juice',
};

/**
 * Common Meta/Google taxonomy categories available in dropdown selector
 */
export const COMMON_META_CATEGORIES = [
  'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Fresh & Cut Fruits',
  'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Fresh & Cut Vegetables',
  'Food, Beverages & Tobacco > Food Items > Cooking & Baking Ingredients > Herbs & Spices',
  'Food, Beverages & Tobacco > Beverages > Juice',
  'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Frozen Fruits & Vegetables',
  'Food, Beverages & Tobacco > Food Items > Prepared Foods',
  'Home & Garden > Plants > Flowers',
  'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables',
  'Food, Beverages & Tobacco > Food Items'
];

/**
 * Escapes characters for strict XML validity and strips illegal XML control characters.
 */
export function escapeXml(unsafe: any): string {
  if (unsafe === undefined || unsafe === null) return '';
  return String(unsafe)
    // Strip illegal XML 1.0 control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Strips HTML tags and normalizes whitespace for clean XML text descriptions.
 */
export function stripHtml(html: any): string {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolves the Google / Meta category taxonomy for a given product category name.
 */
export function getMappedMetaCategory(categoryName: string, customMappings: Record<string, string> = {}): string {
  if (!categoryName) {
    return 'Food, Beverages & Tobacco > Food Items';
  }

  const raw = categoryName.trim();
  const lower = raw.toLowerCase();

  // 1. Direct match in custom mappings
  if (customMappings[raw]) return customMappings[raw];
  if (customMappings[lower]) return customMappings[lower];

  // 2. Singular/plural tolerance in custom mappings
  const singularKey = lower.endsWith('s') ? lower.slice(0, -1) : lower;
  const pluralKey = lower.endsWith('s') ? lower : lower + 's';
  if (customMappings[singularKey]) return customMappings[singularKey];
  if (customMappings[pluralKey]) return customMappings[pluralKey];

  // 3. Direct match in defaults
  if (DEFAULT_META_CATEGORY_MAPPINGS[lower]) return DEFAULT_META_CATEGORY_MAPPINGS[lower];
  if (DEFAULT_META_CATEGORY_MAPPINGS[singularKey]) return DEFAULT_META_CATEGORY_MAPPINGS[singularKey];
  if (DEFAULT_META_CATEGORY_MAPPINGS[pluralKey]) return DEFAULT_META_CATEGORY_MAPPINGS[pluralKey];

  // 4. Keyword heuristic fallbacks
  if (lower.includes('fruit') || lower.includes('berry') || lower.includes('berries')) {
    return 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Fresh & Cut Fruits';
  }
  if (lower.includes('veg') || lower.includes('green') || lower.includes('mushroom') || lower.includes('sprout')) {
    return 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Fresh & Cut Vegetables';
  }
  if (lower.includes('herb') || lower.includes('seasoning') || lower.includes('spice')) {
    return 'Food, Beverages & Tobacco > Food Items > Cooking & Baking Ingredients > Herbs & Spices';
  }
  if (lower.includes('juice') || lower.includes('smoothie') || lower.includes('beverage')) {
    return 'Food, Beverages & Tobacco > Beverages > Juice';
  }
  if (lower.includes('flower') || lower.includes('pooja')) {
    return 'Home & Garden > Plants > Flowers';
  }
  if (lower.includes('frozen')) {
    return 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Frozen Fruits & Vegetables';
  }

  // Fallback
  return 'Food, Beverages & Tobacco > Food Items';
}

/**
 * Builds breadcrumb string for Meta's product_type attribute
 */
export function buildProductType(category?: string, subCategory?: string | null): string {
  if (!category) return 'Fresh Produce';
  const cleanCat = category.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  if (cleanCat.toLowerCase().includes('juice')) {
    const cleanSub = subCategory ? subCategory.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : 'Cold Pressed';
    return `Beverages > Juices & Smoothies > ${cleanSub}`;
  }
  if (cleanCat.toLowerCase().includes('fruit')) {
    return `Fresh Produce > Fruits > ${cleanCat}`;
  }
  if (cleanCat.toLowerCase().includes('veg') || cleanCat.toLowerCase().includes('greens')) {
    return `Fresh Produce > Vegetables > ${cleanCat}`;
  }
  if (cleanCat.toLowerCase().includes('flower')) {
    return `Floral & Pooja > ${cleanCat}`;
  }
  return `Fresh Produce > ${cleanCat}`;
}

/**
 * Formats product titles according to Meta standards (<= 150 chars, no spam, clear unit specification)
 */
export function formatMetaTitle(name: string, unit?: string, isVariant = false): string {
  let cleanName = (name || '').trim().replace(/\s+/g, ' ');
  // Capitalize title words for consistency
  cleanName = cleanName.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

  // Add brand prefix if not already present
  let title = cleanName;
  if (!title.toLowerCase().startsWith('fresh n local')) {
    title = `Fresh N Local ${title}`;
  }

  const cleanUnit = (unit || '').trim();
  if (cleanUnit && !title.toLowerCase().includes(cleanUnit.toLowerCase())) {
    title = isVariant ? `${title} - ${cleanUnit}` : `${title} (${cleanUnit})`;
  }

  // Meta requires <= 150 chars
  if (title.length > 150) {
    title = title.substring(0, 147).trim() + '...';
  }
  return title;
}

/**
 * Produces a stable, alphanumeric-safe variant slug for unique, permanent variant IDs
 */
export function getVariantId(parentProductId: string, unit: string, index: number): string {
  const sanitizedUnit = (unit || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  
  const suffix = sanitizedUnit || `v${index + 1}`;
  const rawId = `${parentProductId}_${suffix}`;
  // Ensure maximum length constraint (Meta allows up to 100 characters for id)
  return rawId.length > 90 ? rawId.substring(0, 90) : rawId;
}

/**
 * Generates the full XML feed adhering strictly to Meta Commerce Catalog requirements.
 */
export function generateMetaFeedXml(
  products: ProductFeedInput[],
  options: FeedGeneratorOptions = {}
): { xml: string; stats: FeedStats } {
  const startTime = Date.now();
  const baseUrl = (options.baseUrl || 'https://www.freshnlocal.co').replace(/\/+$/, '');
  const brandName = options.brandName || 'Fresh N Local';
  const currency = options.currency || 'INR';
  const feedTitle = options.feedTitle || 'Fresh N Local Product Catalog Feed';
  const feedDescription = options.feedDescription || 'Fresh N Local Meta Commerce Products Catalog Feed';
  const customMappings = options.metaCategoryMapping || {};

  let activeIncludedProducts = 0;
  let totalVariantsIncluded = 0;
  let skippedProducts = 0;
  const skipReasons: Record<string, number> = {};
  const categoriesMapped: Record<string, string> = {};
  const seenCatalogIds = new Set<string>();

  // Meta XML Header with Google Base namespace (strict RSS 2.0)
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n`;
  xml += `  <channel>\n`;
  xml += `    <title>${escapeXml(feedTitle)}</title>\n`;
  xml += `    <link>${escapeXml(baseUrl)}</link>\n`;
  xml += `    <description>${escapeXml(feedDescription)}</description>\n`;

  for (const product of products) {
    // 1. Skip deactivated products
    if (product.isDeactivated === true) {
      skippedProducts++;
      skipReasons['deactivated'] = (skipReasons['deactivated'] || 0) + 1;
      continue;
    }

    // 2. Validate price
    const baseSellingPrice = parseFloat(String(product.price));
    if (isNaN(baseSellingPrice) || baseSellingPrice <= 0) {
      skippedProducts++;
      skipReasons['missing_or_invalid_price'] = (skipReasons['missing_or_invalid_price'] || 0) + 1;
      continue;
    }

    // 3. Validate image URL
    const rawImage = product.imageUrl || product.image;
    if (!rawImage || typeof rawImage !== 'string' || (!rawImage.startsWith('http://') && !rawImage.startsWith('https://'))) {
      skippedProducts++;
      skipReasons['missing_or_invalid_image'] = (skipReasons['missing_or_invalid_image'] || 0) + 1;
      continue;
    }

    // 4. Validate name
    if (!product.name || !String(product.name).trim()) {
      skippedProducts++;
      skipReasons['missing_name'] = (skipReasons['missing_name'] || 0) + 1;
      continue;
    }

    const productId = String(product.id).trim();
    if (!productId) {
      skippedProducts++;
      skipReasons['missing_id'] = (skipReasons['missing_id'] || 0) + 1;
      continue;
    }

    // Calculate Availability
    const isProductInStock = product.inStock !== false && (product.stock === undefined || product.stock > 0);
    const availability = isProductInStock ? 'in stock' : 'out of stock';
    const condition = 'new';

    // Descriptions: strip HTML and escape
    let description = stripHtml(product.description || product.metaDescription || product.name);
    if (!description) {
      description = product.name;
    }
    if (description.length > 5000) {
      description = description.substring(0, 4995) + '...';
    }

    // Category mappings
    const rawCategory = product.category || 'fresh produce';
    const googleCategory = getMappedMetaCategory(rawCategory, customMappings);
    categoriesMapped[rawCategory] = googleCategory;
    const productType = buildProductType(rawCategory, product.subCategory);

    // Filter valid variants (must have unit and positive price)
    const validVariants: ProductVariant[] = (product.variants || []).filter(v => {
      if (!v) return false;
      const vPrice = parseFloat(String(v.price));
      return !isNaN(vPrice) && vPrice > 0;
    });

    const hasVariants = validVariants.length > 0;
    const itemGroupId = hasVariants ? productId : null;

    // --- EMIT BASE / PRIMARY ITEM ---
    // If product has variants, the base item represents the default option and shares item_group_id
    const baseUnit = (product.unit || (product.quantityValue ? `${product.quantityValue} ${product.quantityUnit || ''}` : '')).trim();
    const baseTitle = formatMetaTitle(product.name, baseUnit, false);
    const baseLink = `${baseUrl}/product/${productId}`;
    const baseMrp = parseFloat(String(product.originalPrice || product.mrp || product.MRP || 0));

    let feedPrice = '';
    let feedSalePrice = '';
    if (baseMrp > baseSellingPrice) {
      feedPrice = `${baseMrp.toFixed(2)} ${currency}`;
      feedSalePrice = `${baseSellingPrice.toFixed(2)} ${currency}`;
    } else {
      feedPrice = `${baseSellingPrice.toFixed(2)} ${currency}`;
    }

    const baseItemId = productId;
    seenCatalogIds.add(baseItemId);

    xml += `    <item>\n`;
    xml += `      <g:id>${escapeXml(baseItemId)}</g:id>\n`;
    if (itemGroupId) {
      xml += `      <g:item_group_id>${escapeXml(itemGroupId)}</g:item_group_id>\n`;
    }
    xml += `      <g:title>${escapeXml(baseTitle)}</g:title>\n`;
    xml += `      <g:description>${escapeXml(description)}</g:description>\n`;
    xml += `      <g:availability>${escapeXml(availability)}</g:availability>\n`;
    xml += `      <g:condition>${escapeXml(condition)}</g:condition>\n`;
    xml += `      <g:price>${escapeXml(feedPrice)}</g:price>\n`;
    if (feedSalePrice) {
      xml += `      <g:sale_price>${escapeXml(feedSalePrice)}</g:sale_price>\n`;
    }
    xml += `      <g:link>${escapeXml(baseLink)}</g:link>\n`;
    xml += `      <g:image_link>${escapeXml(rawImage)}</g:image_link>\n`;
    if (product.thumbnailUrl && product.thumbnailUrl.startsWith('http') && product.thumbnailUrl !== rawImage) {
      xml += `      <g:additional_image_link>${escapeXml(product.thumbnailUrl)}</g:additional_image_link>\n`;
    }
    xml += `      <g:brand>${escapeXml(brandName)}</g:brand>\n`;
    xml += `      <g:google_product_category>${escapeXml(googleCategory)}</g:google_product_category>\n`;
    xml += `      <g:product_type>${escapeXml(productType)}</g:product_type>\n`;
    if (baseUnit) {
      xml += `      <g:size>${escapeXml(baseUnit)}</g:size>\n`;
    }
    xml += `      <g:identifier_exists>no</g:identifier_exists>\n`;
    if (product.itemCode && String(product.itemCode).trim()) {
      xml += `      <g:mpn>${escapeXml(String(product.itemCode).trim())}</g:mpn>\n`;
    }
    xml += `    </item>\n`;

    activeIncludedProducts++;

    // --- EMIT VARIANTS (IF ANY) ---
    if (hasVariants) {
      validVariants.forEach((variant, vIdx) => {
        const vPrice = parseFloat(String(variant.price));
        const vMrp = parseFloat(String(variant.originalPrice || 0));
        const vUnit = (variant.unit || (variant.quantityValue ? `${variant.quantityValue} ${variant.quantityUnit || ''}` : '')).trim();

        let vItemId = getVariantId(productId, vUnit, vIdx);
        // Collision protection
        if (seenCatalogIds.has(vItemId)) {
          vItemId = `${productId}_v${vIdx + 1}_${Date.now() % 1000}`;
        }
        seenCatalogIds.add(vItemId);

        let vFeedPrice = '';
        let vFeedSalePrice = '';
        if (vMrp > vPrice) {
          vFeedPrice = `${vMrp.toFixed(2)} ${currency}`;
          vFeedSalePrice = `${vPrice.toFixed(2)} ${currency}`;
        } else {
          vFeedPrice = `${vPrice.toFixed(2)} ${currency}`;
        }

        const vTitle = formatMetaTitle(product.name, vUnit, true);
        const vLink = `${baseUrl}/product/${productId}?variant=${encodeURIComponent(vUnit || `v${vIdx + 1}`)}`;

        xml += `    <item>\n`;
        xml += `      <g:id>${escapeXml(vItemId)}</g:id>\n`;
        xml += `      <g:item_group_id>${escapeXml(productId)}</g:item_group_id>\n`;
        xml += `      <g:title>${escapeXml(vTitle)}</g:title>\n`;
        xml += `      <g:description>${escapeXml(description)}</g:description>\n`;
        xml += `      <g:availability>${escapeXml(availability)}</g:availability>\n`;
        xml += `      <g:condition>${escapeXml(condition)}</g:condition>\n`;
        xml += `      <g:price>${escapeXml(vFeedPrice)}</g:price>\n`;
        if (vFeedSalePrice) {
          xml += `      <g:sale_price>${escapeXml(vFeedSalePrice)}</g:sale_price>\n`;
        }
        xml += `      <g:link>${escapeXml(vLink)}</g:link>\n`;
        xml += `      <g:image_link>${escapeXml(rawImage)}</g:image_link>\n`;
        xml += `      <g:brand>${escapeXml(brandName)}</g:brand>\n`;
        xml += `      <g:google_product_category>${escapeXml(googleCategory)}</g:google_product_category>\n`;
        xml += `      <g:product_type>${escapeXml(productType)}</g:product_type>\n`;
        if (vUnit) {
          xml += `      <g:size>${escapeXml(vUnit)}</g:size>\n`;
        }
        xml += `      <g:identifier_exists>no</g:identifier_exists>\n`;
        if (product.itemCode && String(product.itemCode).trim()) {
          xml += `      <g:mpn>${escapeXml(String(product.itemCode).trim())}</g:mpn>\n`;
        }
        xml += `    </item>\n`;

        totalVariantsIncluded++;
      });
    }
  }

  xml += `  </channel>\n`;
  xml += `</rss>\n`;

  const totalFeedItems = activeIncludedProducts + totalVariantsIncluded;
  const generationTimeMs = Date.now() - startTime;

  return {
    xml,
    stats: {
      totalProductsInDb: products.length,
      activeIncludedProducts,
      totalVariantsIncluded,
      totalFeedItems,
      skippedProducts,
      skipReasons,
      categoriesMapped,
      generationTimeMs
    }
  };
}
