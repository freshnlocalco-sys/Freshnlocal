/**
 * Compulsory registration for phone sign-in customers.
 *
 * POST /api/account/register  { accessToken, name, email }
 *
 * Anyone can ask for a WhatsApp code. Entering it proves the phone, but does
 * NOT make an account: a new customer must give their full name and email
 * first, and only then is their web_users row created. A customer who already
 * has an account but no name or email on file is asked to complete it the same
 * way. The delivery address is still taken at checkout.
 *
 * Why this lives on the server: the browser holds a Supabase session that, by
 * design, resolves to no account until this runs (web_firebase_uid() maps only
 * LINKED customer rows), so RLS would refuse the insert -- correctly. The
 * server checks the session with Supabase and writes with the service role.
 *
 * Refuses, never guesses:
 * - a staff number (staff sign in to their own Firebase account instead);
 * - a number on more than one customer account;
 * - an email already used by another live account
 *   (the database enforces this too: uq_web_users_email_live).
 */

import { STAFF_ROLES, normalisePhone } from './staffPhoneAuth.js';

const SB_URL = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';

type Reply = { status: number; body: unknown };
type Row = {
  id: string; email: string | null; display_name: string | null; role: string;
  phone: string | null; auth_user_id: string | null; is_deleted: boolean;
};

const mask = (p: string | null | undefined) => (p ? `...${String(p).slice(-4)}` : '(none)');

/** Same checks the form makes, enforced here. Returns an error message or null. */
export function validateRegistration(name: unknown, email: unknown): { name?: string; email?: string } {
  const errors: { name?: string; email?: string } = {};
  const n = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (n.length < 2) errors.name = 'Please enter your full name.';
  else if (n.length > 80) errors.name = 'That name is too long.';
  else if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(n)) errors.name = 'Please use letters only in your name.';
  const e = String(email ?? '').trim().toLowerCase();
  if (!e) errors.email = 'Please enter your email address.';
  else if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) errors.email = 'Please enter a valid email address.';
  return errors;
}

async function sb(path: string, init: RequestInit = {}) {
  return fetch(`${SB_URL()}${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY(), Authorization: `Bearer ${SB_KEY()}`, 'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(6_000),
  });
}

export async function handleRegister(rawBody: unknown): Promise<Reply> {
  const body = typeof rawBody === 'string'
    ? (() => { try { return JSON.parse(rawBody); } catch { return {}; } })()
    : ((rawBody ?? {}) as Record<string, any>);

  const accessToken = String(body.accessToken ?? '');
  if (!accessToken) return { status: 401, body: { error: 'Not signed in.' } };
  if (!SB_URL() || !SB_KEY()) return { status: 503, body: { error: 'Registration is not available right now.' } };

  const errors = validateRegistration(body.name, body.email);
  if (errors.name || errors.email) return { status: 400, body: { error: 'invalid', fields: errors } };
  const name = String(body.name).trim().replace(/\s+/g, ' ');
  const email = String(body.email).trim().toLowerCase();

  // 1. A genuine session for a phone whose code was actually entered.
  let user: { id?: string; phone?: string; phone_confirmed_at?: string | null } | null = null;
  try {
    const r = await fetch(`${SB_URL()}/auth/v1/user`, {
      headers: { apikey: SB_KEY(), Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (r.ok) user = await r.json();
  } catch {
    return { status: 503, body: { error: 'Could not check your sign-in. Please try again.' } };
  }
  if (!user?.id || !user.phone_confirmed_at) return { status: 401, body: { error: 'Not signed in.' } };
  const phone = normalisePhone(user.phone);
  if (!phone) return { status: 400, body: { error: 'invalid', fields: { phone: 'This sign-in has no valid mobile number.' } } };

  try {
    // 2. Everyone on this number, live accounts only.
    // Every live account with a phone (a few hundred rows), compared after
    // normalising: phones were typed by hand for years -- spaces, dashes,
    // +91, leading zeros -- so an exact-match filter would miss some and
    // create a duplicate account.
    const r = await sb(`/rest/v1/web_users?select=id,email,display_name,role,phone,auth_user_id,is_deleted&is_deleted=eq.false&or=(phone.not.is.null,auth_user_id.eq.${user.id})&limit=10000`);
    if (!r.ok) throw new Error(`lookup ${r.status}`);
    const candidates: Row[] = (await r.json()) as Row[];
    const onNumber = candidates.filter(c => normalisePhone(c.phone) === phone || c.auth_user_id === user!.id);

    if (onNumber.some(c => (STAFF_ROLES as readonly string[]).includes(c.role))) {
      return { status: 409, body: { error: 'staff', message: 'This number belongs to a staff account. Please sign in with your email below.' } };
    }

    // 3. Which account is being completed or created?
    const linked = onNumber.find(c => c.auth_user_id === user!.id);
    const unlinked = onNumber.filter(c => c.role === 'customer' && !c.auth_user_id);
    let target: Row | null = linked ?? null;
    if (!target && unlinked.length > 1) {
      return { status: 409, body: { error: 'shared', message: 'This number is on more than one account. Please contact us and we will sort it out.' } };
    }
    if (!target && unlinked.length === 1) target = unlinked[0];

    // 4. Email must not belong to someone else.
    // ilike finds case variants; it also treats _ as a wildcard, so the
    // exact lower-case comparison below is what decides.
    const er = await sb(`/rest/v1/web_users?select=id,email&is_deleted=eq.false&email=ilike.${encodeURIComponent(email)}`);
    if (!er.ok) throw new Error(`email check ${er.status}`);
    const holders = ((await er.json()) as { id: string; email: string | null }[])
      .filter(h => String(h.email ?? '').trim().toLowerCase() === email);
    if (holders.some(h => h.id !== target?.id)) {
      return { status: 409, body: { error: 'email-taken', fields: { email: 'That email is already used by another account. Please use a different one.' } } };
    }

    const now = new Date().toISOString();
    if (target) {
      const u = await sb(`/rest/v1/web_users?id=eq.${encodeURIComponent(target.id)}&is_deleted=eq.false`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ display_name: name, email, auth_user_id: user.id, updated_at: now }),
      });
      if (!u.ok) throw new Error(`update ${u.status} ${(await u.text()).slice(0, 160)}`);
      console.log(`[REGISTER] completed account ${target.id} for ${mask(phone)}`);
      return { status: 200, body: { ok: true, id: target.id, created: false } };
    }

    // 5. A brand-new customer. id = the auth user's id, as the old trigger did.
    const c = await sb('/rest/v1/web_users', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: user.id, phone, role: 'customer', points: 0, display_name: name, email,
        auth_user_id: user.id, created_at: now,
      }),
    });
    if (!c.ok) {
      const t = await c.text();
      if (t.includes('uq_web_users_email_live')) {
        return { status: 409, body: { error: 'email-taken', fields: { email: 'That email is already used by another account. Please use a different one.' } } };
      }
      if (t.includes('23505')) {
        return { status: 409, body: { error: 'exists', message: 'An account for this number already exists. Please contact us.' } };
      }
      throw new Error(`insert ${c.status} ${t.slice(0, 160)}`);
    }
    console.log(`[REGISTER] created account ${user.id} for ${mask(phone)}`);
    return { status: 200, body: { ok: true, id: user.id, created: true } };
  } catch (err) {
    console.error('[REGISTER] failed:', err instanceof Error ? err.message : String(err));
    return { status: 500, body: { error: 'Could not save your details. Please try again.' } };
  }
}
