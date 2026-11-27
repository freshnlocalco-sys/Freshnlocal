import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged, User as FirebaseUser, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { create } from 'zustand';
import firebaseConfig from '../../firebase-applet-config.json';
import { claimAuth, releaseAuth, ownedByOther } from './authSession';
// Imported directly rather than through otpAuth.ts, which imports this file:
// going the other way would be a cycle. signOut() needs it to end a customer's
// Supabase session as well as a staff Firebase one.
import { supabase } from './supabase';
// customerProfile.ts imports only a TYPE back from this file, which TypeScript
// erases, so this is not a runtime cycle.
import { saveProfileFields, saveAddresses } from './customerProfile';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Use a dynamically computed fallback storage bucket (appspot.com vs firebasestorage.app) to ensure reliability
const primaryBucket = firebaseConfig.storageBucket || "";
const projectId = firebaseConfig.projectId || "freshnlocal-4a420";
let fallbackBucketUrl = `gs://${projectId}.appspot.com`;
if (primaryBucket.endsWith('.appspot.com')) {
  fallbackBucketUrl = `gs://${primaryBucket.replace('.appspot.com', '.firebasestorage.app')}`;
}
export const fallbackStorage = getStorage(app, fallbackBucketUrl);

// Standard Firestore initialization with custom database ID from config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67");

// Safe connection validation to catch potential offline/transient stream transitions gracefully
async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: any) {
    // Gracefully handle offline or transient network states without throwing unhandled exceptions
    if (error?.message?.includes('the client is offline') || error?.code === 'unavailable') {
      // Client operates seamlessly in offline/cached mode
    }
  }
}
testFirestoreConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const isQuota = errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('limit exceeded');
  
  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  
  if (isQuota) {
    console.warn('Firestore Quota Exceeded. App may switch to fallback/offline mode.');
  } else {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }
  
  throw new Error(JSON.stringify({ ...errInfo, isQuota }));
}

export function isQuotaError(error: any): boolean {
  try {
    const parsed = JSON.parse(error.message);
    return parsed.isQuota === true;
  } catch {
    return String(error).toLowerCase().includes('quota');
  }
}

// Address interface for multiple addresses
export interface Address {
  id: string;
  label: string;
  name?: string;
  phone?: string;
  line1: string;
  line2: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  isDefault?: boolean;
}

// User Record in DB
export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'customer' | 'horeca' | 'horeca_admin';
  phone?: string;
  address?: string; // legacy address
  addresses?: Address[];
  points?: number;
  createdAt: number;
}

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  setUser: (user: AppUser | null) => void;
  setLoading: (loading: boolean) => void;
}

