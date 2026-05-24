import React, { useState } from 'react';
import { signInWithEmail, signUpWithEmail } from '../lib/firebase';
import { X, Mail, Lock, User as UserIcon } from 'lucide-react';

export function AuthModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password, name);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white border border-border w-full max-w-md p-8 relative flex flex-col">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>
        
        <h2 className="font-serif text-3xl font-bold mb-2 italic tracking-tight">{isLogin ? 'Welcome Back' : 'Join the Club'}</h2>
        <p className="text-sm text-muted-foreground mb-8">
          {isLogin ? 'Sign in to access your orders and fresh produce.' : 'Create an account to start shopping local.'}
        </p>

        {error && (
          <div className="bg-red-50 text-red-600 text-[11px] p-3 border border-red-200 mb-4 font-medium uppercase tracking-widest">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {!isLogin && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-2">Full Name</label>
              <div className="relative">
                <input 
                  required 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-border border-b-foreground px-4 py-3 pl-10 bg-secondary outline-none text-sm focus:bg-white transition-colors"
                  placeholder="John Doe"
                />
                <UserIcon className="w-4 h-4 absolute left-3 top-3.5 text-muted-foreground" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-2">Email Address</label>
            <div className="relative">
              <input 
                required 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-border border-b-foreground px-4 py-3 pl-10 bg-secondary outline-none text-sm focus:bg-white transition-colors"
                placeholder="you@example.com"
              />
              <Mail className="w-4 h-4 absolute left-3 top-3.5 text-muted-foreground" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-2">Password</label>
            <div className="relative">
              <input 
                required 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-border border-b-foreground px-4 py-3 pl-10 bg-secondary outline-none text-sm focus:bg-white transition-colors"
                placeholder="••••••••"
              />
              <Lock className="w-4 h-4 absolute left-3 top-3.5 text-muted-foreground" />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-3 bg-primary text-white text-[10px] font-bold uppercase tracking-widest hover:bg-[#009e45] transition-colors border border-primary mt-2 disabled:opacity-50"
          >
            {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button 
            type="button" 
            onClick={() => setIsLogin(!isLogin)}
            className="text-foreground font-bold hover:underline"
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
