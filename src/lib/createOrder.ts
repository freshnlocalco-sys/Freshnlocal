/**
 * Placing an order. The order is created in SUPABASE.
 *
 * This replaces `addDoc(collection(db, 'orders'), ...)` as the moment an order
 * comes into existence. Firebase is being kept for sign-in and dropped for
 * storage, and an order is the first thing to move, because it is the record
 * the whole business runs on.
 *
 * It goes through the server rather than writing Supabase from here, for one
 * reason: the browser must not be the thing that decides which customer an
 * order belongs to. The server asks Google whose token this is and files the
 * order against that uid, whatever the payload claims.
 *
 * The server also mints the order id and the order number and hands them back,
 * so the Firestore shadow-write (while that still exists) can use the same id.
 * One order, one key, in both places.
 */

import { auth } from './firebase';
import { readApiJson } from './apiJson';

export interface CreatedOrder {
  ok: boolean;
  /** The order's id in Supabase -- and in Firestore, while both are written. */
  id?: string;
  orderNumber?: string;
  lines?: number;
  reason?: string;
}

/**
 * Not awaited with a timeout the way the old mirror was, and deliberately so.
 * The mirror was a copy: if it failed, the order still existed and checkout
 * could carry on. This IS the order. A timeout here would mean telling a
 * customer their order was placed when nothing recorded it.
 */
export async function createOrder(order: Record<string, any>): Promise<CreatedOrder> {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: 'not signed in' };

  let idToken: string;
  try {
    idToken = await user.getIdToken();
  } catch (err) {
    return { ok: false, reason: `could not get a sign-in token: ${err instanceof Error ? err.message : String(err)}` };
  }

  try {
    const res = await fetch('/api/orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, order }),
    });

    // readApiJson, not res.ok: an /api function that is not deployed answers
    // 200 with the page's own HTML. For a copy that meant a missed mirror; for
    // the order itself it would mean a customer told their order was placed
    // when it was never written. See src/lib/apiJson.ts.
    const result = await readApiJson<{ ok?: boolean; id?: string; orderNumber?: string; lines?: number }>(res);
    if (!result.ok) return { ok: false, reason: result.reason };
    if (!result.data?.id) return { ok: false, reason: `the server replied without an order id: ${JSON.stringify(result.data).slice(0, 160)}` };

    return { ok: true, id: result.data.id, orderNumber: result.data.orderNumber, lines: result.data.lines };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
