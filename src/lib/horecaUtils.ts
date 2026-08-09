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
  
  // Piece / count units
  if (['pc', 'pcs', 'piece', 'pieces', 'pkt', 'packet', 'packets', 'pack', 'packs', 'bunch', 'bunches', 'box', 'boxes', 'bottle', 'bottles'].includes(unit)) {
    if (val <= 0) return null;
    const basePrice = (price / val) * 10;
    const formattedPrice = basePrice % 1 === 0 ? basePrice.toFixed(0) : basePrice.toFixed(1);
    return `₹${formattedPrice}/10 PC`;
  }
  
  // Fallback for custom text units with no leading number
  if (unit) {
    const basePrice = price * 10;
    const formattedPrice = basePrice % 1 === 0 ? basePrice.toFixed(0) : basePrice.toFixed(1);
    return `₹${formattedPrice}/10 PC`;
  }
  
  return null;
}