const getInitialAuthUser = (): AppUser | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('cached_auth_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const initialCachedUser = getInitialAuthUser();

export const useAuth = create<AuthState>((set) => ({
  user: initialCachedUser,
  loading: !initialCachedUser,
  setUser: (user) => {
    if (typeof window !== 'undefined') {
      if (user) {
        try {
          localStorage.setItem('cached_auth_user', JSON.stringify(user));
        } catch {
          // ignore
        }
      } else {
        localStorage.removeItem('cached_auth_user');
      }
    }
    set({ user });
  },
  setLoading: (loading) => set({ loading }),
}));

// Setup listener with real-time user document sync
let unsubscribeUserSnapshot: (() => void) | null = null;

onAuthStateChanged(auth, async (firebaseUser) => {
  if (unsubscribeUserSnapshot) {
    unsubscribeUserSnapshot();
    unsubscribeUserSnapshot = null;
  }

  if (firebaseUser) {
    // Staff are the only people who should still arrive here. Claim the session
    // so the Supabase listener does not clear it out from under us.
    claimAuth('firebase');
    const userEmail = firebaseUser.email?.toLowerCase().trim() || '';
    const isAdmin = userEmail === 'freshnlocalco@gmail.com' || userEmail === 'mohitswami855@gmail.com' || userEmail === 'freshnlocal2@gmail.com' || userEmail.startsWith('admin@');
    const isHorecaAdmin = userEmail === 'horeca@gmail.com' || userEmail === 'horecaadmin@gmail.com' || userEmail.startsWith('horecaadmin@');

    let autoRole: 'admin' | 'horeca_admin' | null = null;
    if (isAdmin) autoRole = 'admin';
    else if (isHorecaAdmin) autoRole = 'horeca_admin';

    const userRef = doc(db, 'users', firebaseUser.uid);

    // Real-time snapshot listener: any points award, deduction, or profile change immediately reflects in app UI
    unsubscribeUserSnapshot = onSnapshot(userRef, (userSnap) => {
      if (userSnap.exists()) {
        const userData = userSnap.data() as Omit<AppUser, 'uid'>;
        const finalRole = autoRole || userData.role || 'customer';
        useAuth.getState().setUser({ uid: firebaseUser.uid, ...userData, role: finalRole } as AppUser);
      }
    }, (err) => {
      console.warn("User profile snapshot listener error:", err);
    });

    try {
      const userSnap = await getDoc(userRef);
      import('./cacheManager').then(m => m.trackFirestoreRead('users', 1)).catch(() => {});
      
      if (userSnap.exists()) {
        const userData = userSnap.data() as Omit<AppUser, 'uid'>;
        const finalRole = autoRole || userData.role || 'customer';
        if (autoRole && userData.role !== autoRole) {
          try {
            await setDoc(userRef, { role: autoRole }, { merge: true });
          } catch (err) {
            console.warn("Could not sync role to Firestore:", err);
          }
        }
        useAuth.getState().setUser({ uid: firebaseUser.uid, ...userData, role: finalRole } as AppUser);
      } else {
        // Create new user record
        const newUser: Omit<AppUser, 'uid'> = {
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || '',
          role: autoRole || 'customer',
          points: 0,
          createdAt: Date.now(),
        };
        try {
          await setDoc(userRef, newUser);
        } catch (err) {
          console.warn("Could not save new user document to Firestore:", err);
        }
        useAuth.getState().setUser({ uid: firebaseUser.uid, ...newUser } as AppUser);
      }
    } catch (e: any) {
      console.warn("Using fallback user due to Firestore error:", e);
      const fallbackUser: Omit<AppUser, 'uid'> = {
        email: firebaseUser.email || '',
        displayName: firebaseUser.displayName || '',
        role: autoRole || 'customer',
        points: 0,
        createdAt: Date.now(),
      };
      useAuth.getState().setUser({ uid: firebaseUser.uid, ...fallbackUser } as AppUser);
    }
  } else {
    // No Firebase user. That is the NORMAL state for a signed-in customer, who
    // holds a Supabase session instead -- so this branch must not assume
    // "nobody is signed in" and clear the store. Without this check the two
    // listeners race on every page load and the customer is signed out a beat
    // after signing in, intermittently. See authSession.ts.
    releaseAuth('firebase');
    if (!ownedByOther('firebase')) {
      useAuth.getState().setUser(null);
    }
  }
  useAuth.getState().setLoading(false);
});

export const signIn = async () => {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error('Sign-in error', error);
    throw error;
  }
};

export const signInWithEmail = async (email: string, pass: string) => {
  return await signInWithEmailAndPassword(auth, email, pass);
};

export const signUpWithEmail = async (email: string, pass: string, name: string) => {
  const res = await createUserWithEmailAndPassword(auth, email, pass);
  const { updateProfile } = await import('firebase/auth');
  await updateProfile(res.user, { displayName: name });
  
  const userRef = doc(db, 'users', res.user.uid);
  try {
    const snap = await getDoc(userRef);
    import('./cacheManager').then(m => m.trackFirestoreRead('users', 1)).catch(() => {});
    if (!snap.exists()) {
       const userEmail = email.toLowerCase().trim();
       let defaultRole: 'admin' | 'horeca_admin' | 'customer' = 'customer';
       if (userEmail === 'freshnlocalco@gmail.com' || userEmail === 'mohitswami855@gmail.com' || userEmail === 'freshnlocal2@gmail.com' || userEmail.startsWith('admin@')) {
         defaultRole = 'admin';
       } else if (userEmail === 'horeca@gmail.com' || userEmail === 'horecaadmin@gmail.com' || userEmail.startsWith('horecaadmin@')) {
         defaultRole = 'horeca_admin';
       }

       await setDoc(userRef, {
          email: email,
          displayName: name,
          role: defaultRole,
          createdAt: Date.now()
       });
    }
  } catch (error: any) {
    if (isQuotaError(error) || String(error).toLowerCase().includes('quota')) {
       console.warn("Could not create user document due to quota error, using fallback state.");
    } else {
       console.error("Firestore user creation failed", error);
       // We don't want to break the whole sign in just because firestore failed, since firebase auth succeeded
    }
  }
  return res;
};

