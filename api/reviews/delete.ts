/**
 * POST /api/reviews/delete -- the PRODUCTION transport.
 *
 * Soft-delete a review. The author, or an admin.
 *
 * server.ts is the local development server and is NOT deployed (see
 * api/orders/mirror.ts). This route used to exist only there, so in production
 * it answered with the SPA's index.html and the feature failed. All the work
 * lives in handleReviewDelete(); this file and the Express registration in server.ts
 * are both thin wrappers over it, so the two cannot drift apart.
 *
 * Authorization is inside handleReviewDelete(), via lookupCaller(), which verifies
 * the caller's token server-side. Nothing here trusts the request body for
 * identity or role.
 *
 * Environment needed in Vercel (server-side only, NO VITE_ prefix):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { handleReviewDelete } from '../../reviews';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Vercel parses JSON bodies for us, but a string arrives when the content
  // type is missing or unexpected; handleReviewDelete() copes with either.
  const { status, body } = await handleReviewDelete(req.body);
  return res.status(status).json(body);
}
