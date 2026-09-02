export function parseUnitScale(unitStr: string | undefined): number {
  if (!unitStr) return 1;
  const match = unitStr.match(/^([\d.]+)\s*(kg|g|gm|gram|grams|kilogram|kilograms|l|ml|ltr|litre|litres|liter|liters|pc|pcs|piece|pieces|pack|packs|pkt|packet|packets|box|boxes|bottle|bottles|bunch|bunches|tray|trays|dozen|ft|foot|feet)$/i);
  if (!match) {
    // If string is just e.g. "Kg" or "Ltr" or "G"
    const simpleMatch = unitStr.match(/^(kg|g|gm|l|ml|ltr|pc|pcs|pack|box|bottle|bunch|ft|foot|feet)$/i);
    if (simpleMatch) {
      const u = simpleMatch[1].toLowerCase();
      if (u === 'g' || u === 'gm') return 0.001;
      if (u === 'ml') return 0.001;
      return 1;
    }
    return 1;
  }
  const val = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  
  if (['g', 'gm', 'gram', 'grams'].includes(unit)) return val / 1000;
  if (['ml'].includes(unit)) return val / 1000;
  if (['kg', 'kilogram', 'kilograms', 'l', 'ltr', 'litre', 'litres', 'liter', 'liters'].includes(unit)) return val;
  if (unit === 'dozen') return val * 12;
  return val;
}

export function getBaseUnit(unitStr: string | undefined): string {
  if (!unitStr) return 'Units';
  const match = unitStr.match(/^([\d.]+)?\s*(kg|g|gm|gram|grams|l|ml|ltr|pc|pcs|pack|pkt|packet|box|bottle|bunch|ft|foot|feet)$/i);
  if (!match) return 'Units';
  const unit = (match[2] || match[1] || '').toLowerCase();
  
  if (['g', 'gm', 'gram', 'grams', 'kg', 'kilogram'].includes(unit)) return 'Kg';
  if (['ml', 'l', 'ltr', 'litre'].includes(unit)) return 'Ltr';
  if (['pc', 'pcs', 'piece', 'pieces'].includes(unit)) return 'Pcs';
  if (['pack', 'packs', 'pkt', 'packet', 'packets'].includes(unit)) return 'Packs';
  if (['box', 'boxes'].includes(unit)) return 'Boxes';
  if (['bottle', 'bottles'].includes(unit)) return 'Bottles';
  if (['bunch', 'bunches'].includes(unit)) return 'Bunches';
  if (['ft', 'foot', 'feet'].includes(unit)) return 'ft';
  return 'Units';
}

export function calculateHorecaPrice(horecaPricePerKg: number, unitStr: string): number {
  const scale = parseUnitScale(unitStr);
  return Number((horecaPricePerKg * scale).toFixed(2));
}

/**
 * Resolves the HoReCa price for a given product and target unit from remembered prices.
 * If the admin entered a custom price for e.g. 25g @ ₹20:
 * - 25g returns ₹20
 * - 50g returns ₹40 (calculated proportionally)
 * - 100g returns ₹80
 * - 1kg returns ₹800
 */
