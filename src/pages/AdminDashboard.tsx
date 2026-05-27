import React, { useState, useEffect } from 'react';
import { useAuth, db, handleFirestoreError, OperationType, isQuotaError } from '../lib/firebase';
import { collection, query, getDocs, doc, updateDoc, addDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { Package, Users, ShoppingBag, Plus, Trash2, Upload, Download, Sparkles, Sliders, Check, FileText, Edit2, ChevronDown } from 'lucide-react';
import { Product } from '../store/useCart';
import * as XLSX from 'xlsx';
import { getCategoryImage } from '../lib/constants';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'bg-amber-400' },
  { value: 'confirmed', label: 'Confirmed', color: 'bg-blue-500' },
  { value: 'shipped', label: 'Shipped', color: 'bg-indigo-500' },
  { value: 'delivered', label: 'Delivered', color: 'bg-emerald-500' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-500' },
];

function OrderStatusDropdown({ currentStatus, onStatusChange }: { currentStatus: string, onStatusChange: (status: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const currentOption = STATUS_OPTIONS.find(o => o.value === currentStatus) || STATUS_OPTIONS[0];

  return (
    <div className="relative inline-block text-left w-[130px] sm:w-[150px]">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white text-foreground px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest border border-border focus:border-primary transition-colors cursor-pointer flex items-center justify-between shadow-sm outline-none"
      >
        <span className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${currentOption.color}`}></span>
          {currentOption.label}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform opacity-50 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
          <div className="absolute z-50 mt-1 w-full rounded-xl bg-white shadow-lg border border-border overflow-hidden">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onStatusChange(option.value);
                  setIsOpen(false);
                }}
                className="w-full text-left px-3.5 py-2.5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest hover:bg-black/5 flex items-center gap-2 transition-colors cursor-pointer text-foreground"
              >
                <span className={`w-2 h-2 rounded-full ${option.color}`}></span>
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function AdminDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'orders' | 'products'>('orders');
  
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // New product form handling
  const [newProduct, setNewProduct] = useState({ name: '', price: '', originalPrice: '', category: 'indian fruits', description: '', imageUrl: '' });
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    
    async function fetchData() {
      try {
        setLoading(true);
        if (activeTab === 'orders') {
          const ordersSnap = await getDocs(query(collection(db, 'orders')));
          setOrders(ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a:any, b:any) => b.createdAt - a.createdAt));
        } else {
          const prodSnap = await getDocs(query(collection(db, 'products')));
          setProducts(prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Product[]);
        }
      } catch (error: any) {
        if (isQuotaError(error)) {
          toast.error("Database limit reached. Dashboard data unavailable.");
        } else {
          handleFirestoreError(error, OperationType.LIST, activeTab);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user, activeTab]);

  if (user?.role !== 'admin') {
    return (
      <div className="max-w-md mx-auto my-24 p-8 rounded-[28px] bg-secondary border border-red-500/20 text-center space-y-4">
        <span className="text-red-400 font-mono text-xs uppercase tracking-widest block">403 FORBIDDEN</span>
        <h2 className="text-xl font-black uppercase text-white">Access Denied</h2>
        <p className="text-xs text-slate-400">You do not possess the necessary administrative credentials to view this control desk.</p>
      </div>
    );
  }

  const handleUpdateOrderStatus = async (orderId: string, status: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status, updatedAt: Date.now() });
      setOrders(orders.map(o => o.id === orderId ? { ...o, status } : o));
      toast.success(`Order ${orderId.slice(0, 6)} state changed to ${status}`);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `orders/${orderId}`);
      toast.error('Failed to update status.');
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProductId) {
        await updateDoc(doc(db, 'products', editingProductId), {
          name: newProduct.name,
          price: Number(newProduct.price),
          originalPrice: newProduct.originalPrice ? Number(newProduct.originalPrice) : null,
          category: newProduct.category,
          description: newProduct.description,
          imageUrl: newProduct.imageUrl || '',
          updatedAt: Date.now()
        });
        setProducts(products.map(p => p.id === editingProductId ? { ...p, name: newProduct.name, price: Number(newProduct.price), originalPrice: newProduct.originalPrice ? Number(newProduct.originalPrice) : undefined, category: newProduct.category, description: newProduct.description, imageUrl: newProduct.imageUrl || '' } as Product : p));
        toast.success('Product updated successfully!');
        setEditingProductId(null);
      } else {
        const docRef = await addDoc(collection(db, 'products'), {
          name: newProduct.name,
          price: Number(newProduct.price),
          originalPrice: newProduct.originalPrice ? Number(newProduct.originalPrice) : null,
          category: newProduct.category,
          description: newProduct.description,
          imageUrl: newProduct.imageUrl || '',
          stock: 100,
          inStock: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        setProducts([{ id: docRef.id, name: newProduct.name, price: Number(newProduct.price), originalPrice: newProduct.originalPrice ? Number(newProduct.originalPrice) : undefined, category: newProduct.category, description: newProduct.description, imageUrl: newProduct.imageUrl, stock: 100, inStock: true, createdAt: Date.now(), updatedAt: Date.now() } as unknown as Product, ...products]);
        toast.success('New product cataloged successfully!');
      }
      setNewProduct({ name: '', price: '', originalPrice: '', category: 'indian fruits', description: '', imageUrl: '' });
    } catch (error) {
      handleFirestoreError(error, editingProductId ? OperationType.UPDATE : OperationType.CREATE, 'products');
      toast.error('Could not save product catalog.');
    }
  };

  const handleEditSetup = (product: Product) => {
    setEditingProductId(product.id);
    setNewProduct({
      name: product.name,
      price: product.price.toString(),
      originalPrice: product.originalPrice ? product.originalPrice.toString() : '',
      category: product.category,
      description: product.description,
      imageUrl: product.imageUrl || ''
    });
    // Scroll to top or form could be useful, but let's keep it simple
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingProductId(null);
    setNewProduct({ name: '', price: '', category: 'indian fruits', description: '', imageUrl: '' });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Firestore max document size is 1MB. 
    // Approximately 700KB max file size for Base64 (which inflates by ~33%).
    const MAX_FILE_SIZE = 700 * 1024; 

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      
      // If file is small enough, use original upload without canvas compression
      if (file.size <= MAX_FILE_SIZE) {
        setNewProduct(prev => ({ ...prev, imageUrl: result }));
        return;
      }

      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        // Use higher quality for larger images before falling back
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        
        // Safety check - if somehow it's still extremely large, we could compress further,
        // but 1200x1200 at 0.92 usually stays safely under 600KB
        setNewProduct(prev => ({ ...prev, imageUrl: dataUrl }));
      };
      if (result) {
        img.src = result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!window.confirm('Do you really want to delete this product catalog item?')) return;
    try {
      await deleteDoc(doc(db, 'products', productId));
      setProducts(products.filter(p => p.id !== productId));
      toast.success('Product catalog cleared.');
    } catch (error) {
       handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
       toast.error('Failed to remove product.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const fileType = file.name.split('.').pop()?.toLowerCase();
      let rawJson: any[] = [];

      if (fileType === 'csv') {
        const text = await file.text();
        const splitRow = (line: string, delimiter: string): string[] => {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"' || char === "'") {
              inQuotes = !inQuotes;
            } else if (char === delimiter && !inQuotes) {
              result.push(current);
              current = '';
            } else {
              current += char;
            }
          }
          result.push(current);
          return result;
        };

        const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        if (lines.length >= 2) {
          const firstLine = lines[0];
          const delimiters = [',', ';', '\t'];
          let detectedDelimiter = ',';
          let maxCols = 0;

          for (const s of delimiters) {
            const cols = firstLine.split(s).length;
            if (cols > maxCols) {
              maxCols = cols;
              detectedDelimiter = s;
            }
          }

          const headers = splitRow(firstLine, detectedDelimiter).map(h => 
            h.replace(/^\ufeff/, '').replace(/^["']|["']$/g, '').trim().toLowerCase()
          );

          for (let i = 1; i < lines.length; i++) {
            const rowValues = splitRow(lines[i], detectedDelimiter);
            const item: Record<string, any> = {};
            for (let j = 0; j < headers.length; j++) {
              const key = headers[j];
              const val = rowValues[j] ? rowValues[j].replace(/^["']|["']$/g, '').trim() : '';
              if (key) {
                item[key] = val;
              }
            }
            rawJson.push(item);
          }
        }
      }

      if (rawJson.length === 0) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        rawJson = XLSX.utils.sheet_to_json(worksheet) as any[];
      }

      const batch = writeBatch(db);
      let importedCount = 0;

      for (const rawRow of rawJson) {
        const row: Record<string, any> = {};
        for (const key in rawRow) {
          const cleanKey = key.replace(/^\ufeff/, '').replace(/^["']|["']$/g, '').trim().toLowerCase();
          row[cleanKey] = rawRow[key];
        }

        let rowName = row.name || row.title || row.product || row.item || row.heading || row.label;
        let rowPrice = row.price || row.sellingprice || row.rate || row.amount || row.priceinrs || row.rupees;
        let rowMrp = row.mrp || row.originalprice || row.regularprice || row.retailprice || row.strikeoutprice;

        if (!rowName || rowPrice === undefined) {
          for (const key of Object.keys(row)) {
            const lowerKey = key.toLowerCase();
            if (!rowName && (lowerKey.includes('name') || lowerKey.includes('product') || lowerKey.includes('title') || lowerKey.includes('item') || lowerKey.includes('fruit') || lowerKey.includes('vegetable') || lowerKey.includes('veg'))) {
              rowName = row[key];
            }
            if (rowPrice === undefined && (lowerKey.includes('price') && !lowerKey.includes('mrp') && !lowerKey.includes('original') || lowerKey.includes('cost') || lowerKey.includes('rate') || lowerKey.includes('amount') || lowerKey.includes('value') || lowerKey.includes('rupee'))) {
              rowPrice = row[key];
            }
            if (rowMrp === undefined && (lowerKey.includes('mrp') || lowerKey.includes('original') || lowerKey.includes('regular'))) {
              rowMrp = row[key];
            }
          }
        }

        if (!rowName || rowPrice === undefined) continue;
        
        let parsedPrice = Number(String(rowPrice).replace(/[^0-9.]/g, '') || 0);
        let parsedMrp = rowMrp ? Number(String(rowMrp).replace(/[^0-9.]/g, '')) : undefined;

        const newProd = {
          name: String(rowName).trim(),
          price: parsedPrice,
          originalPrice: parsedMrp && parsedMrp > parsedPrice ? parsedMrp : null,
          category: (row.category || row.type || 'indian fruits').toLowerCase().trim(),
          description: row.description || row.desc || row.details || '',
          imageUrl: row.imageurl || row.image || row.img || row.photo || '',
          stock: Number(row.stock || row.quantity || row.qty || 100),
          inStock: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        
        const docRef = doc(collection(db, 'products'));
        batch.set(docRef, newProd);
        importedCount++;
      }
      
      if (importedCount === 0) {
        toast.error('No suitable products identified inside CSV. Standard columns expected: "Name", "Price".');
        setLoading(false);
        if (e.target) e.target.value = '';
        return;
      }

      await batch.commit();
      
      const prodSnap = await getDocs(query(collection(db, 'products')));
      setProducts(prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Product[]);

      toast.success(`Excel Import Complete! Cataloged ${importedCount} items.`);
    } catch (error: any) {
      console.error(error);
      toast.error(`Import failed: ${error.message || 'Server error'}`);
    } finally {
      setLoading(false);
      if (e.target) e.target.value = '';
    }
  };

  const downloadCsvTemplate = () => {
    const headers = ['Name', 'Price', 'MRP', 'Category', 'Description', 'ImageUrl', 'Stock'];
    const sampleData = [
      ['Gourmet Red Apples', '180', '250', 'Exotic Fruits', 'Sweet and crisp red apples imported from premium orchards.', 'https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg?auto=compress&cs=tinysrgb&w=800', '100'],
      ['Fresh Broccoli Crown', '95', '', 'Exotic Vegetables', 'Grown organic Broccoli clusters rich in vitamin C.', 'https://images.pexels.com/photos/1359421/pexels-photo-1359421.jpeg?auto=compress&cs=tinysrgb&w=800', '80']
    ];

    const csvRows = [
      headers.join(','),
      ...sampleData.map(row => row.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
    ];
    
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.id = "download-csv-link";
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "FreshNLocal_Bulk_Product_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadExcelTemplate = () => {
    try {
      const templateData = [
        {
          'Name': 'Premium Devgad Alphonso Mangoes',
          'Price': 250,
          'MRP': 350,
          'Category': 'indian fruits',
          'Description': 'Naturally ripened sweet, aromatic mangoes direct from farmers.',
          'ImageUrl': 'https://images.pexels.com/photos/2290753/pexels-photo-2290753.jpeg?auto=compress&cs=tinysrgb&w=800',
          'Stock': 150
        }
      ];

      const worksheet = XLSX.utils.json_to_sheet(templateData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Products Template');
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.id = "download-xlsx-link";
      link.href = url;
      link.setAttribute('download', 'FreshNLocal_Bulk_Product_Template.xlsx');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      downloadCsvTemplate();
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-4 md:p-8 w-full bg-background text-foreground">
      
      {/* Title Desk */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 border-b border-border pb-6 sm:pb-8 mb-6 sm:mb-12">
        <div className="space-y-1.5 bg-transparent">
          <span className="glass-pill text-[8px] sm:text-[10px]">Command Station</span>
          <h1 className="text-2xl sm:text-3xl lg:text-5xl font-sans font-black uppercase text-foreground tracking-tight mt-2.5">
            Logistics Control panel
          </h1>
        </div>
        
        {/* Sleek control navigation tab nodes */}
        <div className="flex w-full md:w-auto overflow-x-auto md:overflow-visible bg-secondary p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-border shrink-0 select-none">
          <button 
            onClick={() => setActiveTab('orders')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 rounded-xl font-extrabold text-[9px] sm:text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'orders' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:text-foreground bg-transparent'}`}
          >
            <ShoppingBag className="w-3.5 h-3.5" /> Consignments
          </button>
          <button 
            onClick={() => setActiveTab('products')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 rounded-xl font-extrabold text-[9px] sm:text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'products' ? 'bg-primary text-white shadow-[0_4px_15px_rgba(0,184,83,0.25)]' : 'text-muted-foreground hover:text-foreground bg-transparent'}`}
          >
            <Package className="w-3.5 h-3.5" /> Larder Inventory
          </button>
        </div>
      </div>

      {loading ? (
        <div className="max-w-7xl mx-auto px-4 py-36 text-center text-muted-foreground font-mono text-xs uppercase tracking-widest flex flex-col items-center justify-center gap-4">
          <span className="w-8 h-8 rounded-full border-t-2 border-primary animate-spin"></span>
          ACCESSING DATABASES & SYNCHRONIZING SECURE TUNNELS...
        </div>
      ) : (
        activeTab === 'orders' ? (
          <div className="slice-bento p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px] sm:min-w-[800px]">
                <thead>
                  <tr className="border-b border-border bg-secondary text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    <th className="p-3 sm:p-4 md:p-5 whitespace-nowrap">Consignment ID</th>
                    <th className="p-3 sm:p-4 md:p-5 whitespace-nowrap">Consignee Details</th>
                    <th className="p-3 sm:p-4 md:p-5 whitespace-nowrap">Lodged Timestamp</th>
                    <th className="p-3 sm:p-4 md:p-5 whitespace-nowrap">Larder Loads / Cost</th>
                    <th className="p-3 sm:p-4 md:p-5 whitespace-nowrap">Logistics status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-[10px] sm:text-xs text-foreground">
                  {orders.map(order => (
                    <tr key={order.id} className="hover:bg-black/5 transition-colors">
                      <td className="p-3 sm:p-4 md:p-5 font-mono font-black tracking-wider text-primary">
                        {order.orderNumber || `FNL-${order.id.slice(0, 8).toUpperCase()}`}
                      </td>
                      <td className="p-3 sm:p-4 md:p-5 leading-relaxed max-w-[200px] sm:max-w-xs whitespace-normal">
                        <span className="font-extrabold text-foreground uppercase block text-[10px] sm:text-xs">{order.shippingDetails?.name || 'Customer'}</span>
                        <span className="text-muted-foreground font-mono text-[8px] sm:text-xxs tracking-wider block mt-0.5">{order.shippingDetails?.phone || 'No phone'}</span>
                        <span className="text-muted-foreground text-[8px] sm:text-[9px] block mt-1 leading-snug">{order.shippingDetails?.address || 'No address provided'}</span>
                      </td>
                      <td className="p-3 sm:p-4 md:p-5 font-medium whitespace-nowrap">{new Date(order.createdAt).toLocaleDateString()}</td>
                      <td className="p-3 sm:p-4 md:p-5 leading-relaxed whitespace-nowrap">
                        <span className="text-foreground font-bold block">{order.items.length} units</span>
                        <span className="font-black text-primary">₹{order.totalAmount}</span>
                      </td>
                      <td className="p-3 sm:p-4 md:p-5">
                        <OrderStatusDropdown 
                          currentStatus={order.status} 
                          onStatusChange={(newStatus) => handleUpdateOrderStatus(order.id, newStatus)} 
                        />
                      </td>
                    </tr>
                  ))}
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-muted-foreground font-mono text-xxs tracking-widest uppercase">
                        Zero active consignments recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            
            {/* Left form desk: manual additions & CSV operations */}
            <div className="col-span-12 lg:col-span-5 space-y-6 sm:space-y-8 bg-secondary border border-border p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-[32px] shadow-sm">
              <div className="space-y-4">
                <h3 className="text-sm sm:text-base font-black uppercase tracking-tight text-foreground flex items-center gap-2">
                  {editingProductId ? <Edit2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary" /> : <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />} 
                  {editingProductId ? 'Edit Product Listing' : 'Create Product Listing'}
                </h3>
                
                <form onSubmit={handleSaveProduct} className="space-y-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Crop/Item Name</label>
                    <input 
                      required 
                      placeholder="Royal Washington Red Apples..." 
                      className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs" 
                      value={newProduct.name} 
                      onChange={e => setNewProduct({...newProduct, name: e.target.value})} 
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    <div className="space-y-1.5 sm:space-y-2">
                      <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Rate Price (₹)</label>
                      <input 
                        required 
                        type="number" 
                        placeholder="180" 
                        className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-mono" 
                        value={newProduct.price} 
                        onChange={e => setNewProduct({...newProduct, price: e.target.value})} 
                      />
                    </div>

                    <div className="space-y-1.5 sm:space-y-2">
                      <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">MRP (Optional ₹)</label>
                      <input 
                        type="number" 
                        placeholder="250" 
                        className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-mono" 
                        value={newProduct.originalPrice} 
                        onChange={e => setNewProduct({...newProduct, originalPrice: e.target.value})} 
                      />
                    </div>
                    
                    <div className="space-y-1.5 sm:space-y-2">
                      <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Inventory Category</label>
                      <select 
                        className="w-full border border-border rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[9px] sm:text-[10px] uppercase font-bold tracking-wider" 
                        value={newProduct.category} 
                        onChange={e => setNewProduct({...newProduct, category: e.target.value})}
                      >
                        <option value="indian fruits">Indian Fruits</option>
                        <option value="exotic fruits">Exotic Fruits</option>
                        <option value="exotic vegetables">Exotic Vegetables</option>
                        <option value="herbs & seasoning">Herbs & Seasoning</option>
                        <option value="fresh & hygenic cut fruits and vegetables">Clean Cuts</option>
                        <option value="imported / super exotic vegetables">Global Luxe Veggies</option>
                        <option value="leafy greens">Leafy Greens</option>
                        <option value="frozen items">Frozen Premium</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5 sm:space-y-2">
                    <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground flex justify-between">
                      <span>Product Image (URL or Upload)</span>
                      <label className="text-primary hover:underline cursor-pointer">
                        Direct Upload
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                      </label>
                    </label>
                    <div className="flex gap-2">
                      <div className="w-16 aspect-[4/3] bg-black/5 rounded-xl border border-border flex items-center justify-center overflow-hidden shrink-0">
                        {newProduct.imageUrl ? (
                          <img src={newProduct.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                          <Upload className="w-4 h-4 text-muted-foreground opacity-50" />
                        )}
                      </div>
                      <input 
                        placeholder="https://images.pexels.com/... or upload" 
                        className="w-full flex-1 border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs font-mono" 
                        value={newProduct.imageUrl} 
                        onChange={e => setNewProduct({...newProduct, imageUrl: e.target.value})} 
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 sm:space-y-2">
                    <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Larder Description</label>
                    <textarea 
                      placeholder="Details about seed origin, crisp index, weight parameters..." 
                      rows={3} 
                      className="w-full border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3.5 bg-white outline-none focus:border-primary text-foreground transition-colors text-[10px] sm:text-xs resize-none placeholder:text-muted-foreground font-medium leading-relaxed" 
                      value={newProduct.description} 
                      onChange={e => setNewProduct({...newProduct, description: e.target.value})}
                    />
                  </div>

                  {editingProductId ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                      <button 
                        type="button" 
                        onClick={handleCancelEdit}
                        className="w-full py-3 sm:py-4 text-[9px] sm:text-[10px] bg-white border border-border text-foreground font-black uppercase tracking-widest rounded-xl hover:bg-black/5 transition-all outline-none"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit" 
                        className="slice-btn-primary w-full py-3 sm:py-4 text-[9px] sm:text-[10px] font-black shadow-[0_4px_15px_rgba(0,184,83,0.2)] hover:scale-102 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        Update Stock <Check className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  ) : (
                    <button 
                      type="submit" 
                      className="slice-btn-primary w-full py-3 sm:py-4 text-[9px] sm:text-[10px] font-black mt-2 shadow-[0_4px_15px_rgba(0,184,83,0.2)] hover:scale-102 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      Commit Stock <Plus className="w-4 h-4 text-white" />
                    </button>
                  )}
                </form>
              </div>
              
              {/* Excel/CSV Block integration */}
              <div className="pt-6 sm:pt-8 border-t border-border space-y-4 sm:space-y-6" id="bulk-import-section">
                <div className="space-y-1 sm:space-y-2">
                  <h3 className="text-sm sm:text-base font-black uppercase tracking-tight text-foreground flex items-center gap-2">
                    <Upload className="w-4 h-4 sm:w-5 sm:h-5 text-primary" /> Bulk Harvest Injector
                  </h3>
                  <p className="text-muted-foreground text-[9px] sm:text-xxs font-semibold leading-relaxed">
                    Instantly catalog hundreds of crops from farmer spreadsheet boards. Fuzzy mappings auto-resolve headers.
                  </p>
                </div>
                
                <div className="p-4 sm:p-5 bg-white border border-dashed border-border rounded-xl sm:rounded-2xl space-y-3 sm:space-y-4">
                  <h4 className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Download Standard template sheets
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3.5">
                    <button 
                      type="button" 
                      onClick={downloadExcelTemplate} 
                      className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-3 px-2 sm:px-4 bg-background hover:bg-black/5 text-[8px] sm:text-[9px] font-black uppercase tracking-wider rounded-lg sm:rounded-xl border border-border transition-colors text-foreground cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" /> <span className="hidden sm:inline">Excel</span> (.xlsx)
                    </button>
                    <button 
                      type="button" 
                      onClick={downloadCsvTemplate} 
                      className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-3 px-2 sm:px-4 bg-background hover:bg-black/5 text-[8px] sm:text-[9px] font-black uppercase tracking-wider rounded-lg sm:rounded-xl border border-border transition-colors text-foreground cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500" /> <span className="hidden sm:inline">CSV</span> (.csv)
                    </button>
                  </div>
                </div>

                <label className="w-full py-3 sm:py-4.5 rounded-xl sm:rounded-[18px] bg-white hover:bg-primary/5 border border-border hover:border-primary/50 text-foreground hover:text-primary transition-all flex items-center justify-center gap-2 text-[9px] sm:text-[10px] font-black uppercase tracking-widest cursor-pointer">
                  <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Inject Excel / CSV file
                  <input 
                    type="file" 
                    accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                    className="hidden" 
                    onChange={handleFileUpload} 
                  />
                </label>
              </div>
            </div>
            
            {/* Live table view of product catalogs */}
            <div className="col-span-12 lg:col-span-7 bg-white border border-border shadow-sm rounded-2xl sm:rounded-[32px] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className="border-b border-border bg-secondary text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <th className="p-3 sm:p-4 md:p-5 whitespace-nowrap">Product Details</th>
                      <th className="p-3 sm:p-4 md:p-5 whitespace-nowrap">Catalog Category</th>
                      <th className="p-3 sm:p-4 md:p-5 whitespace-nowrap">Rate (₹)</th>
                      <th className="p-3 sm:p-4 md:p-5 text-right whitespace-nowrap">Controls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-[10px] sm:text-xs text-foreground">
                    {products.map(product => (
                      <tr key={product.id} className="hover:bg-black/5 transition-colors">
                        <td className="p-3 sm:p-4 md:p-5 flex items-center gap-2 sm:gap-3">
                          <div className="w-10 sm:w-12 md:w-16 aspect-[4/3] rounded-lg sm:rounded-xl bg-secondary overflow-hidden border border-border flex-shrink-0">
                            <img src={product.imageUrl || getCategoryImage(product.category)} alt="" className="w-full h-full object-cover" />
                          </div>
                          <span className="font-extrabold text-foreground uppercase tracking-wide truncate max-w-[100px] sm:max-w-[150px] lg:max-w-[200px] text-[9px] sm:text-xs">{product.name}</span>
                        </td>
                        <td className="p-3 sm:p-4 md:p-5 font-bold uppercase tracking-wider text-muted-foreground text-[8px] sm:text-[10px]">{product.category.replace(/ font-bold/gi, '')}</td>
                        <td className="p-3 sm:p-4 md:p-5 font-bold font-mono text-foreground text-[10px] sm:text-xs">₹{product.price}</td>
                        <td className="p-3 sm:p-4 md:p-5 text-right space-x-2">
                          <button 
                            onClick={() => handleEditSetup(product)} 
                            className="text-muted-foreground hover:text-primary p-1.5 sm:p-2 md:p-2.5 bg-background border border-border rounded-full hover:bg-primary/10 transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteProduct(product.id)} 
                            className="text-muted-foreground hover:text-red-500 p-1.5 sm:p-2 md:p-2.5 bg-background border border-border rounded-full hover:bg-red-500/10 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {products.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-10 text-center text-muted-foreground font-mono text-xxs tracking-widest uppercase">
                          Zero items registered inside the database yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )
      )}
    </div>
  );
}
