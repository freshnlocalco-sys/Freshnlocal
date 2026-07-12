const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf8');

// Update activeTab logic
const search1 = "if (location.pathname.includes('/admin/inventory')) return 'products';";
const replace1 = search1 + "\n    if (location.pathname.includes('/admin/customers')) return 'customers';";
code = code.replace(search1, replace1);

// Import Users icon
const search2 = "import { FileSpreadsheet, Download, RefreshCw, Upload, Image as ImageIcon, Sparkles, Plus, Search, Grid, Edit2, CheckCircle2, XCircle, Clock, Save, MoreVertical, X, Check, Eye, Archive, Trash2, Calendar, TrendingUp, DollarSign, Package, MapPin, Truck, Sliders, ChevronDown } from 'lucide-react';";
const replace2 = "import { FileSpreadsheet, Download, RefreshCw, Upload, Image as ImageIcon, Sparkles, Plus, Search, Grid, Edit2, CheckCircle2, XCircle, Clock, Save, MoreVertical, X, Check, Eye, Archive, Trash2, Calendar, TrendingUp, DollarSign, Package, MapPin, Truck, Sliders, ChevronDown, Users } from 'lucide-react';";
code = code.replace(search2, replace2);

// Add tab button
const search3 = `          <button 
            onClick={() => navigate('/admin/categories')}
            className={\`shrink-0 flex items-center gap-2.5 px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest transition-all whitespace-nowrap \${activeTab === 'categories' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground'}\`}
          >
            <Sliders className="w-4 h-4" /> Categories
          </button>`;
const replace3 = search3 + `\n          <button 
            onClick={() => navigate('/admin/customers')}
            className={\`shrink-0 flex items-center gap-2.5 px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest transition-all whitespace-nowrap \${activeTab === 'customers' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground'}\`}
          >
            <Users className="w-4 h-4" /> Customers
          </button>`;
code = code.replace(search3, replace3);

fs.writeFileSync('src/pages/AdminDashboard.tsx', code);
