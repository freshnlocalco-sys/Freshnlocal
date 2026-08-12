import { db } from './firebase';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';

export interface CustomerHorecaPrice {
  userId: string;
  userEmail?: string;
  productId: string;
  productName?: string;
  price: number;
  updatedAt: number;
}

/**
 * Retrieves all remembered custom HoReCa prices for a specific customer (by userId or userEmail).
 */
export async function getCustomerHorecaPrices(userId: string, userEmail?: string): Promise<Record<string, number>> {
  if (!userId && !userEmail) return {};
  try {
    const map: Record<string, number> = {};

    const storeData = (data: any) => {
      if (!data || typeof data.price !== 'number') return;
      const price = data.price;
      if (data.productId) {
        const rawPid = String(data.productId).trim();
        const lowerPid = rawPid.toLowerCase();
        map[rawPid] = price;
        map[lowerPid] = price;
        const basePid = rawPid.split('-')[0];
        if (basePid) {
          map[basePid] = price;
          map[basePid.toLowerCase()] = price;
        }
      }
      if (data.productName) {
        const rawPname = String(data.productName).trim();
        const lowerPname = rawPname.toLowerCase();
        map[rawPname] = price;
        map[lowerPname] = price;
      }
    };

    if (userId) {
      const q1 = query(collection(db, 'horecaPrices'), where('userId', '==', userId));
      const snap1 = await getDocs(q1);
      snap1.forEach(d => storeData(d.data()));
    }

    if (userEmail) {
      const cleanEmail = userEmail.toLowerCase().trim();
      const q2 = query(collection(db, 'horecaPrices'), where('userEmail', '==', cleanEmail));
      const snap2 = await getDocs(q2);
      snap2.forEach(d => storeData(d.data()));
    }

    return map;
  } catch (err) {
    console.error('Error fetching customer HoReCa prices:', err);
    return {};
  }
}

/**
 * Saves or updates a remembered custom HoReCa price for a specific customer.
 */
export async function saveCustomerHorecaPrice(
  userId: string, 
  productId: string, 
  price: number, 
  productName?: string,
  userEmail?: string
): Promise<void> {
  if (!userId && !userEmail) return;
  if (!productId && !productName) return;

  const cleanEmail = userEmail ? userEmail.toLowerCase().trim() : '';
  const cleanName = productName ? productName.toLowerCase().trim() : '';
  const cleanPid = productId ? productId.toLowerCase().trim() : '';
  const baseProductId = cleanPid ? cleanPid.split('-')[0] : '';

  const docPayload = {
    userId: userId || '',
    userEmail: cleanEmail,
    productId: cleanPid,
    productName: productName || '',
    price: Number(price),
    updatedAt: Date.now()
  };

  try {
    const keyPrefix = userId || cleanEmail;
    
    if (cleanPid) {
      await setDoc(doc(db, 'horecaPrices', `${keyPrefix}_${cleanPid}`), docPayload, { merge: true });
      if (baseProductId && baseProductId !== cleanPid) {
        await setDoc(doc(db, 'horecaPrices', `${keyPrefix}_${baseProductId}`), { ...docPayload, productId: baseProductId }, { merge: true });
      }
    }

    if (cleanName) {
      await setDoc(doc(db, 'horecaPrices', `${keyPrefix}_${cleanName}`), docPayload, { merge: true });
    }

    if (cleanEmail) {
      if (cleanPid) {
        await setDoc(doc(db, 'horecaPrices', `${cleanEmail}_${cleanPid}`), docPayload, { merge: true });
      }
      if (cleanName) {
        await setDoc(doc(db, 'horecaPrices', `${cleanEmail}_${cleanName}`), docPayload, { merge: true });
      }
    }
  } catch (err) {
    console.error('Error saving customer HoReCa price:', err);
  }
}


