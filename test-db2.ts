import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { readFileSync } from 'fs';

async function run() {
  try {
    const config = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
    const app = initializeApp(config);
    const db = getFirestore(app, "ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67");

    const catRef = doc(db, 'settings', 'categoriesConfig');
    const catSnap = await getDoc(catRef);
    if (catSnap.exists()) {
      console.log("categoriesConfig:", JSON.stringify(catSnap.data(), null, 2));
    }

  } catch (error) {
    console.error("Error", error);
  }
}

run();
