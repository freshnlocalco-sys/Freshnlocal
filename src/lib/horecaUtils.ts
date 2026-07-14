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
