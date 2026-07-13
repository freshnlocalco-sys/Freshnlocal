const admin = require('firebase-admin');
const config = require('./firebase-applet-config.json');

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
