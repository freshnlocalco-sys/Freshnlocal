const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function check() {
  const snapshot = await db.collection('products').where('name', '==', 'Rocket Arugula').get();
  snapshot.forEach(doc => {
    console.log(doc.id, doc.data());
  });
}
check();
