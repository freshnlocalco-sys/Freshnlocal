import admin from 'firebase-admin';
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(config)
  });
}
const db = admin.firestore();
async function run() {
  const q = await db.collection('products').where('name', '==', 'Juicy Red Cherry').get();
  q.forEach(doc => console.log(JSON.stringify(doc.data(), null, 2)));
}
run();
