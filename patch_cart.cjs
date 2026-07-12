const fs = require('fs');
let code = fs.readFileSync('src/pages/Cart.tsx', 'utf8');

const search = "userId: user.uid,";
const replace = "userId: user.uid,\n        customerType: user.role || 'customer',";
code = code.replace(search, replace);

fs.writeFileSync('src/pages/Cart.tsx', code);
