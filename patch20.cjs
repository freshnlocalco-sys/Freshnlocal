const fs = require('fs');
let code = fs.readFileSync('scripts/generate-meta.js', 'utf8');

code = code.replace(/Organic Produce Delivery/g, 'Fresh Produce Delivery');
code = code.replace(/premium organic delivery/g, 'premium fresh delivery');
code = code.replace(/catalog of organic fruits/g, 'catalog of fresh fruits');
code = code.replace(/local organic produce/g, 'local fresh produce');

fs.writeFileSync('scripts/generate-meta.js', code);
