const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf8');

const search = "variants: (product as any).variants || []";
const replace = `variants: ((product as any).variants || []).map((v: any) => ({
        unit: v.unit,
        price: v.price ? v.price.toString() : '',
        originalPrice: v.originalPrice ? v.originalPrice.toString() : '',
        horecaPrice: v.horecaPrice ? v.horecaPrice.toString() : ''
      }))`;
code = code.replace(search, replace);

fs.writeFileSync('src/pages/AdminDashboard.tsx', code);
