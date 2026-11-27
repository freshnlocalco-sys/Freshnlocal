/**
 * WhatsApp OTP delivery for Supabase Auth.
 *
 * Supabase owns the whole OTP lifecycle -- it generates the code, stores it,
 * expires it, rate-limits requests, resists replay and issues the session.
 * This file is only the delivery pipe: Supabase calls the hook below with a
 * code it has already decided on, and we hand that code to InstantBroadcast to
 * put on WhatsApp.
 *
 * That split is the reason this provider works and Message Central did not.
 * Message Central insists on minting and validating its own codes, which means
 * the session has to be forged on our side afterwards. InstantBroadcast is a
 * pure sender, so none of that is necessary and none of the security-critical
 * parts are hand-rolled here.
 *
 * THE PROVIDER CONTRACT
 *
 * There is no public documentation for InstantBroadcast. The account serves an
 * OpenAPI spec at GET /api-docs.json (306 paths), but DO NOT TRUST IT: the
 * spec's fully documented `POST /api/send_templet` -- the only send path with
 * real descriptions, a required-field list and a response schema -- is not
 * mounted and answers "Cannot POST". The endpoint that actually takes a
 * template is not in the spec at all. All of the below was established by
 * probing the live API on 23 Nov 2026 with a deliberately nonexistent template
 * name, so nothing could be delivered.
 *
 *   POST /api/v2/send_templet
 *   { "sendTo": "+919…", "templetName": "…", "exampleArr": ["123456"],
 *     "token": "<JWT>" }
 *
 * The token travels in the BODY. A query-string token is rejected here with
 * "API keys not found", and no Authorization header is involved -- though the
 * read-only endpoints (/api/user/get_me) do accept a bearer header.
 *
 * How the endpoints actually divide up:
 *
 *   /api/v2/send_templet        templates. Token in body. THIS ONE.
 *   /api/v1/send_templet        answers identically, but the provider's own
 *                               error text says to use v2 "(balance is
 *                               deducted there)", which reads like v1 is a
 *                               legacy path that may not bill or deliver.
 *   /api/v1/send-message?token= free-form messages only, as a raw Meta message
 *                               object. Refuses templates outright: "Template
 *                               messages are not allowed on /send-message."
 *                               Useful later for order updates inside the
 *                               24-hour service window; useless for login,
 *                               because a cold number can only be reached by
 *                               template.
 *   /api/send_templet           not mounted.
 *   /api/send-message           not mounted.
 *
 * A valid send reaches Meta and comes back as
 *   {"success":false,"message":"Template \"…\" not found under WABA 453053869652978"}
 * when only the template is missing -- which is how we know the token
 * authenticates and the WhatsApp Business Account is live.
 *
 * `exampleArr` IS AN ARRAY. The v1 spec types it as a string, but that spec's
 * field types are plainly auto-generated stubs (every property is a string with
 * a "<field>_value" example). An array got through to Meta, which settles it.
 *
 * WHY exampleArr IS A ONE-ELEMENT ARRAY, AND WHY THAT MIGHT BITE
 *
 * exampleArr is the list of body variables, and it is the ONLY parameter slot
 * this endpoint exposes. Meta requires every AUTHENTICATION template to carry a
 * button and wants the code supplied twice -- once for the body, once for the
 * button -- and there is nowhere here to put the second one.
 *
 * Every escape route was checked and closed:
 *   - /api/v1/send-message takes a raw Meta message object, so it COULD express
 *     a full components array with a button parameter -- but it rejects
 *     template messages by name and points at /api/v2/send_templet.
 *   - /api/v2/send_templet rejects a raw messageObject ("API keys not found")
 *     and only understands the exampleArr shape.
 *   - /api/inbox/send_meta_templet does take {header, body, buttons}, but it
 *     requires a chatId -- an existing inbox conversation -- which a
 *     transactional OTP to an arbitrary number does not have.
 *
 * So an AUTHENTICATION template may approve and then fail at send time with
 * Meta error 132000 (parameter count mismatch), unless InstantBroadcast fills
 * the button parameter itself from the body variable. Several BSPs do exactly
 * that, precisely because of this; whether this one does cannot be established
 * without an approved template to send.
 *
 * Hence the buttonless UTILITY fallback, where one body variable IS the
 * complete parameter set. Both templates are in WHATSAPP_OTP_TEMPLATE.md, and
 * the name is an env var rather than a constant so switching between them is a
 * config change.
 */