export function resolveHorecaSubunitPrice(
  product: { 
    id?: string; 
    name?: string; 
    unit?: string; 
    baseUnit?: string; 
    baseHorecaPrice?: number | null; 
    horecaPrice?: number | null; 
    variants?: any[] 
  } | null | undefined,
  targetUnit: string | undefined,
  rememberedPrices: Record<string, any>
): number {
  if (!product || !rememberedPrices) return 0;

  const targetUnitClean = (targetUnit || product.unit || '1KG').trim();
  const targetScale = parseUnitScale(targetUnitClean);

  const pId = product.id ? product.id.trim() : '';
  const pIdLower = pId.toLowerCase();
  const basePid = pId.split('-')[0];
  const basePidLower = basePid.toLowerCase();
  const pName = product.name ? product.name.trim() : '';
  const pNameLower = pName.toLowerCase();

  // 1. Direct exact match for product + target unit
  const exactVariantKeys = [
    `${pId}-${targetUnitClean}`,
    `${pIdLower}-${targetUnitClean.toLowerCase()}`,
    `${basePid}-${targetUnitClean}`,
    `${basePidLower}-${targetUnitClean.toLowerCase()}`,
    `${pName}-${targetUnitClean}`,
    `${pNameLower}-${targetUnitClean.toLowerCase()}`,
  ];

  for (const k of exactVariantKeys) {
    if (typeof rememberedPrices[k] === 'number' && rememberedPrices[k] > 0) {
      return rememberedPrices[k];
    }
  }

  // 2. Check if a base price per standard unit is explicitly stored
  const basePriceKeys = [
    `${pId}__basePrice`,
    `${pIdLower}__basePrice`,
    `${basePid}__basePrice`,
    `${basePidLower}__basePrice`,
    `${pName}__basePrice`,
    `${pNameLower}__basePrice`,
  ];

  for (const k of basePriceKeys) {
    const basePrice = rememberedPrices[k];
    if (typeof basePrice === 'number' && basePrice > 0) {
      return Number((basePrice * targetScale).toFixed(2));
    }
  }

  // 3. Check general remembered price key and scale proportionally
  const generalKeys = [
    pId,
    pIdLower,
    basePid,
    basePidLower,
    pName,
    pNameLower,
  ];

  for (const k of generalKeys) {
    const val = rememberedPrices[k];
    if (typeof val === 'number' && val > 0) {
      // Check if there is stored unit metadata for this key
      const storedUnit = rememberedPrices[`${k}__unit`];
      if (storedUnit) {
        const storedScale = parseUnitScale(storedUnit);
        if (storedScale > 0) {
          const baseRate = val / storedScale;
          return Number((baseRate * targetScale).toFixed(2));
        }
      }
      
      // If the product has a default primary unit (e.g. 25g or 1KG)
      const primaryUnit = product.unit || '1KG';
      const primaryScale = parseUnitScale(primaryUnit);
      
      // If the target unit matches the primary unit scale
      if (Math.abs(targetScale - primaryScale) < 0.0001) {
        return val;
      }
      
      // Calculate proportional rate based on primary unit
      if (primaryScale > 0) {
        const baseRate = val / primaryScale;
        return Number((baseRate * targetScale).toFixed(2));
      }

      // Default scale calculation
      return Number((val * targetScale).toFixed(2));
    }
  }

  // 4. If product has baseHorecaPrice in catalog
  if (product.baseHorecaPrice && product.baseHorecaPrice > 0) {
    return Number((product.baseHorecaPrice * targetScale).toFixed(2));
  }

  // 5. If product has horecaPrice in catalog
  if (product.horecaPrice && product.horecaPrice > 0) {
    return calculateHorecaPrice(product.horecaPrice, targetUnitClean);
  }

  return 0;
}


