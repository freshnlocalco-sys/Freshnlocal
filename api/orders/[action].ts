/**
 * POST /api/orders/<action> -- one Vercel function for every orders route.
 *
 * WHY ONE FILE: Vercel's Hobby plan refuses a deployment with more than 12
 * serverless functions ("No more than 12 Serverless Functions can be added to
 * a Deployment on the Hobby plan"), and every file under api/ is one function.
 * dev reached 13 on 27 Nov 2026. A dynamic segment keeps every public URL
 * exactly as it was -- /api/orders/<action> still resolves here -- so the
 * browser code did not change.
 *
 * server.ts is the local development server and is NOT deployed: on Vercel
 * this project is a static SPA plus the functions in api/. A route that is
 * only registered in server.ts does not exist in production and answers with
 * index.html instead. That is why every server route needs a file in here.
 *
 * Each action is a thin wrapper over a transport-free handler, the same one
 * server.ts registers for local development, so the two cannot drift.
 * Authorization happens inside each handler; nothing here trusts the body.
 *
 * Environment (server-side only, NO VITE_ prefix): SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY.
 */

import { handleOrderAdminSyncRequest } from '../../orderAdminSync';
import { handleOrderCreateRequest } from '../../orderCreate';
import { handleOrderHistoryRequest } from '../../orderHistory';
import { handleOrderMirrorRequest } from '../../orderMirror';

type Reply = { status: number; body: unknown };
const ACTIONS: Record<string, (body: unknown) => Promise<Reply>> = {
  'admin-sync': (b) => handleOrderAdminSyncRequest(b),
  create: (b) => handleOrderCreateRequest(b),
  mine: (b) => handleOrderHistoryRequest(b),
  mirror: (b) => handleOrderMirrorRequest(b),
};

/** The action from Vercel's dynamic segment, or the URL's last part as a fallback. */
function actionOf(req: any): string {
  const q = req.query?.action;
  if (typeof q === 'string' && q) return q;
  if (Array.isArray(q) && q[0]) return String(q[0]);
  const path = String(req.url ?? '').split('?')[0];
  return path.split('/').filter(Boolean).pop() ?? '';
}

export default async function handler(req: any, res: any) {
  const run = ACTIONS[actionOf(req)];
  if (!run) return res.status(404).json({ error: 'Not Found' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { status, body } = await run(req.body);
  return res.status(status).json(body);
}
