import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const app = initializeApp(config);
const db = getFirestore(app);

async function run() {
  const docRef = doc(db, 'settings', 'categoriesConfig');
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    console.log("Categories before:", snap.data().productCategories);
    
    // We want to make sure we only have "Exotic Vegetable" and "Imported Vegetable"
    // and remove any plurals or duplicates.
    let cats = snap.data().productCategories || [];
    
    // clean up cats array
    let newCats = [];
    const seen = new Set();
    
    for (const c of cats) {
      if (!c) continue;
      let lower = c.toLowerCase().trim();
      
      // normalize
      if (lower === 'exotic vegetables') lower = 'exotic vegetable';
      if (lower === 'imported vegetables') lower = 'imported vegetable';
      
      if (!seen.has(lower)) {
        seen.add(lower);
        // Add with capitalized words
        const formatted = lower.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        newCats.push(formatted);
      }
    }
    
    // Make sure Exotic Vegetable and Imported Vegetable exist if missing
    if (!seen.has('exotic vegetable')) {
       newCats.push('Exotic Vegetable');
    }
    if (!seen.has('imported vegetable')) {
       newCats.push('Imported Vegetable');
    }

    console.log("Categories after:", newCats);
    await setDoc(docRef, { productCategories: newCats }, { merge: true });
    console.log("Categories updated in DB!");
  } else {
    console.log("No categoriesConfig found");
  }
}
run();
