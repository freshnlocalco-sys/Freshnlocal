/**
 * A customer's own orders, read from Supabase.
 *
 * This replaces the `collection(db, 'orders')` query that Orders.tsx,
 * Profile.tsx and Home.tsx each ran against Firestore. Orders are created in
 * Supabase now (orderCreate.ts); this is the other half -- reading them back --
 * and together they are what lets the Firestore shadow write be switched off.
 *
 * IT RETURNS THE OLD SHAPE ON PURPOSE
 *
 * Supabase stores an order normalised across two tables with snake_case
 * columns. The pages expect what Firestore held: one nested object per order,
 * `createdAt` in epoch milliseconds, `items[]` of `{ product, quantity }`. So
 * this translates back rather than asking three pages to change how they
 * render. The migration is about where the data lives, not about rewriting
 * screens that already work -- and a screen that does not change cannot
 * regress.
 *
 * WHOSE ORDERS
 *
 * The uid comes from the Firebase token via Google, never from the request
 * body, and the query is filtered to it. A customer can ask for their own
 * orders and there is no parameter that says whose to fetch.
 */

import type { Express } from 'express';
import { lookupCaller } from './firebaseAuth';

// Read lazily, never captured at module load. catalogueMirror.ts captured these
// in module-level consts and has reported itself unconfigured ever since,
// because server.ts calls dotenv.config() after its imports have evaluated.
const SUPABASE_URL = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const orderHistoryConfigured = (): boolean => !!SUPABASE_URL() && !!SERVICE_KEY();

const sbHeaders = () => ({
  apikey: SERVICE_KEY(),
  Authorization: `Bearer ${SERVICE_KEY()}`,
  'Content-Type': 'application/json',
});

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL()}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Supabase GET /${path} -> ${res.status} ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
};

/** Epoch milliseconds, which is what the pages sort and format with. */
const ms = (v: unknown): number => {
  const t = Date.parse(String(v ?? ''));
  return Number.isFinite(t) ? t : 0;
};

/**
 * The product id inside a cart SKU.
 *
 * A SKU is the product id with the chosen unit after a single hyphen --
 * `lEonGepYmXUd3eoDNALG-500 g`. Splitting on the FIRST hyphen is safe because
 * no product id contains one: all 449 are 20 characters of [A-Za-z0-9],
 * checked rather than assumed. Units do contain hyphens, which is why the
 * split is on the first and not the last.
 */
const productIdFromSku = (sku: string): string => {
  const s = String(sku ?? '');
  const i = s.indexOf('-');
  return i === -1 ? s : s.slice(0, i);
};

interface ItemRow {
  sku: string; product_name: string; unit: string; quantity: number;
  unit_price: number; original_price: number | null; pack_size: string | null;
}
interface OrderRow {
  id: string; order_number: string | null; user_id: string; customer_type: string | null;
  is_horeca: boolean | null; status: string | null; payment_method: string | null;
  delivery_method: string | null; free_gift: any; total_amount: number | null;
  discount: number | null; points_earned: number | null; points_redeemed: number | null;
  points_awarded: boolean | null; points_awarded_at: string | null;
  ship_name: string | null; ship_phone: string | null; ship_email: string | null; ship_address: string | null;
  created_at: string; updated_at: string | null;
  web_order_items: ItemRow[] | null;
}

const SELECT = [
  'id', 'order_number', 'user_id', 'customer_type', 'is_horeca', 'status',
  'payment_method', 'delivery_method', 'free_gift', 'total_amount', 'discount',
  'points_earned', 'points_redeemed', 'points_awarded', 'points_awarded_at',
  'ship_name', 'ship_phone', 'ship_email', 'ship_address', 'created_at', 'updated_at',
  'web_order_items(sku,product_name,unit,pack_size,quantity,unit_price,original_price)',
].join(',');

export interface OrderHistoryReply { status: number; body: Record<string, any>; }

