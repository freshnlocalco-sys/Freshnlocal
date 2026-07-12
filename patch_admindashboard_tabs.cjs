const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf8');

// 1. Add 'customers' to activeTab state
code = code.replace(
  "const [activeTab, setActiveTab] = useState<'orders' | 'products' | 'spotlights' | 'categories' | 'reviews' | 'hero' | 'branding'>('orders');",
  "const [activeTab, setActiveTab] = useState<'orders' | 'products' | 'spotlights' | 'categories' | 'customers' | 'reviews' | 'hero' | 'branding'>('orders');"
);

// 2. Add Customers tab button
const categoriesTabBtn = `              <button 
                onClick={() => setActiveTab('categories')}
                className={\`shrink-0 flex items-center gap-2.5 px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest transition-all whitespace-nowrap \${activeTab === 'categories' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground'}\`}
              >
                Categories
              </button>`;
const customersTabBtn = `              <button 
                onClick={() => setActiveTab('customers')}
                className={\`shrink-0 flex items-center gap-2.5 px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest transition-all whitespace-nowrap \${activeTab === 'customers' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground'}\`}
              >
                Customers
              </button>`;
code = code.replace(categoriesTabBtn, categoriesTabBtn + "\n" + customersTabBtn);

// 3. Add Customers tab content placeholder
const categoriesTabContentStart = "        ) : activeTab === 'categories' ? (";
const customersTabContent = `        ) : activeTab === 'customers' ? (
          <div className="space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-border shadow-sm">
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">Customers</h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">Manage user roles and HoReCa access</p>
              </div>
            </div>
            
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-border shadow-sm overflow-hidden">
              <div className="p-4 sm:p-6 text-center text-muted-foreground">
                Customer management loading...
              </div>
            </div>
          </div>`;
code = code.replace(categoriesTabContentStart, customersTabContent + "\n" + categoriesTabContentStart);

fs.writeFileSync('src/pages/AdminDashboard.tsx', code);
