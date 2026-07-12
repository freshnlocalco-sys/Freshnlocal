const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf8');

const search = "<span className=\"font-extrabold text-foreground uppercase block text-[10px] sm:text-xs\">{order.shippingDetails?.name || 'Customer'}</span>";
const replace = search + "\n                          <span className={`inline-flex px-1.5 py-0.5 mt-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${order.customerType === 'horeca' ? 'bg-orange-500/10 text-orange-600' : 'bg-blue-500/10 text-blue-600'}`}>\n                            {order.customerType || 'retail'}\n                          </span>";
code = code.replace(search, replace);

fs.writeFileSync('src/pages/AdminDashboard.tsx', code);
