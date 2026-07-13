function parseUnit(unitStr) {
  if (!unitStr) return 1;
  const match = unitStr.match(/^([\d.]+)\s*(kg|g|gm|l|ml|ltr|pc|pcs)$/i);
  if (!match) return 1;
  const val = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  
  if (unit === 'g' || unit === 'gm') return val / 1000;
  if (unit === 'ml') return val / 1000;
  if (unit === 'kg' || unit === 'l' || unit === 'ltr') return val;
  return 1;
}

console.log(parseUnit("500Gm"));
console.log(parseUnit("250g"));
console.log(parseUnit("1Kg"));
console.log(parseUnit("1.5Ltr"));
console.log(parseUnit("1Pc"));
