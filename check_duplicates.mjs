import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function check() {
  const q = query(collection(db, 'products'));
  const snap = await getDocs(q);
  snap.forEach(d => {
    if (d.data().name.includes('Cherry')) {
      console.log(d.id, d.data().name, d.data().unit, d.data().price, d.data().horecaPrice);
    }
  });
}
check().catch(console.error);