export async function handleOrderHistoryRequest(rawBody: unknown): Promise<OrderHistoryReply> {
  if (!orderHistoryConfigured()) {
    return { status: 503, body: { error: 'Supabase is not configured on this server.' } };
  }

  const body = typeof rawBody === 'string'
    ? (() => { try { return JSON.parse(rawBody); } catch { return {}; } })()
    : ((rawBody ?? {}) as Record<string, any>);

  const caller = await lookupCaller(String(body.idToken ?? ''));
  if (!caller.uid) {
    console.warn('[ORDER HISTORY] refused:', caller.reason);
    return { status: 401, body: { error: 'Not signed in.' } };
  }

  try {
    const rows = await get<OrderRow[]>(
      `web_orders?select=${encodeURIComponent(SELECT)}` +
      `&user_id=eq.${encodeURIComponent(caller.uid)}` +
      `&is_deleted=eq.false&order=created_at.desc&limit=200`,
    );

    // Images and categories live on the product, not on the frozen order line,
    // so they are fetched once for every product the customer has ever ordered
    // rather than per line. A product since deleted simply has no image, which
    // is what the old Firestore orders did too when the snapshot lacked one.
    const ids = [...new Set(rows.flatMap(o => (o.web_order_items ?? []).map(i => productIdFromSku(i.sku))).filter(Boolean))];
    const byId = new Map<string, { image_url: string | null; category: string | null }>();
    if (ids.length) {
      const list = ids.map(id => `"${id}"`).join(',');
      const products = await get<Array<{ id: string; image_url: string | null; category: string | null }>>(
        `web_products?select=id,image_url,category&id=in.(${encodeURIComponent(list)})`,
      );
      for (const p of products) byId.set(p.id, { image_url: p.image_url, category: p.category });
    }

    const orders = rows.map(o => {
      const gift = o.free_gift;
      return {
        id: o.id,
        orderNumber: o.order_number ?? undefined,
        userId: o.user_id,
        customerType: o.customer_type ?? undefined,
        isHoreca: o.is_horeca === true,
        status: String(o.status ?? 'pending'),
        totalAmount: num(o.total_amount),
        discount: num(o.discount),
        pointsEarned: num(o.points_earned),
        pointsRedeemed: num(o.points_redeemed),
        pointsAwarded: o.points_awarded === true,
        pointsAwardedAt: o.points_awarded_at ? ms(o.points_awarded_at) : undefined,
        paymentMethod: o.payment_method ?? undefined,
        deliveryMethod: o.delivery_method ?? undefined,
        // Both the nested object and the legacy top-level fields, because
        // different pages read different ones and neither should have to care.
        shippingDetails: {
          name: o.ship_name ?? undefined,
          phone: o.ship_phone ?? undefined,
          email: o.ship_email ?? undefined,
          address: o.ship_address ?? undefined,
        },
        address: o.ship_address ?? undefined,
        phone: o.ship_phone ?? undefined,
        // free_gift is one jsonb column holding whichever shape the order had.
        freeGiftsAwarded: Array.isArray(gift) ? gift : gift ? [gift] : [],
        freeGiftAwarded: Array.isArray(gift) ? (gift[0] ?? null) : (gift ?? null),
        items: (o.web_order_items ?? []).map(i => {
          const p = byId.get(productIdFromSku(i.sku));
          return {
            product: {
              // The SKU, because that is what Firestore stored as product.id
              // and what Reorder puts back in the cart.
              id: i.sku,
              name: i.product_name,
              price: num(i.unit_price),
              unit: i.unit,
              imageUrl: p?.image_url ?? '',
              category: p?.category ?? 'General',
              ...(i.original_price != null ? { originalPrice: num(i.original_price) } : {}),
              ...(i.pack_size ? { packSize: i.pack_size } : {}),
            },
            quantity: num(i.quantity),
          };
        }),
        createdAt: ms(o.created_at),
        updatedAt: o.updated_at ? ms(o.updated_at) : undefined,
      };
    });

    return { status: 200, body: { ok: true, orders } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ORDER HISTORY] failed:', message);
    return { status: 500, body: { error: message } };
  }
}

export function registerOrderHistory(app: Express): void {
  app.post('/api/orders/mine', async (req, res) => {
    const { status, body } = await handleOrderHistoryRequest(req.body);
    res.status(status).json(body);
  });
}
