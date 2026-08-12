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

    if (userId) {
      const q1 = query(collection(db, 'horecaPrices'), where('userId', '==', userId));
      const snap1 = await getDocs(q1);
      snap1.forEach(d => {
        const data = d.data();
        if (data.productId && typeof data.price === 'number') {
          map[data.productId] = data.price;
        }
        if (data.productName && typeof data.price === 'number') {
          map[data.productName.toLowerCase().trim()] = data.price;
        }
      });
    }

    if (userEmail) {
      const cleanEmail = userEmail.toLowerCase().trim();
      const q2 = query(collection(db, 'horecaPrices'), where('userEmail', '==', cleanEmail));
      const snap2 = await getDocs(q2);
      snap2.forEach(d => {
        const data = d.data();
        if (data.productId && typeof data.price === 'number') {
          map[data.productId] = data.price;
        }
        if (data.productName && typeof data.price === 'number') {
          map[data.productName.toLowerCase().trim()] = data.price;
        }
      });
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
  const baseProductId = productId ? productId.split('-')[0] : '';

  const docPayload = {
    userId: userId || '',
    userEmail: cleanEmail,
    productId: productId || '',
    productName: productName || '',
    price: Number(price),
    updatedAt: Date.now()
  };

  try {
    const docId = `${userId || cleanEmail}_${productId || cleanName}`;
    await setDoc(doc(db, 'horecaPrices', docId), docPayload, { merge: true });

    // Also index by baseProductId if different
    if (baseProductId && baseProductId !== productId) {
      const baseDocId = `${userId || cleanEmail}_${baseProductId}`;
      await setDoc(doc(db, 'horecaPrices', baseDocId), { ...docPayload, productId: baseProductId }, { merge: true });
    }

    // Also index by email if available and distinct
    if (cleanEmail) {
      const emailDocId = `${cleanEmail}_${productId || cleanName}`;
      await setDoc(doc(db, 'horecaPrices', emailDocId), docPayload, { merge: true });
    }
  } catch (err) {
    console.error('Error saving customer HoReCa price:', err);
  }
}

