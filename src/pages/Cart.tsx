import React, { useState } from 'react';
import { useCart } from '../store/useCart';
import { useAuth } from '../lib/firebase';
import { signIn, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Trash2, Plus, Minus, ArrowLeft, ShoppingBag, Truck, Wallet, ShieldCheck, Info } from 'lucide-react';
import { addDoc, collection, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate, Link } from 'react-router-dom';
import { getCategoryImage } from '../lib/constants';
import { useSettings } from '../store/useSettings';
import { usePWA } from '../store/usePWA';
import { QuantityInput } from '../components/QuantityInput';
import toast from 'react-hot-toast';

export function Cart() {
  const { categoryImages, faviconUrl } = useSettings();
  const { items, removeItem, updateQuantity, total, clearCart } = useCart();
  const cartItems = items.filter(item => item && item.product && item.product.id);
  const { user, setUser } = useAuth();
  const isHoreca = user?.role === 'horeca';
  const navigate = useNavigate();
  const { deferredPrompt, showInstallPrompt } = usePWA();
  const [showPwaModal, setShowPwaModal] = useState(false);
  const [logoError, setLogoError] = useState(false);
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
  const [addressLabel, setAddressLabel] = useState('Home');
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('delivery');
  const [selectedAddressId, setSelectedAddressId] = useState<string>(() => {
    if (user?.addresses && user.addresses.length > 0) {
      const defaultAddr = user.addresses.find(a => a.isDefault);
      return defaultAddr ? defaultAddr.id : user.addresses[0].id;
    }
    return 'new';
  });

  const [usePoints, setUsePoints] = useState(false);
  const userPoints = user?.points || 0;
  const canUsePoints = userPoints >= 100;
  const discount = usePoints && canUsePoints ? 100 : 0;
  const finalTotal = total() - discount;

  const hasOutOfStockItems = cartItems.some(item => !item.product.inStock);
  const hasInvalidRetailQuantity = !isHoreca && cartItems.some(item => item.quantity < 1);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (total() < 1000) return;
    if (hasOutOfStockItems) {
      toast.error("Please remove out of stock items from your cart before checking out.");
      return;
    }
    if (hasInvalidRetailQuantity) {
      toast.error("Retail orders require a minimum quantity of 1 for all items.");
      return;
    }
    if (!user) {
      toast.error(
        "Please Sign In using the profile icon in the top-right corner. If Google Login popups are blocked by your browser inside this preview frame, you can use the Email & Password option!", 
        { duration: 8000 }
      );
      return;
    }
    
    let formattedAddress = '';
    let orderPhone = phone;
    let finalAddresses = user.addresses ? [...user.addresses] : [];

    if (deliveryMethod === 'pickup') {
      formattedAddress = 'Gr Floor Hall, Reva Dham Apartment, Uma Bhawan Crossroad, Opp. Ashirwad Palace, Bhatar, Surat, Gujarat (Store Pickup)';
      if (!phone.trim()) {
        toast.error("Please provide a contact phone number.");
        return;
      }
    } else {
      if (selectedAddressId !== 'new') {
        const selectedObj = finalAddresses.find(a => a.id === selectedAddressId);
        if (!selectedObj) {
          toast.error("Selected address not found.");
          return;
        }
        formattedAddress = [
          selectedObj.line1,
          selectedObj.line2,
          selectedObj.landmark ? `Landmark: ${selectedObj.landmark}` : '',
          selectedObj.city,
          selectedObj.state,
          selectedObj.pincode ? `PIN: ${selectedObj.pincode}` : ''
        ].filter(Boolean).join(', ');
        orderPhone = selectedObj.phone || phone;
      } else {
        if (!addressLines.line1.trim() || !addressLines.line2.trim() || !addressLines.pincode.trim() || !phone.trim()) {
          toast.error("Please provide complete delivery address and phone number.");
          return;
        }
        
        formattedAddress = [
          addressLines.line1,
          addressLines.line2,
          addressLines.landmark ? `Landmark: ${addressLines.landmark}` : '',
          addressLines.city,
          addressLines.state,
          addressLines.pincode ? `PIN: ${addressLines.pincode}` : ''
        ].filter(Boolean).join(', ');
        
        const newAddressObj = {
          id: crypto.randomUUID(),
          label: addressLabel,
          name: user.displayName || 'Customer',
          phone: phone,
          line1: addressLines.line1,
          line2: addressLines.line2,
          landmark: addressLines.landmark,
          city: addressLines.city,
          state: addressLines.state,
          pincode: addressLines.pincode,
          isDefault: finalAddresses.length === 0
        };
        finalAddresses.push(newAddressObj);
      }
    }
    
    setLoading(true);
    try {
      const randomDigits = Math.floor(100000 + Math.random() * 900000);
      const orderNumber = `FNL-${randomDigits}`;

      const rawOrderData = {
        orderNumber,
        userId: user.uid,
        customerType: user.role || 'customer',
        items: cartItems.map(i => {
          const p: any = {
            id: i.product.id,
            name: typeof i.product.name === 'string' ? i.product.name.substring(0, 100) : i.product.name,
            price: i.product.price,
            unit: i.product.unit,
          };
          if (i.product.imageUrl && typeof i.product.imageUrl === 'string' && i.product.imageUrl.length < 500 && i.product.imageUrl.startsWith('http')) {
            p.imageUrl = i.product.imageUrl;
          }
          // Remove keys with undefined directly just in case this is top level
          Object.keys(p).forEach(k => p[k] === undefined && delete p[k]);
          return { product: p, quantity: i.quantity };
        }),
        totalAmount: finalTotal,
        discount: discount,
        pointsEarned: Math.floor(finalTotal / 100) * 2,
        pointsRedeemed: discount > 0 ? 100 : 0,
        status: 'pending',
        paymentMethod: 'COD',
        shippingDetails: {
          name: typeof user.displayName === 'string' ? user.displayName.substring(0, 50) : (user.displayName || 'Customer'),
          address: typeof formattedAddress === 'string' ? formattedAddress.substring(0, 500) : formattedAddress,
          phone: typeof orderPhone === 'string' ? orderPhone.substring(0, 20) : orderPhone
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      // Deep clone and strip all undefined values before passing to Firestore
      let orderData = JSON.parse(JSON.stringify(rawOrderData));
      
      console.log("--- ORDER SIZE AUDIT ---");
      Object.entries(orderData).forEach(([key, value]) => {
        const size = new Blob([JSON.stringify(value)]).size;
        console.log(`${key}: ${size} bytes`);
      });

      const totalSize = new Blob([JSON.stringify(orderData)]).size;
      console.log("Total document size:", totalSize);
      console.log("Number of items:", orderData.items.length);
      console.log("Estimated Firestore payload:", totalSize, "bytes");

      if (totalSize > 900000) {
        throw new Error(`Order too large: ${totalSize} bytes. Please remove some items or contact support.`);
      }
      
      const ordersRef = collection(db, 'orders');
      await addDoc(ordersRef, orderData);

      // Save address and points to user profile
      try {
        const userRef = doc(db, 'users', user.uid);
        const pointsEarned = Math.floor(finalTotal / 100) * 2;
        const newPoints = userPoints + pointsEarned - (discount > 0 ? 100 : 0);
        await updateDoc(userRef, { 
          address: formattedAddress, 
          phone: orderPhone, 
          addresses: finalAddresses,
          points: newPoints
        });
        setUser({ 
          ...user, 
          address: formattedAddress, 
          phone: orderPhone, 
          addresses: finalAddresses,
          points: newPoints
        });
      } catch (err) {
        console.error("Failed to save user address profile details", err);
      }

      clearCart();
      toast.success(`Order Placed successfully! Order ID: ${orderNumber}`);
      
      setShowPwaModal(true);
    } catch (error: any) {
      console.error(error);
      const errorMsg = error?.message || error?.error || String(error);
      toast.error(`Error committing order settlement: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  if (cartItems.length === 0 && !showPwaModal) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-36 px-4 text-center max-w-7xl mx-auto w-full bg-background text-foreground">
        <div className="w-20 h-20 bg-secondary border border-border flex items-center justify-center rounded-[24px] mb-8 shadow-inner">
          <ShoppingBag className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-sans font-black uppercase tracking-tight mb-3 text-foreground">Your order list is empty</h2>
        <p className="text-muted-foreground text-xs font-semibold max-w-sm mb-8 leading-relaxed">
          Unlock your fresh gourmet potential by placing hand-vetted local crops inside your checkout order.
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
    <>
      {showPwaModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-border rounded-3xl p-8 max-w-sm w-full shadow-2xl space-y-6 text-center">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4 overflow-hidden border border-border/60 shadow-[0_4px_16px_rgba(0,0,0,0.06)] p-3">
              {faviconUrl && !logoError ? (
                <img 
                  src={faviconUrl} 
                  alt="FreshNLocal.CO" 
                  onError={() => setLogoError(true)}
                  className="w-full h-full object-contain" 
                  style={{ 
                    imageRendering: '-webkit-optimize-contrast',
                    willChange: 'transform'
                  }}
                  referrerPolicy="no-referrer" 
                />
              ) : (
                <ShoppingBag className="w-10 h-10 text-primary" />
              )}
            </div>
            <h3 className="text-xl font-sans font-black uppercase tracking-tight text-foreground">
              Add FreshNLocal.CO to Home Screen
            </h3>
            <p className="text-sm text-muted-foreground font-semibold">
              Install our app for a faster, seamless shopping experience and easy access to your orders!
            </p>
            <div className="flex flex-col gap-3 pt-4">
              {deferredPrompt ? (
                <button
                  onClick={() => {
                    showInstallPrompt();
                    setShowPwaModal(false);
                    navigate('/profile');
                  }}
                  className="w-full slice-btn-primary px-6 py-4 text-xs font-black uppercase"
                >
                  Install App
                </button>
              ) : (
                <div className="text-xs text-muted-foreground bg-secondary p-3 rounded-xl border border-border text-left">
                  To install the app, tap your browser's menu (⋮ or ↗) and select <strong className="text-foreground">"Add to Home Screen"</strong> or <strong className="text-foreground">"Install App"</strong>.
                </div>
              )}
              <button
                onClick={() => {
                  setShowPwaModal(false);
                  navigate('/profile');
                }}
                className="w-full px-6 py-4 text-xs font-black uppercase text-muted-foreground hover:text-foreground transition-colors"
              >
                {deferredPrompt ? 'Maybe Later' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cartItems.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-36 px-4 text-center max-w-7xl mx-auto w-full bg-background text-foreground">
          <div className="w-20 h-20 bg-secondary border border-border flex items-center justify-center rounded-[24px] mb-8 shadow-inner">
            <ShoppingBag className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-sans font-black uppercase tracking-tight mb-3 text-foreground">Your order list is empty</h2>
          <p className="text-muted-foreground text-xs font-semibold max-w-sm mb-8 leading-relaxed">
            Unlock your fresh gourmet potential by placing hand-vetted local crops inside your checkout order.
          </p>
          <button 
            onClick={() => navigate('/shop')} 
            className="slice-btn-primary px-8 py-4 text-[10px]"
          >
            Begin Exploring Crops <ArrowLeft className="w-4 h-4 rotate-180 ml-1.5 text-white" />
          </button>
        </div>
      ) : (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 w-full grid grid-cols-1 lg:grid-cols-12 gap-12 bg-background">
      {/* Shopping Bag Items Roster */}
      <div className="lg:col-span-7 space-y-8">
        <div className="flex items-end justify-between border-b border-border pb-6">
          <div className="space-y-1.5">
            <span className="glass-pill">Checkout Chamber</span>
            <h1 className="text-2xl sm:text-3xl lg:text-5xl font-sans font-black uppercase text-foreground tracking-tight mt-2.5">
              Review Shopping Order
            </h1>
          </div>
        </div>
        
        {/* Banner with fresh gradient mimicking fintech benefits */}
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
          <div className="bg-primary/10 border border-primary/20 text-primary p-4 rounded-2xl text-xs sm:text-sm font-bold flex items-start gap-3 shadow-sm">
            <Info className="w-5 h-5 shrink-0 mt-0.5" />
            <p>You can click the quantity number to type custom values directly.</p>
          </div>
          {cartItems.map((item) => (
            <div key={item.product.id} className="slice-card flex flex-col sm:flex-row gap-6 p-6 items-start sm:items-center relative group">
              {/* Product preview card layout */}
              <div className="w-[120px] aspect-[4/3] bg-white dark:bg-white border border-border flex-shrink-0 relative rounded-2xl overflow-hidden shadow-inner">
                <img 
                  src={item.product.imageUrl || getCategoryImage(item.product.category, categoryImages) || undefined} 
                  alt={item.product.name} 
                  loading="lazy"
                  className="w-full h-full object-contain object-center"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="flex-1 flex flex-col sm:flex-row justify-between w-full">
                <div className="flex flex-col gap-1.5 mb-4 sm:mb-0">
                  <span className="text-[8px] font-mono tracking-widest text-muted-foreground uppercase">{(item.product.category || '').replace(/ font-bold/gi, '')}</span>
                  <h3 className="font-black text-[#09120b] hover:text-primary transition-colors text-sm uppercase tracking-wide">
                    {item.product.name}
                  </h3>
                  <div className="flex flex-col">
                    <div className="text-primary font-black text-base">₹{(item.product.price * item.quantity).toFixed(2)}</div>
                    {item.quantity !== 1 && (
                      <div className="text-xs text-muted-foreground font-medium">₹{item.product.price} / {item.product.unit || 'unit'}</div>
                    )}
                  </div>
                  {!item.product.inStock && (
                    <div className="mt-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-orange-500 bg-orange-500/10 px-2 py-1 rounded-md">
                        Out of Stock
                      </span>
                    </div>
                  )}
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
                  <div className={`flex items-center border border-border rounded-xl overflow-hidden p-1 order-1 sm:order-2 ${item.product.inStock ? 'bg-background' : 'bg-muted opacity-50'}`}>
                    <button 
                      onClick={() => {
                        const newQty = item.quantity - (isHoreca ? 0.5 : 1);
                        if (newQty <= 0) {
                          removeItem(item.product.id);
                        } else {
                          updateQuantity(item.product.id, newQty);
                        }
                      }}
                      disabled={!item.product.inStock}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg text-foreground ${item.product.inStock ? 'hover:bg-[#09120b] hover:text-white transition-colors cursor-pointer' : 'cursor-not-allowed'}`}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <QuantityInput
                      initialQuantity={item.quantity}
                      isHoreca={isHoreca}
                      className="w-14 text-center font-bold text-xs text-foreground bg-transparent outline-none border-b border-dashed border-foreground/30 focus:border-primary mx-1 py-1"
                      onUpdate={(val) => updateQuantity(item.product.id, val)}
                      onRemove={() => removeItem(item.product.id)}
                    />
                    <button 
                      onClick={() => updateQuantity(item.product.id, item.quantity + (isHoreca ? 0.5 : 1))} 
                      disabled={!item.product.inStock}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg text-foreground ${item.product.inStock ? 'hover:bg-[#09120b] hover:text-white transition-colors cursor-pointer' : 'cursor-not-allowed'}`}
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
              <span>Order Subtotal</span>
              <span className="font-mono text-foreground">₹{total().toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground">
              <span>Hyperlocal Logistics</span>
              <span className="text-primary font-black uppercase tracking-wider text-[9px] bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full">
                0 FEES
              </span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between items-center text-primary">
                <span>FNL Points Discount</span>
                <span className="font-mono font-bold">-₹{discount.toFixed(2)}</span>
              </div>
            )}
            <div className="pt-5 border-t border-border flex justify-between items-end">
              <span className="font-black text-foreground uppercase tracking-widest text-[10px]">Total Indebtedness</span>
              <span className="font-sans font-black text-3xl text-foreground">₹{finalTotal.toFixed(2)}</span>
            </div>
          </div>
          
          <form onSubmit={handleCheckout} className="space-y-8">
            <div className="space-y-5">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse"></span> Delivery Method
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <label className={`p-4 rounded-2xl border flex flex-col items-center gap-2 cursor-pointer transition-colors text-center ${deliveryMethod === 'delivery' ? 'bg-primary/5 border-primary/50' : 'bg-background border-border hover:border-primary/30'}`}>
                  <Truck className={`w-6 h-6 ${deliveryMethod === 'delivery' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="font-bold text-[10px] uppercase tracking-wider text-foreground">Home Delivery</span>
                  <input 
                    type="radio" 
                    name="deliveryMethod" 
                    value="delivery" 
                    checked={deliveryMethod === 'delivery'}
                    onChange={() => setDeliveryMethod('delivery')}
                    className="hidden" 
                  />
                </label>
                <label className={`p-4 rounded-2xl border flex flex-col items-center gap-2 cursor-pointer transition-colors text-center ${deliveryMethod === 'pickup' ? 'bg-primary/5 border-primary/50' : 'bg-background border-border hover:border-primary/30'}`}>
                  <ShoppingBag className={`w-6 h-6 ${deliveryMethod === 'pickup' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="font-bold text-[10px] uppercase tracking-wider text-foreground">Store Pick Up</span>
                  <input 
                    type="radio" 
                    name="deliveryMethod" 
                    value="pickup" 
                    checked={deliveryMethod === 'pickup'}
                    onChange={() => setDeliveryMethod('pickup')}
                    className="hidden" 
                  />
                </label>
              </div>
            </div>

            {deliveryMethod === 'delivery' ? (
              <div className="space-y-5">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse"></span> Shipping Directives
                </h3>
                
                <div className="space-y-4">
                  {user?.addresses && user.addresses.length > 0 && (
                    <div className="space-y-3 mb-6">
                      {user.addresses.map(addr => (
                        <label key={addr.id} className={`p-4 rounded-2xl border flex items-start gap-3 cursor-pointer transition-colors ${selectedAddressId === addr.id ? 'bg-primary/5 border-primary/30' : 'bg-background border-border hover:border-primary/50'}`}>
                          <input 
                            type="radio" 
                            name="selectedAddress" 
                            value={addr.id} 
                            checked={selectedAddressId === addr.id}
                            onChange={() => setSelectedAddressId(addr.id)}
                            className="mt-1 accent-primary" 
                          />
                          <div className="space-y-1 w-full">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-xs uppercase tracking-wider text-foreground">{addr.label}</span>
                              {addr.isDefault && <span className="text-[9px] font-black uppercase text-primary bg-primary/10 px-2 py-0.5 rounded-full">Default</span>}
                            </div>
                            <p className="text-muted-foreground text-xs leading-relaxed">
                              {addr.line1}, {addr.line2}
                              {addr.landmark ? `, ${addr.landmark}` : ''}
                              <br />
                              {addr.city}, {addr.state} - {addr.pincode}
                            </p>
                            <p className="text-foreground text-xs font-mono font-semibold pt-1">{addr.phone || phone}</p>
                          </div>
                        </label>
                      ))}
                      <label className={`p-4 rounded-2xl border flex items-center gap-3 cursor-pointer transition-colors ${selectedAddressId === 'new' ? 'bg-primary/5 border-primary/30' : 'bg-background border-border hover:border-primary/50'}`}>
                        <input 
                          type="radio" 
                          name="selectedAddress" 
                          value="new" 
                          checked={selectedAddressId === 'new'}
                          onChange={() => setSelectedAddressId('new')}
                          className="accent-primary" 
                        />
                        <span className="font-bold text-xs uppercase tracking-wider text-foreground">Add New Address</span>
                      </label>
                    </div>
                  )}
                  
                  {selectedAddressId === 'new' && (
                    <div className="space-y-4 pt-2 border-t border-border mt-4">
                      <div className="flex gap-2">
                        {['Home', 'Work', 'Other'].map(label => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => setAddressLabel(label)}
                            className={`px-4 py-2 border rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors ${addressLabel === label ? 'bg-primary text-white border-primary' : 'bg-background text-muted-foreground hover:border-primary/50 border-border'}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-[#506053] mb-2">Flat, House no., Building, Company, Apartment</label>
                        <input 
                          required={selectedAddressId === 'new' && deliveryMethod === 'delivery'} 
                          type="text"
                          value={addressLines.line1}
                          onChange={(e) => setAddressLines(prev => ({ ...prev, line1: e.target.value }))}
                          className="w-full border border-border rounded-xl px-4 py-3.5 bg-background outline-none focus:border-primary text-foreground transition-colors text-xs font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-[#506053] mb-2">Area, Street, Sector, Village</label>
                        <input 
                          required={selectedAddressId === 'new' && deliveryMethod === 'delivery'} 
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
                          required={selectedAddressId === 'new' && deliveryMethod === 'delivery'} 
                          type="text"
                          pattern="[0-9]{6}"
                          maxLength={6}
                          value={addressLines.pincode}
                          onChange={(e) => setAddressLines(prev => ({ ...prev, pincode: e.target.value.replace(/\D/g, '') }))}
                          className="w-full border border-border rounded-xl px-4 py-3.5 bg-background outline-none focus:border-primary text-foreground transition-colors text-xs font-semibold font-mono"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-[#506053]">Direct Contact Phone</label>
                        <input 
                          required={selectedAddressId === 'new' && deliveryMethod === 'delivery'} 
                          type="tel" 
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="w-full border border-border rounded-2xl px-4 py-4 bg-background outline-none focus:border-primary text-foreground transition-colors text-xs font-mono font-semibold"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse"></span> Store Information
                </h3>
                <div className="p-4 bg-secondary border border-border rounded-2xl space-y-2">
                  <p className="font-bold text-sm">FreshNLocal.CO Store</p>
                  <p className="text-muted-foreground text-xs leading-relaxed">Gr Floor Hall, Reva Dham Apartment, Uma Bhawan Crossroad, Opp. Ashirwad Palace, Bhatar, Surat, Gujarat</p>
                  <p className="text-muted-foreground text-xs mt-2">Pick up your order today during store hours (9 AM - 9 PM).</p>
                </div>
                <div className="space-y-2">
                  <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-[#506053]">Direct Contact Phone</label>
                  <input 
                    required={deliveryMethod === 'pickup'} 
                    type="tel" 
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full border border-border rounded-2xl px-4 py-4 bg-background outline-none focus:border-primary text-foreground transition-colors text-xs font-mono font-semibold"
                  />
                </div>
              </div>
            )}

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
            
            {user && (
              <div className="space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse"></span> FNL Points
                </h3>
                <div className="p-4 bg-background border border-border rounded-2xl">
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-border/50">
                    <span className="text-xs font-semibold">Available Points: <span className="font-bold text-primary">{userPoints}</span></span>
                    <span className="text-[10px] font-black uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                      Earns {Math.floor(finalTotal / 100) * 2} PTS
                    </span>
                  </div>
                  {canUsePoints ? (
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer mt-3">
                        <input 
                          type="checkbox" 
                          checked={usePoints} 
                          onChange={(e) => setUsePoints(e.target.checked)} 
                          className="w-4.5 h-4.5 accent-primary" 
                        />
                        <span className="text-[10px] font-black uppercase tracking-widest text-foreground">
                          Redeem 100 points for ₹100 off
                        </span>
                      </label>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-widest leading-relaxed mt-2">
                        Earn 2 FNL points on every ₹100 spent.
                      </p>
                    </div>
                  ) : (
                    <p className="text-[9px] text-muted-foreground uppercase tracking-widest leading-relaxed mt-2">
                      Reach 100 points to get up to ₹100 off. Earn 2 FNL points on every ₹100 spent.
                    </p>
                  )}
                </div>
              </div>
            )}

            {hasOutOfStockItems && (
              <div className="bg-orange-500/10 text-orange-500 border border-orange-500/15 p-4 rounded-2xl text-center text-[10px] font-black uppercase tracking-widest">
                Remove Out of Stock items to proceed
              </div>
            )}
            {total() < 1000 && !hasOutOfStockItems && (
              <div className="bg-red-500/10 text-red-500 border border-red-500/15 p-4 rounded-2xl text-center text-[10px] font-black uppercase tracking-widest">
                Minimum order checkout is ₹1000
              </div>
            )}
            
            {hasInvalidRetailQuantity && (
              <div className="bg-orange-500/10 text-orange-500 border border-orange-500/15 p-4 rounded-2xl text-center text-[10px] font-black uppercase tracking-widest">
                Retail orders require quantity 1+
              </div>
            )}
            
            {user ? (
              <button 
                type="submit" 
                disabled={loading || total() < 1000 || hasOutOfStockItems || hasInvalidRetailQuantity}
                className={`w-full py-4.5 text-[10px] uppercase font-black tracking-widest rounded-xl transition-all ${loading || total() < 1000 || hasOutOfStockItems || hasInvalidRetailQuantity ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-white hover:bg-[#09120b]'}`}
              >
                {loading ? 'Committing Settlement...' : 'Finalize Settlement Board'}
              </button>
            ) : (
              <button 
                type="button" 
                onClick={signIn} 
                disabled={total() < 1000 || hasOutOfStockItems || hasInvalidRetailQuantity} 
                className={`w-full py-4.5 text-[10px] uppercase font-black tracking-widest rounded-xl transition-all ${total() < 1000 || hasOutOfStockItems || hasInvalidRetailQuantity ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-white hover:bg-[#09120b]'}`}
              >
                Login to Settle Accounts
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
    )}
    </>
  );
}
