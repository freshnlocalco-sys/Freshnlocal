/**
 * POST /api/admin/mirror-catalogue  -- the production transport.
 *
 * On Vercel this project is a static SPA (see vercel.json: everything rewrites
 * to /index.html) plus serverless functions in api/. server.ts is the local
 * development server and is NOT deployed, so an Express route registered there
 * does not exist in production -- the browser would POST this path and get a
 * 404, which the mirror would report as a failure on every admin edit.
 *
 * All of the actual work, including deciding who counts as an admin, lives in
 * handleMirrorRequest so that this and the Express route cannot drift apart.
 *
 * Environment needed in Vercel: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * Both are server-side only and must NOT be given a VITE_ prefix.
 */

import { handleMirrorRequest } from '../../catalogueMirror';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Vercel parses JSON bodies for us, but a string arrives when the content
  // type is missing or unexpected, and the client sets it explicitly -- so this
  // only matters for anything else that calls the endpoint.
  const body = typeof req.body === 'string'
    ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })()
    : req.body;

  const { status, body: payload } = await handleMirrorRequest(body);
  return res.status(status).json(payload);
}
