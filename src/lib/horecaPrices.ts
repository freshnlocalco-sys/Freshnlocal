import { db } from './firebase';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';

export interface CustomerHorecaPrice {
  userId: string;
  productId: string;
  productName?: string;
  price: number;
  updatedAt: number;
}

/**
 * Retrieves all remembered custom HoReCa prices for a specific customer.
 */
export async function getCustomerHorecaPrices(userId: string): Promise<Record<string, number>> {
  if (!userId) return {};
  try {
    const q = query(collection(db, 'horecaPrices'), where('userId', '==', userId));
    const snap = await getDocs(q);
    const map: Record<string, number> = {};
    snap.forEach(d => {
      const data = d.data();
      if (data.productId && typeof data.price === 'number') {
        map[data.productId] = data.price;
      }
    });
    return map;
  } catch (err) {
    console.error('Error fetching customer HoReCa prices:', err);
    return {};
  }
}

/**
 * Saves or updates a remembered custom HoReCa price for a specific customer.
 */
export async function saveCustomerHorecaPrice(userId: string, productId: string, price: number, productName?: string): Promise<void> {
  if (!userId || !productId) return;
  try {
    await setDoc(doc(db, 'horecaPrices', `${userId}_${productId}`), {
      userId,
      productId,
      productName: productName || '',
      price: Number(price),
      updatedAt: Date.now()
    }, { merge: true });
  } catch (err) {
    console.error('Error saving customer HoReCa price:', err);
  }
}
