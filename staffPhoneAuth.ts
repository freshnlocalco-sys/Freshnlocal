/**
 * Staff phone sign-in: trade a FRESH WhatsApp sign-in for the staff member's
 * ordinary Firebase session.
 *
 * WHY IT WORKS THIS WAY
 *
 * Staff live on Firebase: the Admin Portal reads Firestore, and Firestore only
 * admits a Firebase sign-in. A WhatsApp code produces a SUPABASE session, which
 * Firestore ignores. So the code is used purely as proof of the phone, and this
 * endpoint hands back a Firebase custom token for the ONE staff account on that
 * number. The browser signs into Firebase with it and gets exactly the session
 * an email+password sign-in gives: same uid, same Firestore rules, same Admin
 * Portal. Email+password keeps working alongside it.
 *
 * What it deliberately does NOT do: grant anything in Supabase. web_firebase_uid()
 * still resolves a Supabase phone session to customers only
 * (supabase_web_otp_customer_only.sql), so a WhatsApp session on its own is never
 * an admin there. Admin power only ever arrives through Firebase.
 *
 * SAFEGUARDS
 * - The Supabase session must come from a code entered in the last
 *   FRESH_SECONDS (from the token's `amr` claim). A phone session left lying
 *   around cannot be turned into a staff session later.
 * - Exactly one live staff account may own the number. A shared number (one
 *   number is still on seven accounts) is refused, never guessed.
 * - The Firebase account must already exist and not be disabled: this never
 *   creates a Firebase user.
 * - Every exchange is logged as an audit line.
 *
 * Needs FIREBASE_SERVICE_ACCOUNT (the service-account JSON, Sensitive). Without
 * it the endpoint answers 503 and the sign-in form falls back to "use email".
 */

import type { App } from 'firebase-admin/app';
import { STAFF_ROLES, normalisePhone } from './phoneRules.js';
export { STAFF_ROLES, normalisePhone };

