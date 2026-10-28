/**
 * POST /api/orders/mirror  -- copies one website order into the ERP's database.
 *
 * WHY THIS IS A VERCEL FUNCTION
 *
 * erpMirror.ts has been wired into the email poller in emailTriggers.ts, which
 * runs from server.ts. Vercel does not deploy server.ts -- it serves a static
 * SPA plus the functions in api/ -- so in production that poller has never run
 * and no website order has ever reached Supabase. web_orders has been frozen at
 * 248 rows since the one-off backfill on 27 Oct. This is the gap that made the
 * whole "connect the website to the ERP" job look further along than it was.
 *
 * WHAT IT TRUSTS
 *
 * The body carries an order ID and the customer's Firebase ID token, and
 * nothing else. The order itself is read back from Firestore **as that
 * customer**, by passing their own token to the Firestore REST API, so
 * Firestore's own security rules decide whether the read is allowed. The
 * server therefore never takes order data from the caller: a customer cannot
 * invent an order, inflate a quantity, or attribute one to somebody else.
 *
 * That is the same property as api/admin/mirror-catalogue.ts -- ids in, the
 * authoritative copy read server-side -- and it is worth the extra round trip.
 * Taking the order body from the browser would have let any signed-in customer
 * push an arbitrary order onto the packing floor.
 *
 * Checkout already requires a signed-in user (Cart.tsx refuses with "Please
 * Sign In" otherwise), so there is always a token to present.
 *
 * Environment: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, server-side only,
 * no VITE_ prefix.
 */

import firebaseConfig from '../../firebase-applet-config.json';
import { mirrorOrderToSupabase, supabaseConfigured } from '../../erpMirror';

const cfg = firebaseConfig as Record<string, string>;
const DB_ID = cfg.firestoreDatabaseId || 'ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67';
const DOCS = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${DB_ID}/documents`;

/**
 * A Firestore REST value back into a plain one.
 *
 * REST returns every field tagged with its type -- `{stringValue: "x"}`,
 * `{mapValue: {fields: {...}}}`, `{arrayValue: {values: [...]}}` -- where the
 * client SDK would have handed over a plain object. erpMirror.ts was written
 * against the SDK's shape and reads nested structures (`order.items[].product`,
 * `order.shippingDetails`, `order.freeGiftsAwarded`), so the conversion has to
 * recurse rather than just unwrap the top level.
 *
 * integerValue and doubleValue both arrive as strings and are returned as
 * numbers: an order total compared as a string would sort and total wrongly.
 */
function fromRest(value: any): any {
  if (value == null || typeof value !== 'object') return undefined;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(fromRest);
  if ('mapValue' in value) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value.mapValue.fields ?? {})) out[k] = fromRest(v);
    return out;
  }
  // bytesValue, referenceValue, geoPointValue: nothing in an order uses them,
  // and returning undefined is better than a half-converted value.
  return undefined;
}

function docToObject(doc: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(doc?.fields ?? {})) out[k] = fromRest(v);
  return out;
}

/** The caller's uid, validated by Google rather than by us. */
async function uidFromIdToken(idToken: string): Promise<string | null> {
  if (!cfg.apiKey || !idToken) return null;
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${cfg.apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
    if (!r.ok) return null;
    const body = await r.json() as { users?: Array<{ localId?: string }> };
    return body.users?.[0]?.localId ?? null;
  } catch {
    return null;
  }
}

/** Read a document as the caller. Null when Firestore's rules refuse it. */
async function readAsCaller(path: string, idToken: string): Promise<Record<string, any> | null> {
  const r = await fetch(`${DOCS}/${path}`, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!r.ok) return null;
  return docToObject(await r.json());
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (!supabaseConfigured()) {
    // The order is already safely in Firestore by the time this is called, so
    // this is not a reason to fail the customer's checkout.
    return res.status(503).json({ error: 'Supabase is not configured on this function.' });
  }

  const body = typeof req.body === 'string'
    ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })()
    : (req.body ?? {});

  const orderId = String(body.orderId ?? '').trim();
  const idToken = String(body.idToken ?? '').trim();
  if (!orderId) return res.status(400).json({ error: 'orderId is required' });
  if (orderId.includes('/')) return res.status(400).json({ error: 'orderId must be a document id' });

  const uid = await uidFromIdToken(idToken);
  if (!uid) return res.status(401).json({ error: 'Not signed in.' });

  const order = await readAsCaller(`orders/${encodeURIComponent(orderId)}`, idToken);
  if (!order) {
    // Either there is no such order or this customer may not read it. Those are
    // reported as one thing on purpose: distinguishing them would tell a caller
    // which order ids exist.
    return res.status(404).json({ error: 'No such order for this account.' });
  }

  // Firestore's rules already allowed the read, but they are not the only thing
  // that should decide this: an admin can read every order, and an admin's
  // browser calling this endpoint must still not be able to re-attribute one.
  const ownerId = String(order.userId ?? order.uid ?? '').trim();
  if (!ownerId) return res.status(422).json({ error: `Order ${orderId} has no userId.` });

  try {
    // The customer's own user document, for the display name and role on first
    // insert. Best effort: ensureCustomer never overwrites an existing row, so a
    // null here costs a name on a new customer and nothing else.
    const user = ownerId === uid
      ? await readAsCaller(`users/${encodeURIComponent(ownerId)}`, idToken)
      : null;

    // Deliberately does NOT stamp erpMirroredAt on the Firestore order, the way
    // the poller in emailTriggers.ts does. Writing to the order is not the
    // customer's to do, and this function holds only their credential for
    // Firestore.
    //
    // Two consequences, both acceptable. In local development the poller will
    // mirror the same order a second time, because it sees no marker -- the
    // mirror upserts on order id, so that costs a write and changes nothing. And
    // a future catch-up sweep cannot use that marker to tell what is already
    // done; it should compare against the ids in web_orders instead, which is
    // the more trustworthy check anyway since it asks the destination rather
    // than a flag that claims to describe it.
    const { lines } = await mirrorOrderToSupabase(orderId, order, user);
    console.log(`[ORDER MIRROR] ${orderId} -> web_orders, ${lines} line(s)`);
    return res.status(200).json({ ok: true, orderId, lines });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ORDER MIRROR] ${orderId} failed:`, message);
    return res.status(500).json({ error: message });
  }
}
