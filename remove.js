const fs = require('fs');
let data = fs.readFileSync('src/pages/FNLJuice.tsx', 'utf8');
data = data.replace(/[ \t]*imageUrl: "https:\/\/images\.unsplash\.com[^"]+",?\n/g, '');
fs.writeFileSync('src/pages/FNLJuice.tsx', data);
console.log('Images removed');
