/**
 * POST /api/orders/admin-sync -- the production transport for copying an admin's
 * order edit to Supabase. All the work lives in handleOrderAdminSyncRequest so
 * this and the Express route in server.ts cannot drift apart.
 *
 * Environment needed in Vercel: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { handleOrderAdminSyncRequest } from '../../orderAdminSync';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const { status, body } = await handleOrderAdminSyncRequest(req.body);
  return res.status(status).json(body);
}
