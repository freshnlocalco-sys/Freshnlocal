/**
 * POST /api/orders/create -- the production transport.
 *
 * All the work, and every decision about what the browser is allowed to
 * determine, lives in handleOrderCreateRequest so that this and the Express
 * route in server.ts cannot drift apart.
 *
 * Environment needed in Vercel: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY,
 * server-side only, no VITE_ prefix.
 */

import { handleOrderCreateRequest } from '../../orderCreate';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const { status, body } = await handleOrderCreateRequest(req.body);
  return res.status(status).json(body);
}
