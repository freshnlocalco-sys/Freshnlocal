/**
 * Telling the server that an order was just placed, so it can copy it into the
 * ERP's database.
 *
 * Only the order id and the customer's ID token go over the wire. The server
 * reads the order back from Firestore as that customer and mirrors what it
 * finds -- see api/orders/mirror.ts for why it is built that way rather than
 * being handed the order body.
 */

import { auth } from './firebase';
import { readApiJson } from './apiJson';

/**
 * Awaited at the checkout call site, with a timeout, rather than fired and
 * forgotten.
 *
 * Not awaiting it is tempting -- it would keep checkout instant -- but the
 * request is made on a page that is about to clear the cart and swap to an
 * order-confirmation view, and an in-flight fetch on an unmounting page can be
 * cancelled. A cancelled mirror means an order the packing floor never sees,
 * which is the exact failure this is here to end. There is no catch-up sweep
 * yet to repair it afterwards, so the one attempt has to be given a chance to
 * finish.
 *
 * The timeout is what keeps that honest: a slow or unreachable server delays
 * the confirmation by at most this long, and then checkout carries on
 * regardless. The order is already safely in Firestore by this point.
 */
const TIMEOUT_MS = 5000;

export async function mirrorOrderToErp(orderId: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) return { ok: false, reason: 'not signed in' };

    const idToken = await user.getIdToken();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch('/api/orders/mirror', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, idToken }),
        signal: controller.signal,
      });

      // readApiJson, not res.ok. An /api function that is not deployed answers
      // 200 with the page's own HTML, so res.ok is true and this would report
      // every order as mirrored while none reached the ERP. That is the exact
      // failure this module exists to end -- see src/lib/apiJson.ts, and the
      // production probe recorded there.
      const result = await readApiJson<{ ok?: boolean; orderId?: string; lines?: number }>(res);
      if (!result.ok) return { ok: false, reason: result.reason };
      // The function echoes the order id back. Anything that does not is not
      // this function answering, whatever status it carried.
      if (result.data?.orderId !== orderId) {
        return { ok: false, reason: `unexpected reply for ${orderId}: ${JSON.stringify(result.data).slice(0, 160)}` };
      }
      return { ok: true };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
