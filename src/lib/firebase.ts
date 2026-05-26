import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged, User as FirebaseUser, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { create } from 'zustand';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Required parameter to use the correct enterprise database instance
// We use initializeFirestore with experimentalAutoDetectLongPolling to bypass potential websocket blocks in sandboxed containers or iframes
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

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

// User Record in DB
export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'customer';
  phone?: string;
  address?: string;
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
    try {
      const userRef = doc(db, 'users', firebaseUser.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        useAuth.getState().setUser({ uid: firebaseUser.uid, ...userSnap.data() } as AppUser);
      } else {
        // Create new user record
        const isAdmin = firebaseUser.email === 'freshnlocalco@gmail.com';
        const newUser: Omit<AppUser, 'uid'> = {
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || '',
          role: isAdmin ? 'admin' : 'customer',
          createdAt: Date.now(),
        };
        await setDoc(userRef, newUser);
        useAuth.getState().setUser({ uid: firebaseUser.uid, ...newUser } as AppUser);
      }
    } catch (e: any) {
      console.warn("Using fallback user due to Firestore quota error or setup error");
      // Fallback if Firestore quota is exceeded so user is still authenticated locally
      const isAdmin = firebaseUser.email === 'freshnlocalco@gmail.com';
      const fallbackUser: Omit<AppUser, 'uid'> = {
        email: firebaseUser.email || '',
        displayName: firebaseUser.displayName || '',
        role: isAdmin ? 'admin' : 'customer',
        createdAt: Date.now(),
      };
      console.warn("Using fallback user due to Firestore quota error");
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
    if (!snap.exists()) {
       await setDoc(userRef, {
          email: email,
          displayName: name,
          role: email === 'freshnlocalco@gmail.com' ? 'admin' : 'customer',
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
