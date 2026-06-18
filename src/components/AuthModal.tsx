import React, { useState } from 'react';
import { signInWithEmail, signUpWithEmail } from '../lib/firebase';
import { X, Mail, Lock, User as UserIcon } from 'lucide-react';

export function AuthModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [diagError, setDiagError] = useState<any | null>(null);
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
      if (err?.code === 'auth/email-already-in-use' || err?.message?.includes('email-already-in-use')) {
         setError('This email uses Google Sign-In. Open the app in a new tab to use Google login.');
      } else if (err?.code === 'auth/invalid-credential') {
         setError('Invalid password. If you originally used Google, please use Google login. (If you want an email/password Admin account, close this and Sign Up with admin@yourdomain.com)');
      } else if (err?.code === 'auth/unauthorized-domain') {
         setError('Vercel Domain Not Authorized: Add your Vercel URL to Firebase Console -> Authentication -> Authorized domains.');
      } else {
         setError(err.message || 'Authentication failed');
      }
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
          <div className="bg-red-50 text-red-600 text-[11px] p-3 border border-red-200 mb-4 font-medium uppercase tracking-widest break-words">
            {error}
          </div>
        )}

        {diagError && (
          <div className="bg-amber-50 border border-amber-300 p-4 rounded-xl text-xs text-amber-900 leading-normal mb-6 font-medium text-left">
            <div className="flex justify-between items-start mb-2">
              <span className="font-extrabold text-amber-950 uppercase tracking-wider text-[9px] block">🔍 Sign-In Diagnostic Helper</span>
              <button 
                type="button" 
                onClick={() => setDiagError(null)} 
                className="text-amber-600 hover:text-amber-950 font-bold text-[10px] uppercase tracking-wide cursor-pointer"
              >
                Clear
              </button>
            </div>
            
            <p className="font-semibold text-red-700 mb-2">
              Error code: <code className="bg-red-50 px-1 py-0.5 rounded border border-red-200 font-mono text-[10px]">{diagError.code || 'unknown'}</code>
            </p>
            <p className="text-[11px] text-amber-950 mb-3 leading-relaxed break-words">
              {diagError.message}
            </p>

            <div className="border-t border-amber-200 pt-3 mt-3 space-y-3">
              <span className="font-bold uppercase tracking-widest text-[9px] text-amber-950 block">Step-By-Step Solution:</span>
              
              {diagError.code === 'auth/unauthorized-domain' || String(diagError.code || '').includes('unauthorized-domain') || String(diagError.message || '').includes('unauthorized domain') ? (
                <div className="space-y-2 text-[11px] text-amber-900 leading-relaxed">
                  <p>
                    Your current domain <strong className="bg-amber-100 px-1.5 py-0.5 text-amber-950 rounded font-mono select-all break-all">{typeof window !== 'undefined' ? window.location.hostname : 'this domain'}</strong> is not authorized in your Firebase console.
                  </p>
                  <p className="font-bold">To fix this in 30 seconds:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-1 text-amber-950 font-medium">
                    <li>Go to your <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="underline text-blue-700 font-bold hover:text-blue-900">Firebase Console</a></li>
                    <li>Select project: <strong className="font-mono bg-white px-1 border">freshnlocal-4a420</strong></li>
                    <li>Go to <strong className="font-sans">Authentication ➔ Settings ➔ Authorized domains</strong></li>
                    <li>Click <strong className="font-sans">Add Domain</strong> and type: <code className="bg-white px-1.5 py-0.5 border select-all font-mono text-[10px] text-amber-950 font-bold">{typeof window !== 'undefined' ? window.location.hostname : 'your-domain'}</code></li>
                    <li>Make sure to also add <code className="bg-white px-1 border text-[10px] font-mono">freshnlocal.co</code> if you are testing on your production domain!</li>
                  </ol>
                </div>
              ) : diagError.code === 'auth/operation-not-allowed' ? (
                <div className="space-y-2 text-[11px] text-amber-900 leading-relaxed">
                  <p>
                    Google Sign-In is not enabled inside your Firebase project.
                  </p>
                  <p className="font-bold">To fix this:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-1 text-amber-950 font-medium">
                    <li>Go to your <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="underline text-blue-700 font-bold">Firebase Console</a></li>
                    <li>Go to <strong className="font-sans">Authentication ➔ Sign-in method</strong></li>
                    <li>Click <strong className="font-sans">Add new provider</strong> (or edit existing) and select <strong className="font-sans">Google</strong></li>
                    <li>Toggle the <strong className="font-bold">Enable</strong> switch, enter a support email, and click <strong className="font-bold">Save</strong></li>
                  </ol>
                </div>
              ) : diagError.code === 'auth/popup-blocked' ? (
                <div className="space-y-2 text-[11px] text-amber-900 leading-relaxed">
                  <p>
                    The browser blocked the authentication popup window.
                  </p>
                  <p className="font-bold">To fix this:</p>
                  <ul className="list-disc list-inside space-y-1 ml-1 text-amber-950 font-medium">
                    <li>Look at your browser's URL address bar for a blocked popup icon (looks like a key, 🚫 or a popup warning).</li>
                    <li>Click it and select "Always allow popups from this site".</li>
                    <li>Or, click "Open in new tab" in the top-right of your AI Studio workspace to log in without iframe blocks.</li>
                  </ul>
                </div>
              ) : (
                <div className="space-y-2 text-[11px] text-amber-900 leading-relaxed">
                  <p className="font-bold">General Sign-In suggestions:</p>
                  <ul className="list-disc list-inside space-y-1 ml-1 text-amber-950 font-medium">
                    <li>If you are in Incognito / Private browsing, your browser may block cross-origin authentication. Try a standard window.</li>
                    <li>You can always register a traditional account with any email/password instantly above instead!</li>
                  </ul>
                </div>
              )}
            </div>
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

        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 border-t border-border"></div>
          <span className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground">OR</span>
          <div className="flex-1 border-t border-border"></div>
        </div>

        {typeof window !== 'undefined' && window.self !== window.top && (
          <div className="bg-amber-50 border border-amber-200 p-3 sm:p-4 rounded-xl text-[11px] text-amber-800 leading-normal mb-4 font-semibold">
            <span className="font-black uppercase tracking-widest mb-1 text-[10px] text-amber-950 block">⚠️ Nested Iframe Warning</span>
            Google Sign-In popups are blocked/restricted inside design previews due to browser privacy policies.
            <div className="mt-2 space-y-1 text-amber-900">
              <p>• <strong className="text-amber-950">Option 1:</strong> Use the direct <strong className="text-amber-950">Email Address & Password</strong> form above to login or sign up instantly.</p>
              <p>• <strong className="text-amber-950">Option 2:</strong> Click the <strong className="text-amber-950">"Open in new tab"</strong> button in the top-right of your AI Studio workspace. In a separate tab, Google Login will function perfectly.</p>
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={async () => {
            try {
              setLoading(true);
              setError('');
              setDiagError(null);
              const m = await import('../lib/firebase');
              await m.signIn();
              onClose();
            } catch (err: any) {
              setDiagError(err);
              if (err?.code === 'auth/unauthorized-domain') {
                 setError('Domain Not Whitelisted: Add this domain to your Firebase Console under Authentication -> Settings -> Authorized domains.');
              } else {
                 setError('Google Sign In failed: ' + (err.message || ''));
              }
            } finally {
              setLoading(false);
            }
          }}
          className="w-full py-3 bg-white text-foreground text-[10px] font-bold uppercase tracking-widest border border-border hover:bg-black/5 transition-colors flex justify-center items-center gap-2 mb-6"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-4 h-4" />
          Continue with Google
        </button>

        <div className="text-center text-sm text-muted-foreground">
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
