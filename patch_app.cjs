const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const search = '<Route path="admin/categories" element={<AdminDashboard />} />';
const replace = search + '\n          <Route path="admin/customers" element={<AdminDashboard />} />';
code = code.replace(search, replace);

fs.writeFileSync('src/App.tsx', code);
