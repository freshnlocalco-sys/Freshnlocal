const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf8');

code = code.replace(
  `horecaPrice: newProduct.horecaPrice ? Number(newProduct.horecaPrice) : undefined,
        category: finalCategory,`,
  `horecaPrice: newProduct.horecaPrice ? Number(newProduct.horecaPrice) : undefined,
        horecaUnit: newProduct.horecaUnit || '',
        category: finalCategory,`
);

fs.writeFileSync('src/pages/AdminDashboard.tsx', code);
console.log("Fixed updatedProductObj");
