/**
 * Who is calling, according to Google.
 *
 * Firebase is being kept for one job -- signing people in -- and dropped for
 * everything else. That makes this the seam: the browser presents the Firebase
 * ID token it already holds, the server asks Google whose it is, and from that
 * point on the request is identified by a uid and the data lives in Supabase.
 *
 * Every endpoint that replaces a Firestore call goes through here, so there is
 * one place that decides what counts as a signed-in customer, and one place to
 * change when sign-in itself eventually moves to Supabase Auth.
 *
 * Validation is Google's, not ours. accounts:lookup rejects a token that is
 * expired, revoked, malformed, or from another Firebase project, and we do not
 * attempt to read or trust the token's own claims.
 */

import firebaseConfig from './firebaseServerConfig.js';

const cfg = firebaseConfig as Record<string, string>;

export interface CallerLookup {
  uid: string | null;
  /** Why there is no uid -- for logs, never for the response body. */
  reason?: string;
}

// --- Supabase Auth -----------------------------------------------------------
//
// "one place to change when sign-in itself eventually moves to Supabase Auth"
// -- that moment arrived. Customers now sign in with phone + WhatsApp OTP and
// hold a SUPABASE access token; staff still hold a Firebase one. Both have to
// resolve to the same thing: a web_users.id.
//
// Read lazily, per the convention the rest of the server follows: server.ts
// calls dotenv.config() after its imports evaluate.
const SB_URL = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Which issuer minted this token.
 *
 * The payload is decoded WITHOUT verifying it, and that is safe because the
 * answer is used only to pick which issuer to ask. Both branches below then
 * validate authoritatively against that issuer, exactly as the Firebase path
 * always has. A forged `iss` buys nothing: claiming to be a Supabase token
 * means Supabase gets asked, and Supabase says no.
 */
function issuerOf(token: string): 'firebase' | 'supabase' | 'unknown' {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] || '', 'base64url').toString('utf8')
    ) as { iss?: string };
    const iss = String(payload.iss || '');
    if (iss.includes('securetoken.google.com')) return 'firebase';
    if (iss.includes('/auth/v1') || iss.includes('supabase')) return 'supabase';
  } catch {
    // Not a readable JWT. Fall through; the Firebase path will reject it.
  }
  return 'unknown';
}

/**
 * A Supabase caller's storefront uid.
 *
 * Two steps, and both matter:
 *
 *   1. Ask Supabase whose token this is (GET /auth/v1/user). Validation is
 *      Supabase's, not ours -- the same stance the Firebase branch takes with
 *      Google. We never read the token's own claims to decide identity.
 *   2. Map that auth.users id to web_users.id through auth_user_id, which the
 *      login trigger set. Orders, addresses and points are all keyed on
 *      web_users.id, so this is what the rest of the server needs.
 *
 * Step 2 returning nothing is a real state, not an error: a session whose
 * number matched several accounts (the owner's own staff number) is linked to
 * none of them deliberately. It is "not signed in" as far as the storefront is
 * concerned, which is also what RLS would conclude.
 */
async function lookupSupabaseCaller(token: string): Promise<CallerLookup> {
  if (!SB_URL() || !SB_KEY()) {
    return { uid: null, reason: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set' };
  }

  let authUserId: string | null = null;
  try {
    const r = await fetch(`${SB_URL()}/auth/v1/user`, {
      headers: { apikey: SB_KEY(), Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return { uid: null, reason: `supabase auth ${r.status} ${body.slice(0, 160)}` };
    }
    const body = (await r.json()) as { id?: string };
    authUserId = body?.id ?? null;
  } catch (err) {
    // Same reasoning as the Firebase branch: a network failure is not evidence
    // that the customer is signed out, but there is still no safe way on.
    return {
      uid: null,
      reason: `supabase auth unreachable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!authUserId) return { uid: null, reason: 'supabase token carried no user id' };

  try {
    // role=customer is the security boundary, not a filter for tidiness.
    //
    // A WhatsApp code proves possession of a phone and nothing more, so it may
    // only ever act as a CUSTOMER. Linking already refuses staff accounts, but
    // a role can change after the link is made -- on 26 Nov 2026 a customer
    // account linked to a phone was promoted to admin by hand, and from then on
    // that phone's WhatsApp code opened every admin endpoint here, no password
    // involved. Staff authenticate through the Firebase branch above, with
    // email and password. The database enforces the same rule in
    // web_firebase_uid() (supabase_web_otp_customer_only.sql); this is the copy
    // for the endpoints that read with the service role and so bypass RLS.
    const r = await fetch(
      `${SB_URL()}/rest/v1/web_users` +
        `?select=id&auth_user_id=eq.${encodeURIComponent(authUserId)}` +
        `&role=eq.customer&is_deleted=eq.false&limit=1`,
      { headers: { apikey: SB_KEY(), Authorization: `Bearer ${SB_KEY()}` } }
    );
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return { uid: null, reason: `web_users lookup ${r.status} ${body.slice(0, 160)}` };
    }
    const rows = (await r.json()) as Array<{ id?: string }>;
    const uid = rows?.[0]?.id ?? null;
    return uid
      ? { uid }
      : { uid: null, reason: `no live CUSTOMER row linked to auth user ${authUserId} (staff must sign in with email)` };
  } catch (err) {
    return {
      uid: null,
      reason: `web_users lookup failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * The caller's uid, or null with a reason.
 *
 * Accepts EITHER a Supabase access token (customers, phone + WhatsApp OTP) or
 * a Firebase ID token (staff, email+password), and returns a web_users.id
 * either way. Every endpoint that replaced a Firestore call goes through here,
 * so adding the second token type is one change rather than one per endpoint.
 *
 * Callers must report every null the same way to the browser ("not signed in").
 * Distinguishing "expired" from "not ours" to an unauthenticated caller tells
 * them which tokens exist, and nothing they could do about it differs.
 */
export async function lookupCaller(idToken: string): Promise<CallerLookup> {
  const token = String(idToken ?? '').trim();
  if (!token) return { uid: null, reason: 'no token supplied' };

  if (issuerOf(token) === 'supabase') return lookupSupabaseCaller(token);

  if (!cfg.apiKey) return { uid: null, reason: 'firebase apiKey missing from config' };

  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${cfg.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      },
    );
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return { uid: null, reason: `identitytoolkit ${r.status} ${body.slice(0, 160)}` };
    }
    const body = (await r.json()) as { users?: Array<{ localId?: string; email?: string; displayName?: string }> };
    const uid = body.users?.[0]?.localId ?? null;
    return uid ? { uid } : { uid: null, reason: 'token carried no uid' };
  } catch (err) {
    // A network failure here must not read as "this customer is not signed in",
    // because the caller may well be. It is still a null uid -- there is no safe
    // way to proceed -- but the reason says it was us, not them.
    return { uid: null, reason: `identitytoolkit unreachable: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** The uid alone, for callers that do not need the reason. */
export async function uidFromIdToken(idToken: string): Promise<string | null> {
  return (await lookupCaller(idToken)).uid;
}

/** The Firestore REST base for this project, for the endpoints still reading it. */
export const firestoreDocsBase = (): string => {
  const dbId = cfg.firestoreDatabaseId || 'ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67';
  return `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${dbId}/documents`;
};
