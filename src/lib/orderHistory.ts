/**
 * Fetching the signed-in customer's own orders from Supabase.
 *
 * Returns them in the shape Firestore used to hand back -- nested `items`,
 * `createdAt` in epoch milliseconds -- so the pages that render them do not
 * change. See orderHistory.ts at the repo root for why the translation happens
 * on the server rather than here.
 */

import { auth } from './firebase';
import { readApiJson } from './apiJson';

export interface FetchedOrders {
  ok: boolean;
  orders?: any[];
  reason?: string;
}

export async function fetchMyOrders(): Promise<FetchedOrders> {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: 'not signed in' };

  let idToken: string;
  try {
    idToken = await user.getIdToken();
  } catch (err) {
    return { ok: false, reason: `could not get a sign-in token: ${err instanceof Error ? err.message : String(err)}` };
  }

  try {
    const res = await fetch('/api/orders/mine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    // readApiJson, not res.ok -- an undeployed function answers 200 with the
    // page's HTML, which would read as "you have no orders".
    const result = await readApiJson<{ ok?: boolean; orders?: any[] }>(res);
    if (!result.ok) return { ok: false, reason: result.reason };
    if (!Array.isArray(result.data?.orders)) {
      return { ok: false, reason: `the server replied without an orders array: ${JSON.stringify(result.data).slice(0, 160)}` };
    }
    return { ok: true, orders: result.data.orders };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
