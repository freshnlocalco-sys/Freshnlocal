const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf8');

code = code.replace(
  /horecaUnit: newProduct\.horecaUnit \|\| '',\n          horecaUnit: newProduct\.horecaUnit \|\| '',/g,
  `horecaUnit: newProduct.horecaUnit || '',`
);

fs.writeFileSync('src/pages/AdminDashboard.tsx', code);
console.log("Fixed duplicate");
