import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const q = await getDocs(collection(db, 'products'));
  q.forEach(d => {
    const data = d.data();
    if (data.name === 'Juicy Red Cherry') {
      console.log(data);
    }
  });
}
run().catch(console.error);
