/**
 * Mirrors a storefront order into the ERP's Supabase database.
 *
 * WHY THIS EXISTS
 * ---------------
 * The website and the ERP were two databases. An order placed here reached
 * Firestore and stopped: nothing downstream -- no packer, no driver, no stock
 * figure -- knew it existed, and the office re-typed it. The ERP now holds the
 * storefront's tables (supabase/updates/supabase_website_store.sql in the ERP
 * repo), but a one-off backfill only moved what existed on 27 Oct 2026. This is
 * what keeps them in step from now on.
 *
 * WHERE IT RUNS
 * -------------
 * In the Express server, inside the same poll cycle that sends the order
 * emails (emailTriggers.ts). That loop already authenticates, already reads the
 * most recent orders, and already runs server-side where a service role key is
 * safe -- so the mirror is one more pass over a snapshot we already have,
 * rather than a second poller doing the same work twice.
 *
 * It is a SEPARATE pass, not a line inside the email loop, because that loop
 * skips any order with no email address on it -- an order that still has to
 * reach the floor.
 *
 * WHY NOT AT CHECKOUT
 * ------------------------------------
 * Three reasons, in order of importance.
 *
 * It must not be able to break an order. Checkout takes money and clears a
 * cart; a trigger that fails afterwards leaves the order safely in Firestore
 * and the mirror can be retried. The reverse -- an order lost because the ERP
 * was unreachable -- is not recoverable.
 *
 * It needs the service role key, which bypasses row level security. That key
 * must never be in a browser bundle. A Cloud Function is the nearest place to
 * the order that can hold one.
 *
 * And it catches every order however it was placed, rather than every order
 * placed through the one checkout path we remembered to edit.
 *
 * WHAT IT IS NOT
 * --------------
 * It does not create ERP tasks. Turning an order into work for the floor is a
 * separate step with its own decisions still open -- whether stock is reserved
 * at checkout, and how order numbers are allocated -- and it reads these rows
 * once they are here. `erp_pushed_at` stays NULL; that column is how the ERP
 * will know which orders it has already acted on.
 */

const SUPABASE_URL = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabaseConfigured = (): boolean => !!SUPABASE_URL() && !!SERVICE_KEY();

const headers = (prefer?: string): Record<string, string> => ({
  apikey: SERVICE_KEY(),
  Authorization: `Bearer ${SERVICE_KEY()}`,
  'Content-Type': 'application/json',
  ...(prefer ? { Prefer: prefer } : {}),
});

