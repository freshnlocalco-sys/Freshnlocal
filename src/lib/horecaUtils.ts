export function parseUnitScale(unitStr: string | undefined): number {
  if (!unitStr) return 1;
  const match = unitStr.match(/^([\d.]+)\s*(kg|g|gm|l|ml|ltr|pc|pcs)$/i);
  if (!match) return 1;
  const val = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  
  if (unit === 'g' || unit === 'gm') return val / 1000;
  if (unit === 'ml') return val / 1000;
  if (unit === 'kg' || unit === 'l' || unit === 'ltr') return val;
  if (unit === 'pc' || unit === 'pcs') return val;
  return 1;
}

export function getBaseUnit(unitStr: string | undefined): string {
  if (!unitStr) return 'Units';
  const match = unitStr.match(/^([\d.]+)\s*(kg|g|gm|l|ml|ltr|pc|pcs)$/i);
  if (!match) return 'Units';
  const unit = match[2].toLowerCase();
  
  if (unit === 'g' || unit === 'gm' || unit === 'kg') return 'Kg';
  if (unit === 'ml' || unit === 'l' || unit === 'ltr') return 'Ltr';
  if (unit === 'pc' || unit === 'pcs') return 'Pcs';
  return 'Units';
}

export function calculateHorecaPrice(horecaPricePerKg: number, unitStr: string): number {
  const scale = parseUnitScale(unitStr);
  return Number((horecaPricePerKg * scale).toFixed(2));
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
    return `₹${formattedPrice}/1KG`;
  }
  
  // Volume units
  if (['ml', 'l', 'ltr', 'litre', 'litres', 'liter', 'liters'].includes(unit)) {
    const volumeInLitre = ['ml'].includes(unit) ? val / 1000 : val;
    if (volumeInLitre <= 0) return null;
    const basePrice = price / volumeInLitre;
    const formattedPrice = basePrice % 1 === 0 ? basePrice.toFixed(0) : basePrice.toFixed(1);
    return `₹${formattedPrice}/1 Litre`;
  }
  
  // Piece units (PC)
  if (['pc', 'pcs', 'piece', 'pieces'].includes(unit)) {
    if (val <= 0) return null;
    const basePrice = price / val;
    const formattedPrice = basePrice % 1 === 0 ? basePrice.toFixed(0) : basePrice.toFixed(1);
    return `₹${formattedPrice}/1 PC`;
  }

  // Pack units (PACK)
  if (['pack', 'packs', 'pkt', 'packet', 'packets'].includes(unit)) {
    if (val <= 0) return null;
    const basePrice = price / val;
    const formattedPrice = basePrice % 1 === 0 ? basePrice.toFixed(0) : basePrice.toFixed(1);
    return `₹${formattedPrice}/1 PACK`;
  }

  // Box units
  if (['box', 'boxes'].includes(unit)) {
    if (val <= 0) return null;
    const basePrice = price / val;
    const formattedPrice = basePrice % 1 === 0 ? basePrice.toFixed(0) : basePrice.toFixed(1);
    return `₹${formattedPrice}/1 BOX`;
  }

  // Bottle units
  if (['bottle', 'bottles'].includes(unit)) {
    if (val <= 0) return null;
    const basePrice = price / val;
    const formattedPrice = basePrice % 1 === 0 ? basePrice.toFixed(0) : basePrice.toFixed(1);
    return `₹${formattedPrice}/1 BOTTLE`;
  }

  // Bunch units
  if (['bunch', 'bunches'].includes(unit)) {
    if (val <= 0) return null;
    const basePrice = price / val;
    const formattedPrice = basePrice % 1 === 0 ? basePrice.toFixed(0) : basePrice.toFixed(1);
    return `₹${formattedPrice}/1 BUNCH`;
  }

  // Fallback for custom/other units
  if (unit) {
    if (val <= 0) return null;
    const basePrice = price / val;
    const formattedPrice = basePrice % 1 === 0 ? basePrice.toFixed(0) : basePrice.toFixed(1);
    const unitLabel = unit.toUpperCase();
    return `₹${formattedPrice}/1 ${unitLabel}`;
  }
  
  return null;
}

export function getUnitQuantityConfig(unitStr: string | undefined): { initialQty: number; step: number; isDiscrete: boolean } {
  if (!unitStr) return { initialQty: 1, step: 1, isDiscrete: true };

  const trimmed = unitStr.trim();
  const match = trimmed.match(/^([\d.]+)\s*(.*)$/);

  let val = 1;
  let unit = trimmed.toLowerCase();

  if (match) {
    val = parseFloat(match[1]) || 1;
    unit = match[2].trim().toLowerCase();
  }

  // Weight units -> convert g/gm to Kg (e.g., 500gm -> 0.5, 200g -> 0.2, 1kg -> 1)
  if (['g', 'gm', 'gram', 'grams', 'kg', 'kilogram', 'kilograms'].includes(unit)) {
    const weightInKg = ['kg', 'kilogram', 'kilograms'].includes(unit) ? val : val / 1000;
    const qty = Math.max(0.01, Number(weightInKg.toFixed(3)));
    return { initialQty: qty, step: qty, isDiscrete: false };
  }

  // Volume units -> convert ml to Litre (e.g., 500ml -> 0.5, 1.5l -> 1.5)
  if (['ml', 'l', 'ltr', 'litre', 'litres', 'liter', 'liters'].includes(unit)) {
    const volumeInL = ['ml'].includes(unit) ? val / 1000 : val;
    const qty = Math.max(0.01, Number(volumeInL.toFixed(3)));
    return { initialQty: qty, step: qty, isDiscrete: false };
  }

  // Discrete count units (pc, pcs, pack, pkt, box, bottle, bunch) -> whole integers (1, 2, 3, 4, 5...)
  const initialCount = Math.max(1, Math.round(val));
  return { initialQty: initialCount, step: 1, isDiscrete: true };
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

