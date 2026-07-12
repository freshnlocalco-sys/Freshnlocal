import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, "ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67");

async function run() {
  const q = query(collection(db, 'products'), where('name', '==', 'Indian Peach'));
  const snapshot = await getDocs(q);
  snapshot.forEach(doc => {
    console.log(doc.id);
    console.log(doc.data());
  });
  process.exit(0);
}
run();
