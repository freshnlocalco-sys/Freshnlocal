const fs = require('fs');

let filePaths = [
  'src/store/useProducts.ts',
  'src/pages/AdminDashboard.tsx'
];

for (const p of filePaths) {
  let code = fs.readFileSync(p, 'utf8');
  code = code.replace(/products_v4/g, 'products_v5');
  fs.writeFileSync(p, code);
}
console.log("Bumped cache version to v5");
