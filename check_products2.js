import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const app = initializeApp({ projectId: "ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67" });
const db = getFirestore(app);

async function check() {
  const querySnapshot = await getDocs(collection(db, "products"));
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    if (data.name.includes("Cherry") || data.name.includes("Peach") || data.name.includes("Pear") || data.name.includes("Plum") || data.name.includes("Litchi")) {
      console.log(data.name, "HorecaPrice:", data.horecaPrice, "Variants:", JSON.stringify(data.variants));
    }
  });
  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
