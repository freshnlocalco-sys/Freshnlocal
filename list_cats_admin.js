const admin = require('firebase-admin');
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: config.projectId
});

async function run() {
  const db = admin.firestore();
  const snap = await db.collection('settings').doc('categoriesConfig').get();
  console.log(snap.data().productCategories);
}
run();
