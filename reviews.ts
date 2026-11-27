/**
 * Posting and removing product reviews.
 *
 * Reading them does NOT come through here: web_reviews has a policy that lets
 * anyone SELECT a live row, so the browser reads reviews straight from Supabase
 * with the anon key, exactly as it reads the catalogue. A server round trip for
 * public data would buy nothing.
 *
 * WRITING is different, and the reason is the migration. Customers hold a
 * Supabase session and could write their own rows directly under RLS; staff
 * hold a Firebase token, which Supabase has never been configured to accept, so
 * for them `web_firebase_uid()` is NULL and `web_is_admin()` is false. A direct
 * client write by an admin would match no rows and PostgREST would answer 200
 * with an empty array -- a silent no-op, which is the exact failure mode this
 * migration has already produced twice elsewhere.
 *
 * So writes go through lookupCaller(), which accepts either token type and
 * resolves both to a web_users.id, and the actual write uses the service role
 * with the permission check done here. One path, both kinds of user, and a
 * failure is a failure rather than a shrug.
 */

import type { Express } from 'express';
import { lookupCaller } from './firebaseAuth';

const SUPABASE_URL = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const reviewsConfigured = (): boolean => !!SUPABASE_URL() && !!SERVICE_KEY();

const headers = () => ({
  apikey: SERVICE_KEY(),
  Authorization: `Bearer ${SERVICE_KEY()}`,
  'Content-Type': 'application/json',
});

async function sb(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL()}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers as Record<string, string> | undefined) },
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

interface Reply { status: number; body: Record<string, any>; }

/** The caller's storefront row, for the id, the display name and the role. */
async function callerRow(uid: string) {
  const rows = await sb(
    `web_users?select=id,display_name,role,is_deleted&id=eq.${encodeURIComponent(uid)}&limit=1`
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  return row && !row.is_deleted ? row : null;
}

const isStaff = (role: string | null | undefined) => role === 'admin' || role === 'horeca_admin';

export async function handleReviewCreate(rawBody: unknown): Promise<Reply> {
  if (!reviewsConfigured()) return { status: 503, body: { error: 'Supabase is not configured on this server.' } };

  const body = typeof rawBody === 'string'
    ? (() => { try { return JSON.parse(rawBody); } catch { return {}; } })()
    : ((rawBody ?? {}) as Record<string, any>);

  const caller = await lookupCaller(String(body.idToken ?? ''));
  if (!caller.uid) {
    console.warn('[REVIEWS] create refused:', caller.reason);
    return { status: 401, body: { error: 'Not signed in.' } };
  }

  const productId = String(body.productId ?? '').trim();
  const rating = Math.round(Number(body.rating));
  const comment = String(body.comment ?? '').trim();

  if (!productId) return { status: 400, body: { error: 'productId is required' } };
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { status: 400, body: { error: 'rating must be 1 to 5' } };
  }
  // The column is TEXT with no length limit, but the Firestore rule capped this
  // at 2000 and there is no reason to start accepting essays now.
  if (!comment) return { status: 400, body: { error: 'comment is required' } };
  if (comment.length > 2000) return { status: 400, body: { error: 'comment is too long' } };

  const me = await callerRow(caller.uid);
  if (!me) return { status: 401, body: { error: 'Not signed in.' } };

  try {
    // One live review per shopper per product (uq_web_reviews_one_per_user_live).
    // Rather than let the insert fail on the index, update the existing one:
    // "edit my review" is what a customer means by reviewing twice.
    const existing = await sb(
      `web_reviews?select=id&web_product_id=eq.${encodeURIComponent(productId)}` +
      `&user_id=eq.${encodeURIComponent(caller.uid)}&is_deleted=eq.false&limit=1`
    );
    const prior = Array.isArray(existing) ? existing[0] : null;

    if (prior) {
      await sb(`web_reviews?id=eq.${encodeURIComponent(prior.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ rating, comment, updated_at: new Date().toISOString() }),
      });
      console.log(`[REVIEWS] ${caller.uid} updated their review of ${productId}`);
      return { status: 200, body: { ok: true, id: prior.id, updated: true } };
    }

    const id = `rev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    await sb('web_reviews', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id,
        web_product_id: productId,
        user_id: caller.uid,
        // Copied at write time on purpose, matching the column's own comment: a
        // review still shows a name after the account closes, and it must not
        // change if the shopper renames themselves later.
        user_name: String(me.display_name || '').slice(0, 100) || 'Anonymous',
        rating,
        comment,
      }),
    });
    console.log(`[REVIEWS] ${caller.uid} reviewed ${productId}`);
    return { status: 200, body: { ok: true, id } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A foreign key failure means the product id was not real.
    if (/23503|foreign key/i.test(message)) {
      return { status: 400, body: { error: 'That product does not exist.' } };
    }
    console.error('[REVIEWS] create failed:', message);
    return { status: 500, body: { error: 'Could not save your review.' } };
  }
}

export async function handleReviewDelete(rawBody: unknown): Promise<Reply> {
  if (!reviewsConfigured()) return { status: 503, body: { error: 'Supabase is not configured on this server.' } };

  const body = typeof rawBody === 'string'
    ? (() => { try { return JSON.parse(rawBody); } catch { return {}; } })()
    : ((rawBody ?? {}) as Record<string, any>);

  const caller = await lookupCaller(String(body.idToken ?? ''));
  if (!caller.uid) return { status: 401, body: { error: 'Not signed in.' } };

  const reviewId = String(body.reviewId ?? '').trim();
  if (!reviewId) return { status: 400, body: { error: 'reviewId is required' } };

  const me = await callerRow(caller.uid);
  if (!me) return { status: 401, body: { error: 'Not signed in.' } };

  try {
    const rows = await sb(
      `web_reviews?select=id,user_id,is_deleted&id=eq.${encodeURIComponent(reviewId)}&limit=1`
    );
    const review = Array.isArray(rows) ? rows[0] : null;
    if (!review || review.is_deleted) return { status: 404, body: { error: 'No such review.' } };

    // Yours, or you moderate. Checked here against the row we just read rather
    // than trusted from the request.
    if (review.user_id !== caller.uid && !isStaff(me.role)) {
      // Deliberately the same answer as "no such review": whether a given
      // review id exists is not something to confirm to someone who cannot
      // touch it.
      return { status: 404, body: { error: 'No such review.' } };
    }

    await sb(`web_reviews?id=eq.${encodeURIComponent(reviewId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        is_deleted: true,
        deleted_on: new Date().toISOString(),
        deleted_by: review.user_id === caller.uid ? 'customer' : `staff:${caller.uid}`,
      }),
    });
    console.log(`[REVIEWS] ${reviewId} removed by ${caller.uid}`);
    return { status: 200, body: { ok: true } };
  } catch (err) {
    console.error('[REVIEWS] delete failed:', err instanceof Error ? err.message : String(err));
    return { status: 500, body: { error: 'Could not remove the review.' } };
  }
}

export function registerReviews(app: Express): void {
  app.post('/api/reviews/create', async (req, res) => {
    const { status, body } = await handleReviewCreate(req.body);
    res.status(status).json(body);
  });
  app.post('/api/reviews/delete', async (req, res) => {
    const { status, body } = await handleReviewDelete(req.body);
    res.status(status).json(body);
  });
}
