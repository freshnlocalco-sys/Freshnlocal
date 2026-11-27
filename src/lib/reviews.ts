/**
 * Product reviews, read from Supabase and written through our own API.
 *
 * The split is deliberate and explained in reviews.ts at the repo root: live
 * reviews are public, so the browser reads them directly with the anon key,
 * while writes go through the server because staff hold a Firebase token that
 * Supabase does not accept -- a direct write by an admin would match no rows
 * and succeed silently.
 */

import { supabase } from './supabase';
import { getCallerToken } from './callerToken';
import { readApiJson } from './apiJson';

export interface Review {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  rating: number;
  /** Epoch milliseconds, the shape the component already renders. */
  createdAt: number;
  comment: string;
}

const toReview = (r: Record<string, any>): Review => ({
  id: String(r.id),
  productId: String(r.web_product_id),
  userId: String(r.user_id),
  userName: r.user_name || 'Anonymous',
  rating: Number(r.rating) || 0,
  comment: r.comment || '',
  createdAt: r.created_at ? new Date(r.created_at).getTime() : 0,
});

/**
 * Every live review of one product, newest first.
 *
 * Ordered in Postgres rather than sorted in the browser the way the Firestore
 * version had to be -- that sort existed because a compound Firestore query
 * would have needed an index nobody had created.
 */
export async function fetchReviews(productId: string): Promise<Review[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('web_reviews')
    .select('id, web_product_id, user_id, user_name, rating, comment, created_at')
    .eq('web_product_id', productId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[REVIEWS] could not load reviews:', error.message);
    return [];
  }
  return (data ?? []).map(toReview);
}

/**
 * Every live review across the shop, newest first — the admin moderation list.
 *
 * Readable with the anon key like any other review, so this works for a staff
 * member signed in through Firebase, who has no Supabase session at all.
 */
export async function fetchAllReviews(limit = 1000): Promise<Review[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('web_reviews')
    .select('id, web_product_id, user_id, user_name, rating, comment, created_at')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[REVIEWS] could not load the review list:', error.message);
    return [];
  }
  return (data ?? []).map(toReview);
}

export interface WriteResult {
  ok: boolean;
  reason?: string;
}

/**
 * Post a review, or edit the one already there.
 *
 * One live review per shopper per product is a database constraint, so the
 * server turns a second review of the same product into an edit of the first.
 */
export async function submitReview(
  productId: string,
  rating: number,
  comment: string
): Promise<WriteResult> {
  const { token, reason } = await getCallerToken();
  if (!token) return { ok: false, reason: reason ?? 'not signed in' };

  try {
    const res = await fetch('/api/reviews/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token, productId, rating, comment }),
    });
    // readApiJson rather than res.ok: an /api route that is not deployed
    // answers 200 with the page's own HTML, which would read as success.
    const result = await readApiJson<{ ok?: boolean; error?: string }>(res);
    if (!result.ok) return { ok: false, reason: result.reason };
    if (result.data?.error) return { ok: false, reason: result.data.error };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Remove a review: the author's own, or any of them if you are staff. */
export async function deleteReview(reviewId: string): Promise<WriteResult> {
  const { token, reason } = await getCallerToken();
  if (!token) return { ok: false, reason: reason ?? 'not signed in' };

  try {
    const res = await fetch('/api/reviews/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token, reviewId }),
    });
    const result = await readApiJson<{ ok?: boolean; error?: string }>(res);
    if (!result.ok) return { ok: false, reason: result.reason };
    if (result.data?.error) return { ok: false, reason: result.data.error };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Credit loyalty points to a customer. Staff only, checked on the server.
 *
 * Lives here beside the other calls that had to move off a direct client write
 * for the same reason: an admin's Firebase token makes `web_firebase_uid()`
 * NULL, so RLS matches no row and the write silently does nothing.
 */
export async function awardPoints(userId: string, amount: number): Promise<WriteResult> {
  const { token, reason } = await getCallerToken();
  if (!token) return { ok: false, reason: reason ?? 'not signed in' };

  try {
    const res = await fetch('/api/admin/award-points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token, userId, amount }),
    });
    const result = await readApiJson<{ ok?: boolean; error?: string; balance?: number }>(res);
    if (!result.ok) return { ok: false, reason: result.reason };
    if (result.data?.error) return { ok: false, reason: result.data.error };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
