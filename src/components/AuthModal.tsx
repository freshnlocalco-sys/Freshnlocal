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
  const [isSuccess, setIsSuccess] = useState(false);

  // Sync mode if defaultMode changes
  React.useEffect(() => {
    setIsLogin(defaultMode === 'login');
  }, [defaultMode]);

  // Reset state on open/close
  React.useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsSuccess(false);
      setLoading(false);
      setShowPassword(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleModeToggle = (loginMode: boolean) => {
    setIsLogin(loginMode);
    setError(null);
    setShowPassword(false);
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
        setIsSuccess(true);
        notifySignInSuccess(displayName, cleanEmail);
        setTimeout(() => {
          onClose();
        }, 800);
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
        setIsSuccess(true);
        notifySignUpSuccess(displayName);
        setTimeout(() => {
          onClose();
        }, 800);
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
      />

      {/* Modal Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative bg-white border border-border w-full max-w-[420px] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.18)] p-6 sm:p-7 z-10 my-auto text-left"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Success Screen Overlay */}
        <AnimatePresence>
          {isSuccess && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-white rounded-2xl z-20 flex flex-col items-center justify-center p-6 text-center"
            >
              <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mb-3.5 shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-foreground">
                {isLogin ? 'Signed In Successfully' : 'Welcome to FreshNLocal!'}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
                {isLogin ? 'Redirecting you to your account...' : 'Your account has been created. Happy shopping!'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal Header */}
        <div className="mb-5 pr-6">
          <h2 className="text-2xl font-bold text-foreground tracking-tight">
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {isLogin
              ? 'Sign in to access your orders, saved items, and local deliveries.'
              : 'Join FreshNLocal to get fresh farm produce delivered to your doorstep.'}
          </p>
        </div>

        {/* Segmented Tab Bar */}
        <div className="flex bg-secondary/80 p-1 rounded-xl border border-border/70 mb-5">
          <button
            type="button"
            onClick={() => handleModeToggle(true)}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              isLogin
                ? 'bg-white text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => handleModeToggle(false)}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              !isLogin
                ? 'bg-white text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Error Alert Box */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200/80 text-red-700 flex items-start gap-2.5 text-xs leading-snug"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span className="font-medium">{error}</span>
          </motion.div>
        )}

        {/* Form Fields */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <input
                  required
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your Name"
                  className="w-full h-11 px-3.5 pl-10 bg-secondary/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary focus:bg-white transition-colors"
                  autoComplete="name"
                />
                <UserIcon className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full h-11 px-3.5 pl-10 bg-secondary/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary focus:bg-white transition-colors"
                autoComplete="email"
              />
              <Mail className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground/85 mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-11 px-3.5 pl-10 pr-11 bg-secondary/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary focus:bg-white transition-colors"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
              />
              <Lock className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg transition-colors cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {!isLogin && (
              <p className="text-[11px] text-muted-foreground mt-1 ml-0.5">
                Must be at least 6 characters
              </p>
            )}
          </div>

          {/* Primary Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 mt-1 bg-primary hover:bg-[#009e45] active:scale-[0.99] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{isLogin ? 'Signing In...' : 'Creating Account...'}</span>
              </>
            ) : (
              <span>{isLogin ? 'Sign In to Account' : 'Create Account'}</span>
            )}
          </button>
        </form>

        {/* Clean Line Divider */}
        <div className="relative flex items-center justify-center my-4.5">
          <div className="w-full border-t border-border/80" />
          <span className="absolute bg-white px-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            or
          </span>
        </div>

        {/* Google Sign-in Button */}
        <button
          type="button"
          disabled={loading}
          onClick={handleGoogleSignIn}
          className="w-full h-11 bg-white hover:bg-secondary/70 border border-border rounded-xl text-xs font-bold text-foreground flex items-center justify-center gap-2.5 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
        >
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
            className="w-4 h-4"
          />
          <span>Continue with Google</span>
        </button>

        {/* Bottom Toggle */}
        <div className="text-center text-xs text-muted-foreground mt-4.5">
          {isLogin ? "Don't have an account?" : 'Already registered?'}
          <button
            type="button"
            onClick={() => handleModeToggle(!isLogin)}
            className="text-primary font-bold hover:underline cursor-pointer ml-1.5"
          >
            {isLogin ? 'Create one now' : 'Sign in here'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
