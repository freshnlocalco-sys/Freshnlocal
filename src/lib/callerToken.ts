/**
 * The token that proves who the caller is, whichever way they signed in.
 *
 * Customers hold a Supabase access token (phone + WhatsApp OTP); staff hold a
 * Firebase ID token (email+password). Both are accepted by lookupCaller() on
 * the server, which resolves either to a web_users.id.
 *
 * Every client call that posts an `idToken` to our own API should get it from
 * here. Reading `auth.currentUser` directly is now a bug: for a signed-in
 * customer it is null, and the call fails with "not signed in" while the
 * customer is looking at their own name in the header.
 *
 * The field is still called `idToken` on the wire. Renaming it would mean a
 * flag day where an old browser tab posts `idToken` to a server that only
 * reads `token`, and every one of those tabs is someone's checkout.
 */

import { auth } from './firebase';
import { supabase } from './supabase';

export interface CallerToken {
  token: string | null;
  /** Why there is no token. For logs and for the caller's own `reason`. */
  reason?: string;
}

export async function getCallerToken(): Promise<CallerToken> {
  // Supabase first. After the cutover almost every caller is a customer, and
  // this is a local read of an already-cached session, where getIdToken() can
  // go to the network to refresh.
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) return { token };
    } catch (err) {
      // Fall through to Firebase rather than failing: a staff member with a
      // broken Supabase session should still be able to work.
      console.warn('[AUTH] could not read the Supabase session:', err);
    }
  }

  const user = auth.currentUser;
  if (user) {
    try {
      return { token: await user.getIdToken() };
    } catch (err) {
      return {
        token: null,
        reason: `could not get a sign-in token: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return { token: null, reason: 'not signed in' };
}
