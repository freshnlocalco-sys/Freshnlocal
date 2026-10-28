/**
 * POST /api/orders/mirror  -- the production transport.
 *
 * On Vercel this project is a static SPA (see vercel.json: everything rewrites
 * to /index.html) plus serverless functions in api/. server.ts is the local
 * development server and is NOT deployed, so an Express route registered there
 * does not exist in production.
 *
 * Note which way round the gap was here. The function existed and the Express
 * route did not, so production had the transport and local development had
 * none -- a checkout on localhost POSTed this path into Vite's SPA middleware
 * and got index.html back, with no way to tell. All the work now lives in
 * handleOrderMirrorRequest, and both transports are wrappers over it.
 *
 * Environment needed in Vercel: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * Both are server-side only and must NOT be given a VITE_ prefix.
 */

import { handleOrderMirrorRequest } from '../../orderMirror';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Vercel parses JSON bodies for us, but a string arrives when the content
  // type is missing or unexpected; handleOrderMirrorRequest copes with either.
  const { status, body } = await handleOrderMirrorRequest(req.body);
  return res.status(status).json(body);
}
