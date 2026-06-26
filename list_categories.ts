import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, getDoc, doc } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const app = initializeApp(config);
const db = getFirestore(app);

async function run() {
  const settings = await getDoc(doc(db, "settings", "categoriesConfig"));
  console.log("Settings Product Categories:");
  if (settings.exists()) {
    console.log(settings.data().productCategories);
  } else {
    console.log("Not found.");
  }
}

run();
