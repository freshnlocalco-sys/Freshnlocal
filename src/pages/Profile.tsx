import React, { useEffect, useState } from 'react';
import { fetchMyOrders } from '../lib/orderHistory';
import { READ_ORDERS_FROM_SUPABASE } from '../lib/orderSource';
import { useAuth, db, handleFirestoreError, OperationType, signOut, isQuotaError, deleteUserAddress, setDefaultUserAddress, deleteUserLegacyAddress, updateUserDisplayName, sendPasswordReset } from '../lib/firebase';
import { notifySignOutSuccess, notifyPasswordResetSuccess, getHumanAuthErrorMessage } from '../lib/authNotifications';
import { collection, query, where, getDocs, orderBy, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { Package, ShieldAlert, Award, ChevronRight, ShoppingBag, Calendar, Activity, Key, LogOut, Heart, Trash2, ChefHat, Building2, RotateCcw, Pencil, Check, X, User, Lock, Mail, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { trackFirestoreRead } from '../lib/cacheManager';
import { SEO } from '../components/SEO';
import { useCart } from '../store/useCart';
import toast from 'react-hot-toast';
import Markdown from 'react-markdown';

export function Profile() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { addItem } = useCart();
  const [orders, setOrders] = useState<any[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<any[]>([]);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'orders' | 'recipes'>(() => {
    const params = new URLSearchParams(location.search);
    return params.get('tab') === 'recipes' ? 'recipes' : 'orders';
  });
  const [fetching, setFetching] = useState(true);

  // Customer Name Edit State
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  // Password Reset State
  const [resetEmail, setResetEmail] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetSentSuccess, setResetSentSuccess] = useState(false);

  const handleSendResetEmail = async (e?: React.FormEvent, targetEmail?: string) => {
    if (e) e.preventDefault();
    const emailToUse = (targetEmail || resetEmail).trim();
    if (!emailToUse) {
      toast.error('Please enter an email address');
      return;
    }
    setIsSendingReset(true);
    try {
      await sendPasswordReset(emailToUse);
      setResetSentSuccess(true);
      notifyPasswordResetSuccess(emailToUse);
    } catch (err: any) {
      const msg = getHumanAuthErrorMessage(err);
      toast.error(msg);
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleSaveName = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) {
      toast.error('Please enter a valid name');
      return;
    }
    setIsSavingName(true);
    try {
      await updateUserDisplayName(trimmed);
      toast.success('Customer name updated successfully!');
      setIsEditingName(false);
    } catch (error) {
      console.error('Failed to update name:', error);
      toast.error('Failed to update name. Please try again.');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleOrderAgain = async (order: any) => {
    if (reorderingId) return;
    setReorderingId(order.id);
    let itemsAdded = 0;
    try {
      for (const item of order.items || []) {
        const product = item.product || item;
        const qty = item.quantity || 1;

        // Skip promo free gifts from historical orders
        if (
          product.id === 'promo-free-gift' ||
          (typeof product.name === 'string' && product.name.includes('[FREE PROMO GIFT]')) ||
          (product.price === 0 && typeof product.name === 'string' && product.name.toLowerCase().includes('free'))
        ) {
          continue;
        }

        if (product.id) {
          try {
            const docRef = doc(db, 'products', product.id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              const data = docSnap.data();
              if (data.inStock !== false) {
                addItem({ id: product.id, ...data } as any, qty);
                itemsAdded++;
                continue;
              }
            }
          } catch (e) {
            console.warn("Could not check product stock, using order snapshot", e);
          }
        }

        if (product.name) {
          addItem({
            id: product.id || `order-item-${Date.now()}-${Math.random()}`,
            name: product.name,
            price: product.price || 0,
            imageUrl: product.imageUrl || '',
            category: product.category || 'General',
            description: product.description || '',
            unit: product.unit || 'unit',
            stock: 999,
            inStock: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            ...product
          }, qty);
          itemsAdded++;
        }
      }

      if (itemsAdded > 0) {
        toast.success(`Added ${itemsAdded} item${itemsAdded > 1 ? 's' : ''} to cart`);
        navigate('/cart');
      } else {
        toast.error("Items from this order are no longer available.");
      }
    } catch(err) {
      console.error(err);
      toast.error("Failed to reorder items.");
    } finally {
      setReorderingId(null);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'recipes' || tab === 'orders') {
      setActiveTab(tab);
    }
  }, [location.search]);

  useEffect(() => {
    if (!loading && !user) {
      setFetching(false);
      return;
    }

    async function fetchData() {
      if (!user) return;
      try {
        if (READ_ORDERS_FROM_SUPABASE) {
          // Orders live in Supabase now; the server hands them back in the old
          // shape, newest first. A failure here must not take the rest of the
          // profile down with it -- saved recipes and addresses still load.
          const mine = await fetchMyOrders();
          if (mine.ok) setOrders(mine.orders ?? []);
          else console.error('[ORDERS] could not load this customer\'s orders:', mine.reason);
        } else {
          const qOrders = query(collection(db, 'orders'), where('userId', '==', user.uid));
          const snapOrders = await getDocs(qOrders);
          trackFirestoreRead('orders', snapOrders.size);
          const orderList = snapOrders.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          orderList.sort((a: any, b: any) => b.createdAt - a.createdAt);
          setOrders(orderList);
        }

        const qRecipes = query(collection(db, 'users', user.uid, 'savedRecipes'), orderBy('createdAt', 'desc'));
        const snapRecipes = await getDocs(qRecipes);
        trackFirestoreRead('savedRecipes', snapRecipes.size);
        setSavedRecipes(snapRecipes.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error: any) {
        if (isQuotaError(error)) {
          toast.error("Database limit reached. History unavailable.");
          setOrders([]);
          setSavedRecipes([]);
        } else {
          console.warn("Using empty data due to Firestore error:", error);
          setOrders([]);
          setSavedRecipes([]);
        }
      } finally {
        setFetching(false);
      }
    }
    if (user) fetchData();
  }, [user, loading, navigate]);

  const handleDeleteRecipe = async (recipeId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'savedRecipes', recipeId));
      setSavedRecipes(prev => prev.filter(r => r.id !== recipeId));
      toast.success('Recipe removed from favorites');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/savedRecipes/${recipeId}`);
      toast.error('Failed to remove recipe');
    }
  };

  if (loading || (user && fetching)) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-36 text-center text-muted-foreground font-mono text-xs uppercase tracking-widest flex flex-col items-center justify-center gap-4 bg-background">
        <span className="w-8 h-8 rounded-full border-t-2 border-primary animate-spin"></span>
        FETCHING SECURITY TOKENS & PROFILE DATABASES...
      </div>
    );
  }

  // Dedicated unauthenticated view with Forgot Password & Sign In
  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 md:py-20 w-full text-foreground">
        <SEO 
          title="Account Access & Password Recovery - FreshNLocal" 
          description="Sign in or reset your FreshNLocal admin or customer account password."
        />

        {/* Header */}
        <div className="text-center max-w-xl mx-auto mb-10 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-bold uppercase tracking-wider mb-2">
            <ShieldCheck className="w-4 h-4" /> Member & Admin Portal
          </div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-foreground">
            Account Access & Recovery
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Sign in to access your orders and admin portal, or request a password reset email if you don't know your password.
          </p>
        </div>

        {/* Two Column Grid: Sign In & Forgot Password */}
        <div className="grid md:grid-cols-2 gap-6 items-stretch">
          {/* Card 1: Sign In */}
          <div className="bg-secondary/60 border border-border rounded-2xl p-6 sm:p-7 flex flex-col justify-between shadow-xs">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center">
                <User className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold uppercase tracking-tight text-foreground">
                Sign In to Account
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                If you know your password, click below to open the sign in window and enter your email & password.
              </p>
            </div>

            <div className="pt-6">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { mode: 'login' } }))}
                className="w-full py-3 px-4 bg-primary hover:bg-[#009e45] text-primary-foreground font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Open Sign In Window</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Card 2: Forgot Password Form */}
          <div className="bg-white dark:bg-card border-2 border-primary/40 rounded-2xl p-6 sm:p-7 flex flex-col justify-between shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[9px] font-mono font-black uppercase px-3 py-1 rounded-bl-xl tracking-wider">
              Password Reset
            </div>

            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Key className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold uppercase tracking-tight text-foreground">
                Forgot Password?
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Enter your registered admin or customer email address. A password reset link will be sent to your Gmail inbox so you can create a new password.
              </p>

              {resetSentSuccess ? (
                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold">
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Reset Link Sent!</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    We sent a password reset link to <b className="font-mono">{resetEmail}</b>. Check your Gmail inbox (and Spam folder) on this PC, click the link to set your new password, then sign in!
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setResetSentSuccess(false);
                      window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { mode: 'login' } }));
                    }}
                    className="mt-2 text-xs font-bold text-primary hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <span>Click here to Sign In now</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <form onSubmit={(e) => handleSendResetEmail(e)} className="space-y-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                      Email Address
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="e.g. freshnlocalco@gmail.com"
                        className="w-full h-11 px-3.5 pl-10 bg-secondary/40 border border-border focus:border-primary focus:bg-white rounded-xl text-xs font-bold text-foreground outline-none transition-colors"
                      />
                      <Mail className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSendingReset || !resetEmail.trim()}
                    className="w-full py-3 px-4 bg-primary hover:bg-[#009e45] disabled:opacity-50 text-primary-foreground font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSendingReset ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Sending Link...</span>
                      </>
                    ) : (
                      <>
                        <Mail className="w-4 h-4" />
                        <span>Send Password Reset Email</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-border/60 text-[10px] text-muted-foreground">
              💡 <b>Tip:</b> Since your admin Gmail is already logged in on this PC, check your Gmail inbox immediately after clicking send.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const displayLabel = user?.displayName || (
    user?.role === 'admin' ? 'FNL Admin' : 
    user?.role === 'horeca_admin' ? 'HoReCa Admin' : 
    user?.role === 'horeca' ? 'HoReCa Partner' : 'Customer'
  );

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 pt-6 pb-16 w-full grid lg:grid-cols-12 gap-8 bg-background text-foreground">
      <SEO 
        title="Your Profile" 
        description="Access and manage your FreshNLocal Co. account details, saved addresses, reward points, order history, and favorited AI chef recipes."
      />
      {/* Left Sidebar Member Profile Card */}
      <div className="lg:col-span-4">
        <div className="slice-card p-5 sm:p-8 space-y-6 sm:space-y-8 lg:sticky lg:top-24 bg-secondary border border-border shadow-sm">
          <div className="space-y-3 sm:space-y-4 text-center">
            {/* User Icon resembling slice credit details */}
            <div className="mx-auto w-16 h-16 sm:w-24 sm:h-24 bg-gradient-to-tr from-primary/20 to-secondary border border-primary/30 text-primary rounded-2xl sm:rounded-[24px] flex items-center justify-center text-xl sm:text-3xl font-black shadow-none">
              {(user?.displayName || displayLabel || 'U')[0].toUpperCase()}
            </div>
            
            <div className="space-y-1 mt-2 flex flex-col items-center w-full">
              {!isEditingName ? (
                <>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <h2 className="text-lg sm:text-xl font-black uppercase text-foreground tracking-tight flex items-center justify-center gap-2">
                      {user?.displayName || displayLabel}
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setNameInput(user?.displayName || '');
                        setIsEditingName(true);
                      }}
                      className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer border border-transparent hover:border-primary/20"
                      title="Edit customer name"
                      aria-label="Edit customer name"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {(user?.role === 'horeca' || user?.role === 'horeca_admin') && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 border border-primary/25 rounded-full text-primary shadow-2xs" title="Verified HoReCa B2B Partner">
                      <Building2 className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[10px] uppercase font-black tracking-widest text-primary">HoReCa B2B Partner</span>
                    </span>
                  )}
                  <p className="text-xs text-muted-foreground font-mono tracking-wide">{user?.email}</p>
                </>
              ) : (
                <form
                  onSubmit={handleSaveName}
                  className="w-full mt-2 p-3 bg-background rounded-xl border border-primary/30 shadow-xs space-y-2.5 text-left"
                >
                  <div className="flex items-center justify-between">
                    <label htmlFor="customer-name-edit" className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-primary" /> Update Customer Name
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsEditingName(false)}
                      className="text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
                      aria-label="Cancel editing"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    id="customer-name-edit"
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Enter customer name"
                    maxLength={50}
                    autoFocus
                    className="w-full px-3 py-1.5 bg-secondary/50 border border-border focus:border-primary focus:ring-1 focus:ring-primary rounded-lg text-xs font-bold text-foreground outline-none transition-all placeholder:text-muted-foreground/60"
                  />
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsEditingName(false)}
                      disabled={isSavingName}
                      className="px-2.5 py-1 rounded-md text-xs font-bold text-muted-foreground hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingName || !nameInput.trim()}
                      className="px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 rounded-md text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                    >
                      {isSavingName ? (
                        <>
                          <span className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></span>
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Save Name
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          <div className="space-y-3 sm:space-y-4 border-t border-border pt-5 sm:pt-6 text-[10px] uppercase font-bold tracking-wider text-muted-foreground font-sans">
            <div className="flex justify-between items-center bg-background p-2.5 sm:p-3 rounded-xl border border-border">
              <span className="flex items-center gap-2"><User className="w-4 h-4 text-primary" /> Customer Name</span>
              <div className="flex items-center gap-2">
                <span className="text-foreground font-bold tracking-tight truncate max-w-[120px] sm:max-w-[150px] text-right">
                  {user?.displayName || 'Not Set'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setNameInput(user?.displayName || '');
                    setIsEditingName(true);
                  }}
                  className="text-[9px] uppercase tracking-wider font-extrabold text-primary hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" />
                  {user?.displayName ? 'Edit' : 'Add'}
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center bg-background p-2.5 sm:p-3 rounded-xl border border-border">
              <span className="flex items-center gap-2"><Key className="w-4 h-4 text-primary" /> Authority level</span>
              <span className="text-primary font-black uppercase tracking-widest">{user?.role}</span>
            </div>
            {user?.points !== undefined && (
              <div className="flex justify-between items-center bg-background p-2.5 sm:p-3 rounded-xl border border-border">
                <span className="flex items-center gap-2"><Award className="w-4 h-4 text-primary" /> FNL Points</span>
                <span className="text-primary font-black uppercase tracking-widest bg-primary/10 px-2 py-0.5 rounded-md">{user.points} PTS</span>
              </div>
            )}
            <div className="flex justify-between items-center bg-background p-2.5 sm:p-3 rounded-xl border border-border">
              <span className="flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Member Since</span>
              <span className="text-foreground font-mono">{new Date(user?.createdAt || Date.now()).toLocaleDateString()}</span>
            </div>

            {user?.addresses && user.addresses.length > 0 ? (
              <div className="bg-background p-4 rounded-xl border border-border space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-2 font-bold text-xs uppercase text-foreground"><Package className="w-4 h-4 text-primary" /> Saved Addresses ({user.addresses.length})</span>
                </div>
                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {user.addresses.map((addr, i) => (
                    <div key={addr.id} className={`p-2.5 rounded-lg border border-border/70 bg-secondary/20 relative ${i !== 0 ? 'mt-2' : ''}`}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-xs uppercase text-foreground flex items-center gap-1.5">
                          {addr.label}
                          {addr.isDefault && <span className="text-[8px] bg-primary/10 text-primary font-extrabold px-1.5 py-0.5 rounded-full tracking-wider">Default</span>}
                        </span>
                        <div className="flex items-center gap-2">
                          {!addr.isDefault && (
                            <button
                              type="button"
                              onClick={() => {
                                setDefaultUserAddress(addr.id);
                                toast.success("Set as default address!");
                              }}
                              className="text-[9px] uppercase tracking-wider font-extrabold text-primary hover:underline cursor-pointer"
                              title="Set as Default Address"
                            >
                              Set Default
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              deleteUserAddress(addr.id);
                              toast.success(`Deleted "${addr.label}" address`);
                            }}
                            className="p-1 rounded-md text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Delete this address"
                            aria-label="Delete address"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-muted-foreground text-[10px] leading-relaxed capitalize">
                        {addr.line1}, {addr.line2}
                        {addr.landmark ? `, ${addr.landmark}` : ''}
                        <br/> {addr.city}, {addr.state} - {addr.pincode}
                      </p>
                      {addr.phone && <p className="text-muted-foreground font-mono mt-1 text-[9px] tracking-wider">{addr.phone}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ) : user?.address ? (
              <div className="bg-background p-4 rounded-xl border border-border space-y-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="flex items-center gap-2 font-bold text-xs uppercase text-foreground"><Package className="w-4 h-4 text-primary" /> Saved Delivery Address</span>
                  <button
                    type="button"
                    onClick={() => {
                      deleteUserLegacyAddress();
                      toast.success("Saved address deleted");
                    }}
                    className="p-1 rounded-md text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                    title="Delete saved address"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-foreground text-[11px] leading-relaxed capitalize">{user.address}</p>
              </div>
            ) : null}
            
            {/* Password & Security Section */}
            <div className="bg-background p-3.5 rounded-xl border border-border space-y-2 text-left">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-bold text-xs uppercase text-foreground">
                  <Lock className="w-4 h-4 text-primary" /> Password & Security
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed normal-case">
                Need to reset or change your password? Click below to send a secure password reset link to <b className="text-foreground">{user?.email}</b>.
              </p>
              <button
                type="button"
                onClick={() => handleSendResetEmail(undefined, user?.email)}
                disabled={isSendingReset || !user?.email}
                className="w-full py-2 px-3 bg-secondary hover:bg-secondary/80 border border-border hover:border-primary/40 rounded-lg text-xs font-bold text-foreground transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs disabled:opacity-50"
              >
                {isSendingReset ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending Reset Link...</span>
                  </>
                ) : (
                  <>
                    <Mail className="w-3.5 h-3.5 text-primary" />
                    <span>Send Password Reset Email</span>
                  </>
                )}
              </button>
            </div>

            <button 
              onClick={async () => {
                await signOut();
                notifySignOutSuccess();
                navigate('/');
              }} 
              className="w-full mt-4 flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 py-3 rounded-xl border border-red-500/20 transition-all font-black cursor-pointer"
            >
              <LogOut className="w-4 h-4" /> SIGN OUT NOW
            </button>
          </div>
        </div>
      </div>

      {/* Right Column Orders History */}
      <div className="lg:col-span-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-border pb-4 gap-4">
          <div className="space-y-4 bg-transparent w-full">
            <div>
              <span className="glass-pill inline-block">{activeTab === 'orders' ? 'Purchase Desk' : 'Culinary Desk'}</span>
            </div>
            <div className="flex gap-6">
              <button 
                onClick={() => navigate('/profile?tab=orders')}
                className={`text-lg sm:text-xl md:text-3xl font-sans font-black uppercase tracking-tight pb-2 transition-all relative ${activeTab === 'orders' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground/80 border-b-2 border-transparent'}`}
              >
                Orders
              </button>
              <button 
                onClick={() => navigate('/profile?tab=recipes')}
                className={`text-lg sm:text-xl md:text-3xl font-sans font-black uppercase tracking-tight pb-2 transition-all relative ${activeTab === 'recipes' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground/80 border-b-2 border-transparent'}`}
              >
                Saved Recipes
              </button>
            </div>
          </div>
          <p className="hidden md:flex items-center gap-1.5 text-xxs font-mono font-bold tracking-widest text-[#506053] shrink-0 pb-2">
            <Activity className="w-4 h-4 text-primary animate-pulse" /> {activeTab === 'orders' ? 'TRANSACTION SECURE' : 'RECIPES SECURE'}
          </p>
        </div>

        {activeTab === 'orders' ? (
          orders.length === 0 ? (
            <div className="bg-secondary border border-border p-12 lg:p-16 text-center flex flex-col items-center gap-6 rounded-[32px] shadow-sm">
              <Package className="w-12 h-12 text-primary opacity-80" />
              <div className="space-y-1">
                <h3 className="text-lg font-black uppercase text-foreground">No active orders found</h3>
                <p className="text-muted-foreground text-xs font-semibold max-w-xs mx-auto">
                  Your transaction ledger is completely clean. Get fresh harvests directly from Gujarati farmers.
                </p>
              </div>
              <button 
                onClick={() => navigate('/shop')} 
                className="slice-btn-primary px-8 py-4.5 text-[10px] flex items-center gap-1.5 shadow-none mt-2"
              >
                Order Fresh Now <ChevronRight className="w-4.5 h-4.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {orders.map(order => (
                <div key={order.id} className="slice-card p-6 lg:p-8 space-y-6">
                  <div className="flex flex-wrap justify-between items-start gap-4 pb-6 border-b border-border font-sans text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <div>
                      <p className="text-muted-foreground font-black text-[8px] tracking-[0.12em] block">TRANSACTION ID</p>
                      <p className="font-mono text-foreground text-xs mt-1">
                         {order.orderNumber || `#FNL-${order.id.slice(0, 8).toUpperCase()}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-black text-[8px] tracking-[0.12em] block">TIMESTAMP</p>
                      <p className="text-foreground mt-1">{new Date(order.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-black text-[8px] tracking-[0.12em] block">SETTLEMENT COST</p>
                      <p className="text-primary font-black text-xs mt-1">₹{order.totalAmount}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-black text-[8px] tracking-[0.12em] block">SHIPMENT STATUS</p>
                      <span className={`inline-block px-3.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest mt-1
                         ${order.status === 'delivered' ? 'bg-primary/10 text-primary border border-primary/20' : 
                           order.status === 'cancelled' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 
                           'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'}`}>
                        {order.status}
                      </span>
                    </div>
                  </div>
  
                  <div className="space-y-4">
                    <h4 className="text-[9px] font-black uppercase tracking-wider text-primary">Consigned Items</h4>
                    <div className="grid sm:grid-cols-2 gap-4">
                      {order.items.map((item: any, idx: number) => {
                        const product = item.product || item;
                        return (
                          <div key={idx} className="flex justify-between items-center p-3.5 rounded-xl bg-background border border-border text-xs font-semibold">
                            <span className="text-foreground uppercase tracking-wide truncate max-w-[200px]">
                              {item.quantity}x {product.name}
                            </span>
                            <span className="text-muted-foreground font-mono">₹{product.price * item.quantity}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 border-t border-border">
                    <button 
                      onClick={() => handleOrderAgain(order)}
                      disabled={reorderingId === order.id}
                      className="slice-btn-primary px-6 py-3 text-[10px] flex items-center justify-center gap-2 group shadow-xs disabled:opacity-50"
                    >
                      {reorderingId === order.id ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          Reordering...
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-3.5 h-3.5 transition-transform group-hover:-rotate-90 duration-300" />
                          Reorder
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          savedRecipes.length === 0 ? (
            <div className="bg-secondary border border-border p-12 lg:p-16 text-center flex flex-col items-center gap-6 rounded-[32px] shadow-sm">
              <Heart className="w-12 h-12 text-primary opacity-80" />
              <div className="space-y-1">
                <h3 className="text-lg font-black uppercase text-foreground">No saved recipes</h3>
                <p className="text-muted-foreground text-xs font-semibold max-w-xs mx-auto">
                  You haven't saved any recipes yet. Visit FNL Recipes to create and save some delicious culinary creations.
                </p>
              </div>
              <button 
                onClick={() => navigate('/fnl-recipes')} 
                className="slice-btn-primary px-8 py-4.5 text-[10px] flex items-center gap-1.5 shadow-none mt-2"
              >
                Create Recipes <ChevronRight className="w-4.5 h-4.5" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {savedRecipes.map(recipe => (
                <div key={recipe.id} className="slice-card p-6 flex flex-col relative group">
                  <button 
                    onClick={() => handleDeleteRecipe(recipe.id)}
                    className="absolute top-4 right-4 p-2 bg-red-500/10 text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white"
                    title="Remove Recipe"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-2 mb-4">
                    <ChefHat className="w-5 h-5 text-primary" />
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{new Date(recipe.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="prose prose-sm prose-green max-w-none flex-1 max-h-64 overflow-y-auto custom-scrollbar pr-2 mb-4">
                    <Markdown>{recipe.recipeMarkdown}</Markdown>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
