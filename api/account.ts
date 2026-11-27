/**
 * POST /api/account/<action> -- customer and staff sign-in steps that need the
 * server. One Vercel function for the group (the Hobby plan allows 12).
 *
 *   register     compulsory name + email after a WhatsApp code (customerRegistration.ts)
 *   staff-token  a fresh WhatsApp sign-in traded for a staff Firebase session
 *                (staffPhoneAuth.ts)
 *
 * HOW A REQUEST GETS HERE: vercel.json rewrites /api/account/<action> to
 * /api/account?action=<action>, ahead of its catch-all rules. A plain file
 * name and an explicit rewrite, because dynamic-segment files were not routed
 * in production (27 Nov 2026).
 *
 * server.ts is the local development server and is NOT deployed; it registers
 * the same handlers at the same paths.
 *
 * Environment (server-side only, NO VITE_ prefix): SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, and FIREBASE_SERVICE_ACCOUNT for staff-token.
 */

import { handleRegister } from '../customerRegistration.js';
import { handleStaffToken } from '../staffPhoneAuth.js';

type Reply = { status: number; body: unknown };
const ACTIONS: Record<string, (body: unknown) => Promise<Reply>> = {
  register: (b) => handleRegister(b),
  'staff-token': (b) => handleStaffToken(b),
};

/** The action from the rewrite's ?action=, or the URL's last part as a fallback. */
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
