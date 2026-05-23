import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, useAuth } from '../lib/firebase';
import { Order } from '../store/useCart';
import { Link, Navigate } from 'react-router-dom';
import { Package, ArrowRight, Sparkles, HelpCircle, Activity } from 'lucide-react';
import toast from 'react-hot-toast';

export function Orders() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrders() {
      if (!user) return;
      try {
        setLoading(true);
        const q = query(
          collection(db, 'orders'),
          where('userId', '==', user.uid)
        );
        const snapshot = await getDocs(q);
        const fetchedOrders = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Order[];
        
        fetchedOrders.sort((a, b) => b.createdAt - a.createdAt);
        setOrders(fetchedOrders);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'orders');
        toast.error('Failed to load transaction history.');
      } finally {
        setLoading(false);
      }
    }
    
    if (!authLoading) {
      fetchOrders();
    }
  }, [user, authLoading]);

  if (authLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-36 text-center text-muted-foreground font-mono text-xs uppercase tracking-widest flex flex-col items-center justify-center gap-4 bg-background">
        <span className="w-8 h-8 rounded-full border-t-2 border-primary animate-spin"></span>
        FETCHING SECURITY TOKENS & ORDER BOARDS...
      </div>
    );
  }
  
  if (!user) return <Navigate to="/" replace />;

  return (
    <div className="max-w-4xl mx-auto px-4 py-16 w-full bg-background text-foreground animate-fade-in">
      <div className="flex items-end justify-between border-b border-border pb-6 mb-12">
        <div className="space-y-1.5ClassName bg-transparent">
          <span className="glass-pill">History Desk</span>
          <h1 className="text-3xl md:text-5xl font-sans font-black uppercase text-foreground tracking-tight mt-2.5">
            Larder Board Logs
          </h1>
        </div>
        <div className="flex items-center gap-2 p-2 bg-secondary border border-border rounded-2xl text-[9px] font-mono tracking-wider text-muted-foreground">
          <Activity className="w-4.5 h-4.5 text-primary animate-pulse" /> SYSTEM SECURE
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-muted-foreground font-mono text-xs uppercase tracking-widest animate-pulse">
          Querying safe servers...
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-border rounded-[32px] bg-secondary flex flex-col items-center gap-6 p-8">
          <Package className="w-12 h-12 text-primary opacity-80" />
          <div className="space-y-1">
            <h3 className="text-base font-black uppercase tracking-tight text-foreground">No historical orders lodged</h3>
            <p className="text-muted-foreground text-xs font-semibold max-w-xs mx-auto">
              Your active credential has zero historical purchase logs. Start building your larder basket!
            </p>
          </div>
          <Link to="/shop" className="slice-btn-primary px-8 py-4 text-[10px] flex items-center gap-1.5 mt-2 shadow-none">
            Shop Catalog Now <ArrowRight className="w-4 h-4 text-white" />
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {orders.map((order) => (
            <div key={order.id} className="slice-card p-6 lg:p-8 space-y-6">
              
              {/* Header metrics */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-border font-sans">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-[10px] uppercase font-extrabold text-muted-foreground">
                  <div className="space-y-1">
                    <span className="text-muted-foreground text-[8px] tracking-[0.15em] block font-black">LOG NUMBER</span>
                    <span className="font-mono text-foreground tracking-wider text-xs block">
                      {order.orderNumber || `#FNL-${order.id.slice(0, 8).toUpperCase()}`}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground text-[8px] tracking-[0.15em] block font-black">TIMESTAMP</span>
                    <span className="text-foreground text-xs block">{new Date(order.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="space-y-1 col-span-2 md:col-span-1">
                    <span className="text-muted-foreground text-[8px] tracking-[0.15em] block font-black">SETTLEMENT AMOUNT</span>
                    <span className="text-primary text-xs font-black block">₹{order.totalAmount.toFixed(2)}</span>
                  </div>
                </div>

                <div>
                  <span className={`px-4.5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                    order.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/25' :
                    order.status === 'processing' ? 'bg-blue-500/10 text-blue-400 border-blue-500/25' :
                    order.status === 'shipped' ? 'bg-purple-500/10 text-purple-400 border-purple-500/25' :
                    order.status === 'delivered' ? 'bg-primary/10 text-primary border-primary/25 shadow-sm' :
                    'bg-red-500/10 text-red-500 border-red-500/25'
                  }`}>
                    {order.status}
                  </span>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-4 divide-y divide-border">
                {order.items.map((item, index) => {
                  const product = item.product || item;
                  return (
                    <div key={index} className="flex justify-between items-center pt-4 first:pt-0">
                      <div className="flex items-center gap-4">
                        {product.imageUrl ? (
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-background border border-border flex-shrink-0">
                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 bg-background border border-border rounded-xl flex items-center justify-center flex-shrink-0">
                            <Package className="w-4.5 h-4.5 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <p className="font-extrabold text-xs uppercase text-foreground tracking-wide">{product.name}</p>
                          <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">
                            QUANTITY: {item.quantity} × ₹{product.price}
                          </p>
                        </div>
                      </div>
                      <div className="font-sans font-black text-sm text-foreground">
                        ₹{(product.price * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Destination logistics block */}
              {order.shippingDetails && (
                <div className="bg-background border border-border p-5 rounded-2xl flex flex-col md:flex-row gap-8 justify-between text-xs font-semibold leading-relaxed">
                  <div className="space-y-1.5">
                    <h4 className="font-black text-[9px] uppercase tracking-wider text-primary">Consignee Card</h4>
                    <p className="text-foreground">{order.shippingDetails.name || 'Gourmet Customer'}</p>
                    <p className="text-muted-foreground font-mono text-xxs tracking-wider">{order.shippingDetails.phone}</p>
                  </div>
                  <div className="space-y-1.5 max-w-sm">
                    <h4 className="font-black text-[9px] uppercase tracking-wider text-primary">Consignment Port</h4>
                    <p className="text-foreground font-medium">{order.shippingDetails.address}</p>
                  </div>
                </div>
              )}

            </div>
          ))}
        </div>
      )}
    </div>
  );
}
