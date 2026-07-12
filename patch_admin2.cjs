const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf8');

code = code.replace(
  `horecaPrice: product.horecaPrice ? product.horecaPrice.toString() : '',
      category: product.category,
      subCategory: (product as any).subCategory || 'cold-pressed',
      description: product.description,
      imageUrl: product.imageUrl || '',
      unit: product.unit || '',
      variants: ((product as any).variants || []).map((v: any) => ({
        unit: v.unit,
        price: v.price ? v.price.toString() : '',
        originalPrice: v.originalPrice ? v.originalPrice.toString() : '',
        horecaPrice: v.horecaPrice ? v.horecaPrice.toString() : ''
      }))`,
  `horecaPrice: product.horecaPrice ? product.horecaPrice.toString() : '',
      horecaUnit: product.horecaUnit || '',
      category: product.category,
      subCategory: (product as any).subCategory || 'cold-pressed',
      description: product.description,
      imageUrl: product.imageUrl || '',
      unit: product.unit || '',
      variants: ((product as any).variants || []).map((v: any) => ({
        unit: v.unit,
        price: v.price ? v.price.toString() : '',
        originalPrice: v.originalPrice ? v.originalPrice.toString() : '',
        horecaPrice: v.horecaPrice ? v.horecaPrice.toString() : '',
        horecaUnit: v.horecaUnit || ''
      }))`
);

fs.writeFileSync('src/pages/AdminDashboard.tsx', code);
console.log("Success2");
