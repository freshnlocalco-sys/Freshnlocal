/**
 * The public Firebase web config, for SERVER code (anything a Vercel function
 * imports). The browser keeps importing firebase-applet-config.json directly.
 *
 * WHY A COPY: the project is an ES module (package.json "type": "module"),
 * and Node refuses a JSON import without an import attribute. Vercel compiles
 * each file on its own, and an attribute can be dropped in that step -- on
 * 27 Nov 2026 a missing one crashed every function that touched Firebase.
 * A .ts module behaves the same under every compiler, so server code imports
 * this instead.
 *
 * These are public client identifiers (they ship to every browser), not
 * secrets. If firebase-applet-config.json ever changes, regenerate this file
 * from it; scripts/verifyOtpSetup.mjs is not the place to look -- compare the
 * two files directly.
 */
const firebaseConfig = {
  "projectId": "freshnlocal-4a420",
  "appId": "1:847111511003:web:f5a04c0a4a5e4f225765fe",
  "apiKey": "AIzaSyAC7wQTruA_TCHVKFaeBt83Kc6VUO4DQzc",
  "authDomain": "freshnlocal-4a420.firebaseapp.com",
  "firestoreDatabaseId": "ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67",
  "storageBucket": "freshnlocal-4a420.firebasestorage.app",
  "messagingSenderId": "847111511003",
  "measurementId": ""
};

export default firebaseConfig;
