/**
 * Telling the server that an admin just changed an order, so the customer's
 * order page shows it.
 *
 * Only the order id and the kind of change go over the wire. The server reads
 * the new values from Firestore itself; see orderAdminSync.ts.
 */

import toast from 'react-hot-toast';
import { auth } from './firebase';
import { readApiJson } from './apiJson';

export type OrderChange = 'status' | 'lines' | 'emailFlags' | 'deleted';

/** Repeated clicks on a quantity become one request for the value that stuck. */
const SETTLE_MS = 300;

const waiting = new Map<string, ReturnType<typeof setTimeout>>();

async function send(orderId: string, change: OrderChange): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('not signed in');

    const idToken = await user.getIdToken();
    const res = await fetch('/api/orders/admin-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, orderId, change }),
    });

    // readApiJson, not res.ok: an undeployed function answers 200 with the
    // page's own HTML. See src/lib/apiJson.ts.
    const result = await readApiJson<{ applied?: boolean }>(res);
    if (!result.ok) throw new Error(result.reason);

    if (!result.data?.applied) {
      console.warn(`[ORDER ADMIN SYNC] ${orderId} has no live row in Supabase; nothing to update.`);
    }
  } catch (err) {
    console.error(`[ORDER ADMIN SYNC] ${change} on ${orderId} did not reach Supabase:`, err);
    // The Firestore write has already succeeded, so the dashboard looks right.
    // The admin is the only person who can notice that the customer's page does not.
    toast.error("Saved here, but the customer's order page was not updated. Try the change again.", { duration: 10000 });
  }
}

/** Call after Firestore has accepted the write. Never throws and never blocks. */
export function syncOrderChange(orderId: string, change: OrderChange): void {
  const key = `${orderId}:${change}`;
  const earlier = waiting.get(key);
  if (earlier) clearTimeout(earlier);

  waiting.set(key, setTimeout(() => {
    waiting.delete(key);
    void send(orderId, change);
  }, SETTLE_MS));
}
