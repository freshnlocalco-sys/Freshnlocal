import React, { useState, useEffect } from 'react';
import { useAuth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, getDocs, doc, updateDoc, addDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { Package, Users, ShoppingBag, Plus, Trash2, Upload, Download, Sparkles, Sliders, Check, FileText } from 'lucide-react';
import { Product } from '../store/useCart';
import * as XLSX from 'xlsx';
import { getCategoryImage } from '../lib/constants';
import toast from 'react-hot-toast';

export function AdminDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'orders' | 'products'>('orders');
  
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // New product form handling
  const [newProduct, setNewProduct] = useState({ name: '', price: '', category: 'indian fruits', description: '', imageUrl: '' });

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
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, activeTab);
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

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const docRef = await addDoc(collection(db, 'products'), {
        name: newProduct.name,
        price: Number(newProduct.price),
        category: newProduct.category,
        description: newProduct.description,
        imageUrl: newProduct.imageUrl || '',
        stock: 100,
        inStock: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      setProducts([{ id: docRef.id, name: newProduct.name, price: Number(newProduct.price), category: newProduct.category, description: newProduct.description, imageUrl: newProduct.imageUrl, stock: 100, inStock: true, createdAt: Date.now(), updatedAt: Date.now() } as unknown as Product, ...products]);
      setNewProduct({ name: '', price: '', category: 'indian fruits', description: '', imageUrl: '' });
      toast.success('New product cataloged successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'products');
      toast.error('Could not save product catalog.');
    }
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
        let rowPrice = row.price || row.cost || row.mrp || row.rate || row.amount || row.priceinrs || row.rupees;

        if (!rowName || rowPrice === undefined) {
          for (const key of Object.keys(row)) {
            const lowerKey = key.toLowerCase();
            if (!rowName && (lowerKey.includes('name') || lowerKey.includes('product') || lowerKey.includes('title') || lowerKey.includes('item') || lowerKey.includes('fruit') || lowerKey.includes('vegetable') || lowerKey.includes('veg'))) {
              rowName = row[key];
            }
            if (rowPrice === undefined && (lowerKey.includes('price') || lowerKey.includes('cost') || lowerKey.includes('mrp') || lowerKey.includes('rate') || lowerKey.includes('amount') || lowerKey.includes('value') || lowerKey.includes('rupee'))) {
              rowPrice = row[key];
            }
          }
        }

        if (!rowName || rowPrice === undefined) continue;
        
        const newProd = {
          name: String(rowName).trim(),
          price: Number(String(rowPrice).replace(/[^0-9.]/g, '') || 0),
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
    const headers = ['Name', 'Price', 'Category', 'Description', 'ImageUrl', 'Stock'];
    const sampleData = [
      ['Gourmet Red Apples', '180', 'Exotic Fruits', 'Sweet and crisp red apples imported from premium orchards.', 'https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg?auto=compress&cs=tinysrgb&w=800', '100'],
      ['Fresh Broccoli Crown', '95', 'Exotic Vegetables', 'Grown organic Broccoli clusters rich in vitamin C.', 'https://images.pexels.com/photos/1359421/pexels-photo-1359421.jpeg?auto=compress&cs=tinysrgb&w=800', '80']
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
    <div className="max-w-7xl mx-auto p-4 md:p-8 w-full bg-[#040804] text-white">
      
      {/* Title Desk */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5 pb-8 mb-12">
        <div className="space-y-1.5ClassName bg-transparent">
          <span className="glass-pill">Command Station</span>
          <h1 className="text-3xl lg:text-5xl font-sans font-black uppercase text-white tracking-tight mt-2.5">
            Logistics Control panel
          </h1>
        </div>
        
        {/* Sleek control navigation tab nodes */}
        <div className="flex bg-secondary p-1.5 rounded-2xl border border-white/10 shrink-0 select-none">
          <button 
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest transition-all ${activeTab === 'orders' ? 'bg-primary text-[#020602] shadow-[0_4px_15px_rgba(0,234,114,0.25)]' : 'text-slate-400 hover:text-white bg-transparent'}`}
          >
            <ShoppingBag className="w-3.5 h-3.5" /> Consignments
          </button>
          <button 
            onClick={() => setActiveTab('products')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest transition-all ${activeTab === 'products' ? 'bg-primary text-[#020602] shadow-[0_4px_15px_rgba(0,234,114,0.25)]' : 'text-slate-400 hover:text-white bg-transparent'}`}
          >
            <Package className="w-3.5 h-3.5" /> Larder Inventory
          </button>
        </div>
      </div>

      {loading ? (
        <div className="max-w-7xl mx-auto px-4 py-36 text-center text-muted-foreground font-mono text-xs uppercase tracking-widest flex flex-col items-center justify-center gap-4">
          <span className="w-8 h-8 rounded-full border-t-2 border-[#00ea72] animate-spin"></span>
          ACCESSING DATABASES & SYNCHRONIZING SECURE TUNNELS...
        </div>
      ) : (
        activeTab === 'orders' ? (
          <div className="slice-bento p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 bg-[#020602] text-[10px] font-black uppercase tracking-widest text-[#707c72]">
                    <th className="p-5">Consignment ID</th>
                    <th className="p-5">Consignee Details</th>
                    <th className="p-5">Lodged Timestamp</th>
                    <th className="p-5">Larder Loads / Cost</th>
                    <th className="p-5">Logistics status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs text-slate-300">
                  {orders.map(order => (
                    <tr key={order.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-5 font-mono font-black tracking-wider text-[#00ea72]">
                        {order.orderNumber || `FNL-${order.id.slice(0, 8).toUpperCase()}`}
                      </td>
                      <td className="p-5 leading-relaxed">
                        <span className="font-extrabold text-white uppercase block">{order.shippingDetails?.name}</span>
                        <span className="text-slate-400 font-mono text-xxs tracking-wider">{order.shippingDetails?.phone}</span>
                      </td>
                      <td className="p-5 font-medium">{new Date(order.createdAt).toLocaleDateString()}</td>
                      <td className="p-5 leading-relaxed">
                        <span className="text-white font-bold block">{order.items.length} units</span>
                        <span className="font-black text-[#00ea72]">₹{order.totalAmount}</span>
                      </td>
                      <td className="p-5">
                        <select 
                          value={order.status}
                          onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value)}
                          className="bg-[#020602] text-white px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10 outline-none focus:border-[#00ea72] transition-colors"
                        >
                          <option value="pending">Pending</option>
                          <option value="confirmed">Confirmed</option>
                          <option value="shipped">Shipped</option>
                          <option value="delivered">Delivered</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-slate-500 font-mono text-xxs tracking-widest uppercase">
                        Zero active consignments recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-12 gap-12 items-start">
            
            {/* Left form desk: manual additions & CSV operations */}
            <div className="lg:col-span-5 space-y-8 bg-secondary border border-white/10 p-8 rounded-[32px] shadow-lg">
              <div className="space-y-4">
                <h3 className="text-base font-black uppercase tracking-tight text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-primary" /> Create Product Listing
                </h3>
                
                <form onSubmit={handleAddProduct} className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">Crop/Item Name</label>
                    <input 
                      required 
                      placeholder="Royal Washington Red Apples..." 
                      className="w-full border border-white/10 rounded-2xl px-4 py-3.5 bg-white/5 outline-none focus:border-[#00ea72] text-[#f4fdf5] transition-colors text-xs" 
                      value={newProduct.name} 
                      onChange={e => setNewProduct({...newProduct, name: e.target.value})} 
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">Rate Price (₹)</label>
                      <input 
                        required 
                        type="number" 
                        placeholder="180" 
                        className="w-full border border-white/10 rounded-2xl px-4 py-3.5 bg-white/5 outline-none focus:border-[#00ea72] text-[#f4fdf5] transition-colors text-xs font-mono" 
                        value={newProduct.price} 
                        onChange={e => setNewProduct({...newProduct, price: e.target.value})} 
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">Inventory Category</label>
                      <select 
                        className="w-full border border-white/10 rounded-2xl p-3.5 bg-[#020602] outline-none focus:border-[#00ea72] text-[#f4fdf5] transition-colors text-[10px] uppercase font-bold tracking-wider" 
                        value={newProduct.category} 
                        onChange={e => setNewProduct({...newProduct, category: e.target.value})}
                      >
                        <option value="indian fruits">Indian Fruits</option>
                        <option value="exotic fruits">Exotic Fruits</option>
                        <option value="exotic vegetables">Exotic Vegetables</option>
                        <option value="herbs & seasoning">Herbs & Seasoning</option>
                        <option value="fresh & hygenic cut fruits and vegetables">Clean Cuts</option>
                        <option value="imported / super exotic vegetables font-bold">Global Luxe Veggies</option>
                        <option value="leafy greens font-bold">Leafy Greens</option>
                        <option value="frozen items font-bold">Frozen Premium</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">High-Res Product Image URL</label>
                    <input 
                      placeholder="https://images.pexels.com/..." 
                      className="w-full border border-white/10 rounded-2xl px-4 py-3.5 bg-white/5 outline-none focus:border-[#00ea72] text-[#f4fdf5] transition-colors text-xs font-mono" 
                      value={newProduct.imageUrl} 
                      onChange={e => setNewProduct({...newProduct, imageUrl: e.target.value})} 
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">Larder Description</label>
                    <textarea 
                      placeholder="Details about seed origin, crisp index, weight parameters..." 
                      rows={3} 
                      className="w-full border border-[#1a2a1f] rounded-2xl px-4 py-3.5 bg-white/5 outline-none focus:border-[#00ea72] text-[#f4fdf5] transition-colors text-xs resize-none placeholder:text-slate-600 font-medium leading-relaxed" 
                      value={newProduct.description} 
                      onChange={e => setNewProduct({...newProduct, description: e.target.value})}
                    />
                  </div>

                  <button 
                    type="submit" 
                    className="slice-btn-primary w-full py-4.5 text-[10px] font-black mt-2 shadow-[0_4px_15px_rgba(0,234,114,0.2)] hover:scale-102 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    Commit Stock <Plus className="w-4.5 h-4.5 text-black" />
                  </button>
                </form>
              </div>
              
              {/* Excel/CSV Block integration */}
              <div className="pt-8 border-t border-white/5 space-y-6" id="bulk-import-section">
                <div className="space-y-2">
                  <h3 className="text-base font-black uppercase tracking-tight text-white flex items-center gap-2">
                    <Upload className="w-5 h-5 text-primary" /> Bulk Harvest Injector
                  </h3>
                  <p className="text-slate-400 text-xxs font-semibold leading-relaxed">
                    Instantly catalog hundreds of crops from farmer spreadsheet boards. Fuzzy mappings auto-resolve headers.
                  </p>
                </div>
                
                <div className="p-5 bg-white/5 border border-dashed border-white/10 rounded-2xl space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-[#00ea72] flex items-center gap-1.5">
                    <Download className="w-4 h-4" /> Download Standard template sheets
                  </h4>
                  <div className="grid grid-cols-2 gap-3.5">
                    <button 
                      type="button" 
                      onClick={downloadExcelTemplate} 
                      className="flex items-center justify-center gap-2 py-3 px-4 bg-[#020602] hover:bg-neutral-900 text-[9px] font-black uppercase tracking-wider rounded-xl border border-white/10 transition-colors text-white cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-emerald-400" /> Excel (.xlsx)
                    </button>
                    <button 
                      type="button" 
                      onClick={downloadCsvTemplate} 
                      className="flex items-center justify-center gap-2 py-3 px-4 bg-[#020602] hover:bg-neutral-900 text-[9px] font-black uppercase tracking-wider rounded-xl border border-white/10 transition-colors text-white cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-blue-400" /> CSV (.csv)
                    </button>
                  </div>
                </div>

                <label className="w-full py-4.5 rounded-[18px] bg-white/5 hover:bg-[#00ea72]/10 border border-white/10 hover:border-[#00ea72]/50 text-white hover:text-primary transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest cursor-pointer">
                  <Upload className="w-4 h-4" /> Inject Excel / CSV file
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
            <div className="lg:col-span-7 bg-[#020602] border border-white/5 rounded-[32px] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-secondary text-[10px] font-black uppercase tracking-widest text-[#707c72]">
                      <th className="p-5">Product Details</th>
                      <th className="p-5">Catalog Category</th>
                      <th className="p-5">Rate (₹)</th>
                      <th className="p-5 text-right">Removal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs text-slate-300">
                    {products.map(product => (
                      <tr key={product.id} className="hover:bg-white/5 transition-colors">
                        <td className="p-5 flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-neutral-900 overflow-hidden border border-white/5 flex-shrink-0">
                            <img src={product.imageUrl || getCategoryImage(product.category)} alt="" className="w-full h-full object-cover" />
                          </div>
                          <span className="font-extrabold text-[#f4fdf5] uppercase tracking-wide">{product.name}</span>
                        </td>
                        <td className="p-5 font-bold uppercase tracking-wider text-[#707c72] text-[10px]">{product.category}</td>
                        <td className="p-5 font-bold font-mono text-white text-xs">₹{product.price}</td>
                        <td className="p-5 text-right">
                          <button 
                            onClick={() => handleDeleteProduct(product.id)} 
                            className="text-slate-500 hover:text-red-400 p-2.5 bg-white/5 border border-white/5 rounded-full hover:bg-red-500/10 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {products.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-10 text-center text-slate-500 font-mono text-xxs tracking-widest uppercase">
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
