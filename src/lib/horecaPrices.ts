import { db } from './firebase';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { parseUnitScale } from './horecaUtils';

export interface CustomerHorecaPrice {
  userId: string;
  userEmail?: string;
  productId: string;
  productName?: string;
  price: number;
  unit?: string;
  basePrice?: number;
  baseUnit?: string;
  updatedAt: number;
}

function processHorecaDocs(docs: any[]): Record<string, any> {
  const map: Record<string, any> = {};
  docs.forEach(d => {
    const data = typeof d.data === 'function' ? d.data() : d;
    if (!data || typeof data.price !== 'number') return;
    const price = data.price;
    const unit = data.unit ? String(data.unit).trim() : '';
    const basePrice = typeof data.basePrice === 'number' && data.basePrice > 0 ? data.basePrice : undefined;

    if (data.productId) {
      const rawPid = String(data.productId).trim();
      const lowerPid = rawPid.toLowerCase();
      map[rawPid] = price;
      map[lowerPid] = price;

      if (basePrice) {
        map[`${rawPid}__basePrice`] = basePrice;
        map[`${lowerPid}__basePrice`] = basePrice;
      }
      if (unit) {
        map[`${rawPid}__unit`] = unit;
        map[`${lowerPid}__unit`] = unit;
        map[`${rawPid}-${unit}`] = price;
        map[`${lowerPid}-${unit.toLowerCase()}`] = price;
      }

      const basePid = rawPid.split('-')[0];
      if (basePid) {
        const lowerBasePid = basePid.toLowerCase();
        map[basePid] = basePrice || price;
        map[lowerBasePid] = basePrice || price;
        if (basePrice) {
          map[`${basePid}__basePrice`] = basePrice;
          map[`${lowerBasePid}__basePrice`] = basePrice;
        }
        if (unit) {
          map[`${basePid}__unit`] = unit;
          map[`${lowerBasePid}__unit`] = unit;
          map[`${basePid}-${unit}`] = price;
          map[`${lowerBasePid}-${unit.toLowerCase()}`] = price;
        }
      }
    }

    if (data.productName) {
      const rawPname = String(data.productName).trim();
      const lowerPname = rawPname.toLowerCase();
      map[rawPname] = price;
      map[lowerPname] = price;

      if (basePrice) {
        map[`${rawPname}__basePrice`] = basePrice;
        map[`${lowerPname}__basePrice`] = basePrice;
      }
      if (unit) {
        map[`${rawPname}__unit`] = unit;
        map[`${lowerPname}__unit`] = unit;
        map[`${rawPname}-${unit}`] = price;
        map[`${lowerPname}-${unit.toLowerCase()}`] = price;
      }
    }
  });
  return map;
}

/**
 * Retrieves all remembered custom HoReCa prices for a specific customer (by userId or userEmail).
 */
export async function getCustomerHorecaPrices(userId: string, userEmail?: string): Promise<Record<string, any>> {
  if (!userId && !userEmail) return {};
  try {
    const promises: Promise<any>[] = [];

    if (userId) {
      const q1 = query(collection(db, 'horecaPrices'), where('userId', '==', userId));
      promises.push(getDocs(q1));
    }

    if (userEmail) {
      const cleanEmail = userEmail.toLowerCase().trim();
      const q2 = query(collection(db, 'horecaPrices'), where('userEmail', '==', cleanEmail));
      promises.push(getDocs(q2));
    }

    const snapshots = await Promise.all(promises);
    const allDocs: any[] = [];
    snapshots.forEach(snap => {
      snap.forEach((d: any) => allDocs.push(d.data()));
    });

    return processHorecaDocs(allDocs);
  } catch (err) {
    console.error('Error fetching customer HoReCa prices:', err);
    return {};
  }
}

/**
 * Saves or updates a remembered custom HoReCa price for a specific customer.
 * Supports auto-calculating base price per standard unit (e.g. 1 Kg or 1 Ltr) so sub-units scale accurately.
 */
export async function saveCustomerHorecaPrice(
  userId: string, 
  productId: string, 
  price: number, 
  productName?: string,
  userEmail?: string,
  unit?: string
): Promise<void> {
  if (!userId && !userEmail) return;
  if (!productId && !productName) return;

  const cleanEmail = userEmail ? userEmail.toLowerCase().trim() : '';
  const cleanName = productName ? productName.toLowerCase().trim() : '';
  const cleanPid = productId ? productId.toLowerCase().trim() : '';
  const baseProductId = cleanPid ? cleanPid.split('-')[0] : '';
  const cleanUnit = unit ? String(unit).trim() : '';

  // Calculate base price per standard unit (e.g. 1000g / 1 Kg or 1000ml / 1 Ltr)
  let calculatedBasePrice: number | undefined = undefined;
  if (cleanUnit) {
    const scale = parseUnitScale(cleanUnit);
    if (scale > 0) {
      calculatedBasePrice = Number((price / scale).toFixed(2));
    }
  }

  const docPayload: Record<string, any> = {
    userId: userId || '',
    userEmail: cleanEmail,
    productId: cleanPid,
    productName: productName || '',
    price: Number(price),
    unit: cleanUnit,
    basePrice: calculatedBasePrice || Number(price),
    baseUnit: 'Kg',
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



