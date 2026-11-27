/**
 * Customer sign-in: phone number + a one-time code over WhatsApp.
 *
 * This replaces email+password for customers. Staff keep Firebase
 * email+password (see src/lib/firebase.ts) because none of the four staff
 * accounts has a phone number on file, and they are the accounts that gate
 * AdminDashboard.
 *
 * WHO GENERATES THE CODE
 *
 * Supabase does. It stores it, expires it, rate-limits requests for it,
 * resists replay and issues the session on success. Nothing in this file holds
 * a code or decides whether one is correct. The server's
 * /api/auth/sms-hook (whatsappOtp.ts) is handed Supabase's code and does
 * nothing but put it on WhatsApp.
 *
 * That matters for more than tidiness: a hand-rolled OTP is where this kind of
 * feature usually goes wrong -- codes that do not expire, attempts that are not
 * counted, comparisons that leak timing, sessions minted on the client. None of
 * that is reachable from here, because none of it lives here.
 *
 * HOW AN OTP FINDS AN EXISTING ACCOUNT
 *
 * It does not, from here. On the first successful login Supabase inserts a row
 * into auth.users, and a Postgres trigger
 * (supabase_web_auth_user_id.sql -> web_link_auth_user) matches the phone to
 * the existing web_users row and writes web_users.auth_user_id. Every order,
 * address, review and point balance stays keyed on the id it already had.
 *
 * The trigger links only when exactly ONE live customer has that number. The
 * owner's own eight admin/test accounts share one number and are excluded by
 * both the role check and the count, so an OTP to that number produces a valid
 * session with no storefront identity -- and RLS then shows it nothing. That is
 * intentional, and it is why signing in as staff means using the staff form.
 */

import { supabase } from './supabase';
import { useAuth, type AppUser, type Address } from './firebase';
import { claimAuth, releaseAuth, ownedByOther } from './authSession';

/**
 * E.164 with the plus, which is what Supabase Auth expects.
 *
 * Mirrors toE164() in whatsappOtp.ts, web_normalise_phone() in
 * supabase_web_auth_user_id.sql and normalisePhone() in
 * scripts/mergeSharedPhoneAccounts.mjs. Four copies of one rule is three too
 * many, but they live in four languages; if you change one, change all four.
 */