/** POST to PostgREST, raising with the body so a failure says which constraint. */
async function send(path: string, init: RequestInit): Promise<void> {
  const res = await fetch(`${SUPABASE_URL()}/rest/v1/${path}`, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Supabase ${init.method} /${path} -> ${res.status} ${body.slice(0, 400)}`);
  }
}

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
};

/** Firestore writes epoch milliseconds; Postgres wants an ISO timestamp. */
const iso = (v: unknown): string | null => {
  if (v == null) return null;
  if (typeof v === 'number') return new Date(v).toISOString();
  if (typeof v === 'object' && typeof (v as { toDate?: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const ROLES = ['admin', 'customer', 'horeca', 'horeca_admin'];

/**
 * The customer row must exist before the order can reference it --
 * web_orders.user_id is a hard foreign key. Anyone who signed up after the
 * backfill is not there yet, so this puts them there.
 *
 * `resolution=ignore-duplicates` rather than merge: if the customer is already
 * known, their row is the ERP's, and overwriting it from an order's shipping
 * details would quietly reset their loyalty points and could demote a HoReCa
 * account to retail pricing. All this needs is for the row to exist.
 */
async function ensureCustomer(userId: string, order: Record<string, any>, user: Record<string, any> | null): Promise<void> {
  const ship = order.shippingDetails ?? {};
  const role = ROLES.includes(String(user?.role)) ? String(user!.role)
    : order.isHoreca === true ? 'horeca'
    : 'customer';

  await send('web_users?on_conflict=id', {
    method: 'POST',
    headers: headers('resolution=ignore-duplicates,return=minimal'),
    body: JSON.stringify({
      id: userId,
      email: user?.email ?? ship.email ?? null,
      display_name: user?.displayName ?? ship.name ?? null,
      role,
      phone: user?.phone ?? ship.phone ?? null,
      points: Math.max(0, num(user?.points, 0)),
      created_at: iso(user?.createdAt) ?? new Date().toISOString(),
    }),
  });
}

/**
 * The order itself, in the same shape the backfill produced, so a mirrored
 * order and a migrated one are indistinguishable to anything reading them.
 *
 * `erp_party_name` records which ERP party this order belongs to, decided here
 * because this is where we know whether it was a HoReCa sale. The marketplaces
 * (Zepto, Swiggy, Zomato) are separate parties and unaffected; the website's
 * retail and B2B sides are 'Website Customers' and 'Hotel' respectively, which
 * is how the office already thinks about them.
 */
async function writeOrder(orderId: string, order: Record<string, any>, userId: string): Promise<void> {
  const ship = order.shippingDetails ?? {};
  const isHoreca = order.isHoreca === true;

  // The flag and the timestamp cannot disagree -- that is the CHECK, and the
  // reason behind it is that a customer must not be paid their points twice.
  const awarded = order.pointsAwarded === true;
  const awardedAt = awarded ? (iso(order.pointsAwardedAt) ?? iso(order.updatedAt) ?? iso(order.createdAt) ?? new Date().toISOString()) : null;

  await send('web_orders?on_conflict=id', {
    method: 'POST',
    headers: headers('resolution=merge-duplicates,return=minimal'),
    body: JSON.stringify({
      id: orderId,
      order_number: order.orderNumber != null ? String(order.orderNumber) : null,
      user_id: userId,
      customer_type: order.customerType ?? null,
      is_horeca: isHoreca,
      status: String(order.status ?? 'pending'),
      payment_method: order.paymentMethod ?? null,
      delivery_method: order.deliveryMethod ?? null,
      free_gift: order.freeGiftAwarded ?? order.freeGiftsAwarded ?? null,
      confirmation_email_sent: typeof order.confirmationEmailSent === 'boolean' ? order.confirmationEmailSent : null,
      shipping_email_status: order.shippingEmailStatus ?? null,
      price_updated_email_pending: typeof order.priceUpdatedEmailPending === 'boolean' ? order.priceUpdatedEmailPending : null,
      total_amount: Math.max(0, num(order.totalAmount)),
      discount: Math.max(0, num(order.discount)),
      points_earned: Math.max(0, num(order.pointsEarned)),
      points_redeemed: Math.max(0, num(order.pointsRedeemed)),
      points_awarded: awarded,
      points_awarded_at: awardedAt,
      ship_name: ship.name ?? null,
      ship_phone: ship.phone ?? order.phone ?? null,
      ship_email: ship.email ?? null,
      ship_address: ship.address ?? order.address ?? null,
      erp_party_name: isHoreca ? 'Hotel' : 'Website Customers',
      erp_pushed_at: null,
      created_at: iso(order.createdAt) ?? new Date().toISOString(),
      updated_at: iso(order.updatedAt),
    }),
  });
}

/**
 * The lines, as a frozen receipt of what was bought at the price it was bought
 * at. `sku` is the storefront's own product reference verbatim -- the same
 * string platform_item_mappings is keyed on, which is what lets the ERP work
 * out what a packer puts in the box.
 *
 * Deleted and re-inserted rather than upserted, so a retry cannot leave a line
 * from a previous attempt behind if the order was edited in between.
 */
async function writeItems(orderId: string, order: Record<string, any>): Promise<number> {
  const items = Array.isArray(order.items) ? order.items : [];

  await send(`web_order_items?order_id=eq.${encodeURIComponent(orderId)}`, {
    method: 'DELETE',
    headers: headers('return=minimal'),
  });
  if (!items.length) return 0;

  const rows = items.map((it: Record<string, any>, i: number) => {
    const p = it.product ?? {};
    const qty = num(it.quantity);
    const unitPrice = Math.max(0, num(p.price));
    return {
      id: `${orderId}__i${i}`,
      order_id: orderId,
      // Left for the ERP to resolve: a product may have been renamed or
      // removed, and the frozen copy below is the record that matters.
      variant_id: null,
      web_product_id: null,
      sku: String(p.id ?? '') || `unknown__${orderId}__${i}`,
      product_name: String(p.name ?? '(unknown)'),
      unit: String(p.unit ?? '').trim() || 'Each',
      pack_size: p.packSize ?? null,
      quantity: qty,
      unit_price: unitPrice,
      original_price: p.originalPrice != null ? Math.max(0, num(p.originalPrice)) : null,
      line_total: Math.round(qty * unitPrice * 100) / 100,
      created_at: iso(order.createdAt) ?? new Date().toISOString(),
    };
  }).filter((r: { quantity: number }) => r.quantity > 0); // the CHECK refuses zero, and a zero line is not a sale

  if (!rows.length) return 0;

  await send('web_order_items?on_conflict=id', {
    method: 'POST',
    headers: headers('resolution=merge-duplicates,return=minimal'),
    body: JSON.stringify(rows),
  });
  return rows.length;
}

/**
 * Mirror one order. Safe to call again for the same order: the customer is
 * inserted only if missing, the order is upserted, and the lines are replaced.
 *
 * Throws on failure so the caller can record that this order still needs
 * mirroring. It deliberately does not swallow errors -- an order silently
 * absent from the ERP is the exact problem this is here to end.
 */
export async function mirrorOrderToSupabase(
  orderId: string,
  order: Record<string, any>,
  user: Record<string, any> | null
): Promise<{ lines: number }> {
  if (!supabaseConfigured()) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set on this function.');
  }
  const userId = String(order.userId ?? order.uid ?? '').trim();
  if (!userId) throw new Error(`order ${orderId} has no userId; web_orders.user_id cannot be null`);

  await ensureCustomer(userId, order, user);
  await writeOrder(orderId, order, userId);
  const lines = await writeItems(orderId, order);
  return { lines };
}
