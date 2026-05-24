import React, { useState } from 'react';
import { useCart } from '../store/useCart';
import { useAuth } from '../lib/firebase';
import { signIn, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Trash2, Plus, Minus, ArrowLeft, ShoppingBag, Truck, Wallet, ShieldCheck } from 'lucide-react';
import { addDoc, collection, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate, Link } from 'react-router-dom';
import { getCategoryImage } from '../lib/constants';
import toast from 'react-hot-toast';

export function Cart() {
  const { items, removeItem, updateQuantity, total, clearCart } = useCart();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [addressLines, setAddressLines] = useState(() => {
    let line1 = user?.address || '';
    let line2 = '';
    let landmark = '';
    let city = 'Surat';
    let state = 'Gujarat';
    let pincode = '';

    if (user?.address && user.address.includes(', ')) {
      const parts = user.address.split(', ');
      if (parts.length >= 2) {
        line1 = parts[0];
        line2 = parts[1];
      }
      for (let i = 2; i < parts.length; i++) {
        if (parts[i].startsWith('Landmark: ')) {
          landmark = parts[i].replace('Landmark: ', '');
        } else if (parts[i].startsWith('PIN: ')) {
          pincode = parts[i].replace('PIN: ', '');
        } else if (parts[i] !== 'Surat' && parts[i] !== 'Gujarat') {
          line2 += ', ' + parts[i];
        }
      }
    }

    return {
      line1,
      line2,
      landmark,
      city,
      state,
      pincode
    };
  });
  const [phone, setPhone] = useState(user?.phone || '');

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (total() < 1000) return;
    if (!user) return signIn();
    
    if (!addressLines.line1.trim() || !addressLines.line2.trim() || !addressLines.pincode.trim() || !phone.trim()) {
      toast.error("Please provide complete delivery address and phone number.");
      return;
    }
    
    const formattedAddress = [
      addressLines.line1,
      addressLines.line2,
      addressLines.landmark ? `Landmark: ${addressLines.landmark}` : '',
      addressLines.city,
      addressLines.state,
      addressLines.pincode ? `PIN: ${addressLines.pincode}` : ''
    ].filter(Boolean).join(', ');
    
    setLoading(true);
    try {
      const randomDigits = Math.floor(100000 + Math.random() * 900000);
      const orderNumber = `FNL-${randomDigits}`;

      const orderData = {
        orderNumber,
        userId: user.uid,
        items: items.map(i => ({ product: i.product, quantity: i.quantity })),
        totalAmount: total(),
        status: 'pending',
        paymentMethod: 'COD',
        shippingDetails: {
          name: user.displayName || 'Customer',
          address: formattedAddress,
          phone
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      const ordersRef = collection(db, 'orders');
      await addDoc(ordersRef, orderData);

      // Save address to user profile
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, { address: formattedAddress, phone });
        setUser({ ...user, address: formattedAddress, phone });
      } catch (err) {
        console.error("Failed to save user address profile details", err);
      }

      clearCart();
      toast.success(`Order Placed successfully! Order ID: ${orderNumber}`);
      navigate('/profile');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'orders');
      toast.error("Error committing order settlement.");
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-36 px-4 text-center max-w-7xl mx-auto w-full bg-background text-foreground">
        <div className="w-20 h-20 bg-secondary border border-border flex items-center justify-center rounded-[24px] mb-8 shadow-inner">
          <ShoppingBag className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-3xl font-sans font-black uppercase tracking-tight mb-3 text-foreground">Your larder list is empty</h2>
        <p className="text-muted-foreground text-xs font-semibold max-w-sm mb-8 leading-relaxed">
          Unlock your fresh gourmet potential by placing hand-vetted local crops inside your checkout larder.
        </p>
        <button 
          onClick={() => navigate('/shop')} 
          className="slice-btn-primary px-8 py-4 text-[10px]"
        >
          Begin Exploring Crops <ArrowLeft className="w-4 h-4 rotate-180 ml-1.5 text-white" />
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 w-full grid grid-cols-1 lg:grid-cols-12 gap-12 bg-background">
      {/* Shopping Bag Items Roster */}
      <div className="lg:col-span-7 space-y-8">
        <div className="flex items-end justify-between border-b border-border pb-6">
          <div className="space-y-1.5">
            <span className="glass-pill">Checkout Chamber</span>
            <h1 className="text-3xl lg:text-5xl font-sans font-black uppercase text-foreground tracking-tight mt-2.5">
              Review Shopping Larder
            </h1>
          </div>
        </div>
        
        {/* Banner with organic gradient mimicking fintech benefits */}
        <div className="rounded-[22px] bg-secondary border border-primary/30 p-5 flex items-center justify-between text-foreground relative overflow-hidden">
          <div className="absolute -left-10 top-[-50px] w-24 h-24 bg-primary/10 rounded-full blur-xl"></div>
          <div className="flex items-center gap-3 z-10">
            <Truck className="w-5 h-5 text-primary" />
            <span className="font-extrabold text-[10px] uppercase tracking-widest text-[#2c3e30]">
              Instant local transport in Surat
            </span>
          </div>
          <span className="font-extrabold text-[10px] uppercase tracking-widest text-primary z-10">
            FREE ON BOARD
          </span>
        </div>

        <div className="space-y-6">
          {items.map((item) => (
            <div key={item.product.id} className="slice-card flex flex-col sm:flex-row gap-6 p-6 items-start sm:items-center relative group">
              {/* Product preview card layout */}
              <div className="w-[120px] aspect-[4/3] bg-background border border-border flex-shrink-0 relative rounded-2xl overflow-hidden shadow-inner">
                <img 
                  src={item.product.imageUrl || getCategoryImage(item.product.category)} 
                  alt={item.product.name} 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="flex-1 flex flex-col sm:flex-row justify-between w-full">
                <div className="flex flex-col gap-1.5 mb-4 sm:mb-0">
                  <span className="text-[8px] font-mono tracking-widest text-muted-foreground uppercase">{item.product.category.replace(/ font-bold/gi, '')}</span>
                  <h3 className="font-black text-[#09120b] hover:text-primary transition-colors text-sm uppercase tracking-wide">
                    {item.product.name}
                  </h3>
                  <div className="text-primary font-black text-base">₹{item.product.price}</div>
                </div>
                
                <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-4 w-full sm:w-auto self-stretch">
                  <button 
                    onClick={() => removeItem(item.product.id)} 
                    className="text-slate-400 hover:text-red-500 p-2 sm:p-1.5 bg-background border border-border hover:bg-red-500/10 rounded-full transition-all order-2 sm:order-1 cursor-pointer"
                    title="Remove Tier"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  
                  {/* Glass Quantity Controls */}
                  <div className="flex items-center border border-border bg-background rounded-xl overflow-hidden p-1 order-1 sm:order-2">
                    <button 
                      onClick={() => updateQuantity(item.product.id, Math.max(1, item.quantity - 1))} 
                      className="w-8 h-8 flex items-center justify-center hover:bg-[#09120b] hover:text-white transition-colors rounded-lg cursor-pointer text-foreground"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-8 text-center font-bold text-xs text-foreground">{item.quantity}</span>
                    <button 
                      onClick={() => updateQuantity(item.product.id, item.quantity + 1)} 
                      className="w-8 h-8 flex items-center justify-center hover:bg-[#09120b] hover:text-white transition-colors rounded-lg cursor-pointer text-foreground"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Settlement checkout form */}
      <div className="lg:col-span-5">
        <div className="bg-secondary border border-border rounded-[32px] p-6 lg:p-8 sticky top-28 space-y-8 shadow-sm">
          <h2 className="text-lg lg:text-xl font-sans font-black uppercase text-foreground tracking-wide border-b border-border pb-4">
            Settlement Summary
          </h2>

          <div className="space-y-4 text-xs font-semibold">
            <div className="flex justify-between items-center text-muted-foreground">
              <span>Larder Subtotal</span>
              <span className="font-mono text-foreground">₹{total().toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground">
              <span>Hyperlocal Logistics</span>
              <span className="text-primary font-black uppercase tracking-wider text-[9px] bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full">
                0 FEES
              </span>
            </div>
            <div className="pt-5 border-t border-border flex justify-between items-end">
              <span className="font-black text-foreground uppercase tracking-widest text-[10px]">Total Indebtedness</span>
              <span className="font-sans font-black text-3xl text-foreground">₹{total().toFixed(2)}</span>
            </div>
          </div>
          
          <form onSubmit={handleCheckout} className="space-y-8">
            <div className="space-y-5">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse"></span> Shipping Directives
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-[#506053] mb-2">Flat, House no., Building, Company, Apartment</label>
                  <input 
                    required 
                    type="text"
                    value={addressLines.line1}
                    onChange={(e) => setAddressLines(prev => ({ ...prev, line1: e.target.value }))}
                    className="w-full border border-border rounded-xl px-4 py-3.5 bg-background outline-none focus:border-primary text-foreground transition-colors text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-[#506053] mb-2">Area, Street, Sector, Village</label>
                  <input 
                    required 
                    type="text"
                    value={addressLines.line2}
                    onChange={(e) => setAddressLines(prev => ({ ...prev, line2: e.target.value }))}
                    className="w-full border border-border rounded-xl px-4 py-3.5 bg-background outline-none focus:border-primary text-foreground transition-colors text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-[#506053] mb-2">Landmark (Optional)</label>
                  <input 
                    type="text"
                    value={addressLines.landmark}
                    onChange={(e) => setAddressLines(prev => ({ ...prev, landmark: e.target.value }))}
                    className="w-full border border-border rounded-xl px-4 py-3.5 bg-background outline-none focus:border-primary text-foreground transition-colors text-xs font-semibold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-[#506053] mb-2">City</label>
                    <input 
                      disabled
                      type="text"
                      value={addressLines.city}
                      className="w-full border border-border rounded-xl px-4 py-3.5 bg-secondary/50 text-muted-foreground outline-none text-xs font-semibold cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-[#506053] mb-2">State</label>
                    <input 
                      disabled
                      type="text"
                      value={addressLines.state}
                      className="w-full border border-border rounded-xl px-4 py-3.5 bg-secondary/50 text-muted-foreground outline-none text-xs font-semibold cursor-not-allowed"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-[#506053] mb-2">Pincode</label>
                  <input 
                    required 
                    type="text"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={addressLines.pincode}
                    onChange={(e) => setAddressLines(prev => ({ ...prev, pincode: e.target.value.replace(/\D/g, '') }))}
                    className="w-full border border-border rounded-xl px-4 py-3.5 bg-background outline-none focus:border-primary text-foreground transition-colors text-xs font-semibold font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-[#506053]">Direct Contact Phone</label>
                <input 
                  required 
                  type="tel" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full border border-border rounded-2xl px-4 py-4 bg-background outline-none focus:border-primary text-foreground transition-colors text-xs font-mono font-semibold"
                />
              </div>
            </div>

            <div className="space-y-5">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-primary"></span> Settlement Route
              </h3>
              
              <label className="p-4 bg-primary/5 rounded-2xl border border-primary/20 flex items-center justify-between cursor-pointer hover:bg-primary/10 transition-colors">
                <div className="flex items-center gap-3">
                  <Wallet className="w-5 h-5 text-primary" />
                  <span className="font-black text-[9px] uppercase tracking-widest text-primary">
                    Cash on Delivery (COD)
                  </span>
                </div>
                <input type="radio" name="paymentMethod" checked readOnly className="w-4.5 h-4.5 accent-primary" />
              </label>
            </div>
            
            {total() < 1000 && (
              <div className="bg-red-500/10 text-red-500 border border-red-500/15 p-4 rounded-2xl text-center text-[10px] font-black uppercase tracking-widest">
                Minimum larder checkout is ₹1000
              </div>
            )}
            
            {user ? (
              <button 
                type="submit" 
                disabled={loading || total() < 1000}
                className="slice-btn-primary w-full py-4.5 text-[10px]"
              >
                {loading ? 'Committing Settlement...' : 'Finalize Settlement Board'}
              </button>
            ) : (
              <button 
                type="button" 
                onClick={signIn} 
                disabled={total() < 1000} 
                className="slice-btn-primary w-full py-4.5 text-[10px]"
              >
                Login to Settle Accounts
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
