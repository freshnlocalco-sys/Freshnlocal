/**
 * POST /api/admin/<action> -- one Vercel function for every admin route.
 *
 * WHY ONE FILE: Vercel's Hobby plan refuses a deployment with more than 12
 * serverless functions ("No more than 12 Serverless Functions can be added to
 * a Deployment on the Hobby plan"), and every file under api/ is one function.
 * dev reached 13 on 27 Nov 2026. A dynamic segment keeps every public URL
 * exactly as it was -- /api/admin/<action> still resolves here -- so the
 * browser code did not change.
 *
 * Each action is a thin wrapper over a transport-free handler, the same one
 * server.ts registers for local development, so the two cannot drift.
 * Authorization happens inside each handler; nothing here trusts the body.
 *
 * Environment (server-side only, NO VITE_ prefix): SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY.
 */

import { handleAwardPoints } from '../../adminPoints';
import { handleMirrorRequest } from '../../catalogueMirror';

type Reply = { status: number; body: unknown };
const ACTIONS: Record<string, (body: unknown) => Promise<Reply>> = {
  'award-points': (b) => handleAwardPoints(b),
  // This handler expects an object; a string arrives when the content type is
  // missing, so it is parsed here, exactly as api/admin/mirror-catalogue.ts did.
  'mirror-catalogue': (b) => handleMirrorRequest(
    typeof b === 'string' ? (() => { try { return JSON.parse(b); } catch { return {}; } })() : b
  ),
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
