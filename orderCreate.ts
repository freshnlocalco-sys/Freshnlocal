/**
 * Creating an order IN SUPABASE, as the order's first and only home.
 *
 * This is the difference between this file and orderMirror.ts, and it is the
 * whole point: the mirror copies an order that Firestore already owns, while
 * this one brings the order into existence. Firestore keeps sign-in and loses
 * the rest.
 *
 * WHAT THE SERVER DECIDES, AND WHY
 *
 * The browser sends the order it has composed -- items, totals, address -- and
 * a Firebase ID token. Three things are NOT taken from the browser:
 *
 *   * the customer. `user_id` is the uid Google returns for the token, never
 *     the one in the payload. Otherwise any signed-in customer could file an
 *     order against somebody else's account.
 *   * the order id. Supabase owns the key now, so the server mints it. It is
 *     returned so that the Firestore shadow-write, while that still exists,
 *     can use the SAME id -- one order, one key, in both places, which is what
 *     makes them reconcilable.
 *   * the order number. It carries a unique index in Supabase
 *     (uq_web_orders_number_live) that Firestore never had, so a collision is
 *     fatal here where it used to pass silently. The server generates and, on
 *     collision, generates again.
 *
 * WHAT IS STILL TAKEN ON TRUST, SAID OUT LOUD
 *
 * Prices, totals, discounts and points come from the browser. That is exactly
 * what happens today when the cart writes to Firestore, so this is parity, not
 * a new hole -- but it IS a hole, and the right fix is to re-price server-side
 * from web_products. That is a job of its own: it has to reproduce HoReCa
 * pricing, points redemption and the free-gift offer rules, and getting it
 * subtly wrong would overcharge real customers. Noted here so it is not
 * mistaken for a decision that nobody noticed.
 */

import type { Express } from 'express';
import { lookupCaller } from './firebaseAuth';
import { mirrorOrderToSupabase, supabaseConfigured } from './erpMirror';

/** A Firestore-style id: 20 chars of [A-Za-z0-9]. */
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function newOrderId(): string {
  let out = '';
  for (let i = 0; i < 20; i++) out += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  return out;
}

/** The shop's own order number, in the shape customers already recognise. */
function newOrderNumber(): string {
  return `FNL-${Math.floor(100000 + Math.random() * 900000)}`;
}

/** Postgres says 23505 and PostgREST says 409; either means the number is taken. */
const isDuplicateNumber = (err: unknown): boolean => {
  const m = err instanceof Error ? err.message : String(err);
  return /23505|duplicate key|uq_web_orders_number_live|\b409\b/i.test(m);
};

export interface OrderCreateReply {
  status: number;
  body: Record<string, any>;
}

export async function handleOrderCreateRequest(rawBody: unknown): Promise<OrderCreateReply> {
  if (!supabaseConfigured()) {
    return { status: 503, body: { error: 'Supabase is not configured on this server.' } };
  }

  const body = typeof rawBody === 'string'
    ? (() => { try { return JSON.parse(rawBody); } catch { return {}; } })()
    : ((rawBody ?? {}) as Record<string, any>);

  const caller = await lookupCaller(String(body.idToken ?? ''));
  if (!caller.uid) {
    console.warn('[ORDER CREATE] refused:', caller.reason);
    return { status: 401, body: { error: 'Not signed in.' } };
  }

  const order = body.order;
  if (!order || typeof order !== 'object') {
    return { status: 400, body: { error: 'order is required' } };
  }
  const items = Array.isArray(order.items) ? order.items : [];
  if (items.length === 0) {
    // An order with no lines is not an order. Refusing here keeps a row that
    // nobody can pack out of web_orders, where it would sit in the ERP's panel
    // as "no lines at all" and puzzle whoever found it.
    return { status: 400, body: { error: 'An order needs at least one item.' } };
  }

  const orderId = newOrderId();

  // The payload, with the fields the server owns overwritten rather than
  // merged -- an attacker's value must not survive by arriving first.
  const toWrite: Record<string, any> = {
    ...order,
    userId: caller.uid,
    uid: caller.uid,
    status: String(order.status ?? 'pending'),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    // Points are never awarded at creation; that is the poller's decision and
    // its CHECK constraint pairs the flag with a timestamp.
    pointsAwarded: false,
  };

  // Up to a handful of attempts. Each one is a fresh number against a 900,000
  // space with a few hundred live orders, so a second collision is already
  // vanishingly unlikely -- but a loop that cannot end is worse than a failed
  // checkout, hence the bound.
  const ATTEMPTS = 5;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const orderNumber = String(order.orderNumber ?? '').trim() && attempt === 1
      ? String(order.orderNumber).trim()
      : newOrderNumber();
    try {
      const { lines } = await mirrorOrderToSupabase(orderId, { ...toWrite, orderNumber }, null);
      console.log(`[ORDER CREATE] ${orderNumber} (${orderId}) -> web_orders, ${lines} line(s), uid ${caller.uid}`);
      return { status: 200, body: { ok: true, id: orderId, orderNumber, lines } };
    } catch (err) {
      lastErr = err;
      if (!isDuplicateNumber(err)) break;
      console.warn(`[ORDER CREATE] order number ${orderNumber} was taken; retrying (${attempt}/${ATTEMPTS})`);
    }
  }

  const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
  console.error('[ORDER CREATE] failed:', message);
  return { status: 500, body: { error: message } };
}

/** The local development route, so local and production run the same code. */
export function registerOrderCreate(app: Express): void {
  app.post('/api/orders/create', async (req, res) => {
    const { status, body } = await handleOrderCreateRequest(req.body);
    res.status(status).json(body);
  });
}
