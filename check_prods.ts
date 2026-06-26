import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const app = initializeApp(config);
const db = getFirestore(app);

async function run() {
  const querySnapshot = await getDocs(collection(db, "products"));
  const products = [];
  querySnapshot.forEach((doc) => {
    products.push({ id: doc.id, ...doc.data() });
  });

  const exoticList = ["broccoli", "zucchini", "lettuce", "cherry tomato", "celery", "asparagus", "avocado", "bell pepper", "mushroom", "bok choy"];
  // I don't know exactly what they had, so I'll just print them out.
  
  const imp = products.filter(p => (p.category || '').toLowerCase().includes("imported vegetable"));
  const exo = products.filter(p => (p.category || '').toLowerCase().includes("exotic vegetable"));
  
  console.log("IMPORTED VEG:");
  imp.forEach(p => console.log(p.name, p.category));
  
  console.log("EXOTIC VEG:");
  exo.forEach(p => console.log(p.name, p.category));
}
run();
