import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './lib/firebase';

export function ProductDebugger() {
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const snap = await getDocs(collection(db, 'products'));
      const prods: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const relevant = prods.filter(p => p.category?.toLowerCase().includes('vegetable'));
      setData(relevant);
    }
    load();
  }, []);

  return (
    <div style={{ padding: 50, zIndex: 99999, position: 'relative', background: 'white' }}>
      <h1>Vegetable Products</h1>
      <textarea readOnly value={JSON.stringify(data, null, 2)} style={{ width: '100%', height: 500 }} />
    </div>
  );
}
