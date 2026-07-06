import { initializeApp } from "firebase/app";
import { doc, deleteDoc, initializeFirestore } from "firebase/firestore";
import fs from "fs";
const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const app = initializeApp(config);
const db = initializeFirestore(app, {}, "ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67");

async function run() {
  const catRef = doc(db, 'settings', 'categoriesConfig');
  await deleteDoc(catRef);
  console.log("Deleted categoriesConfig");
  process.exit(0);
}
run();
