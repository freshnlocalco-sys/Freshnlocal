import { db } from './src/lib/firebase.js';
import { collection, getDocs } from 'firebase/firestore';

async function run() {
    const q = await getDocs(collection(db, 'products'));
    q.forEach(d => {
        const data = d.data();
        if (data.name === 'Juicy Red Cherry') {
            console.log("Juicy Red Cherry:", data);
        }
    });
}
run();
