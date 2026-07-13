import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const q = await getDocs(collection(db, 'users'));
  q.forEach(d => {
    const data = d.data();
    console.log(d.id, data.email, data.role);
  });
}
run().catch(console.error);
