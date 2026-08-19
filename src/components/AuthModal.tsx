import React, { useState } from 'react';
import { signInWithEmail, signUpWithEmail } from '../lib/firebase';
import { X, Mail, Lock, User as UserIcon, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { getHumanAuthErrorMessage, notifySignInSuccess, notifySignUpSuccess, notifyAuthError } from '../lib/authNotifications';
import { motion, AnimatePresence } from 'motion/react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'login' | 'signup';
}

export function AuthModal({ isOpen, onClose, defaultMode = 'login' }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(defaultMode === 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sync mode if defaultMode changes
  React.useEffect(() => {
    setIsLogin(defaultMode === 'login');
  }, [defaultMode]);

  // Reset state on open/close
  React.useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessMessage(null);
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleModeToggle = (loginMode: boolean) => {
    setIsLogin(loginMode);
    setError(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const cleanEmail = email.trim();

    try {
      if (isLogin) {
        const userCred = await signInWithEmail(cleanEmail, password);
        const displayName = userCred.user?.displayName || cleanEmail.split('@')[0];
        setSuccessMessage(`Welcome back, ${displayName}!`);
        notifySignInSuccess(displayName, cleanEmail);
        setTimeout(() => {
          onClose();
        }, 900);
      } else {
        if (!name.trim()) {
          setError('Please enter your full name.');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters long.');
          setLoading(false);
          return;
        }
        const userCred = await signUpWithEmail(cleanEmail, password, name.trim());
        const displayName = name.trim() || userCred.user?.displayName || cleanEmail.split('@')[0];
        setSuccessMessage(`Account created! Welcome to FreshNLocal.`);
        notifySignUpSuccess(displayName);
        setTimeout(() => {
          onClose();
        }, 900);
      }
    } catch (err: any) {
      const friendlyMsg = getHumanAuthErrorMessage(err);
      setError(friendlyMsg);
      notifyAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      const m = await import('../lib/firebase');
      await m.signIn();
      notifySignInSuccess('there', '');
      onClose();
    } catch (err: any) {
      const friendlyMsg = getHumanAuthErrorMessage(err);
      setError(friendlyMsg);
      notifyAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="bg-white border border-border/80 w-full max-w-md p-6 sm:p-8 relative rounded-3xl shadow-2xl overflow-hidden"
        >
          {/* Top Close Button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-all cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Success Overlay Animation */}
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 bg-white/95 backdrop-blur-xs z-20 flex flex-col items-center justify-center p-6 text-center"
            >
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4 shadow-inner">
                <CheckCircle2 className="w-9 h-9 animate-bounce" />
              </div>
              <h3 className="font-serif text-2xl font-bold text-foreground mb-1">
                {isLogin ? 'Signed In!' : 'Welcome to FreshNLocal!'}
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs">{successMessage}</p>
            </motion.div>
          )}

          {/* Header Brand & Title */}
          <div className="text-center sm:text-left mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-[10px] uppercase font-bold tracking-widest mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> FreshNLocal Account
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {isLogin ? 'Welcome Back' : 'Create Your Account'}
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {isLogin
                ? 'Sign in to access your orders, saved recipes, and farm-fresh produce.'
                : 'Join today to enjoy farm-to-table deliveries and partner benefits.'}
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="grid grid-cols-2 p-1 bg-secondary/80 rounded-2xl mb-6 border border-border/50">
            <button
              type="button"
              onClick={() => handleModeToggle(true)}
              className={`py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
                isLogin
                  ? 'bg-white text-foreground shadow-xs font-black'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => handleModeToggle(false)}
              className={`py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
                !isLogin
                  ? 'bg-white text-foreground shadow-xs font-black'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Professional Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-50/90 border border-red-200/80 text-red-700 px-4 py-3 rounded-2xl mb-5 flex items-start gap-2.5 text-xs leading-relaxed"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{error}</div>
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {!isLogin && (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-foreground/80 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <input
                    required
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border border-border/80 rounded-2xl px-4 py-3 pl-10 bg-secondary/40 outline-none text-sm focus:border-primary focus:bg-white transition-all text-foreground placeholder:text-muted-foreground/60"
                    placeholder="e.g. Rahul Sharma"
                    autoComplete="name"
                  />
                  <UserIcon className="w-4 h-4 absolute left-3.5 top-3.5 text-muted-foreground" />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-foreground/80 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-border/80 rounded-2xl px-4 py-3 pl-10 bg-secondary/40 outline-none text-sm focus:border-primary focus:bg-white transition-all text-foreground placeholder:text-muted-foreground/60"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
                <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-muted-foreground" />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-foreground/80 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-border/80 rounded-2xl px-4 py-3 pl-10 pr-10 bg-secondary/40 outline-none text-sm focus:border-primary focus:bg-white transition-all text-foreground placeholder:text-muted-foreground/60"
                  placeholder="••••••••"
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                />
                <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-muted-foreground" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {!isLogin && (
                <p className="text-[10px] text-muted-foreground mt-1 ml-1">Must be at least 6 characters</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-primary text-white rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-[#009e45] active:scale-[0.99] transition-all shadow-md shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isLogin ? 'Signing In...' : 'Creating Account...'}</span>
                </>
              ) : isLogin ? (
                'Sign In to Account'
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Subtle Divider */}
          <div className="flex items-center gap-4 my-5">
            <div className="flex-1 border-t border-border/60" />
            <span className="text-[9px] uppercase font-black tracking-widest text-muted-foreground/80">
              OR
            </span>
            <div className="flex-1 border-t border-border/60" />
          </div>

          {/* Google Sign-in */}
          <button
            type="button"
            disabled={loading}
            onClick={handleGoogleSignIn}
            className="w-full py-3 bg-white text-foreground text-xs font-bold uppercase tracking-wider border border-border/80 rounded-2xl hover:bg-secondary/60 active:scale-[0.99] transition-all flex justify-center items-center gap-2.5 shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <img
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              alt="Google"
              className="w-4 h-4"
            />
            <span>Continue with Google</span>
          </button>

          {/* Footer toggle */}
          <div className="text-center text-xs text-muted-foreground mt-5">
            {isLogin ? "Don't have an account yet? " : 'Already registered? '}
            <button
              type="button"
              onClick={() => handleModeToggle(!isLogin)}
              className="text-primary font-bold hover:underline cursor-pointer ml-1"
            >
              {isLogin ? 'Create one now' : 'Sign in here'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
