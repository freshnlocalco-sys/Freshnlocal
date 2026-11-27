/**
 * Which auth system owns the signed-in customer right now.
 *
 * Two of them are live at the same time during this migration: customers sign
 * in with phone + WhatsApp OTP through Supabase, and staff (3 admin, 1 horeca,
 * none of whom has a phone on file) stay on Firebase email+password. Both have
 * a listener that fires on page load and writes to the same `useAuth` store.
 *
 * Without arbitration they fight, and the symptom is nasty because it is a
 * race: Supabase restores a customer session and sets the user, then Firebase's
 * onAuthStateChanged fires with `null` -- because there is genuinely no
 * Firebase user -- and clears it. The customer gets signed out a beat after
 * being signed in, intermittently, depending on which network round trip
 * returns first.
 *
 * So a listener may only clear the user if it owns the session, or if nobody
 * does. Setting a user claims ownership.
 *
 * This is deliberately a module-level variable and not React state: the
 * listeners live outside React (they are module side effects in firebase.ts
 * and otpAuth.ts) and run before any component mounts.
 */

export type AuthOwner = 'firebase' | 'supabase';

let owner: AuthOwner | null = null;

/** Called by whichever listener has just established a real signed-in user. */
export function claimAuth(who: AuthOwner): void {
  owner = who;
}

/**
 * Called when a provider's session genuinely ends. A no-op if that provider
 * was not the owner, so a Firebase "no user" event cannot release a Supabase
 * customer's claim.
 */
export function releaseAuth(who: AuthOwner): void {
  if (owner === who) owner = null;
}

/**
 * True when some *other* provider owns the session, meaning `who` must keep its
 * hands off the store. An unowned session is fair game, which is what makes the
 * very first load work.
 */
export function ownedByOther(who: AuthOwner): boolean {
  return owner !== null && owner !== who;
}

/** For sign-out, which has to end the right session. */
export function currentOwner(): AuthOwner | null {
  return owner;
}