// firebase-admin is loaded only when a staff exchange actually happens, and a
// failure to load it is answered as "staff sign-in unavailable" instead of
// crashing the function. Nothing else in api/account.ts may depend on it.
async function firebaseAdmin() {
  try {
    const [app, auth] = await Promise.all([import('firebase-admin/app'), import('firebase-admin/auth')]);
    return { ...app, getAuth: auth.getAuth };
  } catch (err) {
    console.error('[STAFF-PHONE] firebase-admin could not be loaded:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

const SB_URL = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PROJECT_ID = 'freshnlocal-4a420';
const FRESH_SECONDS = 10 * 60;
const ADMIN_APP_NAME = 'staff-phone-signin';


type Reply = { status: number; body: unknown };


export interface StaffRow {
  id: string;
  email: string | null;
  role: string;
  phone: string | null;
  is_deleted?: boolean | null;
}

/** Which staff account owns this phone. Pure, so it is tested directly. */
export function pickStaffAccount(
  rows: StaffRow[],
  phone: string
): { row: StaffRow } | { reason: 'bad-phone' | 'none' | 'ambiguous'; count: number } {
  const n = normalisePhone(phone);
  if (!n) return { reason: 'bad-phone', count: 0 };
  const hits = rows.filter(
    r => !r.is_deleted && (STAFF_ROLES as readonly string[]).includes(r.role) && normalisePhone(r.phone) === n
  );
  if (hits.length === 1) return { row: hits[0] };
  return { reason: hits.length ? 'ambiguous' : 'none', count: hits.length };
}

/**
 * Seconds since the one-time code behind this session was entered, or null if
 * the session was not made with one. Reads the `amr` claim. Only called AFTER
 * Supabase has validated the token, so decoding without re-verifying is safe.
 */
export function otpAgeSeconds(accessToken: string, nowSeconds = Date.now() / 1000): number | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'));
    const stamps = (Array.isArray(payload?.amr) ? payload.amr : [])
      .filter((a: any) => a?.method === 'otp' || a?.method === 'sms')
      .map((a: any) => Number(a.timestamp))
      .filter(Number.isFinite);
    return stamps.length ? nowSeconds - Math.max(...stamps) : null;
  } catch {
    return null;
  }
}

const mask = (p: string | null | undefined) => (p ? `...${String(p).slice(-4)}` : '(none)');

let warnedConfig = false;
async function adminApp(): Promise<{ app: App; getAuth: (a: App) => any } | null> {
  const fa = await firebaseAdmin();
  if (!fa) return null;
  const { initializeApp, cert, getApps, getAuth } = fa;
  const existing = getApps().find(a => a.name === ADMIN_APP_NAME);
  if (existing) return { app: existing, getAuth };
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  let sa: any;
  try {
    sa = JSON.parse(raw);
  } catch {
    if (!warnedConfig) console.error('[STAFF-PHONE] FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
    warnedConfig = true;
    return null;
  }
  if (sa?.project_id !== PROJECT_ID) {
    if (!warnedConfig) console.error(`[STAFF-PHONE] service account is for "${sa?.project_id}", not ${PROJECT_ID}.`);
    warnedConfig = true;
    return null;
  }
  return { app: initializeApp({ credential: cert(sa) }, ADMIN_APP_NAME), getAuth };
}

export const staffPhoneConfigured = (): boolean =>
  !!SB_URL() && !!SB_KEY() && !!process.env.FIREBASE_SERVICE_ACCOUNT;

/** POST /api/admin/staff-token  { accessToken } -> { customToken } */
export async function handleStaffToken(rawBody: unknown): Promise<Reply> {
  const body = typeof rawBody === 'string'
    ? (() => { try { return JSON.parse(rawBody); } catch { return {}; } })()
    : ((rawBody ?? {}) as Record<string, any>);

  const accessToken = String(body.accessToken ?? '');
  if (!accessToken) return { status: 401, body: { error: 'Not signed in.' } };
  if (!SB_URL() || !SB_KEY()) return { status: 503, body: { error: 'Staff phone sign-in is not set up.' } };

  // 1. Is this a genuine, current Supabase session? Supabase validates it.
  let user: { id?: string; phone?: string } | null = null;
  try {
    const r = await fetch(`${SB_URL()}/auth/v1/user`, {
      headers: { apikey: SB_KEY(), Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (r.ok) user = await r.json();
  } catch {
    return { status: 503, body: { error: 'Could not check the sign-in. Please try again.' } };
  }
  if (!user?.id || !user.phone) return { status: 401, body: { error: 'Not signed in.' } };

  // 2. Was it made with a code entered just now?
  const age = otpAgeSeconds(accessToken);
  if (age === null || age < -60 || age > FRESH_SECONDS) {
    console.warn(`[STAFF-PHONE] refused ${mask(user.phone)}: sign-in not from a fresh code (age ${age})`);
    return { status: 403, body: { error: 'Please request a new code and try again.' } };
  }

  // 3. Which staff account owns this number?
  let rows: StaffRow[] = [];
  try {
    const r = await fetch(
      `${SB_URL()}/rest/v1/web_users?select=id,email,role,phone,is_deleted` +
        `&role=in.(${STAFF_ROLES.join(',')})&is_deleted=eq.false`,
      { headers: { apikey: SB_KEY(), Authorization: `Bearer ${SB_KEY()}` }, signal: AbortSignal.timeout(5_000) }
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    rows = await r.json();
  } catch (err) {
    console.error('[STAFF-PHONE] staff lookup failed:', err instanceof Error ? err.message : String(err));
    return { status: 503, body: { error: 'Could not check the sign-in. Please try again.' } };
  }

  const pick = pickStaffAccount(rows, user.phone);
  if (!('row' in pick)) {
    if (pick.reason === 'ambiguous') {
      console.warn(`[STAFF-PHONE] refused ${mask(user.phone)}: number is on ${pick.count} staff accounts`);
      return { status: 409, body: { error: 'shared', message: 'This number is on more than one staff account. Please sign in with your email.' } };
    }
    return { status: 404, body: { error: 'not-staff' } };
  }

  // 4. Mint the Firebase session for that one account.
  // Not configured (no key) or firebase-admin unavailable: answered the same,
  // and only for a number that IS staff, so customers are never affected.
  const admin = process.env.FIREBASE_SERVICE_ACCOUNT ? await adminApp() : null;
  const app = admin?.app ?? null;
  // 'staff-unavailable' tells the website this IS a staff number, so it shows
  // "use email" rather than offering a customer registration.
  if (!app) return { status: 503, body: { error: 'staff-unavailable' } };
  const fbAuth = admin!.getAuth(app);
  try {
    const fbUser = await fbAuth.getUser(pick.row.id);
    if (fbUser.disabled) {
      console.warn(`[STAFF-PHONE] refused ${pick.row.id}: Firebase account disabled`);
      return { status: 403, body: { error: 'This staff account is disabled.' } };
    }
  } catch {
    console.warn(`[STAFF-PHONE] refused ${pick.row.id}: no Firebase account with that id`);
    return { status: 404, body: { error: 'not-staff' } };
  }

  const customToken = await fbAuth.createCustomToken(pick.row.id, { signInMethod: 'whatsapp-otp' });
  console.warn(JSON.stringify({
    event: 'staff.phone_signin', at: new Date().toISOString(),
    uid: pick.row.id, role: pick.row.role, phone: mask(user.phone), supabase_user: user.id,
  }));
  return { status: 200, body: { customToken } };
}
