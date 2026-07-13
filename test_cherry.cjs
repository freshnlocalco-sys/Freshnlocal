const config = require('./firebase-applet-config.json');

async function run() {
  const admin = require('firebase-admin');
  admin.initializeApp({
    credential: admin.credential.cert(config)
  });
  const db = admin.firestore();
  const q = await db.collection('products').where('name', '==', 'Juicy Red Cherry').get();
  q.forEach(doc => console.log(JSON.stringify(doc.data(), null, 2)));
}
run().catch(console.error);
