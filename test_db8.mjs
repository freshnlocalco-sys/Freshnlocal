import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const q = await getDocs(collection(db, 'products'));
  let found = false;
  q.forEach(d => {
    const data = d.data();
    if (data.name && data.name.includes('Juicy Red Cherry')) {
      console.log("Found:", doc.id, JSON.stringify(data, null, 2));
      found = true;
    }
  });
  if (!found) console.log("Not found.");
}
run().catch(console.error);
