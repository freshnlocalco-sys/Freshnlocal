const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf8');

const importSearch = "import { collection, query, orderBy, getDocs, updateDoc, doc, deleteDoc, addDoc, setDoc, limit, startAfter, Timestamp } from 'firebase/firestore';";
code = code.replace(importSearch, importSearch + "\nimport { AppUser } from '../lib/firebase';");

const stateSearch = "const [activeTab, setActiveTab] = useState<'orders' | 'products' | 'spotlights' | 'categories' | 'customers' | 'reviews' | 'hero' | 'branding'>('orders');";
const stateInsert = `
  const [customers, setCustomers] = useState<AppUser[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  const fetchCustomers = async () => {
    setLoadingCustomers(true);
    try {
      const q = query(collection(db, 'users'), orderBy('displayName'));
      const snapshot = await getDocs(q);
      import('../lib/cacheManager').then(m => m.trackFirestoreRead('users', snapshot.docs.length)).catch(() => {});
      const usersData = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser));
      setCustomers(usersData);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast.error('Failed to load customers');
    } finally {
      setLoadingCustomers(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'customers') {
      fetchCustomers();
    }
  }, [activeTab]);

  const handleToggleHoreca = async (user: AppUser) => {
    if (user.role === 'admin') {
      toast.error('Cannot change admin role');
      return;
    }
    const newRole = user.role === 'horeca' ? 'customer' : 'horeca';
    try {
      await updateDoc(doc(db, 'users', user.uid), { role: newRole });
      setCustomers(customers.map(c => c.uid === user.uid ? { ...c, role: newRole } : c));
      toast.success(\`User role updated to \${newRole}\`);
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Failed to update role');
    }
  };
`;
code = code.replace(stateSearch, stateSearch + "\n" + stateInsert);

const tabSearch = `<div className="bg-white rounded-2xl sm:rounded-3xl border border-border shadow-sm overflow-hidden">
              <div className="p-4 sm:p-6 text-center text-muted-foreground">
                Customer management loading...
              </div>
            </div>`;
const tabReplace = `
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-border shadow-sm overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-border">
                <input 
                  type="text" 
                  placeholder="Search customers by name, email, or phone..." 
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="w-full sm:max-w-md border border-border rounded-xl px-4 py-3 bg-muted/30 outline-none focus:border-primary text-xs"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/30 text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground border-b border-border">
                      <th className="px-4 sm:px-6 py-4">Customer</th>
                      <th className="px-4 sm:px-6 py-4">Contact</th>
                      <th className="px-4 sm:px-6 py-4">Role</th>
                      <th className="px-4 sm:px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingCustomers ? (
                      <tr>
                        <td colSpan={4} className="px-4 sm:px-6 py-8 text-center text-xs text-muted-foreground">Loading customers...</td>
                      </tr>
                    ) : customers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 sm:px-6 py-8 text-center text-xs text-muted-foreground">No customers found.</td>
                      </tr>
                    ) : (
                      customers.filter(c => 
                        (c.displayName || '').toLowerCase().includes(customerSearch.toLowerCase()) || 
                        (c.email || '').toLowerCase().includes(customerSearch.toLowerCase()) ||
                        (c.phone || '').includes(customerSearch)
                      ).map(customer => (
                        <tr key={customer.uid} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                          <td className="px-4 sm:px-6 py-4">
                            <div className="text-xs sm:text-sm font-bold text-foreground">{customer.displayName || 'Unknown'}</div>
                          </td>
                          <td className="px-4 sm:px-6 py-4">
                            <div className="text-[10px] sm:text-xs text-muted-foreground">{customer.email}</div>
                            {customer.phone && <div className="text-[10px] sm:text-xs text-muted-foreground">{customer.phone}</div>}
                          </td>
                          <td className="px-4 sm:px-6 py-4">
                            <span className={\`inline-flex px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider \${customer.role === 'admin' ? 'bg-red-500/10 text-red-600' : customer.role === 'horeca' ? 'bg-orange-500/10 text-orange-600' : 'bg-blue-500/10 text-blue-600'}\`}>
                              {customer.role || 'customer'}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 text-right">
                            {customer.role !== 'admin' && (
                              <button 
                                onClick={() => handleToggleHoreca(customer)}
                                className={\`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg transition-colors \${customer.role === 'horeca' ? 'bg-muted text-foreground hover:bg-muted/80' : 'bg-primary/10 text-primary hover:bg-primary/20'}\`}
                              >
                                {customer.role === 'horeca' ? 'Revoke HoReCa' : 'Make HoReCa'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>`;
code = code.replace(tabSearch, tabReplace);

fs.writeFileSync('src/pages/AdminDashboard.tsx', code);
