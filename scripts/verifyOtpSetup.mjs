#!/usr/bin/env node
/**
 * Is WhatsApp OTP login actually ready?
 *
 * Read-only. Checks every piece that has to be in place and says which step is
 * next, so you can run it after each dashboard change instead of guessing why
 * sign-in is not working.
 *
 *   node scripts/verifyOtpSetup.mjs
 */

import { readFile } from 'fs/promises';

const env = {};
for (const line of (await readFile('.env', 'utf8')).split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const U = (env.SUPABASE_URL || '').replace(/\/$/, '');
const K = env.SUPABASE_SERVICE_ROLE_KEY || '';
const A = env.VITE_SUPABASE_ANON_KEY || '';
if (!U || !K) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.');
  process.exit(1);
}
const svc = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };

const results = [];
const check = (ok, name, detail, fix) => results.push({ ok, name, detail, fix });

const rpc = async (fn, body) => {
  try {
    const r = await fetch(`${U}/rest/v1/rpc/${fn}`, {
      method: 'POST', headers: svc, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    });
    return { status: r.status, text: await r.text().catch(() => '') };
  } catch (e) {
    return { status: 0, text: String(e) };
  }
};

// --- 1. the link column -----------------------------------------------------
{
  const r = await fetch(`${U}/rest/v1/web_users?select=id,auth_user_id&limit=1`, { headers: svc });
  const body = await r.text().catch(() => '');
  const missing = body.includes('auth_user_id does not exist');
  check(r.ok && !missing, 'web_users.auth_user_id',
    missing ? 'column not there' : r.ok ? 'present' : body.slice(0, 120),
    'Run supabase_web_auth_user_id.sql');
}

// --- 2. phone normaliser (same migration) -----------------------------------
{
  const r = await rpc('web_normalise_phone', { raw: '+91 98765 43210' });
  const ok = r.status === 200 && r.text.includes('9876543210');
  check(ok, 'web_normalise_phone()',
    ok ? 'agrees with the JS version' : r.text.slice(0, 120),
    'Run supabase_web_auth_user_id.sql');
}

// --- 3. points -------------------------------------------------------------
for (const fn of ['web_redeem_points', 'web_award_points']) {
  // A zero amount is a no-op that still proves the function is there.
  const r = await rpc(fn, { p_user_id: '__verify_probe__', p_amount: 0 });
  const missing = r.text.includes('PGRST202');
  check(!missing && r.status === 200, `${fn}()`,
    missing ? 'not created' : r.status === 200 ? 'present' : r.text.slice(0, 120),
    'Run supabase_web_points_redeem.sql');
}

// --- 4. OTP throttle --------------------------------------------------------
{
  const r = await rpc('web_otp_throttle', {
    p_phone: '', p_max: 3, p_window_seconds: 900, p_block_seconds: 900, p_commit: false,
  });
  const missing = r.text.includes('PGRST202');
  check(!missing && r.status === 200, 'web_otp_throttle()',
    missing ? 'not created' : r.status === 200 ? 'present' : r.text.slice(0, 120),
    'Run supabase_web_otp_throttle.sql');
}
{
  const r = await fetch(`${U}/rest/v1/web_otp_sends?select=phone&limit=1`, { headers: svc });
  check(r.ok, 'web_otp_sends table', r.ok ? 'present' : (await r.text()).slice(0, 120),
    'Run supabase_web_otp_throttle.sql');
}

// --- 5. the Phone provider --------------------------------------------------
let providerOn = false;
if (!A) {
  check(false, 'Phone provider', 'VITE_SUPABASE_ANON_KEY missing from .env', 'Add it to .env');
} else {
  // The only probe that actually distinguishes the provider being off.
  //
  // `create_user: false` is no good: with no account on that number Supabase
  // answers 422 otp_disabled ("Signups not allowed for otp") BEFORE it looks at
  // the provider, so a disabled provider and an enabled one are
  // indistinguishable. It has to be create_user: true, where a disabled
  // provider answers 400 phone_provider_disabled.
  //
  // +910000000000 is deliberately unroutable. If the provider IS on, Supabase
  // generates a code and calls our hook -- which rejects '0000000000' as not an
  // Indian mobile before touching InstantBroadcast. So no WhatsApp message and
  // no ₹0.15, however often this runs.
  const r = await fetch(`${U}/auth/v1/otp`, {
    method: 'POST',
    headers: { apikey: A, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+910000000000', create_user: true }),
  });
  const body = await r.text().catch(() => '');
  const off = body.includes('phone_provider_disabled');
  providerOn = !off;
  check(providerOn, 'Phone provider',
    off ? 'disabled' : 'enabled',
    'Authentication -> Sign In / Providers -> Phone -> Enable');
}

// --- 6. local env for delivery ---------------------------------------------
check(!!env.IB_API_URL && !!env.IB_API_TOKEN, 'InstantBroadcast credentials',
  env.IB_API_TOKEN ? 'set' : 'IB_API_TOKEN missing', 'Set IB_API_URL and IB_API_TOKEN in .env');
check(!!env.IB_OTP_TEMPLATE_NAME, 'Template name',
  env.IB_OTP_TEMPLATE_NAME || 'not set -- the hook will LOG the code instead of sending',
  'Set IB_OTP_TEMPLATE_NAME in .env');
check(!!env.SUPABASE_SMS_HOOK_SECRET, 'Hook signing secret',
  env.SUPABASE_SMS_HOOK_SECRET ? 'set' : 'not set -- the hook refuses every request',
  'Copy it from Authentication -> Hooks -> Send SMS into SUPABASE_SMS_HOOK_SECRET');

// --- 7. provider balance ----------------------------------------------------
if (env.IB_API_TOKEN && env.IB_API_URL) {
  try {
    const r = await fetch(`${env.IB_API_URL.replace(/\/$/, '')}/api/user/get_me`, {
      headers: { Authorization: `Bearer ${env.IB_API_TOKEN}` }, signal: AbortSignal.timeout(10_000),
    });
    const j = await r.json().catch(() => null);
    const bal = j?.data?.balance ?? j?.data?.wallet ?? null;
    check(r.ok, 'InstantBroadcast reachable',
      r.ok ? `account "${j?.data?.name ?? '?'}"${bal !== null ? `, balance ${bal}` : ''}` : `HTTP ${r.status}`,
      'Check IB_API_TOKEN');
  } catch (e) {
    check(false, 'InstantBroadcast reachable', String(e).slice(0, 100), 'Check IB_API_URL');
  }
}

// --- report -----------------------------------------------------------------
const pad = Math.max(...results.map(r => r.name.length));
console.log('');
for (const r of results) {
  console.log(`${r.ok ? ' ok ' : 'MISS'}  ${r.name.padEnd(pad)}  ${r.detail}`);
}
const missing = results.filter(r => !r.ok);
console.log('');
if (!missing.length) {
  console.log('Everything is in place. Add a test number under');
  console.log('Authentication -> Sign In / Providers -> Phone -> "Test Phone Numbers and OTPs"');
  console.log('as  919876543210=123456  and sign in at http://localhost:3001');
  process.exit(0);
}
console.log(`${missing.length} thing(s) to do, in this order:`);
const seen = new Set();
for (const m of missing) {
  if (seen.has(m.fix)) continue;
  seen.add(m.fix);
  console.log(`  - ${m.fix}`);
}
process.exit(1);
