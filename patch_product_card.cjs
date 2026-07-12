const fs = require('fs');
let code = fs.readFileSync('src/components/ProductCard.tsx', 'utf8');

code = code.replace(
  `const defaults = { unit: product.unit || '', price: product.price, originalPrice: product.originalPrice, horecaPrice: product.horecaPrice };
    if (variants.length === 0) return [defaults];
    return [defaults, ...variants.map(v => ({ 
      unit: v.unit, 
      price: Number(v.price), 
      originalPrice: v.originalPrice ? Number(v.originalPrice) : undefined,
      horecaPrice: v.horecaPrice ? Number(v.horecaPrice) : undefined
    }))];`,
  `const defaults = { unit: product.unit || '', price: product.price, originalPrice: product.originalPrice, horecaPrice: product.horecaPrice, horecaUnit: product.horecaUnit || '' };
    if (variants.length === 0) return [defaults];
    return [defaults, ...variants.map(v => ({ 
      unit: v.unit, 
      price: Number(v.price), 
      originalPrice: v.originalPrice ? Number(v.originalPrice) : undefined,
      horecaPrice: v.horecaPrice ? Number(v.horecaPrice) : undefined,
      horecaUnit: v.horecaUnit || ''
    }))];`
);

code = code.replace(
  `const currentPrice = isHoreca && currentVariant.horecaPrice ? currentVariant.horecaPrice : currentVariant.price;
  const currentOriginalPrice = currentVariant.originalPrice;
  const currentUnit = currentVariant.unit;`,
  `const currentPrice = isHoreca && currentVariant.horecaPrice ? currentVariant.horecaPrice : currentVariant.price;
  const currentOriginalPrice = currentVariant.originalPrice;
  const currentUnit = isHoreca && currentVariant.horecaUnit ? currentVariant.horecaUnit : currentVariant.unit;`
);

code = code.replace(
  `<option key={idx} value={idx}>{v.unit}</option>`,
  `<option key={idx} value={idx}>{isHoreca && v.horecaUnit ? v.horecaUnit : v.unit}</option>`
);


fs.writeFileSync('src/components/ProductCard.tsx', code);
console.log("Success4");