import express, { type Express, type Request, type Response } from 'express';
import crypto from 'crypto';

// Read lazily, never captured at module load: server.ts calls dotenv.config()
// after its imports have evaluated. catalogueMirror.ts captured these in
// module-level consts and has reported itself unconfigured ever since.
// No fallback for the base URL. A default here would be a second place the
// provider's address lives, and the one that wins silently when the env var is
// missing or misspelt -- so a typo would keep working against the hardcoded
// host instead of failing where you can see it.
const IB_URL = () => (process.env.IB_API_URL || '').replace(/\/$/, '');
const IB_TOKEN = () => process.env.IB_API_TOKEN || '';
const IB_TEMPLATE = () => process.env.IB_OTP_TEMPLATE_NAME || '';
// The path is configurable because it has already moved once. The documented
// /api/send_templet is not mounted, /api/v1/send_templet is legacy, and the one
// that bills and delivers is v2 -- discovered only by probing. If the provider
// moves it again this is a config change, not a deploy.
const IB_SEND_PATH = () => process.env.IB_SEND_TEMPLATE_PATH || '/api/v2/send_templet';
const IB_LANG = () => process.env.IB_OTP_TEMPLATE_LANG || 'en';
// Whether the template carries a copy-code button. See the long note below:
// it decides whether the code is sent once or twice. Default true, because the
// approved template (`authentication1`) has one and Meta requires a button on
// every AUTHENTICATION template. Set false only for a buttonless UTILITY one.
const IB_TEMPLATE_HAS_BUTTON = () =>
  String(process.env.IB_OTP_TEMPLATE_HAS_BUTTON ?? 'true').toLowerCase() !== 'false';
const HOOK_SECRET = () => process.env.SUPABASE_SMS_HOOK_SECRET || '';

// How hard a single number may lean on the send endpoint. Enforced in the hook,
// which every delivery passes through, and backed by Postgres so it survives a
// redeploy and holds across serverless instances.
const MAX_SENDS = () => Number(process.env.OTP_MAX_SENDS || 3);
const WINDOW_MINUTES = () => Number(process.env.OTP_WINDOW_MINUTES || 15);
const BLOCK_MINUTES = () => Number(process.env.OTP_BLOCK_MINUTES || 15);

const SB_URL = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** True when a real WhatsApp message can actually be sent. */
export const otpDeliveryConfigured = (): boolean => !!IB_URL() && !!IB_TOKEN() && !!IB_TEMPLATE();

/**
 * E.164 with the leading plus, which is what `sendTo` wants.
 *
 * Supabase stores the phone as digits with no plus and with the country code
 * ('919876543210'). Customers typed theirs into Firestore every other way. Both
 * reduce to the same ten digits here, then get +91 put back on the front.
 *
 * Returns null for anything that is not an Indian mobile rather than sending to
 * a number we cannot vouch for. Mirrors web_normalise_phone() in
 * supabase_web_auth_user_id.sql and normalisePhone() in
 * scripts/mergeSharedPhoneAccounts.mjs -- if you change one, change all three.
 */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

export interface SendResult {
  ok: boolean;
  /** Set when the provider refused, for the log. Never shown to a customer. */
  error?: string;
  /** The provider's raw reply, kept for diagnosing a template mismatch. */
  providerResponse?: unknown;
  /**
   * Whether retrying this exact send could plausibly work.
   *
   * Supabase retries a hook up to three times on 429 or 503, so saying so is
   * worth something: a dropped connection or a provider blip gets another go
   * instead of failing a customer's login. A rejected template or a bad number
   * will fail identically every time, and retrying it just burns the 5-second
   * budget.
   */
  transient?: boolean;
  /**
   * We stopped waiting, but the provider had already accepted the send.
   *
   * Measured on 24 Nov 2026: a request aborted at 4 seconds still deducted
   * 0.15 from the InstantBroadcast balance and arrived on WhatsApp. The
   * comment that used to sit in the catch block below -- "nothing reached
   * Meta, so a retry is clean" -- was simply wrong, and acting on it is what
   * turns one slow send into three charges and three identical messages.
   *
   * So this is not `transient`. It means "probably delivered, do not retry".
   */
  uncertain?: boolean;
}