export function toE164(raw: string): string | null {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

/** Human-readable, for the "we sent a code to ..." line. */
export function formatIndianMobile(raw: string): string {
  const e164 = toE164(raw);
  if (!e164) return raw;
  const d = e164.slice(3);
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
}

export class OtpError extends Error {}

/**
 * The code was RIGHT, but no customer account is behind this number.
 *
 * A separate class because the form must not treat it as a wrong guess: the
 * customer typed the correct code and should not lose one of their attempts
 * for it. It happens for numbers that only belong to staff (the phone on an
 * admin account), for a number whose empty customer account was deleted, and
 * if the linking trigger ever fails.
 *
 * Saying so is not an enumeration leak. The message only appears after the
 * caller has proved they hold the phone by entering the code sent to it.
 */
export class NoAccountError extends OtpError {}

function client() {
  if (!supabase) {
    throw new OtpError(
      'Sign-in is not available right now. Please try again shortly.'
    );
  }
  return supabase;
}

/**
 * Ask Supabase to generate and deliver a code.
 *
 * `shouldCreateUser` is true on purpose: a number with no account becomes one,
 * which is how a new customer signs up. There is no separate sign-up form any
 * more -- entering your number IS the sign-up, and the trigger creates the
 * web_users row.
 */
export async function requestOtp(phone: string): Promise<void> {
  const e164 = toE164(phone);
  if (!e164) throw new OtpError('Enter a 10-digit Indian mobile number.');

  const { error } = await client().auth.signInWithOtp({
    phone: e164,
    options: { shouldCreateUser: true },
  });

  if (error) throw new OtpError(humanise(error.message, error.status));
}

/**
 * Check a code and, if it is right, start the session.
 *
 * The AppUser is not built here -- onAuthStateChange below does that, so the
 * store is populated the same way whether a session was just created or
 * restored from a previous visit.
 */
export async function verifyOtp(phone: string, code: string): Promise<void> {
  const e164 = toE164(phone);
  if (!e164) throw new OtpError('Enter a 10-digit Indian mobile number.');

  const clean = code.replace(/\D/g, '');
  if (clean.length < 4) throw new OtpError('Enter the code from WhatsApp.');

  const { error } = await client().auth.verifyOtp({
    phone: e164,
    token: clean,
    type: 'sms',
  });

  if (error) throw new OtpError(humanise(error.message, error.status));

  // A valid code proves the phone, not that a shop account sits behind it.
  // Check BEFORE the caller shows "signed in": without this the form
  // congratulated the customer, closed, and left them signed out, because the
  // session had no customer row to load.
  const appUser = await loadAppUser();
  if (!appUser) {
    // End the half-made session, so nothing is left holding a token that
    // RLS shows nothing to.
    await client().auth.signOut().catch(() => {});
    throw new NoAccountError(
      "This number isn't linked to a customer account. " +
      'If you are staff, sign in with your email below.'
    );
  }

  // Populate the store now, rather than racing onAuthStateChange: the form
  // closes the moment this resolves, and the header should already say who is
  // signed in when it does. The listener will set the same user again, which
  // is harmless.
  claimAuth('supabase');
  useAuth.getState().setUser(appUser);
}

/** Ends a customer's Supabase session. Staff sign-out goes through firebase.ts. */
export async function signOutOtp(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/**
 * Supabase's errors are written for developers. These are the ones a customer
 * can actually cause, in words that tell them what to do next.
 *
 * Deliberately never says whether a number has an account: the sign-in form
 * must not double as a way to find out who shops here.
 */
function humanise(message: string, status?: number): string {
  // The raw text goes to the console because some of these are OUR mistakes,
  // not the customer's, and the friendly message deliberately hides which.
  // `phone_provider_disabled` ("Unsupported phone provider") is the one you
  // will hit first: it means the Phone provider is still switched off in
  // Supabase -> Authentication -> Sign In / Providers. A customer seeing
  // "we could not send the code" would otherwise be the only clue.
  console.warn(`[OTP] Supabase auth error${status ? ` (${status})` : ''}: ${message}`);

  const m = (message || '').toLowerCase();
  if (m.includes('provider') && (m.includes('unsupported') || m.includes('disabled'))) {
    return 'WhatsApp sign-in is not switched on yet. Please try again shortly.';
  }
  if (status === 429 || m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (m.includes('expired')) {
    return 'That code has expired. Tap resend to get a new one.';
  }
  if (m.includes('invalid') && (m.includes('token') || m.includes('otp') || m.includes('code'))) {
    return 'That code is not right. Check WhatsApp and try again.';
  }
  if (m.includes('phone') && m.includes('invalid')) {
    return 'That does not look like a valid Indian mobile number.';
  }
  if (m.includes('sms') || m.includes('provider') || m.includes('deliver')) {
    return 'We could not send the code just now. Please try again in a moment.';
  }
  return 'Something went wrong signing you in. Please try again.';
}

// ---------------------------------------------------------------------------
// Session -> AppUser
// ---------------------------------------------------------------------------

const toAddress = (r: Record<string, any>): Address => ({
  id: String(r.id),
  label: r.label || '',
  name: r.name ?? undefined,
  phone: r.phone ?? undefined,
  line1: r.line1 || '',
  line2: r.line2 || '',
  landmark: r.landmark ?? undefined,
  city: r.city || '',
  state: r.state || '',
  pincode: r.pincode || '',
  isDefault: !!r.is_default,
});

/**
 * Read the storefront account behind a Supabase session.
 *
 * Both queries run under the customer's own token, not the service role, so RLS
 * is doing the filtering: `web_firebase_uid()` resolves auth.uid() through
 * web_users.auth_user_id and the policies compare against it. There is no
 * "whose account" parameter here to get wrong, because the database decides.
 *
 * Returns null when the session has no linked row -- a shared staff number, or
 * a trigger that did not fire. The caller treats that as not-signed-in, which
 * is the honest answer: RLS would show that session nothing anyway.
 */
async function loadAppUser(): Promise<AppUser | null> {
  const sb = supabase;
  if (!sb) return null;

  // Who the session says we are. Needed for the filter below.
  const { data: auth } = await sb.auth.getUser();
  const authUserId = auth?.user?.id;
  if (!authUserId) return null;

  // Filtered on auth_user_id rather than left to RLS.
  //
  // It is tempting to select with no WHERE and let the policy narrow it, and
  // for a customer that works. But web_users_self is
  // `USING (id = web_firebase_uid() OR web_is_admin())` -- the OR is there so
  // staff can read the customer list -- so for any caller web_is_admin()
  // accepts, the same query returns all 368 rows and this .limit(1), which has
  // no ORDER BY, picks an arbitrary one. That would sign an admin in as
  // whichever customer Postgres happened to emit first.
  const { data: rows, error } = await sb
    .from('web_users')
    .select('id, email, display_name, role, phone, legacy_address, points, created_at')
    .eq('auth_user_id', authUserId)
    .eq('is_deleted', false)
    // A phone sign-in is a CUSTOMER sign-in, whatever the linked row's role
    // has become since. The database enforces this in web_firebase_uid()
    // (supabase_web_otp_customer_only.sql) and the server in
    // lookupSupabaseCaller(); this copy keeps the UI honest -- without it a
    // staff-linked phone session showed "Admin Portal" and then a dashboard
    // full of permission errors, because every admin read lives behind
    // Firebase, which a WhatsApp sign-in never touches. With it, the sign-in
    // form says to use email instead (NoAccountError).
    .eq('role', 'customer')
    .limit(1);

  if (error) {
    console.warn('[OTP] could not read web_users for this session:', error.message);
    return null;
  }
  const row = rows?.[0];
  if (!row) return null;

  let addresses: Address[] = [];
  const { data: addrRows, error: addrErr } = await sb
    .from('web_addresses')
    .select('*')
    .eq('user_id', row.id)        // explicit, for the same reason as above
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  if (addrErr) {
    // Not fatal. A profile with no addresses still beats no profile at all,
    // and checkout asks for one anyway.
    console.warn('[OTP] could not read web_addresses:', addrErr.message);
  } else if (addrRows) {
    addresses = addrRows.map(toAddress);
  }

  return {
    uid: String(row.id),
    email: row.email || '',
    displayName: row.display_name || '',
    role: (row.role || 'customer') as AppUser['role'],
    phone: row.phone ?? undefined,
    address: row.legacy_address ?? undefined,
    addresses,
    points: Number(row.points) || 0,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}

/**
 * Keep `useAuth` in step with the Supabase session.
 *
 * Registered as a module side effect, matching how firebase.ts registers its
 * own listener, so both are live from first paint. The ownership check is what
 * stops the two of them from undoing each other -- see authSession.ts.
 */
if (supabase) {
  supabase.auth.onAuthStateChange(async (event, session) => {
    // TOKEN_REFRESHED fires on a timer and carries no new identity. Re-reading
    // the profile on every refresh would mean a query every hour per open tab
    // for no change at all.
    if (event === 'TOKEN_REFRESHED') return;

    if (session?.user) {
      const appUser = await loadAppUser();
      if (appUser) {
        claimAuth('supabase');
        useAuth.getState().setUser(appUser);
      } else {
        // A session with nothing behind it. Do not claim ownership and do not
        // write a half-built user into the store; Firebase may legitimately own
        // this browser (a staff member who also has a phone session lying
        // around).
        if (!ownedByOther('supabase')) useAuth.getState().setUser(null);
      }
      useAuth.getState().setLoading(false);
      return;
    }

    // Signed out, or never signed in.
    releaseAuth('supabase');
    if (!ownedByOther('supabase')) {
      useAuth.getState().setUser(null);
      useAuth.getState().setLoading(false);
    }
  });
}

/** Re-read the profile after a change (points spent, address added). */
export async function refreshOtpUser(): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const appUser = await loadAppUser();
  if (appUser) {
    claimAuth('supabase');
    useAuth.getState().setUser(appUser);
  }
}
