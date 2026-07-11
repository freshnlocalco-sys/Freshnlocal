import React from 'react';
import { useCart } from '../store/useCart';

export function TestCart() {
  const { items } = useCart();
  return (
    <div style={{ paddingTop: '100px' }}>
      <h1>Cart State</h1>
      <pre>{JSON.stringify(items, null, 2)}</pre>
    </div>
  );
}
