const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: serviceAccount.projectId,
    clientEmail: serviceAccount.clientEmail || 'ai-studio@ai-studio.iam.gserviceaccount.com',
    privateKey: serviceAccount.privateKey || '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n'
  })
});

// Since we only have client config in firebase-applet-config.json, using admin might fail if it doesn't have privateKey.
// Wait, we can't use admin SDK easily without a service account key.
// I will just use the React app's `AdminDashboard.tsx` to run a migration.