/**
 * Hand one code to InstantBroadcast.
 *
 * Deliberately says nothing about whether the number exists or has an account:
 * that belongs to Supabase, and leaking it here would turn the login form into
 * a phone-number oracle.
 */
export async function sendOtpViaWhatsApp(phone: string, code: string): Promise<SendResult> {
  const sendTo = toE164(phone);
  if (!sendTo) return { ok: false, error: `not an Indian mobile: ${mask(phone)}` };
  if (!IB_URL()) return { ok: false, error: 'IB_API_URL is not set' };
  if (!IB_TOKEN()) return { ok: false, error: 'IB_API_TOKEN is not set' };
  if (!IB_TEMPLATE()) return { ok: false, error: 'IB_OTP_TEMPLATE_NAME is not set' };

  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetch(`${IB_URL()}${IB_SEND_PATH()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 2.5 seconds. Supabase gives an HTTP hook FIVE seconds in TOTAL, and
      // that budget covers everything: the network hop to us, the throttle
      // round trip (measured median 490ms, spiking to 1.4s), this send, and
      // the hop back.
      //
      // 3.5s was tried first and overran: a real login on 24 Nov 2026 came
      // back `hook_timeout -- Failed to reach hook within maximum time of
      // 5.000000 seconds` while the WhatsApp message arrived anyway. The
      // customer got a code AND an error, which is the worst of both.
      //
      // A healthy send returns in ~1.5s, so this ceiling is rarely reached,
      // and reaching it costs nothing: see `uncertain` on SendResult. The
      // provider already has the request and bills and delivers it whatever we
      // do, so the only thing a longer wait buys is a more accurate log line --
      // paid for with the customer's login.
      signal: AbortSignal.timeout(2_500),
      body: JSON.stringify({
        sendTo,
        templetName: IB_TEMPLATE(),
        // THE CODE GOES IN TWICE, AND THAT IS NOT A TYPO.
        //
        // Meta requires a button on every AUTHENTICATION template and wants the
        // code supplied once for the body and once for the button. This
        // endpoint exposes only `exampleArr`, which reads like body variables
        // alone -- and with a single entry Meta rejects the send:
        //
        //   (#100) Invalid parameter
        //   button: Parameter 'text' is mandatory for component parameter
        //   type 'text' and cannot be empty
        //
        // So InstantBroadcast does build the button component, it just has
        // nothing to put in it. exampleArr turns out to be positional across
        // ALL components, not only the body: [body, button]. With the code
        // twice, Meta accepts it (messageType "authentication").
        //
        // Established 24 Nov 2026 by sending both shapes at the live API. A
        // buttonless UTILITY template needs one entry instead, hence the flag.
        exampleArr: IB_TEMPLATE_HAS_BUTTON() ? [code, code] : [code],
        token: IB_TOKEN(),
      }),
    });
  } catch (e) {
    // A timeout and a failure to connect are NOT the same thing, and treating
    // them alike is expensive.
    //
    // Timed out: the provider accepted the request and is still working on it.
    // Proven on 24 Nov 2026 -- a send aborted at 4s was billed and delivered
    // anyway. Retrying charges a second time and sends a second copy.
    //
    // Refused, DNS, TLS: nothing ever arrived, and a retry is genuinely clean.
    const name = e instanceof Error ? e.name : '';
    const timedOut = name === 'TimeoutError' || name === 'AbortError';
    return {
      ok: false,
      transient: !timedOut,
      uncertain: timedOut,
      error: `provider ${timedOut ? 'timed out' : 'unreachable'}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const text = await res.text().catch(() => '');
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* keep the text */ }

  // The provider answers 200 with {"success":false,...} for a bad template or
  // an expired token, so the status code alone is not the answer.
  const ok = res.ok && body?.success !== false && body?.success !== 0;
  if (!ok) {
    // A 5xx or a rate-limit from the provider might pass on a retry. A 4xx, or
    // a 200 carrying success:false, is a verdict -- a missing template, an
    // unapproved number, a spent balance -- and will say the same thing again.
    const transient = res.status >= 500 || res.status === 429;
    return {
      ok: false,
      transient,
      error: `provider refused (HTTP ${res.status}): ${typeof body === 'string' ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300)}`,
      providerResponse: body,
    };
  }
  return { ok: true, providerResponse: body };
}

/** Last four digits only -- an OTP log must not become a phone book. */
const mask = (p: string | null | undefined) => (p ? `...${String(p).slice(-4)}` : '(none)');

/** The bare 10 digits, which is the key web_otp_sends is bucketed by. */
const bareMobile = (phone: string): string => (toE164(phone) || '').replace(/^\+91/, '');

export interface Allowance {
  allowed: boolean;
  /** Seconds until this number may ask again. Only meaningful when refused. */
  retryAfterSeconds?: number;
  remaining?: number;
  reason?: string;
}

/**
 * How many more codes this number may ask for.
 *
 * Enforced here rather than in the browser because this is the only place every
 * delivery must pass: the customer's "send me a code" request goes straight to
 * Supabase and our server never sees it. The countdown in the UI is courtesy;
 * this is the rule.
 *
 * FAIL OPEN, deliberately. If the throttle is unreachable -- the migration not
 * run, the database briefly down -- this returns allowed and logs loudly. The
 * alternative is that a Postgres hiccup locks every customer out of their
 * account, and this is abuse mitigation, not authentication. Supabase's own
 * per-project SMS cap and per-number interval remain as a backstop underneath.
 * Contrast the hook secret, which fails CLOSED: that one is authentication.
 *
 * @param commit false to ask without spending the allowance.
 */
export async function checkSendAllowance(phone: string, commit: boolean): Promise<Allowance> {
  const bare = bareMobile(phone);
  if (!bare) return { allowed: false, reason: 'not an Indian mobile' };

  if (!SB_URL() || !SB_KEY()) {
    console.error('[OTP] throttle unavailable (Supabase env missing); allowing the send.');
    return { allowed: true, reason: 'throttle unavailable' };
  }

  try {
    const res = await fetch(`${SB_URL()}/rest/v1/rpc/web_otp_throttle`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY(),
        Authorization: `Bearer ${SB_KEY()}`,
        'Content-Type': 'application/json',
      },
      // Well inside Supabase's 5s hook budget, and short enough that a slow
      // database degrades to "allowed" rather than eating the whole window.
      signal: AbortSignal.timeout(1_500),
      body: JSON.stringify({
        p_phone: bare,
        p_max: MAX_SENDS(),
        p_window_seconds: Math.round(WINDOW_MINUTES() * 60),
        p_block_seconds: Math.round(BLOCK_MINUTES() * 60),
        p_commit: commit,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[OTP] throttle call failed (${res.status}): ${body.slice(0, 200)} -- allowing the send.`);
      return { allowed: true, reason: 'throttle unavailable' };
    }

    const v = (await res.json()) as {
      allowed?: boolean; retry_after_seconds?: number; remaining?: number; reason?: string;
    };
    return {
      allowed: v?.allowed !== false,
      retryAfterSeconds: v?.retry_after_seconds,
      remaining: v?.remaining,
      reason: v?.reason,
    };
  } catch (err) {
    console.error(
      `[OTP] throttle unreachable (${err instanceof Error ? err.message : String(err)}); allowing the send.`
    );
    return { allowed: true, reason: 'throttle unavailable' };
  }
}