/**
 * Sign out of everything.
 *
 * Both are ended regardless of which one is live, because "Sign out" has to
 * mean it. Signing out of only the owning provider would leave a stale session
 * in the other one, and the next page load would silently restore it -- the
 * worst possible answer on a shared or family device, which is exactly the
 * situation the shared-phone merge showed us is real here.
 */
export const signOut = async () => {
  const results = await Promise.allSettled([
    firebaseSignOut(auth),
    supabase ? supabase.auth.signOut() : Promise.resolve(),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') console.error('Sign-out error', r.reason);
  }
  releaseAuth('firebase');
  releaseAuth('supabase');
  useAuth.getState().setUser(null);
};

export const sendPasswordReset = async (email: string) => {
  return await sendPasswordResetEmail(auth, email.trim());
};

export const deleteUserAddress = async (addressId: string) => {
  const currentUser = useAuth.getState().user;
  if (!currentUser) return;

  const currentAddresses = currentUser.addresses || [];
  let updatedAddresses = currentAddresses.filter(a => a.id !== addressId);

  // If deleted address was default and there are remaining addresses, set the first as default
  const deletedAddress = currentAddresses.find(a => a.id === addressId);
  if (deletedAddress?.isDefault && updatedAddresses.length > 0) {
    if (!updatedAddresses.some(a => a.isDefault)) {
      updatedAddresses = updatedAddresses.map((a, idx) => ({
        ...a,
        isDefault: idx === 0,
      }));
    }
  }

  const updatedUser: AppUser = {
    ...currentUser,
    addresses: updatedAddresses,
  };

  useAuth.getState().setUser(updatedUser);

  try {
    // Customers are on Supabase. Staff fall through to Firestore, which is
    // where their profile still lives.
    if (!(await saveAddresses(currentUser.uid, updatedAddresses))) {
      const userRef = doc(db, 'users', currentUser.uid);
      await setDoc(userRef, { addresses: updatedAddresses }, { merge: true });
    }
  } catch (err) {
    console.warn("Could not delete address:", err);
  }
};

export const setDefaultUserAddress = async (addressId: string) => {
  const currentUser = useAuth.getState().user;
  if (!currentUser || !currentUser.addresses) return;

  const updatedAddresses = currentUser.addresses.map(a => ({
    ...a,
    isDefault: a.id === addressId
  }));

  const updatedUser: AppUser = {
    ...currentUser,
    addresses: updatedAddresses,
  };

  useAuth.getState().setUser(updatedUser);

  try {
    if (!(await saveAddresses(currentUser.uid, updatedAddresses))) {
      const userRef = doc(db, 'users', currentUser.uid);
      await setDoc(userRef, { addresses: updatedAddresses }, { merge: true });
    }
  } catch (err) {
    console.warn("Could not set default address:", err);
  }
};

export const deleteUserLegacyAddress = async () => {
  const currentUser = useAuth.getState().user;
  if (!currentUser) return;

  const { address, ...rest } = currentUser;
  const updatedUser: AppUser = {
    ...rest,
    address: undefined,
  };

  useAuth.getState().setUser(updatedUser);

  try {
    if (!(await saveProfileFields(currentUser.uid, { legacy_address: '' }))) {
      const userRef = doc(db, 'users', currentUser.uid);
      await setDoc(userRef, { address: '' }, { merge: true });
    }
  } catch (err) {
    console.warn("Could not delete legacy address:", err);
  }
};

export const updateUserDisplayName = async (newName: string): Promise<AppUser> => {
  const currentUser = useAuth.getState().user;
  if (!currentUser) throw new Error("No authenticated user");

  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Name cannot be empty");

  // 1. Update Firebase Auth currentUser displayName if available
  if (auth.currentUser) {
    try {
      await updateProfile(auth.currentUser, { displayName: trimmed });
    } catch (authErr) {
      console.warn("Could not update auth profile displayName:", authErr);
    }
  }

  // 2. Update local Zustand state immediately
  const updatedUser: AppUser = {
    ...currentUser,
    displayName: trimmed,
  };
  useAuth.getState().setUser(updatedUser);

  // 3. Persist. Supabase for customers, Firestore for staff.
  try {
    if (!(await saveProfileFields(currentUser.uid, { display_name: trimmed }))) {
      const userRef = doc(db, 'users', currentUser.uid);
      await setDoc(userRef, { displayName: trimmed }, { merge: true });
    }
  } catch (err) {
    console.warn("Could not save updated displayName:", err);
  }

  return updatedUser;
};

