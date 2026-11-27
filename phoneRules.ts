/**
 * Small, dependency-free phone rules shared by the sign-in endpoints.
 *
 * Kept apart from staffPhoneAuth.ts on purpose: that module loads
 * firebase-admin, a large package, and registration must never depend on it.
 * On 27 Nov 2026 api/account.ts crashed on load in production (every action,
 * registration included) and firebase-admin was the one new dependency in it.
 */

/** Roles that sign in through Firebase rather than as a phone customer. */
export const STAFF_ROLES = ['admin', 'horeca_admin', 'horeca'] as const;

/** The bare 10-digit Indian mobile, or null. Same rule as toE164() elsewhere. */
export function normalisePhone(raw: unknown): string | null {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
