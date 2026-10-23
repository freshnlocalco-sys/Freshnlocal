import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useCart, Product } from '../store/useCart';
import { useAuth } from '../lib/firebase';
import { signIn, db, handleFirestoreError, OperationType, deleteUserAddress } from '../lib/firebase';
import { Trash2, Plus, Minus, ArrowLeft, ShoppingBag, Truck, Wallet, ShieldCheck, Info, Building2, ChevronRight, Loader2, Gift, Sparkles, Check } from 'lucide-react';
import { addDoc, collection, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate, Link } from 'react-router-dom';
import { getCategoryImage } from '../lib/constants';
import { useSettings } from '../store/useSettings';
import { useOffers, getEffectiveGiftItems, GiftItem } from '../store/useOffers';
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
import { CustomZoneSelect } from '../components/CustomZoneSelect';
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
  const { offer, fetchOffer } = useOffers();
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const cartItems = items.filter(item => item && item.product && item.product.id);
  const { user, setUser } = useAuth();
  const isHoreca = user?.role === 'horeca' || user?.role === 'horeca_admin';
  const navigate = useNavigate();
  const { deferredPrompt, showInstallPrompt } = usePWA();
  const [placedOrderSummary, setPlacedOrderSummary] = useState<{
    orderNumber: string;
    totalAmount: number;
    pointsEarned: number;
    deliveryMethod: 'delivery' | 'pickup';
  } | null>(null);
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
  const { selectedLocation, openLocationModal, setLocation } = useDeliveryLocation();

  // Keep checkout location in sync with selectedLocation whenever it changes
  useEffect(() => {
    if (selectedLocation?.pincode) {
      setAddressLines(prev => ({
        ...prev,
        pincode: selectedLocation.pincode,
        line2: selectedLocation.areaName || selectedLocation.mainArea || prev.line2,
      }));

      // If user has saved addresses, check if one matches the selected location pincode
      if (user?.addresses && user.addresses.length > 0) {
        const matchingAddr = user.addresses.find(a => a.pincode === selectedLocation.pincode);
        if (matchingAddr) {
          setSelectedAddressId(matchingAddr.id);
        } else {
          setSelectedAddressId('new');
        }
      } else {
        setSelectedAddressId('new');
      }
    }
  }, [selectedLocation, user?.addresses]);

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

  const isOfferEligible = useMemo(() => {
    if (!offer || !offer.enabled || isHoreca) return false;
    const meetsSubtotal = total() >= (offer.minOrderAmount || 1000);
    const meetsDelivery = 
      offer.deliveryMethodRequired === 'any' || 
      offer.deliveryMethodRequired === deliveryMethod;
    return meetsSubtotal && meetsDelivery;
  }, [offer, total, deliveryMethod, isHoreca]);

  const effectiveGifts = useMemo(() => getEffectiveGiftItems(offer), [offer]);
  const [selectedGiftIds, setSelectedGiftIds] = useState<string[]>([]);

  useEffect(() => {
    if (effectiveGifts.length === 0) {
      setSelectedGiftIds([]);
      return;
    }
    if (offer?.rewardType === 'all') {
      setSelectedGiftIds(effectiveGifts.map(g => g.id));
    } else {
      const max = Math.max(1, offer?.maxChoices || 1);
      setSelectedGiftIds(prev => {
        const valid = prev.filter(id => effectiveGifts.some(g => g.id === id));
        if (valid.length > 0) {
          return valid.slice(0, max);
        }
        return effectiveGifts.slice(0, max).map(g => g.id);
      });
    }
  }, [offer, effectiveGifts]);

  const awardedGifts = useMemo(() => {
    if (!isOfferEligible || !offer || effectiveGifts.length === 0) return [];
    if (offer.rewardType === 'all') {
      return effectiveGifts;
    }
    const chosen = effectiveGifts.filter(g => selectedGiftIds.includes(g.id));
    if (chosen.length > 0) return chosen;
    return effectiveGifts.slice(0, Math.max(1, offer.maxChoices || 1));
  }, [isOfferEligible, offer, effectiveGifts, selectedGiftIds]);

  const handleToggleGiftChoice = (id: string) => {
    const max = Math.max(1, offer?.maxChoices || 1);
    if (max === 1) {
      setSelectedGiftIds([id]);
      return;
    }
    setSelectedGiftIds(prev => {
      if (prev.includes(id)) {
        if (prev.length > 1) {
          return prev.filter(itemId => itemId !== id);
        }
        return prev;
      }
      if (prev.length < max) {
        return [...prev, id];
      }
      return [...prev.slice(1), id];
    });
  };

  const hasOutOfStockItems = !isHoreca && cartItems.some(item => !item.product.inStock);
  const hasInvalidRetailQuantity = !isHoreca && cartItems.some(item => item.quantity <= 0);

  const [minOrderAlert, setMinOrderAlert] = useState<string | null>(null);
  const minOrderAlertTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (minOrderAlertTimerRef.current) {
        clearTimeout(minOrderAlertTimerRef.current);
      }
    };
  }, []);

  const triggerMinOrderWarning = () => {
    const remainingForDelivery = Math.max(0, Math.ceil(1000 - total()));
    const msg = `Add ₹${remainingForDelivery} more for place order Or select Store Pickup delivery method.`;
    setMinOrderAlert(msg);
    if (minOrderAlertTimerRef.current) {
      clearTimeout(minOrderAlertTimerRef.current);
    }
    minOrderAlertTimerRef.current = setTimeout(() => {
      setMinOrderAlert(null);
    }, 5000);
  };

  useEffect(() => {
    async function init() {
      await hydrateFromIDB();
      fetchProducts();
    }
    init();
    fetchOffer();
  }, [fetchProducts, hydrateFromIDB, fetchOffer]);

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
    if (!isHoreca && deliveryMethod === 'delivery' && total() < 1000) {
      triggerMinOrderWarning();
      return;
    }
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
        items: (() => {
          const mapped = cartItems
            .filter(i => {
              const name = typeof i.product?.name === 'string' ? i.product.name : '';
              const id = i.product?.id || '';
              // Filter out duplicate or legacy promo gifts from cart items
              if (id === 'promo-free-gift' || name.includes('[FREE PROMO GIFT]') || (i.product?.price === 0 && name.toLowerCase().includes('free promo'))) {
                return false;
              }
              return true;
            })
            .map(i => {
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
            });

          if (isOfferEligible && awardedGifts.length > 0) {
            awardedGifts.forEach((g, idx) => {
              mapped.push({
                product: {
                  id: g.productId || `promo-free-gift-${g.id || idx}`,
                  name: `[FREE PROMO GIFT] ${g.name}`,
                  price: 0,
                  unit: g.unit || '1 Pc',
                  imageUrl: g.imageUrl || '',
                },
                quantity: 1,
              });
            });
          }
          return mapped;
        })(),
        freeGiftsAwarded: isOfferEligible && awardedGifts.length > 0 ? awardedGifts.map(g => ({
          name: g.name,
          unit: g.unit || '1 Pc',
          originalPrice: g.originalPrice || 0,
        })) : [],
        freeGiftAwarded: isOfferEligible && awardedGifts.length > 0 ? {
          name: awardedGifts[0].name,
          unit: awardedGifts[0].unit || '1 Pc',
          originalPrice: awardedGifts[0].originalPrice || 0,
        } : null,
        totalAmount: isHoreca ? (finalTotal > 0 ? finalTotal : 0) : finalTotal,
        discount: isHoreca ? 0 : discount,
        pointsEarned: isHoreca ? 0 : Math.floor(finalTotal / 100) * 2,
        pointsRedeemed: isHoreca ? 0 : (discount > 0 ? 100 : 0),
        pointsAwarded: false,
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

      // Save address and deduct redeemed discount points immediately from user profile
      try {
        const userRef = doc(db, 'users', user.uid);
        const pointsDeducted = discount > 0 ? 100 : 0;
        const newPoints = Math.max(0, userPoints - pointsDeducted);
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
      
      setPlacedOrderSummary({
        orderNumber,
        totalAmount: isHoreca ? (finalTotal > 0 ? finalTotal : 0) : finalTotal,
        pointsEarned: isHoreca ? 0 : Math.floor(finalTotal / 100) * 2,
        deliveryMethod,
      });
    } catch (error: any) {
      console.error(error);
      const errorMsg = error?.message || error?.error || String(error);
      toast.error(`Error committing order settlement: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  if (cartItems.length === 0 && !placedOrderSummary) {
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
      
      {/* Thank You Popup Menu */}
      {placedOrderSummary && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-border rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6 text-center transform transition-all">
            
            {/* Header Icon / Branding */}
            <div className="relative mx-auto w-20 h-20">
              <div className="w-20 h-20 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center shadow-inner">
                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary rounded-full flex items-center justify-center text-white border-2 border-white shadow">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Thank you title & message */}
            <div className="space-y-2">
              <h3 className="text-2xl font-sans font-black uppercase tracking-tight text-foreground">
                Thank You for Your Order!
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground font-semibold leading-relaxed">
                Your order has been placed successfully. We are preparing your fresh farm products with care.
              </p>
            </div>

            {/* Order Details Snippet */}
            <div className="bg-secondary/50 rounded-2xl p-4 border border-border text-left space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Order Number:</span>
                <span className="font-mono font-black text-foreground tracking-wide">{placedOrderSummary.orderNumber}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Payment Mode:</span>
                <span className="font-bold text-foreground">{isHoreca ? 'B2B Invoice' : 'Cash on Delivery (COD)'}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Delivery Type:</span>
                <span className="font-bold text-foreground capitalize">{placedOrderSummary.deliveryMethod === 'pickup' ? 'Store Pickup' : 'Home Delivery'}</span>
              </div>
              {placedOrderSummary.pointsEarned > 0 && (
                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-border/60">
                  <span className="text-emerald-700 font-medium flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Points to Earn:
                  </span>
                  <span className="font-black text-emerald-700">+{placedOrderSummary.pointsEarned} FNL Points</span>
                </div>
              )}
            </div>

            {/* OK Button - Navigates directly to Orders page */}
            <div>
              <button
                onClick={() => {
                  setPlacedOrderSummary(null);
                  navigate('/orders');
                }}
                className="w-full slice-btn-primary py-4 px-6 text-sm font-black uppercase tracking-wider rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
              >
                OK
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

      <form onSubmit={handleCheckout} className="space-y-8">
        {/* 1. Fulfillment & Delivery Details (At Top) */}
        <div className="bg-secondary/40 border border-border rounded-2xl p-5 sm:p-6 shadow-2xs space-y-5">
          <div className="flex items-center justify-between border-b border-border/60 pb-3.5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Truck className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-sans font-black uppercase text-foreground tracking-wide flex items-center gap-2">
                  Delivery Details & Address
                </h2>
                <p className="text-[11px] text-muted-foreground font-semibold">
                  Choose fulfillment method and deliverable Surat location
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full uppercase tracking-wider">
              Surat Zone
            </span>
          </div>

          {/* Delivery Method Selection */}
          <div className="space-y-3">
            <label className="block text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground">
              Delivery Method
            </label>
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <button
                type="button"
                onClick={() => setDeliveryMethod('delivery')}
                className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-colors cursor-pointer ${deliveryMethod === 'delivery' ? 'bg-primary text-white border-primary shadow-xs' : 'bg-background text-foreground border-border hover:border-primary/50'}`}
              >
                <Truck className="w-4 h-4" /> Home Delivery
              </button>
              <button
                type="button"
                onClick={() => setDeliveryMethod('pickup')}
                className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-colors cursor-pointer ${deliveryMethod === 'pickup' ? 'bg-primary text-white border-primary shadow-xs' : 'bg-background text-foreground border-border hover:border-primary/50'}`}
              >
                <ShoppingBag className="w-4 h-4" /> Store Pickup
              </button>
            </div>
          </div>

          {/* Delivery Address or Store Info */}
          {deliveryMethod === 'delivery' ? (
            <div className="space-y-4 pt-1">
              <div className="flex items-center justify-between">
                <label className="block text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground">
                  Delivery Destination & Surat Zone
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
              <div className="p-3.5 bg-background border border-border/80 rounded-xl flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <MapPin className="w-4 h-4" />
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
                  className="text-[11px] font-bold text-primary hover:underline px-2.5 py-1 rounded-lg cursor-pointer shrink-0"
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
                          onChange={() => {
                            setSelectedAddressId(addr.id);
                            if (addr.pincode) {
                              const zone = getZoneByPincode(addr.pincode);
                              setLocation(addr.pincode, zone?.mainArea || addr.line2 || 'Surat Area');
                            }
                          }}
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
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  deleteUserAddress(addr.id);
                                  if (selectedAddressId === addr.id) {
                                    setSelectedAddressId('new');
                                  }
                                  toast.success(`Deleted "${addr.label}" address`);
                                }}
                                className="p-1 rounded text-red-500 hover:bg-red-500/15 transition-colors cursor-pointer"
                                title="Delete address"
                                aria-label="Delete address"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
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
                <div className="space-y-3 pt-1">
                  <div className="flex gap-2">
                    {['Home', 'Work', 'Other'].map(label => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setAddressLabel(label)}
                        className={`px-3 py-1.5 border rounded-lg text-[10px] font-bold tracking-wider transition-colors cursor-pointer ${addressLabel === label ? 'bg-primary text-white border-primary' : 'bg-secondary text-muted-foreground border-border'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Quick Zone Picker Dropdown - Web Theme Custom Component */}
                  <CustomZoneSelect
                    value={addressLines.pincode}
                    onChange={(val) => {
                      const zone = getZoneByPincode(val);
                      const mainArea = zone ? zone.mainArea : '';
                      setAddressLines(prev => ({
                        ...prev,
                        pincode: val,
                        line2: mainArea || prev.line2
                      }));
                      if (val && mainArea) {
                        setLocation(val, mainArea);
                      }
                    }}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      <div className="p-3.5 bg-emerald-50/90 border border-emerald-300 rounded-xl text-xs text-zinc-900 flex items-start gap-2.5 shadow-xs">
                        <CheckCircle2 className="w-4.5 h-4.5 text-[#00c853] shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-extrabold text-[#008537] text-xs tracking-wide">
                            Verified Surat Delivery Zone
                          </p>
                          <p className="text-[11px] font-semibold text-zinc-700 mt-0.5 leading-relaxed break-words">
                            <strong className="text-zinc-900 font-bold">{currentMatchedZone?.mainArea}</strong> ({currentMatchedZone?.pincode}) — {currentMatchedZone?.description}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 space-y-1.5 shadow-xs">
                        <div className="flex items-center gap-1.5 font-bold text-amber-900">
                          <AlertCircle className="w-4.5 h-4.5 text-amber-600 shrink-0" />
                          <span>Pincode {addressLines.pincode} is not in our delivery zone</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-amber-800 font-medium">
                          FreshNLocal delivers fresh crops only to key Surat zones (Adajan, Vesu, Althan, Katargam, Rander, Varachha, Dumas, Udhna, etc.). Please switch to <strong>Store Pickup</strong> or select a serviceable address.
                        </p>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <div className="p-3.5 bg-background border border-border rounded-xl text-xs space-y-1">
                <p className="font-bold">FreshNLocal.CO Store Pickup</p>
                <p className="text-muted-foreground text-[11px]">Gr Floor Hall, Reva Dham, Bhatar, Surat</p>
              </div>
              <div className="sm:max-w-md">
                <input 
                  placeholder="Contact Phone Number"
                  required 
                  type="tel" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full border border-border rounded-xl px-3.5 py-2.5 bg-background outline-none focus:border-primary text-xs font-semibold"
                />
              </div>
            </div>
          )}
        </div>

        {/* 2. Free Gift Offer Banner & Customer Choice Selection */}
        {offer && offer.enabled && !isHoreca && effectiveGifts.length > 0 && (
          <div className="space-y-3">
            {isOfferEligible ? (
              <div className="bg-emerald-500/[0.08] border border-emerald-500/30 rounded-3xl p-4 sm:p-5 shadow-xs space-y-3.5">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-emerald-500/20 pb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-black uppercase tracking-widest bg-emerald-600 text-white px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs">
                      <Sparkles className="w-3 h-3" /> FREE GIFT UNLOCKED
                    </span>
                    {offer.rewardType === 'choice' ? (
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md uppercase">
                        Select {offer.maxChoices || 1} Free Gift{(offer.maxChoices || 1) > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md uppercase">
                        All {effectiveGifts.length} Gifts Included Free
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-emerald-700 bg-white border border-emerald-500/20 px-3 py-1 rounded-xl shadow-2xs">
                      ₹0.00 (100% FREE)
                    </span>
                  </div>
                </div>

                {/* Subtitle / Prompt */}
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-emerald-950 uppercase tracking-tight">
                    {offer.rewardType === 'choice' 
                      ? `Choose Your Free Gift (${selectedGiftIds.length} of ${Math.max(1, offer.maxChoices || 1)} selected):`
                      : `You've Qualified for All ${effectiveGifts.length} Free Gifts!`
                    }
                  </h4>
                  <p className="text-[11px] text-emerald-800 font-semibold mt-0.5">
                    {offer.rewardType === 'choice'
                      ? `Tap your preferred free gift below to add it to your order delivery for ₹0.00:`
                      : `All items below are automatically packaged into your delivery order at no charge.`
                    }
                  </p>
                </div>

                {/* Gift Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                  {effectiveGifts.map((gift) => {
                    const isSelected = selectedGiftIds.includes(gift.id);
                    const isChoiceMode = offer.rewardType === 'choice';
                    return (
                      <div
                        key={gift.id}
                        onClick={() => {
                          if (isChoiceMode) {
                            handleToggleGiftChoice(gift.id);
                          }
                        }}
                        className={`p-3 rounded-2xl border-2 transition-all flex items-center gap-3 relative ${
                          isChoiceMode ? 'cursor-pointer' : ''
                        } ${
                          isSelected 
                            ? 'bg-white border-emerald-600 shadow-sm ring-2 ring-emerald-500/20' 
                            : 'bg-white/80 border-emerald-500/20 hover:border-emerald-500/40'
                        }`}
                      >
                        {/* Thumbnail */}
                        <div className="w-14 h-14 rounded-xl bg-neutral-50 border border-emerald-500/20 overflow-hidden shrink-0 flex items-center justify-center">
                          {gift.imageUrl ? (
                            <img 
                              src={gift.imageUrl} 
                              alt={gift.name} 
                              className="w-full h-full object-contain p-1"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <Gift className="w-6 h-6 text-emerald-600" />
                          )}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <h5 className="font-bold text-xs text-foreground truncate">
                            {gift.name}
                          </h5>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                            <span className="font-semibold text-neutral-700 bg-neutral-100 px-1.5 py-0.2 rounded">
                              {gift.unit || '1 Pc'}
                            </span>
                            {gift.originalPrice > 0 && (
                              <span className="line-through font-mono text-[9px]">
                                ₹{gift.originalPrice}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-black text-emerald-600 mt-1 block">
                            ₹0.00 FREE
                          </span>
                        </div>

                        {/* Choice Button / Indicator */}
                        <div className="shrink-0">
                          {isChoiceMode ? (
                            <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                              isSelected 
                                ? 'border-emerald-600 bg-emerald-600 text-white shadow-2xs' 
                                : 'border-neutral-300 bg-white hover:border-emerald-500'
                            }`}>
                              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </span>
                          ) : (
                            <span className="text-[8px] font-black uppercase text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                              Included
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-emerald-500/[0.07] border border-emerald-500/20 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                  <div className="w-12 h-12 rounded-xl bg-white border border-emerald-500/20 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                    {effectiveGifts[0]?.imageUrl ? (
                      <img 
                        src={effectiveGifts[0].imageUrl} 
                        alt={effectiveGifts[0].name} 
                        className="w-full h-full object-contain p-1"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Gift className="w-6 h-6 text-emerald-600" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className="text-[8px] font-black uppercase tracking-widest bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                        FREE GIFT OFFER
                      </span>
                      {offer.deliveryMethodRequired === 'delivery' && (
                        <span className="text-[8px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded uppercase">
                          Home Delivery Only
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm font-bold text-foreground leading-snug">
                      {total() < (offer.minOrderAmount || 1000) ? (
                        <>
                          Add <span className="text-emerald-600 font-black">₹{((offer.minOrderAmount || 1000) - total()).toFixed(0)}</span> more to unlock {offer.rewardType === 'choice' ? (
                            <>free gift choice of <span className="text-emerald-700 font-extrabold">{effectiveGifts.map(g => g.name).join(' or ')}</span></>
                          ) : (
                            <>all free gifts: <span className="text-emerald-700 font-extrabold">{effectiveGifts.map(g => g.name).join(' + ')}</span></>
                          )} 100% FREE!
                        </>
                      ) : (
                        <>
                          Select <span className="text-emerald-700 font-black">Home Delivery</span> at checkout to claim your Free Gift{effectiveGifts.length > 1 ? 's' : ''}!
                        </>
                      )}
                    </p>
                  </div>
                </div>
                {total() < (offer.minOrderAmount || 1000) && (
                  <div className="self-end sm:self-center shrink-0">
                    <button 
                      type="button"
                      onClick={() => navigate('/shop')} 
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black uppercase tracking-wider rounded-xl transition-all shadow-xs"
                    >
                      Add Items
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
              <span className="text-xs font-bold text-muted-foreground">
                {cartItems.length + (isOfferEligible && offer ? 1 : 0)} items
              </span>
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
                      className={`w-full h-full object-contain object-center transition-all duration-300 ${item.product.inStock === false ? 'grayscale opacity-75' : ''}`}
                      referrerPolicy="no-referrer"
                    />
                    {item.product.inStock === false && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-[7.5px] font-black text-neutral-900 dark:text-neutral-100 bg-white/85 dark:bg-black/75 backdrop-blur-xs border-none px-2 py-0.5 rounded-full shadow-sm uppercase tracking-wider select-none">
                          OUT OF STOCK
                        </span>
                      </div>
                    )}
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
                            </div>
                          );
                        })()
                      )}
                    </div>
                  </div>

                  {/* Quantity Stepper & Remove */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <button 
                      type="button"
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
                            type="button"
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
                            type="button"
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

              {/* Free Unlocked Promotional Gift Items in Cart */}
              {isOfferEligible && awardedGifts.length > 0 && (
                <div className="space-y-2.5">
                  {awardedGifts.map((giftItem) => (
                    <div 
                      key={giftItem.id}
                      className="flex items-center gap-4 py-3.5 px-3 bg-emerald-500/[0.08] border border-emerald-500/30 rounded-xl relative overflow-hidden shadow-2xs animate-in fade-in duration-300"
                    >
                      {/* Thumbnail */}
                      <div className="w-20 h-[60px] sm:w-24 sm:h-[72px] bg-white border border-emerald-500/30 rounded-xl overflow-hidden shrink-0 relative shadow-2xs flex items-center justify-center">
                        {giftItem.imageUrl ? (
                          <img 
                            src={giftItem.imageUrl} 
                            alt={giftItem.name} 
                            loading="lazy"
                            className="w-full h-full object-contain object-center p-1"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <Gift className="w-7 h-7 text-emerald-600" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <span className="text-[7.5px] font-mono tracking-widest text-emerald-700 uppercase truncate block font-black">
                          {offer?.rewardType === 'choice' ? 'CHOSEN FREE GIFT REWARD' : 'PROMOTIONAL GIFT REWARD'}
                        </span>
                        <h3 className="font-black text-foreground text-[11px] sm:text-xs uppercase tracking-tight line-clamp-2 leading-tight">
                          {giftItem.name}
                        </h3>
                        <div className="text-[10px] text-muted-foreground font-semibold mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded text-[9px]">
                            Qty: {giftItem.unit || '1 Pc'}
                          </span>
                          <span className="text-emerald-600 font-bold text-[9px] uppercase">
                            ✓ Included in delivery
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-black text-emerald-600">FREE (₹0.00)</span>
                          {giftItem.originalPrice > 0 && (
                            <span className="text-[10px] text-muted-foreground line-through font-mono">
                              ₹{giftItem.originalPrice.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Free Tag Pill */}
                      <div className="shrink-0 flex flex-col items-end">
                        <span className="px-2.5 py-1 bg-emerald-600 text-white font-black text-[9px] uppercase tracking-wider rounded-lg shadow-2xs">
                          100% FREE
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}


            </div>

            {/* Add More Items Button */}
            <div className="pt-2">
              <button 
                type="button"
                onClick={() => navigate('/shop')}
                className="w-full py-3 bg-background border border-dashed border-border hover:border-primary text-primary font-bold text-xs uppercase rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
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

              {isOfferEligible && awardedGifts.length > 0 && (
                <div className="space-y-1.5">
                  {awardedGifts.map((giftItem) => (
                    <div 
                      key={giftItem.id}
                      className="flex justify-between items-center text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
                    >
                      <span className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
                        <Gift className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate">Free Gift: {giftItem.name} ({giftItem.unit || '1 Pc'})</span>
                      </span>
                      <span className="font-black text-emerald-700 shrink-0 ml-2">₹0.00</span>
                    </div>
                  ))}
                </div>
              )}

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

            {/* Order Threshold Container: Placed down below "To Pay" Amount */}
            <div className="pt-1">
              <FreeDeliveryProgressBar 
                currentTotal={total()} 
                threshold={1000} 
                isHoreca={isHoreca} 
                showShopLink={true}
              />
            </div>

            {/* Checkout Form Actions & Policies */}
            <div className="space-y-4 pt-1">
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
              {minOrderAlert && (
                <div className="bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-600 text-red-600 dark:text-red-400 p-3.5 rounded-xl text-center text-xs sm:text-[13px] font-black leading-snug shadow-sm flex items-center justify-center gap-2">
                  <span className="text-base shrink-0">⚠️</span>
                  <span className="text-red-600 dark:text-red-400 font-black">{minOrderAlert}</span>
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
                  disabled={loading || (deliveryMethod === 'delivery' && !isDeliveryPincodeServiceable) || hasOutOfStockItems || hasInvalidRetailQuantity}
                  className={`w-full py-3.5 text-xs uppercase font-black tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer ${loading || (deliveryMethod === 'delivery' && !isDeliveryPincodeServiceable) || hasOutOfStockItems || hasInvalidRetailQuantity ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-white hover:bg-primary/90'}`}
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
                  onClick={() => {
                    if (!isHoreca && deliveryMethod === 'delivery' && total() < 1000) {
                      triggerMinOrderWarning();
                      return;
                    }
                    signIn();
                  }} 
                  disabled={(deliveryMethod === 'delivery' && !isDeliveryPincodeServiceable) || hasOutOfStockItems || hasInvalidRetailQuantity} 
                  className={`w-full py-3.5 text-xs uppercase font-black tracking-wider rounded-xl transition-all shadow-sm cursor-pointer ${(deliveryMethod === 'delivery' && !isDeliveryPincodeServiceable) || hasOutOfStockItems || hasInvalidRetailQuantity ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-white hover:bg-primary/90'}`}
                >
                  Proceed with phone number / Login
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </form>

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