/**
 * Verify a Supabase auth hook signature (the Standard Webhooks scheme).
 *
 * Without this the endpoint is an open relay: anyone could POST a phone number
 * and a code of their choosing and we would send it, which is both a way to
 * burn the client's WhatsApp quota and a way to phish their customers with a
 * message that genuinely comes from Fresh N Local.
 *
 * The secret arrives from Supabase as 'v1,whsec_<base64>'. The signed payload
 * is '<id>.<timestamp>.<body>' and the header may carry several
 * space-separated signatures, so any one matching is a pass.
 */
export function verifyHookSignature(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  secret: string,
  toleranceSeconds = 300
): { ok: boolean; reason?: string } {
  const h = (k: string) => {
    const v = headers[k] ?? headers[k.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  };
  const id = h('webhook-id');
  const ts = h('webhook-timestamp');
  const sig = h('webhook-signature');
  if (!id || !ts || !sig) return { ok: false, reason: 'missing webhook-id/timestamp/signature' };

  // Reject a replay of a captured request before spending any CPU on HMAC.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
  if (!Number.isFinite(age) || age > toleranceSeconds) {
    return { ok: false, reason: `timestamp outside ${toleranceSeconds}s tolerance` };
  }

  const key = Buffer.from(secret.replace(/^v1,/, '').replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${rawBody}`).digest('base64');

  for (const part of String(sig).split(' ')) {
    const candidate = part.startsWith('v1,') ? part.slice(3) : part;
    const a = Buffer.from(candidate);
    const b = Buffer.from(expected);
    // timingSafeEqual throws on a length mismatch, so check that first.
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return { ok: true };
  }
  return { ok: false, reason: 'no signature matched' };
}

/**
 * POST /api/auth/sms-hook -- the URL to paste into
 * Supabase -> Authentication -> Hooks -> Send SMS.
 *
 * Supabase sends { user: { phone, ... }, sms: { otp } } and reads only the
 * status code: 2xx means delivered, anything else means the login attempt
 * failed and the customer is told to try again.
 *
 * Needs the raw body for the signature, so it is mounted with its own
 * express.raw() and must be registered BEFORE app.use(express.json()) has a
 * chance to consume the stream -- registerOtpHook does that for you.
 */
/**
 * The hook's work, with no transport attached.
 *
 * Both callers hand it the EXACT bytes Supabase signed, and that is the entire
 * reason this is no longer written as an Express handler. The signature covers
 * the raw body, and every convenience that parses JSON for you destroys it --
 * `express.json()` here, and Vercel's own body helper in production.
 * Re-serialising a parsed object does not reproduce the original bytes: one
 * reordered key or one dropped space is the difference between a verified
 * request and "bad signature", with nothing in the payload to show for it.
 *
 * Returns a plain result rather than writing a response, so server.ts and
 * api/auth/sms-hook.ts can each render it their own way. `retryAfter` is the
 * one header that carries meaning: Supabase retries a 503 only when it is
 * present and non-empty.
 */
export interface HookResult {
  status: number;
  body: unknown;
  retryAfter?: boolean;
}

export async function handleSmsHook(
  raw: string,
  headers: Record<string, string | string[] | undefined>
): Promise<HookResult> {
  const secret = HOOK_SECRET();
  if (!secret) {
    // Fail closed. An unsigned hook is an open WhatsApp relay.
    console.error('[OTP] SUPABASE_SMS_HOOK_SECRET is not set; refusing to send.');
    return { status: 500, body: { error: { http_code: 500, message: 'hook not configured' } } };
  }

  const check = verifyHookSignature(raw, headers, secret);
  if (!check.ok) {
    console.warn(`[OTP] rejected unsigned request: ${check.reason}`);
    return { status: 401, body: { error: { http_code: 401, message: 'bad signature' } } };
  }

  let payload: any;
  try { payload = JSON.parse(raw); } catch {
    return { status: 400, body: { error: { http_code: 400, message: 'bad json' } } };
  }

  const phone: string | undefined = payload?.user?.phone;
  const code: string | undefined = payload?.sms?.otp;
  if (!phone || !code) {
    return { status: 400, body: { error: { http_code: 400, message: 'missing user.phone or sms.otp' } } };
  }

  // Has this number asked too often? Counted HERE, in ONE round trip, and
  // deliberately not counted again after the send.
  //
  // This used to check with commit=false and commit afterwards, so a send that
  // failed cost the customer nothing. That is the kinder rule and it is gone on
  // purpose: each call is a round trip to Supabase (measured median 490ms,
  // spiking to 1.4s) and two of those plus a send does not reliably fit inside
  // the five seconds Supabase allows a hook. Overrunning the budget fails the
  // login outright, which is worse for the customer than occasionally spending
  // one of three attempts on a send that did not land.
  const allowance = await checkSendAllowance(phone, true);

  if (!allowance.allowed && allowance.reason === 'not an Indian mobile') {
    // Not a throttle refusal at all, and it must not borrow the throttle's
    // words. Supabase validates E.164 but not the country, so a perfectly real
    // foreign number reaches here and used to be told "too many code requests;
    // please wait" -- untrue, and nothing the caller can act on.
    console.warn(`[OTP] refused ${mask(phone)}: not an Indian mobile`);
    return { status: 400, body: { error: { http_code: 400, message: 'not an Indian mobile number' } } };
  }

  if (!allowance.allowed) {
    const wait = allowance.retryAfterSeconds ?? BLOCK_MINUTES() * 60;
    console.warn(`[OTP] refused ${mask(phone)}: ${allowance.reason}; ${wait}s to wait`);
    // 500, not 429. Supabase retries a 429 three times, and this is a
    // deliberate refusal that will say the same thing each time -- the retries
    // would just burn the hook's five-second budget.
    return {
      status: 500,
      body: { error: { http_code: 500, message: 'too many code requests; please wait' } },
    };
  }

  // Before Meta approves a template nothing can be delivered and the whole
  // login flow would be untestable. So in development, with no template
  // configured, log the code and report success. Gated on NODE_ENV so this can
  // never silently swallow a production OTP.
  if (!otpDeliveryConfigured()) {
    if (process.env.NODE_ENV !== 'production') {
      // The allowance was already spent above, so the lockout is still
      // exercised end to end in development -- without a second round trip.
      console.warn(
        `[OTP] DEV ONLY -- no template configured, nothing sent.\n` +
        `[OTP] code for ${mask(phone)} is ${code}` +
        (allowance.remaining !== undefined ? ` (${allowance.remaining} left before lockout)` : '')
      );
      return { status: 200, body: {} };
    }
    console.error('[OTP] delivery not configured in production; OTP not sent.');
    return { status: 500, body: { error: { http_code: 500, message: 'delivery not configured' } } };
  }

  const result = await sendOtpViaWhatsApp(phone, code);
  if (!result.ok) {
    // Logged in full, returned vague: the customer gets "try again", and the
    // reason stays in our logs.
    console.error(`[OTP] send to ${mask(phone)} failed: ${result.error}`);

    if (result.uncertain) {
      // We stopped waiting; the provider did not stop working. Answering 503
      // would have Supabase retry up to three times, and each retry bills again
      // and puts another copy of the same code on the customer's WhatsApp --
      // while still showing them an error for a message they are holding in
      // their hand. 200 is the honest answer to "probably delivered": if it
      // truly did not arrive, the customer taps resend, which is one tap and
      // one charge rather than three.
      console.warn(
        `[OTP] ${mask(phone)}: gave up waiting on the provider; ` +
        `treating as sent, NOT retrying`
      );
      return { status: 200, body: {} };
    }

    if (result.transient) {
      // 503 is one of only two codes Supabase will retry (the other is 429),
      // and it needs a non-empty retry-after header to do it.
      return {
        status: 503,
        retryAfter: true,
        body: { error: { http_code: 503, message: 'delivery temporarily unavailable' } },
      };
    }

    // Anything else is final. Deliberately not 400 or 403: Supabase turns both
    // of those into a 500 anyway.
    return { status: 500, body: { error: { http_code: 500, message: 'could not deliver the code' } } };
  }

  // Delivered. The allowance was spent before the send, in one round trip, so
  // there is nothing left to do here but say so.
  console.log(
    `[OTP] sent to ${mask(phone)} via template ${IB_TEMPLATE()}` +
      (allowance.remaining !== undefined ? ` (${allowance.remaining} left before lockout)` : '')
  );
  return { status: 200, body: {} };
}

/**
 * POST /api/auth/sms-hook -- the LOCAL DEVELOPMENT transport.
 *
 * server.ts is not deployed (see api/orders/mirror.ts, which says so). The
 * production transport is api/auth/sms-hook.ts, and both are thin wrappers
 * over handleSmsHook above. If you add behaviour, add it there or only half
 * your customers get it.
 *
 * express.raw is what keeps the bytes intact, and server.ts registers this
 * BEFORE express.json() for the same reason.
 */
export function registerOtpHook(app: Express): void {
  app.post(
    '/api/auth/sms-hook',
    express.raw({ type: '*/*', limit: '64kb' }),
    async (req: Request, res: Response) => {
      const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');
      const result = await handleSmsHook(raw, req.headers as any);
      if (result.retryAfter) res.setHeader('retry-after', 'true');
      return res.status(result.status).json(result.body);
    }
  );

  console.log(
    otpDeliveryConfigured()
      ? `[OTP] WhatsApp delivery ready (template ${IB_TEMPLATE()}).`
      : '[OTP] No IB_OTP_TEMPLATE_NAME set. In development the code is logged, not sent.'
  );
}
