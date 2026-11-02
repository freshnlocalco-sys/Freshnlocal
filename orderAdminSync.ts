/**
 * Carrying an admin's order edit from Firestore to the row the customer reads.
 *
 * The admin dashboard still reads and writes Firestore, while a customer's
 * order page reads web_orders (orderHistory.ts). Without this, an order marked
 * delivered in the dashboard stays pending on the customer's page.
 *
 * WHAT IT TRUSTS
 *
 * The body carries an order id, the kind of change and an ID token. The values
 * are read back from Firestore with that token, so the browser cannot put a
 * status or a price of its own into Supabase. The caller's role is read from
 * their own Firestore user document, the same place Firestore's rules look,
 * because web_users is only filled in when a row is missing and can lag it.
 *
 * WHY ONE KIND OF CHANGE AT A TIME
 *
 * web_orders has a second writer. The ERP moves `status` as an order is packed
 * and owns erp_pushed_at and erp_order_number. Firestore never hears about any
 * of that, so its copy of an order can be behind. Copying the whole order after
 * a price edit would walk a shipped order back to pending, so each kind of
 * change names the columns it may touch, and the ERP's columns are in none.
 *
 * An admin's status change does overwrite whatever the ERP last wrote. That is
 * a person deciding, and the ERP's write-back leaves a cancelled order alone.
 *
 * Environment: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, server-side only.
 */

import type { Express } from 'express';
import { firestoreDocsBase, lookupCaller } from './firebaseAuth';
import { docToObject, readAsCaller } from './orderMirror';
import { iso, num, patchLiveOrder, replaceOrderLines, supabaseConfigured } from './erpMirror';

const ADMIN_ROLES = ['admin', 'horeca_admin'];

type Fields = Record<string, unknown>;

const stampedAt = (order: Record<string, any>): string =>
  iso(order.updatedAt) ?? new Date().toISOString();

const emailFlagFields = (order: Record<string, any>): Fields => ({
  shipping_email_status: order.shippingEmailStatus ?? null,
  price_updated_email_pending: typeof order.priceUpdatedEmailPending === 'boolean' ? order.priceUpdatedEmailPending : null,
  updated_at: stampedAt(order),
});

function statusFields(order: Record<string, any>): Fields {
  const fields: Fields = {
    status: String(order.status),
    shipping_email_status: order.shippingEmailStatus ?? null,
    updated_at: stampedAt(order),
  };
  if (order.pointsEarned !== undefined) fields.points_earned = Math.max(0, num(order.pointsEarned));

  // Only ever set, and the pair together: web_orders_points_awarded_consistent
  // refuses a flag without its timestamp.
  if (order.pointsAwarded === true) {
    fields.points_awarded = true;
    fields.points_awarded_at = iso(order.pointsAwardedAt) ?? stampedAt(order);
  }
  return fields;
}

const lineFields = (order: Record<string, any>): Fields => ({
  ...emailFlagFields(order),
  total_amount: Math.max(0, num(order.totalAmount)),
});

export interface OrderAdminSyncReply {
  status: number;
  body: Record<string, any>;
}

export async function handleOrderAdminSyncRequest(rawBody: unknown): Promise<OrderAdminSyncReply> {
  if (!supabaseConfigured()) {
    return { status: 503, body: { error: 'Supabase is not configured on this server.' } };
  }

  const body = typeof rawBody === 'string'
    ? (() => { try { return JSON.parse(rawBody); } catch { return {}; } })()
    : ((rawBody ?? {}) as Record<string, any>);

  const orderId = String(body.orderId ?? '').trim();
  const change = String(body.change ?? '');
  const idToken = String(body.idToken ?? '').trim();
  if (!orderId) return { status: 400, body: { error: 'orderId is required' } };
  if (orderId.includes('/')) return { status: 400, body: { error: 'orderId must be a document id' } };
  if (!['status', 'lines', 'emailFlags', 'deleted'].includes(change)) {
    return { status: 400, body: { error: "change must be 'status', 'lines', 'emailFlags' or 'deleted'" } };
  }

  const caller = await lookupCaller(idToken);
  if (!caller.uid) {
    console.warn('[ORDER ADMIN SYNC] refused:', caller.reason);
    return { status: 401, body: { error: 'Not signed in.' } };
  }

  const profile = await readAsCaller(`users/${encodeURIComponent(caller.uid)}`, idToken);
  if (!ADMIN_ROLES.includes(String(profile?.role))) {
    return { status: 403, body: { error: 'Admins only.' } };
  }

  try {
    const res = await fetch(`${firestoreDocsBase()}/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    // Only a 404 says the order is gone. Any other failure is a read that did
    // not work, and hiding a customer's order on one of those would be wrong.
    if (!res.ok && res.status !== 404) {
      return { status: 502, body: { error: `Firestore read failed: ${res.status}` } };
    }
    const exists = res.ok;

    if (change === 'deleted') {
      if (exists) return { status: 409, body: { error: 'That order still exists in Firestore.' } };
      const now = new Date().toISOString();
      const applied = await patchLiveOrder(orderId, {
        is_deleted: true, deleted_on: now, deleted_by: 'website-admin', updated_at: now,
      });
      console.log(`[ORDER ADMIN SYNC] ${orderId} deleted, applied: ${applied}`);
      return { status: 200, body: { ok: true, orderId, applied } };
    }

    if (!exists) return { status: 404, body: { error: 'No such order.' } };
    const order = docToObject(await res.json());

    if (change === 'status' && !String(order.status ?? '').trim()) {
      return { status: 422, body: { error: `Order ${orderId} has no status.` } };
    }

    const fields = change === 'status' ? statusFields(order)
      : change === 'lines' ? lineFields(order)
      : emailFlagFields(order);

    const applied = await patchLiveOrder(orderId, fields);
    const lines = applied && change === 'lines' ? await replaceOrderLines(orderId, order) : 0;

    console.log(`[ORDER ADMIN SYNC] ${orderId} ${change}, applied: ${applied}, ${lines} line(s)`);
    return { status: 200, body: { ok: true, orderId, applied, lines } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ORDER ADMIN SYNC] ${orderId} failed:`, message);
    return { status: 500, body: { error: message } };
  }
}

/** The local development route, so local and production run the same code. */
export function registerOrderAdminSync(app: Express): void {
  app.post('/api/orders/admin-sync', async (req, res) => {
    const { status, body } = await handleOrderAdminSyncRequest(req.body);
    res.status(status).json(body);
  });
}
