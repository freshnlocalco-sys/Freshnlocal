import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged, User as FirebaseUser, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, setDoc, serverTimestamp, enableMultiTabIndexedDbPersistence, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { create } from 'zustand';
import firebaseConfig from '../../firebase-applet-config.json';

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
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  experimentalAutoDetectLongPolling: true,
}, "ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67");

// Test Firestore connection on boot to catch potential offline/transient stream issues
async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firestore connection check: Client offline or transient stream reconnecting.");
    }
  }
}
testFirestoreConnection();

if (typeof window !== 'undefined') {
  enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open, persistence can only be enabled in one tab at a time.
      console.warn('Firestore multi-tab persistence failed-precondition (multiple tabs)');
    } else if (err.code === 'unimplemented') {
      // The current browser does not support all of the features required to enable persistence
      console.warn('Firestore persistence unimplemented in this browser');
    } else {
      console.warn('Firestore persistence error:', err);
    }
  });
}

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

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
}));

// Setup listener
onAuthStateChanged(auth, async (firebaseUser) => {
  if (firebaseUser) {
    const userEmail = firebaseUser.email?.toLowerCase().trim() || '';
    const isAdmin = userEmail === 'freshnlocalco@gmail.com' || userEmail === 'mohitswami855@gmail.com' || userEmail === 'freshnlocal2@gmail.com' || userEmail.startsWith('admin@');
    const isHorecaAdmin = userEmail === 'horeca@gmail.com' || userEmail === 'horecaadmin@gmail.com' || userEmail.startsWith('horecaadmin@');

    let autoRole: 'admin' | 'horeca_admin' | null = null;
    if (isAdmin) autoRole = 'admin';
    else if (isHorecaAdmin) autoRole = 'horeca_admin';

    try {
      const userRef = doc(db, 'users', firebaseUser.uid);
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
    useAuth.getState().setUser(null);
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

export const signOut = async () => {
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    console.error('Sign-out error', error);
  }
};
