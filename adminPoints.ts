/**
 * Crediting loyalty points to a customer, on an admin's instruction.
 *
 * AdminDashboard awards these when an order is marked delivered. It used to do
 * it in the browser with `increment()` against Firestore `users/{uid}`; once
 * the balance moved to web_users that wrote to a document nobody reads, and
 * pointing the same write at Supabase does not help -- an admin holds a
 * Firebase token, so `web_firebase_uid()` is NULL for them and RLS matches no
 * row. The write would succeed against nothing, which is how this whole class
 * of bug has been presenting.
 *
 * So the browser asks the server, the server decides whether the caller really
 * is staff, and the credit happens with the service role through
 * web_award_points(). The role is read from web_users here and never taken from
 * the request.
 */

import type { Express } from 'express';
import { lookupCaller } from './firebaseAuth.js';

const SUPABASE_URL = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const adminPointsConfigured = (): boolean => !!SUPABASE_URL() && !!SERVICE_KEY();

const H = () => ({
  apikey: SERVICE_KEY(),
  Authorization: `Bearer ${SERVICE_KEY()}`,
  'Content-Type': 'application/json',
});

interface Reply { status: number; body: Record<string, any>; }

export async function handleAwardPoints(rawBody: unknown): Promise<Reply> {
  if (!adminPointsConfigured()) {
    return { status: 503, body: { error: 'Supabase is not configured on this server.' } };
  }

  const body = typeof rawBody === 'string'
    ? (() => { try { return JSON.parse(rawBody); } catch { return {}; } })()
    : ((rawBody ?? {}) as Record<string, any>);

  const caller = await lookupCaller(String(body.idToken ?? ''));
  if (!caller.uid) {
    console.warn('[POINTS] award refused:', caller.reason);
    return { status: 401, body: { error: 'Not signed in.' } };
  }

  const userId = String(body.userId ?? '').trim();
  const amount = Number(body.amount);
  if (!userId) return { status: 400, body: { error: 'userId is required' } };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { status: 400, body: { error: 'amount must be a positive number' } };
  }
  // A cap, because this is the one endpoint that creates value out of nothing.
  // Orders award tens of points; a four-figure request is a bug or a mistake,
  // and either way it should stop here rather than land in a balance.
  if (amount > 10_000) {
    console.error(`[POINTS] refused an award of ${amount} to ${userId} by ${caller.uid}`);
    return { status: 400, body: { error: 'amount is implausibly large' } };
  }

  // Is the caller staff? Read from the database, never from the request.
  const whoRes = await fetch(
    `${SUPABASE_URL()}/rest/v1/web_users?select=role,is_deleted&id=eq.${encodeURIComponent(caller.uid)}&limit=1`,
    { headers: H() }
  );
  if (!whoRes.ok) {
    console.error('[POINTS] could not read the caller:', whoRes.status, await whoRes.text().catch(() => ''));
    return { status: 500, body: { error: 'Could not award points.' } };
  }
  const who = (await whoRes.json())?.[0];
  if (!who || who.is_deleted || (who.role !== 'admin' && who.role !== 'horeca_admin')) {
    console.warn(`[POINTS] ${caller.uid} (role ${who?.role ?? 'none'}) tried to award points`);
    // Same answer as a missing session: whether the endpoint exists is not
    // something to confirm to someone who may not use it.
    return { status: 401, body: { error: 'Not signed in.' } };
  }

  try {
    const res = await fetch(`${SUPABASE_URL()}/rest/v1/rpc/web_award_points`, {
      method: 'POST',
      headers: H(),
      body: JSON.stringify({ p_user_id: userId, p_amount: amount }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[POINTS] award of ${amount} to ${userId} failed: ${res.status} ${text.slice(0, 200)}`);
      return { status: 500, body: { error: 'Could not award points.' } };
    }
    const balance = await res.json().catch(() => null);
    if (balance === null) {
      console.error(`[POINTS] no live web_users row for ${userId}; ${amount} not awarded`);
      return { status: 404, body: { error: 'No such customer.' } };
    }
    console.log(`[POINTS] ${amount} awarded to ${userId} by ${caller.uid}, balance now ${balance}`);
    return { status: 200, body: { ok: true, balance } };
  } catch (err) {
    console.error('[POINTS] award threw:', err instanceof Error ? err.message : String(err));
    return { status: 500, body: { error: 'Could not award points.' } };
  }
}

/** Admin or HoReCa admin, read from the database. Null when the caller is not. */
async function staffCaller(idToken: string): Promise<string | null> {
  const caller = await lookupCaller(idToken);
  if (!caller.uid) return null;
  const r = await fetch(
    `${SUPABASE_URL()}/rest/v1/web_users?select=role,is_deleted&id=eq.${encodeURIComponent(caller.uid)}&limit=1`,
    { headers: H() }
  );
  if (!r.ok) return null;
  const who = (await r.json())?.[0];
  return who && !who.is_deleted && (who.role === 'admin' || who.role === 'horeca_admin') ? caller.uid : null;
}

/**
 * POST /api/admin/award-order-points  { idToken, orderId }
 *
 * Credit ONE order's points, at most once, through web_award_order_points()
 * (supabase_web_points_on_completion.sql), which claims the order's
 * points_awarded flag and credits the customer in a single statement.
 *
 * The Admin Portal used to call award-points with a user and an amount, having
 * checked only its own Firestore copy of the order. Once the ERP can complete
 * an order and credit it too, that copy can be stale -- and the customer would
 * be paid twice. Crediting by order, against the Supabase flag, closes that.
 *
 * Answers { reason: 'not-ready' } while the SQL has not been run, so the
 * Portal can fall back to its previous behaviour during the rollout.
 */
export async function handleAwardOrderPoints(rawBody: unknown): Promise<Reply> {
  if (!adminPointsConfigured()) {
    return { status: 503, body: { error: 'Supabase is not configured on this server.' } };
  }
  const body = typeof rawBody === 'string'
    ? (() => { try { return JSON.parse(rawBody); } catch { return {}; } })()
    : ((rawBody ?? {}) as Record<string, any>);

  const uid = await staffCaller(String(body.idToken ?? ''));
  if (!uid) return { status: 401, body: { error: 'Not signed in.' } };

  const orderId = String(body.orderId ?? '').trim();
  if (!orderId) return { status: 400, body: { error: 'orderId is required' } };

  try {
    const res = await fetch(`${SUPABASE_URL()}/rest/v1/rpc/web_award_order_points`, {
      method: 'POST', headers: H(), body: JSON.stringify({ p_order_id: orderId }),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      if (text.includes('PGRST202')) return { status: 200, body: { ok: true, reason: 'not-ready', credited: 0 } };
      console.error(`[POINTS] order ${orderId} credit failed: ${res.status} ${text.slice(0, 200)}`);
      return { status: 500, body: { error: 'Could not award points.' } };
    }
    const result = JSON.parse(text) as { credited?: number; reason?: string };
    console.log(`[POINTS] order ${orderId}: ${result.reason} (${result.credited ?? 0}) by ${uid}`);
    return { status: 200, body: { ok: true, credited: Number(result.credited) || 0, reason: result.reason } };
  } catch (err) {
    console.error('[POINTS] order credit threw:', err instanceof Error ? err.message : String(err));
    return { status: 500, body: { error: 'Could not award points.' } };
  }
}

export function registerAdminPoints(app: Express): void {
  app.post('/api/admin/award-points', async (req, res) => {
    const { status, body } = await handleAwardPoints(req.body);
    res.status(status).json(body);
  });
  app.post('/api/admin/award-order-points', async (req, res) => {
    const { status, body } = await handleAwardOrderPoints(req.body);
    res.status(status).json(body);
  });
}
