import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, useAuth, isQuotaError } from '../lib/firebase';
import { trackFirestoreRead } from '../lib/cacheManager';
import { Order, useCart } from '../store/useCart';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Package, ArrowRight, Sparkles, HelpCircle, Activity, CheckCircle2, Clock, Truck, FileCheck, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

const TIMELINE_STEPS = [
  { id: 'pending', label: 'Order Placed', desc: 'We received your order', icon: FileCheck },
  { id: 'confirmed', label: 'Processing', desc: 'Preparing dispatch', icon: Package },
  { id: 'shipped', label: 'On the Way', desc: 'Out for delivery', icon: Truck },
  { id: 'delivered', label: 'Delivered', desc: 'Order completed', icon: CheckCircle2 }
];

function OrderTimeline({ order }: { order: Order }) {
  if (order.status === 'cancelled') {
    return (
      <div className="py-4 px-4 bg-red-500/10 rounded-xl border border-red-500/20 text-red-500 text-center font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 mb-6">
         Order Cancelled
      </div>
    );
  }
  
  const normalizedStatus = order.status === 'processing' ? 'confirmed' : order.status;
  const currentIndex = TIMELINE_STEPS.findIndex(s => s.id === normalizedStatus);
  const activeIndex = currentIndex === -1 ? 0 : currentIndex;

  const formatDate = (timestamp: number) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    }).format(new Date(timestamp));
  }

  return (
    <div className="w-full border border-border bg-secondary/30 rounded-2xl p-6 sm:p-8 mb-6 overflow-hidden">
      <div className="flex flex-col relative space-y-8 sm:space-y-0 sm:flex-row sm:justify-between sm:px-2">
        
        {/* Desktop Active/Background Line */}
        <div className="hidden sm:block absolute top-[1.25rem] left-[12%] right-[12%] h-[2px] bg-border -z-10"></div>
        <div 
          className="hidden sm:block absolute top-[1.25rem] left-[12%] h-[2px] bg-primary transition-all duration-700 delay-300 -z-10" 
          style={{ width: `${(activeIndex / (TIMELINE_STEPS.length - 1)) * 76}%` }}
        ></div>

        {TIMELINE_STEPS.map((step, index) => {
          const isActive = index <= activeIndex;
          const isCurrent = index === activeIndex;
          const Icon = step.icon;
          
          let dateStr = '';
          if (index === 0) dateStr = formatDate(order.createdAt);
          else if (isCurrent && order.updatedAt) dateStr = formatDate(order.updatedAt);
          else if (isActive && order.updatedAt && index === TIMELINE_STEPS.length - 1) dateStr = formatDate(order.updatedAt);
          
          return (
            <div key={step.id} className="flex sm:flex-col items-start sm:items-center relative z-10 sm:w-1/4">
               {/* Mobile vertical lines */}
               {index !== TIMELINE_STEPS.length - 1 && (
                 <div className="sm:hidden absolute left-5 top-10 bottom-[-32px] w-[2px] bg-border -z-10"></div>
               )}
               {index !== TIMELINE_STEPS.length - 1 && isActive && (
                 <div 
                   className="sm:hidden absolute left-5 top-10 w-[2px] bg-primary -z-10 transition-all duration-700" 
                   style={{ 
                     bottom: activeIndex > index ? '-32px' : '50%',
                   }}
                 ></div>
               )}

              <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full border-2 flex items-center justify-center shrink-0 mb-0 sm:mb-4 mt-1 sm:mt-0
                ${isActive 
                  ? 'border-primary bg-primary shadow-[0_0_15px_rgba(0,184,83,0.3)]' 
                  : 'border-border bg-background text-muted-foreground'
                } transition-all duration-500`}
              >
                {isActive ? (
                  <div className="w-full h-full rounded-full bg-background flex items-center justify-center">
                    <Icon className={`w-4 h-4 md:w-5 md:h-5 ${isCurrent ? 'animate-pulse text-primary' : 'text-primary'}`} />
                  </div>
                ) : (
                  <Icon className="w-4 h-4 md:w-5 md:h-5" />
                )}
              </div>
              
              <div className="flex flex-col ml-5 sm:ml-0 sm:items-center sm:text-center mt-0 sm:mt-1 min-h-[3rem]">
                <span className={`text-[11px] md:text-xs font-black uppercase tracking-widest ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {step.label}
                </span>
                <span className={`text-[10px] mt-1 font-bold leading-snug ${isActive ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>
                  {step.desc}
                </span>
                {(isActive && dateStr) ? (
                  <span className="text-[9px] font-mono text-primary font-bold mt-2 flex items-center gap-1 sm:justify-center bg-primary/10 px-2 py-0.5 rounded-full w-fit">
                    {dateStr}
                  </span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );
}

export function Orders() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const { addItem } = useCart();
  const navigate = useNavigate();

  const handleOrderAgain = async (order: Order) => {
    let itemsAdded = 0;
    try {
      // Create an array of promises to fetch the latest product data for each item
      const addedProducts = [];
      for (const item of order.items) {
        const product = (item as any).product || item;
        // Verify product still exists in db to get latest price/stock
        if (product.id) {
          const docRef = doc(db, 'products', product.id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
             const data = docSnap.data();
             if (data.inStock) {
               addItem({ id: product.id, ...data } as any, item.quantity);
               itemsAdded++;
             }
          }
        }
      }
      
      if (itemsAdded > 0) {
        toast.success(`Added ${itemsAdded} items to cart`);
        navigate('/cart');
      } else {
        toast.error("Items from this order are no longer available.");
      }
    } catch(err) {
      console.error(err);
      toast.error("Failed to re-order items.");
    }
  };

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
        trackFirestoreRead('orders', snapshot.size);
        const fetchedOrders = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Order[];
        
        fetchedOrders.sort((a, b) => b.createdAt - a.createdAt);
        setOrders(fetchedOrders);
      } catch (error: any) {
        if (isQuotaError(error)) {
           toast.error("Database limit reached. Could not load history.");
           setOrders([]);
        } else {
          handleFirestoreError(error, OperationType.LIST, 'orders');
        }
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
            Order Board Logs
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
              Your active credential has zero historical purchase logs. Start building your order basket!
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
                    (order.status === 'processing' || order.status === 'confirmed') ? 'bg-blue-500/10 text-blue-500 border-blue-500/25' :
                    order.status === 'shipped' ? 'bg-purple-500/10 text-purple-500 border-purple-500/25' :
                    order.status === 'delivered' ? 'bg-primary/10 text-primary border-primary/25 shadow-sm' :
                    'bg-red-500/10 text-red-500 border-red-500/25'
                  }`}>
                    {order.status}
                  </span>
                </div>
              </div>

              <OrderTimeline order={order} />

              {/* Items List */}
              <div className="space-y-4 divide-y divide-border">
                {order.items.map((item, index) => {
                  const product = item.product || item;
                  return (
                    <div key={index} className="flex justify-between items-center pt-4 first:pt-0">
                      <div className="flex items-center gap-4">
                        {product.imageUrl ? (
                          <div className="w-16 aspect-[4/3] rounded-xl overflow-hidden bg-white dark:bg-white border border-border flex-shrink-0">
                            <img src={product.imageUrl} alt={product.name} loading="lazy" className="w-full h-full object-contain object-center" />
                          </div>
                        ) : (
                          <div className="w-16 aspect-[4/3] bg-background border border-border rounded-xl flex items-center justify-center flex-shrink-0">
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
              <div className="flex flex-col gap-4">
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
                
                {order.status === 'delivered' && (
                  <button 
                    onClick={() => handleOrderAgain(order)}
                    className="slice-btn-primary w-full sm:w-auto self-end px-6 py-3.5 text-[10px] flex items-center justify-center gap-2 group shadow-sm mt-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5 transition-transform group-hover:rotate-180 duration-500" />
                    Order Again
                  </button>
                )}
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  );
}
