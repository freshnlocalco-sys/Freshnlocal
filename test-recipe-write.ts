import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, addDoc } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  try {
    await signInWithEmailAndPassword(auth, "freshnlocalco@gmail.com", "password123");
    console.log("Signed in:", auth.currentUser.uid);
    const docRef = await addDoc(collection(db, 'users', auth.currentUser.uid, 'savedRecipes'), {
      recipeMarkdown: "test",
      createdAt: Date.now()
    });
    console.log("Success:", docRef.id);
  } catch(e) {
    console.error("Error:", e);
  }
  process.exit(0);
}
run();
