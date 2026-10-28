/**
 * POST /api/orders/mine -- the production transport for a customer's own order
 * history. All the work lives in handleOrderHistoryRequest so this and the
 * Express route in server.ts cannot drift apart.
 *
 * POST rather than GET because the Firebase ID token travels in the body; a
 * token in a query string ends up in server logs and browser history.
 *
 * Environment needed in Vercel: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { handleOrderHistoryRequest } from '../../orderHistory';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const { status, body } = await handleOrderHistoryRequest(req.body);
  return res.status(status).json(body);
}
