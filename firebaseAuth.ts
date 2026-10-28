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

import firebaseConfig from './firebase-applet-config.json';

const cfg = firebaseConfig as Record<string, string>;

export interface CallerLookup {
  uid: string | null;
  /** Why there is no uid -- for logs, never for the response body. */
  reason?: string;
}

/**
 * The caller's uid, or null with a reason.
 *
 * Callers must report every null the same way to the browser ("not signed in").
 * Distinguishing "expired" from "not ours" to an unauthenticated caller tells
 * them which tokens exist, and nothing they could do about it differs.
 */
export async function lookupCaller(idToken: string): Promise<CallerLookup> {
  const token = String(idToken ?? '').trim();
  if (!token) return { uid: null, reason: 'no token supplied' };
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