export function calculateBaseUnitPrice(price: number, unitStr: string | undefined): string | null {
  if (!unitStr) return null;
  
  const trimmed = unitStr.trim();
  const match = trimmed.match(/^([\d.]+)\s*(.*)$/);
  
  let val = 1;
  let unit = trimmed.toLowerCase();
  
  if (match) {
    val = parseFloat(match[1]) || 1;
    unit = match[2].trim().toLowerCase();
  }
  
  // Weight units
  if (['g', 'gm', 'gram', 'grams', 'kg', 'kilogram', 'kilograms'].includes(unit)) {
    const weightInKg = ['kg', 'kilogram', 'kilograms'].includes(unit) ? val : val / 1000;
    if (weightInKg <= 0) return null;
    const basePrice = price / weightInKg;
    const formattedPrice = basePrice % 1 === 0 ? basePrice.toFixed(0) : basePrice.toFixed(1);
    return `₹${formattedPrice}/KG`;
  }
  
  // Volume units
  if (['ml', 'l', 'ltr', 'litre', 'litres', 'liter', 'liters'].includes(unit)) {
    const volumeInLitre = ['ml'].includes(unit) ? val / 1000 : val;
    if (volumeInLitre <= 0) return null;
    const basePrice = price / volumeInLitre;
    const formattedPrice = basePrice % 1 === 0 ? basePrice.toFixed(0) : basePrice.toFixed(1);
    return `₹${formattedPrice}/Litre`;
  }
  
  // Piece units (PC)
  if (['pc', 'pcs', 'piece', 'pieces'].includes(unit)) {
    if (val <= 0) return null;
    const basePrice = price / val;
    const formattedPrice = basePrice % 1 === 0 ? basePrice.toFixed(0) : basePrice.toFixed(1);
    return `₹${formattedPrice}/PC`;
  }

  // Pack units (PACK)
  if (['pack', 'packs', 'pkt', 'packet', 'packets'].includes(unit)) {
    if (val <= 0) return null;
    const basePrice = price / val;
    const formattedPrice = basePrice % 1 === 0 ? basePrice.toFixed(0) : basePrice.toFixed(1);
    return `₹${formattedPrice}/PACK`;
  }

  // Box units
  if (['box', 'boxes'].includes(unit)) {
    if (val <= 0) return null;
    const basePrice = price / val;
    const formattedPrice = basePrice % 1 === 0 ? basePrice.toFixed(0) : basePrice.toFixed(1);
    return `₹${formattedPrice}/BOX`;
  }

  // Bottle units
  if (['bottle', 'bottles'].includes(unit)) {
    if (val <= 0) return null;
    const basePrice = price / val;
    const formattedPrice = basePrice % 1 === 0 ? basePrice.toFixed(0) : basePrice.toFixed(1);
    return `₹${formattedPrice}/BOTTLE`;
  }

  // Bunch units
  if (['bunch', 'bunches'].includes(unit)) {
    if (val <= 0) return null;
    const basePrice = price / val;
    const formattedPrice = basePrice % 1 === 0 ? basePrice.toFixed(0) : basePrice.toFixed(1);
    return `₹${formattedPrice}/BUNCH`;
  }

  // Fallback for custom/other units
  if (unit) {
    if (val <= 0) return null;
    const basePrice = price / val;
    const formattedPrice = basePrice % 1 === 0 ? basePrice.toFixed(0) : basePrice.toFixed(1);
    const unitLabel = unit.toUpperCase();
    return `₹${formattedPrice}/${unitLabel}`;
  }
  
  return null;
}

export function formatDisplayUnit(unitStr: string | undefined): string {
  if (!unitStr) return '';
  const trimmed = unitStr.trim();
  // Remove leading '1 ' (case insensitive) if followed by unit
  const cleaned = trimmed.replace(/^1\s+/i, '');
  return cleaned;
}

export function getUnitQuantityConfig(unitStr: string | undefined): { initialQty: number; step: number; isDiscrete: boolean } {
  if (!unitStr) return { initialQty: 1, step: 1, isDiscrete: true };
  const lower = unitStr.trim().toLowerCase();
  if (['kg', 'kilogram', 'kilograms', 'l', 'ltr', 'litre', 'litres', 'ft', 'foot', 'feet'].includes(lower)) {
    return { initialQty: 1, step: 0.5, isDiscrete: false };
  }
  return { initialQty: 1, step: 1, isDiscrete: true };
}

export function safeAddQuantity(current: number, step: number, isDiscrete: boolean): number {
  if (isDiscrete) {
    return Math.max(1, Math.round(current + step));
  }
  return Number((current + step).toFixed(3));
}

export function safeSubtractQuantity(current: number, step: number, isDiscrete: boolean, minQty: number = 0.01): number {
  if (isDiscrete) {
    return Math.max(Math.round(minQty), Math.round(current - step));
  }
  const result = Number((current - step).toFixed(3));
  return Math.max(minQty, result);
}

