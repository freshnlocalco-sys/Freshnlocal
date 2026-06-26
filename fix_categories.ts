import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const app = initializeApp(config);
const db = getFirestore(app);

async function run() {
  const catRef = doc(db, 'settings', 'categoriesConfig');
  const catSnap = await getDoc(catRef);
  let cats = [];
  if (catSnap.exists() && catSnap.data().productCategories) {
    cats = catSnap.data().productCategories;
  }
  console.log("Current cats:", cats);
  let changed = false;
  
  if (!cats.find(c => c && c.toLowerCase() === 'exotic vegetables')) {
    cats.push('Exotic Vegetables');
    changed = true;
  }
  if (!cats.find(c => c && c.toLowerCase() === 'imported vegetables')) {
    cats.push('Imported Vegetables');
    changed = true;
  }
  
  if (changed) {
    await setDoc(catRef, { productCategories: cats }, { merge: true });
    console.log("Updated categories to:", cats);
  } else {
    console.log("Categories are already fine:", cats);
  }
  process.exit(0);
}
run();
