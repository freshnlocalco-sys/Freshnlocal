const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const config = require('./firebase-applet-config.json');

initializeApp({
  credential: cert(config)
});
const db = getFirestore();
async function run() {
  const q = await db.collection('products').where('name', '==', 'Juicy Red Cherry').get();
  q.forEach(doc => {
    const data = doc.data();
    console.log("ID:", doc.id);
    console.log("variants:", data.variants);
    console.log("horecaPrice:", data.horecaPrice, "horecaUnit:", data.horecaUnit);
  });
}
run();
