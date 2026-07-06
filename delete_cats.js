const { initializeApp } = require('firebase/app');
const { getFirestore, doc, deleteDoc, initializeFirestore } = require('firebase/firestore');
require('dotenv').config();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {}, "ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67");

async function run() {
  const catRef = doc(db, 'settings', 'categoriesConfig');
  await deleteDoc(catRef);
  console.log("Deleted categoriesConfig");
  process.exit(0);
}
run();
