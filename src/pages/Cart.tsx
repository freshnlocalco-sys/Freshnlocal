import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useCart, Product } from '../store/useCart';
import { useAuth } from '../lib/firebase';
import { signIn, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Trash2, Plus, Minus, ArrowLeft, ShoppingBag, Truck, Wallet, ShieldCheck, Info, Building2, ChevronRight, Loader2 } from 'lucide-react';
import { addDoc, collection, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate, Link } from 'react-router-dom';
import { getCategoryImage } from '../lib/constants';
import { useSettings } from '../store/useSettings';
import { usePWA } from '../store/usePWA';
import { useProducts } from '../store/useProducts';
import { ProductCard } from '../components/ProductCard';
import { QuickViewModal } from '../components/QuickViewModal';
import { QuantityInput } from '../components/QuantityInput';
import { FreeDeliveryProgressBar } from '../components/FreeDeliveryProgressBar';
import { getUnitQuantityConfig, safeAddQuantity, safeSubtractQuantity } from '../lib/horecaUtils';
import { SERVICEABLE_ZONES, isPincodeServiceable, getZoneByPincode } from '../lib/deliveryZones';
import { useDeliveryLocation } from '../store/useDeliveryLocation';
import { SEO } from '../components/SEO';
import { MapPin, AlertCircle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

function YouMightAlsoLikeSection({ 
  products, 
  onAddToCart, 
  onQuickView 
}: { 
  products: Product[]; 
  onAddToCart: (product: Product, quantity?: number) => void; 
  onQuickView: (product: Product) => void; 
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    let animationFrameId: number;
    let accumulatedScroll = 0;
    const pixelsPerFrame = 0.4; // Slow, smooth auto scroll like Home page
    
    const smoothScroll = () => {
      if (!isHovered && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const maxScrollLeft = container.scrollWidth - container.clientWidth;
        
        accumulatedScroll += pixelsPerFrame;
        
        if (accumulatedScroll >= 1) {
          const scrollPixels = Math.floor(accumulatedScroll);
          accumulatedScroll -= scrollPixels;
          
          if (container.scrollLeft >= maxScrollLeft - 1) {
            container.scrollLeft = 0;
          } else {
            container.scrollLeft += scrollPixels;
          }
        }
      }
      animationFrameId = requestAnimationFrame(smoothScroll);
    };

    animationFrameId = requestAnimationFrame(smoothScroll);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isHovered, products]);

  if (!products || products.length === 0) return null;

  return (
    <div 
      className="w-full mt-12 pt-8 border-t border-border group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 gap-2 px-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-sans font-black uppercase text-foreground tracking-tight">
              YOU MIGHT ALSO LIKE
            </h2>
            <span className="bg-primary/10 text-primary border border-primary/20 text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-wider">
              MATCHING PAIRINGS
            </span>
          </div>
          <p className="text-xs text-muted-foreground font-semibold mt-1">
            Fresh recommendations selected to match products in your cart
          </p>
        </div>
        <Link 
          to="/shop" 
          className="text-xs font-bold text-primary flex items-center hover:underline uppercase tracking-wider shrink-0 mt-2 sm:mt-0"
        >
          Browse All Products <ChevronRight className="w-4 h-4 ml-0.5" />
        </Link>
      </div>

      <div 
        ref={scrollContainerRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onTouchStart={() => setIsHovered(true)}
        onTouchEnd={() => setIsHovered(false)}
        className="w-full pb-6 overflow-x-auto no-scrollbar flex gap-3 sm:gap-4 lg:gap-6 px-2"
      >
        {products.map(product => (
          <div key={`recom-${product.id}`} className="w-[calc(50%-6px)] sm:w-[calc(50%-8px)] md:w-[calc(25%-12px)] lg:w-[calc(25%-18px)] xl:w-[calc(25%-18px)] shrink-0 snap-start flex">
            <div className="w-full">
              <ProductCard 
                product={product}
                onAddToCart={onAddToCart}
                onQuickView={onQuickView}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function calculateTotalUnitString(unitStr: string | undefined, qty: number): string {
  if (!unitStr) return '';
  const trimmed = unitStr.trim();
  const match = trimmed.match(/^([\d.]+)\s*(.*)$/);

  let val = 1;
  let unitName = trimmed;

  if (match) {
    val = parseFloat(match[1]) || 1;
    unitName = match[2].trim();
  } else {
    val = 1;
    unitName = trimmed;
  }

  const totalVal = val * qty;
  const unitLower = unitName.toLowerCase();

  // If the unit is "g" or "gm" or "grams" or "gram" and totalVal >= 1000, convert to "Kg"
  if (['g', 'gm', 'gram', 'grams'].includes(unitLower) && totalVal >= 1000) {
    const kgVal = totalVal / 1000;
    const formattedKg = kgVal % 1 === 0 ? kgVal.toFixed(0) : kgVal.toFixed(1);
    return `${formattedKg} Kg`;
  }

  const formattedTotalVal = totalVal % 1 === 0 ? totalVal.toFixed(0) : totalVal.toFixed(1);

  // Simple pluralization
  let displayUnit = unitName;
  if (qty > 1) {
    if (unitLower === 'pc') {
      displayUnit = 'Pcs';
    } else if (unitLower === 'piece') {
      displayUnit = 'Pieces';
    } else if (unitLower === 'packet') {
      displayUnit = 'Packets';
    } else if (unitLower === 'box') {
      displayUnit = 'Boxes';
    } else if (unitLower === 'bottle') {
      displayUnit = 'Bottles';
    }
  }

  return `${formattedTotalVal} ${displayUnit}`;
}

export function Cart() {
  const { categoryImages, faviconUrl } = useSettings();
  const { items, removeItem, updateQuantity, total, clearCart, addItem } = useCart();
  const { products, fetchProducts, hydrateFromIDB } = useProducts();
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const cartItems = items.filter(item => item && item.product && item.product.id);
  const { user, setUser } = useAuth();
  const isHoreca = user?.role === 'horeca' || user?.role === 'horeca_admin';
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

  const { usePoints: canUsePointsBool } = { usePoints: true };
  const { selectedLocation, openLocationModal } = useDeliveryLocation();

  // If user has a selected location in store and address lines pincode is empty, populate it
  useEffect(() => {
    if (selectedLocation && !addressLines.pincode) {
      setAddressLines(prev => ({
        ...prev,
        pincode: selectedLocation.pincode,
        line2: prev.line2 ? prev.line2 : selectedLocation.areaName,
      }));
    }
  }, [selectedLocation]);

  const selectedAddressObj = useMemo(() => {
    if (selectedAddressId !== 'new' && user?.addresses) {
      return user.addresses.find(a => a.id === selectedAddressId);
    }
    return null;
  }, [selectedAddressId, user?.addresses]);

  const activePincode = useMemo(() => {
    if (deliveryMethod === 'pickup') return '395017';
    if (selectedAddressId !== 'new' && selectedAddressObj) {
      return (selectedAddressObj.pincode || '').trim().replace(/\D/g, '');
    }
    return (addressLines.pincode || '').trim().replace(/\D/g, '');
  }, [deliveryMethod, selectedAddressId, selectedAddressObj, addressLines.pincode]);

  const isDeliveryPincodeServiceable = useMemo(() => {
    if (deliveryMethod === 'pickup') return true;
    if (!activePincode) return false;
    return isPincodeServiceable(activePincode);
  }, [deliveryMethod, activePincode]);

  const currentMatchedZone = useMemo(() => {
    return getZoneByPincode(activePincode);
  }, [activePincode]);

  const [usePoints, setUsePoints] = useState(false);
  const userPoints = user?.points || 0;
  const canUsePoints = userPoints >= 100;
  const discount = usePoints && canUsePoints ? 100 : 0;
  const finalTotal = total() - discount;

  const hasOutOfStockItems = !isHoreca && cartItems.some(item => !item.product.inStock);
  const hasInvalidRetailQuantity = !isHoreca && cartItems.some(item => item.quantity <= 0);

  useEffect(() => {
    async function init() {
      await hydrateFromIDB();
      fetchProducts();
    }
    init();
  }, [fetchProducts, hydrateFromIDB]);

  const recommendedProducts = useMemo(() => {
    if (!products || products.length === 0) return [];

    const cartProductIds = new Set(cartItems.map(item => item.product.id));
    const available = products.filter(p => p && p.id && !cartProductIds.has(p.id) && !cartItems.some(ci => ci.product.id.startsWith(p.id)));

    if (available.length === 0) return [];

    const cartCategories = Array.from(
      new Set(
        cartItems
          .map(item => (item.product.category || '').toLowerCase().trim())
          .filter(Boolean)
      )
    );

    if (cartCategories.length === 0) {
      return available.filter(p => p.inStock).slice(0, 8);
    }

    const sameCategory = available.filter(p => {
      const pCat = (p.category || '').toLowerCase().trim();
      return cartCategories.some(cCat => pCat.includes(cCat) || cCat.includes(pCat));
    });

    const otherCategory = available.filter(p => !sameCategory.includes(p));

    const combined = [...sameCategory, ...otherCategory].filter(p => p.inStock);
    return combined.slice(0, 8);
  }, [products, cartItems]);

  const handleAddToCartRecommended = (product: Product, quantity?: number) => {
    addItem(product, quantity || 1);
    toast.success(`Added ${product.name} to cart!`);
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isHoreca && deliveryMethod === 'delivery' && total() < 1000) return;
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
      // Validate Home Delivery Pincode against allowed Surat zones
      if (!isDeliveryPincodeServiceable) {
        toast.error(
          `Home delivery is not available for pincode "${activePincode || 'entered'}". We deliver to selected Surat zones only. Please switch to Store Pickup or enter a serviceable address.`,
          { duration: 6000 }
        );
        return;
      }

      if (selectedAddressId !== 'new') {
        const selectedObj = finalAddresses.find(a => a.id === selectedAddressId);
        if (!selectedObj) {
          toast.error("Selected address not found.");
          return;
        }
        if (!isPincodeServiceable(selectedObj.pincode)) {
          toast.error(`The selected address pincode (${selectedObj.pincode}) is outside our delivery zone. Please choose a serviceable address or select Store Pickup.`);
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

        if (!isPincodeServiceable(addressLines.pincode)) {
          toast.error(`Pincode ${addressLines.pincode} is not in our delivery zones. Please check our supported Surat areas.`);
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
        isHoreca: isHoreca,
        items: cartItems.map(i => {
          const p: any = {
            id: i.product.id,
            name: typeof i.product.name === 'string' ? i.product.name.substring(0, 100) : i.product.name,
            price: typeof i.product.price === 'number' && i.product.price > 0 ? i.product.price : (isHoreca ? 0 : (i.product.price || 0)),
            unit: i.product.unit,
          };
          if (i.product.imageUrl && typeof i.product.imageUrl === 'string' && i.product.imageUrl.length < 500 && i.product.imageUrl.startsWith('http')) {
            p.imageUrl = i.product.imageUrl;
          }
          // Remove keys with undefined directly just in case this is top level
          Object.keys(p).forEach(k => p[k] === undefined && delete p[k]);
          return { product: p, quantity: i.quantity };
        }),
        totalAmount: isHoreca ? (finalTotal > 0 ? finalTotal : 0) : finalTotal,
        discount: isHoreca ? 0 : discount,
        pointsEarned: isHoreca ? 0 : Math.floor(finalTotal / 100) * 2,
        pointsRedeemed: isHoreca ? 0 : (discount > 0 ? 100 : 0),
        status: 'pending',
        paymentMethod: isHoreca ? 'B2B Invoice' : 'COD',
        deliveryMethod,
        shippingDetails: {
          name: typeof user.displayName === 'string' ? user.displayName.substring(0, 50) : (user.displayName || 'Customer'),
          email: user.email,
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
        <SEO title="Your Cart" description="Review your fresh organic crops, farm fruits, vegetables, and cold-pressed elixirs before proceeding to secure checkout." />
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
      <SEO title="Your Cart" description="Review your fresh organic crops, farm fruits, vegetables, and cold-pressed elixirs before proceeding to secure checkout." />
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
        <div className="flex-1 flex flex-col items-center justify-center py-20 px-4 max-w-7xl mx-auto w-full bg-background text-foreground">
          <div className="text-center flex flex-col items-center">
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

          <YouMightAlsoLikeSection 
            products={recommendedProducts}
            onAddToCart={handleAddToCartRecommended}
            onQuickView={setQuickViewProduct}
          />
        </div>
      ) : (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 w-full bg-background text-foreground">
      {/* Instamart Header Bar */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/shop')} 
            className="w-9 h-9 bg-secondary hover:bg-secondary/80 rounded-full flex items-center justify-center transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-sans font-black uppercase text-foreground tracking-tight">
              Your Cart
            </h1>
            <p className="text-xs text-muted-foreground font-semibold">
              {cartItems.length} {cartItems.length === 1 ? 'item' : 'items'} in your order
            </p>
          </div>
        </div>
        <button 
          onClick={clearCart}
          className="text-xs font-bold text-red-500 hover:text-red-600 bg-red-500/10 px-3 py-1.5 rounded-xl transition-colors"
        >
          Clear Cart
        </button>
      </div>

      {/* Free Delivery / Savings Banner */}
      <div className="mb-6">
        <FreeDeliveryProgressBar 
          currentTotal={total()} 
          threshold={1000} 
          isHoreca={isHoreca} 
          showShopLink={false}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Items & Delivery Column */}
        <div className="lg:col-span-7 space-y-6">
          {/* Delivery Time & Items Card */}
          <div className="bg-secondary/40 border border-border rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse"></span>
                <span className="text-xs font-black uppercase tracking-wider text-foreground">24 Hrs Delivery</span>
              </div>
              <span className="text-xs font-bold text-muted-foreground">{cartItems.length} items</span>
            </div>

            {/* Cart Items List */}
            <div className="space-y-4">
              {cartItems.map((item) => (
                <div key={item.product.id} className="flex items-center gap-4 py-3 border-b border-border/40 last:border-0">
                  {/* Thumbnail */}
                  <div className="w-20 h-[60px] sm:w-24 sm:h-[72px] bg-white border border-border rounded-xl overflow-hidden shrink-0 relative shadow-2xs">
                    <img 
                      src={item.product.imageUrl || getCategoryImage(item.product.category, categoryImages) || undefined} 
                      alt={item.product.name} 
                      loading="lazy"
                      className="w-full h-full object-contain object-center"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <span className="text-[7.5px] font-mono tracking-widest text-muted-foreground uppercase truncate block">
                      {(item.product.category || '').replace(/ font-bold/gi, '')}
                    </span>
                    <h3 className="font-black text-foreground text-[11px] sm:text-xs uppercase tracking-tight line-clamp-2 leading-tight">
                      {item.product.name}
                    </h3>
                    <div className="text-[10px] text-muted-foreground font-semibold mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span>{item.product.unit || '1 Unit'}</span>
                      {item.quantity > 1 && (
                        <span className="text-primary font-bold bg-primary/10 px-1.5 py-0.5 rounded-full text-[9px] uppercase tracking-wide">
                          (Total in Cart: {calculateTotalUnitString(item.product.unit || '1 Unit', item.quantity)})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1.5">
                      {isHoreca ? (
                        <span className="text-xs font-black text-primary">B2B Wholesale</span>
                      ) : (
                        (() => {
                          const config = getUnitQuantityConfig(item.product.unit);
                          const itemSubtotal = (item.product.price * item.quantity) / (config.initialQty || 1);
                          return (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-foreground">₹{itemSubtotal.toFixed(2)}</span>
                              {item.product.originalPrice && item.product.originalPrice > item.product.price && (
                                <span className="text-[10px] text-muted-foreground line-through font-mono">
                                  ₹{((item.product.originalPrice * item.quantity) / (config.initialQty || 1)).toFixed(2)}
                                </span>
                              )}
                            </div>
                          );
                        })()
                      )}
                    </div>
                  </div>

                  {/* Quantity Stepper & Remove */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <button 
                      onClick={() => removeItem(item.product.id)} 
                      className="text-muted-foreground hover:text-red-500 transition-colors p-1"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {(() => {
                      const config = getUnitQuantityConfig(item.product.unit);
                      const minQty = isHoreca ? 0.5 : config.initialQty;
                      const step = isHoreca ? 0.5 : config.step;
                      const isDiscrete = config.isDiscrete;
                      return (
                        <div className="flex items-center bg-background border border-border rounded-lg overflow-hidden shadow-2xs">
                          <button 
                            onClick={() => {
                              if (item.quantity <= minQty + 0.001) {
                                removeItem(item.product.id);
                              } else {
                                const newQty = safeSubtractQuantity(item.quantity, step, isDiscrete, minQty);
                                updateQuantity(item.product.id, newQty);
                              }
                            }}
                            className="w-7 h-7 flex items-center justify-center text-foreground hover:bg-primary hover:text-white transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <QuantityInput
                            initialQuantity={item.quantity}
                            isHoreca={isHoreca}
                            minQuantity={minQty}
                            isDiscrete={isDiscrete}
                            className="w-10 text-center font-bold text-xs text-foreground bg-transparent outline-none py-0.5"
                            onUpdate={(val) => {
                              if (val >= minQty) {
                                updateQuantity(item.product.id, val);
                              }
                            }}
                            onRemove={() => removeItem(item.product.id)}
                          />
                          <button 
                            onClick={() => updateQuantity(item.product.id, safeAddQuantity(item.quantity, step, isDiscrete))} 
                            className="w-7 h-7 flex items-center justify-center text-foreground hover:bg-primary hover:text-white transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>

            {/* Add More Items Button */}
            <div className="pt-2">
              <button 
                onClick={() => navigate('/shop')}
                className="w-full py-3 bg-background border border-dashed border-border hover:border-primary text-primary font-bold text-xs uppercase rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add more items
              </button>
            </div>
          </div>
        </div>

        {/* Checkout & Bill Details Sidebar */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-secondary/40 border border-border rounded-2xl p-5 shadow-2xs space-y-6">
            <h2 className="text-sm font-sans font-black uppercase text-foreground tracking-wide border-b border-border pb-3">
              Bill Details
            </h2>

            {/* Bill breakdown */}
            <div className="space-y-3 text-xs font-semibold">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Item Total</span>
                <span className="font-mono text-foreground">₹{total().toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Handling Fee</span>
                <span className="font-mono text-foreground">₹0.00</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Delivery Partner Fee</span>
                <span className="text-primary font-bold uppercase text-[10px]">FREE</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between items-center text-primary">
                  <span>FNL Points Discount</span>
                  <span className="font-mono font-bold">-₹{discount.toFixed(2)}</span>
                </div>
              )}
              <div className="pt-3 border-t border-border flex justify-between items-end">
                <span className="font-black text-foreground uppercase tracking-widest text-xs">To Pay</span>
                <span className="font-sans font-black text-xl text-foreground">₹{finalTotal.toFixed(2)}</span>
              </div>
            </div>

            <form onSubmit={handleCheckout} className="space-y-6 pt-2">
              {/* Delivery Method Selection */}
              <div className="space-y-3">
                <label className="block text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground">
                  Delivery Method
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod('delivery')}
                    className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-colors ${deliveryMethod === 'delivery' ? 'bg-primary text-white border-primary shadow-xs' : 'bg-background text-foreground border-border hover:border-primary/50'}`}
                  >
                    <Truck className="w-4 h-4" /> Home Delivery
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod('pickup')}
                    className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-colors ${deliveryMethod === 'pickup' ? 'bg-primary text-white border-primary shadow-xs' : 'bg-background text-foreground border-border hover:border-primary/50'}`}
                  >
                    <ShoppingBag className="w-4 h-4" /> Store Pickup
                  </button>
                </div>
              </div>

              {/* Delivery Address or Store Info */}
              {deliveryMethod === 'delivery' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground">
                      Delivery Address
                    </label>
                    <button
                      type="button"
                      onClick={openLocationModal}
                      className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <MapPin className="w-3 h-3" /> Select Area
                    </button>
                  </div>

                  {/* Selected Delivery Area Indicator */}
                  <div className="p-3 bg-secondary/50 border border-border/70 rounded-xl flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <MapPin className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] font-semibold text-muted-foreground block leading-tight">Delivery Zone</span>
                        <span className="font-bold text-xs text-foreground truncate block leading-tight">
                          {selectedLocation ? `${selectedLocation.areaName} (${selectedLocation.pincode})` : 'Surat Deliverable Clusters'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={openLocationModal}
                      className="text-[11px] font-bold text-primary hover:underline px-2 py-1 rounded-lg cursor-pointer shrink-0"
                    >
                      Change
                    </button>
                  </div>

                  {user?.addresses && user.addresses.length > 0 ? (
                    <div className="space-y-2">
                      {user.addresses.map(addr => {
                        const isAddrServiceable = isPincodeServiceable(addr.pincode);
                        return (
                          <label key={addr.id} className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-colors text-xs ${selectedAddressId === addr.id ? (isAddrServiceable ? 'bg-primary/5 border-primary/40' : 'bg-secondary border-amber-500/40') : 'bg-background border-border hover:border-primary/30'}`}>
                            <input 
                              type="radio" 
                              name="selectedAddress" 
                              value={addr.id} 
                              checked={selectedAddressId === addr.id}
                              onChange={() => setSelectedAddressId(addr.id)}
                              className="mt-0.5 accent-primary" 
                            />
                            <div className="space-y-0.5 w-full">
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-foreground">{addr.label}</span>
                                <div className="flex items-center gap-1.5">
                                  {isAddrServiceable ? (
                                    <span className="text-[9px] font-semibold text-green-700 bg-green-500/10 px-1.5 py-0.5 rounded">Deliverable</span>
                                  ) : (
                                    <span className="text-[9px] font-semibold text-amber-700 bg-amber-500/15 px-1.5 py-0.5 rounded">Out of Zone</span>
                                  )}
                                  {addr.isDefault && <span className="text-[9px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">Default</span>}
                                </div>
                              </div>
                              <p className="text-muted-foreground text-[11px] leading-relaxed">
                                {addr.line1}, {addr.line2}{addr.landmark ? `, ${addr.landmark}` : ''}, {addr.city} - {addr.pincode}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                      <label className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-colors text-xs ${selectedAddressId === 'new' ? 'bg-primary/5 border-primary/40' : 'bg-background border-border hover:border-primary/30'}`}>
                        <input 
                          type="radio" 
                          name="selectedAddress" 
                          value="new" 
                          checked={selectedAddressId === 'new'}
                          onChange={() => setSelectedAddressId('new')}
                          className="accent-primary" 
                        />
                        <span className="font-semibold text-foreground">Add New Address</span>
                      </label>
                    </div>
                  ) : null}

                  {(selectedAddressId === 'new' || !user?.addresses || user.addresses.length === 0) && (
                    <div className="space-y-2.5 pt-1">
                      <div className="flex gap-2">
                        {['Home', 'Work', 'Other'].map(label => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => setAddressLabel(label)}
                            className={`px-3 py-1.5 border rounded-lg text-[10px] font-bold tracking-wider transition-colors ${addressLabel === label ? 'bg-primary text-white border-primary' : 'bg-secondary text-muted-foreground border-border'}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {/* Quick Zone Picker Dropdown */}
                      <div className="space-y-1">
                        <label className="block text-[9px] font-black uppercase text-muted-foreground">
                          Quick Select Surat Zone
                        </label>
                        <select
                          value={addressLines.pincode}
                          onChange={(e) => {
                            const val = e.target.value;
                            const zone = getZoneByPincode(val);
                            setAddressLines(prev => ({
                              ...prev,
                              pincode: val,
                              line2: zone ? zone.mainArea : prev.line2
                            }));
                          }}
                          className="w-full border border-border rounded-xl px-3.5 py-2.5 bg-background outline-none focus:border-primary text-xs font-semibold"
                        >
                          <option value="">-- Choose Surat Delivery Area --</option>
                          {SERVICEABLE_ZONES.map(z => (
                            <option key={z.pincode} value={z.pincode}>
                              {z.pincode} — {z.mainArea} ({z.areas.slice(0, 3).join(', ')})
                            </option>
                          ))}
                        </select>
                      </div>

                      <input 
                        required 
                        placeholder="Flat, House no., Building, Apartment"
                        type="text"
                        value={addressLines.line1}
                        onChange={(e) => setAddressLines(prev => ({ ...prev, line1: e.target.value }))}
                        className="w-full border border-border rounded-xl px-3.5 py-2.5 bg-background outline-none focus:border-primary text-xs font-semibold"
                      />
                      <input 
                        required 
                        placeholder="Area, Street, Sector (e.g. Adajan, Vesu, Althan)"
                        type="text"
                        value={addressLines.line2}
                        onChange={(e) => setAddressLines(prev => ({ ...prev, line2: e.target.value }))}
                        className="w-full border border-border rounded-xl px-3.5 py-2.5 bg-background outline-none focus:border-primary text-xs font-semibold"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input 
                          placeholder="Pincode (6 digits)"
                          required 
                          type="text" 
                          maxLength={6}
                          value={addressLines.pincode}
                          onChange={(e) => setAddressLines(prev => ({ ...prev, pincode: e.target.value.replace(/\D/g, '') }))}
                          className={`w-full border rounded-xl px-3.5 py-2.5 bg-background outline-none text-xs font-semibold ${
                            addressLines.pincode.length === 6
                              ? (isPincodeServiceable(addressLines.pincode) ? 'border-green-500 focus:ring-1 focus:ring-green-500' : 'border-amber-500 focus:ring-1 focus:ring-amber-500')
                              : 'border-border focus:border-primary'
                          }`}
                        />
                        <input 
                          placeholder="Phone number"
                          required 
                          type="tel" 
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="w-full border border-border rounded-xl px-3.5 py-2.5 bg-background outline-none focus:border-primary text-xs font-semibold"
                        />
                      </div>

                      {/* Real-time Pincode Verification Feedback */}
                      {addressLines.pincode.length === 6 && (
                        isPincodeServiceable(addressLines.pincode) ? (
                          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-xs text-green-800 dark:text-green-300 flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold">✓ Verified Surat Delivery Zone</p>
                              <p className="text-[11px] text-green-700 dark:text-green-300/80">
                                {currentMatchedZone?.mainArea} — {currentMatchedZone?.description}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-800 dark:text-amber-300 space-y-1">
                            <div className="flex items-center gap-1.5 font-bold">
                              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                              <span>Pincode {addressLines.pincode} is not in our delivery zone</span>
                            </div>
                            <p className="text-[11px] leading-relaxed">
                              FreshNLocal delivers fresh crops only to 15 key Surat zones (Adajan, Vesu, Althan, Katargam, Rander, Varachha, Dumas, Udhna, etc.). Please switch to <strong>Store Pickup</strong> or select a serviceable address.
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3.5 bg-background border border-border rounded-xl text-xs space-y-1">
                    <p className="font-bold">FreshNLocal.CO Store Pickup</p>
                    <p className="text-muted-foreground text-[11px]">Gr Floor Hall, Reva Dham, Bhatar, Surat</p>
                  </div>
                  <input 
                    placeholder="Contact Phone Number"
                    required 
                    type="tel" 
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full border border-border rounded-xl px-3.5 py-2.5 bg-background outline-none focus:border-primary text-xs font-semibold"
                  />
                </div>
              )}

              {/* FNL Points Redemption */}
              {!isHoreca && user && canUsePoints && (
                <div className="p-3.5 bg-background border border-border rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold block">Redeem FNL Points</span>
                    <span className="text-[10px] text-muted-foreground">Available: {userPoints} pts</span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={usePoints} 
                      onChange={(e) => setUsePoints(e.target.checked)} 
                      className="w-4 h-4 accent-primary rounded" 
                    />
                    <span className="font-bold text-primary">₹100 Off</span>
                  </label>
                </div>
              )}

              {/* Cancellation Policy Notice */}
              <div className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 p-3 rounded-xl text-[10px] font-semibold leading-relaxed">
                <strong>Cancellation Policy:</strong> Orders cannot be cancelled and are non-refundable once packed for delivery.
              </div>

              {/* Validation Warnings */}
              {hasOutOfStockItems && (
                <div className="bg-red-500/10 text-red-500 p-3 rounded-xl text-center text-[10px] font-black uppercase">
                  Remove Out of Stock items to proceed
                </div>
              )}
              {!isHoreca && deliveryMethod === 'delivery' && total() < 1000 && !hasOutOfStockItems && (
                <div className="bg-red-500/10 text-red-500 p-3 rounded-xl text-center text-[10px] font-black uppercase">
                  Minimum order for delivery is ₹1000
                </div>
              )}
              {deliveryMethod === 'delivery' && !isDeliveryPincodeServiceable && activePincode.length > 0 && (
                <div className="bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 p-3 rounded-xl text-center text-[11px] font-bold">
                  ⚠️ Pincode {activePincode} is outside our delivery zone. Please switch to Store Pickup or enter a serviceable Surat address.
                </div>
              )}

              {/* Checkout CTA */}
              {user ? (
                <button 
                  type="submit" 
                  disabled={loading || (!isHoreca && deliveryMethod === 'delivery' && total() < 1000) || (deliveryMethod === 'delivery' && !isDeliveryPincodeServiceable) || hasOutOfStockItems || hasInvalidRetailQuantity}
                  className={`w-full py-3.5 text-xs uppercase font-black tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 ${loading || (!isHoreca && deliveryMethod === 'delivery' && total() < 1000) || (deliveryMethod === 'delivery' && !isDeliveryPincodeServiceable) || hasOutOfStockItems || hasInvalidRetailQuantity ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-white hover:bg-primary/90'}`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processing Order...</span>
                    </>
                  ) : (
                    <span>{isHoreca ? 'Submit HoReCa Order Requirement' : (deliveryMethod === 'delivery' && !isDeliveryPincodeServiceable ? 'Select Serviceable Area to Deliver' : 'Proceed with Order')}</span>
                  )}
                </button>
              ) : (
                <button 
                  type="button" 
                  onClick={signIn} 
                  disabled={(!isHoreca && deliveryMethod === 'delivery' && total() < 1000) || (deliveryMethod === 'delivery' && !isDeliveryPincodeServiceable) || hasOutOfStockItems || hasInvalidRetailQuantity} 
                  className={`w-full py-3.5 text-xs uppercase font-black tracking-wider rounded-xl transition-all shadow-sm ${(!isHoreca && deliveryMethod === 'delivery' && total() < 1000) || (deliveryMethod === 'delivery' && !isDeliveryPincodeServiceable) || hasOutOfStockItems || hasInvalidRetailQuantity ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-white hover:bg-primary/90'}`}
                >
                  Proceed with phone number / Login
                </button>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* You Might Also Like */}
      <div className="mt-12">
        <YouMightAlsoLikeSection 
          products={recommendedProducts}
          onAddToCart={handleAddToCartRecommended}
          onQuickView={setQuickViewProduct}
        />
      </div>
    </div>
)}

{quickViewProduct && (
  <QuickViewModal 
    product={quickViewProduct} 
    onClose={() => setQuickViewProduct(null)} 
  />
)}
</>
);
}
