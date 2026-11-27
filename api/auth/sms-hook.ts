/**
 * POST /api/auth/sms-hook -- the PRODUCTION transport for Supabase's Send SMS
 * hook.
 *
 * On Vercel this project is a static SPA plus serverless functions in api/;
 * server.ts is the local development server and is NOT deployed. Without this
 * file the hook URL answers with index.html in production and every customer
 * login fails -- which is exactly the gap api/orders.ts documents, in
 * the opposite direction.
 *
 * WHY bodyParser IS OFF
 *
 * The Standard Webhooks signature is an HMAC over `<id>.<timestamp>.<body>`,
 * where body is the exact byte sequence Supabase sent. Vercel's Node helper
 * parses JSON for you and hands you an object; JSON.stringify of that object
 * is NOT guaranteed to reproduce those bytes -- key order, whitespace and
 * number formatting are all free to differ. Verification would then fail on
 * perfectly genuine requests, intermittently, with nothing in the payload to
 * explain it. So the body is read off the stream, unparsed.
 *
 * Environment needed in Vercel (server-side only, NO VITE_ prefix):
 *   SUPABASE_SMS_HOOK_SECRET   the v1,whsec_... secret from the dashboard hook
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   for the send throttle
 *   IB_API_URL, IB_API_TOKEN, IB_OTP_TEMPLATE_NAME   InstantBroadcast
 *
 * The hook URL to register in Supabase is
 *   https://<your-domain>/api/auth/sms-hook
 */

import { handleSmsHook } from '../../whatsappOtp.js';

export const config = {
  api: {
    // See "WHY bodyParser IS OFF" above. Do not turn this back on.
    bodyParser: false,
  },
};

/** Collect the request body without parsing it. */
function readRawBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    // Already buffered by a transport that ignored the config above: use it,
    // but only when it is genuinely raw bytes. A parsed object cannot be
    // turned back into the bytes that were signed, so do not pretend.
    if (Buffer.isBuffer(req.body)) return resolve(req.body.toString('utf8'));
    if (typeof req.body === 'string') return resolve(req.body);

    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (c: Buffer) => {
      total += c.length;
      // Supabase's payload is a few hundred bytes. Anything near this is not
      // one, and an unbounded read on an unauthenticated endpoint is a way to
      // be knocked over.
      if (total > 64 * 1024) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { http_code: 405, message: 'Method Not Allowed' } });
  }

  let raw: string;
  try {
    raw = await readRawBody(req);
  } catch (e) {
    console.error('[OTP] could not read hook body:', e instanceof Error ? e.message : String(e));
    return res.status(400).json({ error: { http_code: 400, message: 'bad request body' } });
  }

  const result = await handleSmsHook(raw, req.headers || {});
  // Supabase retries a 503 only when retry-after is present and non-empty.
  if (result.retryAfter) res.setHeader('retry-after', 'true');
  return res.status(result.status).json(result.body);
}
