import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function check() {
  const d = await getDoc(doc(db, 'products', 'jREbVFxMhUWdhEshzvEz'));
  console.log(JSON.stringify(d.data(), null, 2));
}
check().catch(console.error);
