const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf8');

const importSearch = "import { collection, query, orderBy, getDocs, updateDoc, doc, deleteDoc, addDoc, setDoc, limit, startAfter, Timestamp } from 'firebase/firestore';";
if (!code.includes("AppUser")) {
  code = code.replace(importSearch, importSearch + "\nimport { AppUser } from '../lib/firebase';");
}

const search = "const [orders, setOrders] = useState<any[]>([]);";
const insert = `
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

  const handleToggleHoreca = async (customerUser: AppUser) => {
    if (customerUser.role === 'admin') {
      toast.error('Cannot change admin role');
      return;
    }
    const newRole = customerUser.role === 'horeca' ? 'customer' : 'horeca';
    try {
      await updateDoc(doc(db, 'users', customerUser.uid), { role: newRole });
      setCustomers(customers.map(c => c.uid === customerUser.uid ? { ...c, role: newRole } : c));
      toast.success(\`User role updated to \${newRole}\`);
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Failed to update role');
    }
  };
`;
code = code.replace(search, search + "\n" + insert);

fs.writeFileSync('src/pages/AdminDashboard.tsx', code);
