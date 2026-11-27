#!/usr/bin/env node
/**
 * Collapse storefront accounts that share one mobile number, so that a phone
 * number can become a login identity.
 *
 * Phone + WhatsApp OTP means one number must resolve to exactly one account.
 * Four numbers currently resolve to fourteen. This script merges the customer
 * ones and refuses to touch the rest.
 *
 * WHAT IT WILL NOT DO
 * -------------------
 * It skips any group containing an account whose role is not 'customer'.
 * That rule exists because of a specific group: +91 ...2285 carries eight of
 * the owner's own accounts, two of them 'admin' and one 'horeca_admin', and a
 * "keep the most recently active" rule picks a plain customer row and folds
 * the admins into it -- destroying the roles that gate AdminDashboard. Staff
 * keep Firebase email+password and need no phone identity, so the correct
 * action for that group is none at all.
 *
 * WHAT IT DOES, per surviving group
 * ---------------------------------
 *   KEEP = the account with the most recent live order; ties go to the newest
 *   account. Then:
 *     - KEEP.points := the sum of every account's points in the group
 *     - web_orders / web_addresses / web_reviews / web_saved_recipes /
 *       web_recipe_chats: user_id repointed to KEEP
 *     - merged default addresses demoted to is_default = FALSE, because
 *       uq_web_addresses_one_default_live allows one live default per user
 *       (if KEEP has no default of its own, the newest merged one is promoted)
 *     - a merged review for a product KEEP has also reviewed is soft-deleted,
 *       because uq_web_reviews_one_per_user_live is (web_product_id, user_id)
 *     - the merged web_users rows are SOFT-deleted (is_deleted = TRUE), never
 *       hard-deleted: every child table is ON DELETE CASCADE, so a hard delete
 *       would take the order history with it
 *
 * Soft deletes and a full pre-change backup are what make this reversible.
 *
 * Output carries uids, counts and the last four digits of a number -- never a
 * full number, an email, a name or an address.
 *
 *   node scripts/mergeSharedPhoneAccounts.mjs
 *       # dry run: print the plan, touch nothing
 *
 *   node scripts/mergeSharedPhoneAccounts.mjs --apply --backup=../fnl-merge-backup.json
 *       # write, then re-read and verify
 *
 *   node scripts/mergeSharedPhoneAccounts.mjs --rollback=../fnl-merge-backup.json
 *       # restore every row in a backup to exactly what it was
 */

import { readFile, writeFile } from 'fs/promises';
import { resolve, sep } from 'path';

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const APPLY = process.argv.includes('--apply');
const BACKUP = arg('backup');
const ROLLBACK = arg('rollback');

// --- env --------------------------------------------------------------------
const env = {};
for (const line of (await readFile('.env', 'utf8')).split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const SB_URL = env.SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.');
  process.exit(1);
}
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

if (APPLY && !BACKUP) {
  console.error('--apply needs --backup=<path>: a summed points balance cannot be recovered otherwise.');
  process.exit(1);
}
if (BACKUP && (resolve(BACKUP) + sep).startsWith(resolve('.') + sep)) {
  console.error('--backup must be outside this repo: it is the customer list.');
  process.exit(1);
}

const ACTOR = 'merge: shared phone';
const CHILD_TABLES = ['web_orders', 'web_addresses', 'web_reviews', 'web_saved_recipes', 'web_recipe_chats'];

// --- REST helpers -----------------------------------------------------------
async function readAll(table, select = '*') {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(
      `${SB_URL}/rest/v1/${table}?select=${select}&order=id&limit=1000&offset=${offset}`,
      { headers: H }
    );
    if (!r.ok) throw new Error(`read ${table} failed: ${r.status} ${await r.text()}`);
    const page = await r.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function patch(table, filter, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`patch ${table} (${filter}) failed: ${r.status} ${await r.text()}`);
  return r.json();
}

/**
 * An Indian mobile, or null. Strips +91, a leading 0 and any punctuation, then
 * insists on the 10-digit 6-9 form. Anything else is not an identity we can
 * send an OTP to, so it is not a collision either.
 */
const normalisePhone = raw => {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
};
const mask = n => `...${n.slice(-4)}`;

// --- rollback ---------------------------------------------------------------
if (ROLLBACK) {
  const snap = JSON.parse(await readFile(ROLLBACK, 'utf8'));
  console.log(`Restoring from ${ROLLBACK} (taken ${snap.takenAt}).\n`);
  let n = 0;
  for (const [table, rows] of Object.entries(snap.rows)) {
    for (const row of rows) {
      const { id, ...rest } = row;
      await patch(table, `id=eq.${encodeURIComponent(id)}`, rest);
      n++;
    }
    console.log(`  ${table}: ${rows.length} row(s) restored`);
  }
  console.log(`\nRestored ${n} row(s). Re-run without flags to confirm the groups are back.`);
  process.exit(0);
}

// --- load -------------------------------------------------------------------
const users = (await readAll('web_users')).filter(u => !u.is_deleted);
const orders = (await readAll('web_orders', 'id,user_id,created_at,is_deleted')).filter(o => !o.is_deleted);
const addresses = (await readAll('web_addresses')).filter(a => !a.is_deleted);
const reviews = (await readAll('web_reviews')).filter(r => !r.is_deleted);

const ordersBy = new Map();
for (const o of orders) {
  if (!ordersBy.has(o.user_id)) ordersBy.set(o.user_id, []);
  ordersBy.get(o.user_id).push(o);
}

const groups = new Map();
for (const u of users) {
  const n = normalisePhone(u.phone);
  if (!n) continue;
  if (!groups.has(n)) groups.set(n, []);
  groups.get(n).push(u);
}
const shared = [...groups.entries()].filter(([, a]) => a.length > 1).sort((a, b) => b[1].length - a[1].length);

console.log(`${users.length} live accounts, ${groups.size} distinct mobile numbers.`);
console.log(`${shared.length} number(s) shared by ${shared.reduce((s, [, a]) => s + a.length, 0)} accounts.\n`);

// --- plan -------------------------------------------------------------------
const plan = [];
for (const [phone, accounts] of shared) {
  const nonCustomer = accounts.filter(u => (u.role || 'customer') !== 'customer');
  if (nonCustomer.length) {
    console.log(
      `SKIP  +91 ${mask(phone)}  ${accounts.length} accounts -- holds ${nonCustomer.length} ` +
        `non-customer role(s): ${[...new Set(nonCustomer.map(u => u.role))].join(', ')}`
    );
    console.log('      Staff keep email+password; merging would destroy the roles that gate the admin panel.\n');
    continue;
  }

  const ranked = accounts
    .map(u => {
      const mine = ordersBy.get(u.id) || [];
      const last = mine.map(o => o.created_at).filter(Boolean).sort().pop() || null;
      return { u, orders: mine.length, last };
    })
    .sort((a, b) => {
      if ((a.last || '') !== (b.last || '')) return (b.last || '').localeCompare(a.last || '');
      const created = String(b.u.created_at || '').localeCompare(String(a.u.created_at || ''));
      if (created !== 0) return created;
      // Last resort, so a dry run always predicts the apply. Without this, two
      // accounts with equal (or missing) timestamps fall back to whatever order
      // the rows arrived in, and the keeper changes between runs.
      return String(a.u.id).localeCompare(String(b.u.id));
    });

  const keep = ranked[0].u;
  const merged = ranked.slice(1).map(r => r.u);
  const points = accounts.reduce((s, u) => s + (Number(u.points) || 0), 0);

  // Default-address collision. uq_web_addresses_one_default_live permits one
  // live default per user, so every merged default must be demoted first.
  const keepHasDefault = addresses.some(a => a.user_id === keep.id && a.is_default);
  const mergedDefaults = addresses.filter(a => merged.some(m => m.id === a.user_id) && a.is_default);
  const promote = !keepHasDefault && mergedDefaults.length
    ? mergedDefaults.sort((x, y) => String(y.created_at || '').localeCompare(String(x.created_at || '')))[0]
    : null;
  const demote = mergedDefaults.filter(a => a.id !== promote?.id);

  // Review collision. uq_web_reviews_one_per_user_live is (web_product_id, user_id).
  const keepProducts = new Set(reviews.filter(r => r.user_id === keep.id).map(r => r.web_product_id));
  const dupReviews = reviews.filter(
    r => merged.some(m => m.id === r.user_id) && keepProducts.has(r.web_product_id)
  );

  plan.push({ phone, keep, merged, points, promote, demote, dupReviews, ranked });

  console.log(`MERGE +91 ${mask(phone)}  ${accounts.length} accounts -> 1`);
  console.log(`      keep   ${keep.id}  (${ranked[0].orders} order(s), last ${ranked[0].last?.slice(0, 10) || 'never'})`);
  for (const r of ranked.slice(1)) {
    console.log(`      merge  ${r.u.id}  (${r.orders} order(s), last ${r.last?.slice(0, 10) || 'never'})`);
  }
  console.log(`      points ${accounts.map(u => Number(u.points) || 0).join(' + ')} = ${points}`);
  if (promote) console.log(`      address ${promote.id} promoted to default (keep had none)`);
  if (demote.length) console.log(`      ${demote.length} merged default address(es) demoted`);
  if (dupReviews.length) console.log(`      ${dupReviews.length} duplicate review(s) will be soft-deleted`);
  console.log();
}

if (!plan.length) {
  console.log('Nothing to merge.');
  process.exit(0);
}

const totals = plan.reduce(
  (t, g) => ({
    groups: t.groups + 1,
    gone: t.gone + g.merged.length,
    orders: t.orders + g.merged.reduce((s, m) => s + (ordersBy.get(m.id)?.length || 0), 0),
  }),
  { groups: 0, gone: 0, orders: 0 }
);
console.log(
  `${totals.groups} group(s): ${totals.gone} account(s) soft-deleted, ` +
    `${totals.orders} order(s) repointed. ${users.length} live accounts -> ${users.length - totals.gone}.`
);

if (!APPLY) {
  console.log('\nDry run. Nothing was written. Re-run with --apply --backup=<path outside this repo>.');
  process.exit(0);
}

// --- backup -----------------------------------------------------------------
// Every row the plan will touch, exactly as it is now. Written and flushed
// before the first write, so an interrupted run is still recoverable.
const touchedUserIds = new Set(plan.flatMap(g => [g.keep.id, ...g.merged.map(m => m.id)]));
const snapshot = { takenAt: new Date().toISOString(), actor: ACTOR, rows: {} };
snapshot.rows.web_users = users.filter(u => touchedUserIds.has(u.id));
for (const table of CHILD_TABLES) {
  const rows = await readAll(table);
  snapshot.rows[table] = rows.filter(r => touchedUserIds.has(r.user_id));
}
await writeFile(BACKUP, JSON.stringify(snapshot, null, 2));
const backedUp = Object.values(snapshot.rows).reduce((s, r) => s + r.length, 0);
console.log(`\nBacked up ${backedUp} row(s) to ${BACKUP}.`);

// --- apply ------------------------------------------------------------------
const now = new Date().toISOString();
for (const g of plan) {
  console.log(`\n+91 ${mask(g.phone)} -> ${g.keep.id}`);

  // 1. Demote merged defaults BEFORE repointing, or the unique index trips.
  for (const a of g.demote) {
    await patch('web_addresses', `id=eq.${encodeURIComponent(a.id)}`, { is_default: false });
  }
  if (g.demote.length) console.log(`  demoted ${g.demote.length} default address(es)`);

  // 2. Soft-delete colliding reviews BEFORE repointing, same reason.
  for (const r of g.dupReviews) {
    await patch('web_reviews', `id=eq.${encodeURIComponent(r.id)}`, {
      is_deleted: true, deleted_on: now, deleted_by: ACTOR,
    });
  }
  if (g.dupReviews.length) console.log(`  soft-deleted ${g.dupReviews.length} duplicate review(s)`);

  // 3. Repoint every child row.
  for (const m of g.merged) {
    for (const table of CHILD_TABLES) {
      const moved = await patch(table, `user_id=eq.${encodeURIComponent(m.id)}`, { user_id: g.keep.id });
      if (moved.length) console.log(`  ${table}: ${moved.length} row(s) ${m.id} -> ${g.keep.id}`);
    }
  }

  // 4. Promote a default address if KEEP had none.
  if (g.promote) {
    await patch('web_addresses', `id=eq.${encodeURIComponent(g.promote.id)}`, { is_default: true });
    console.log(`  promoted address ${g.promote.id} to default`);
  }

  // 5. Sum the points onto KEEP.
  await patch('web_users', `id=eq.${encodeURIComponent(g.keep.id)}`, { points: g.points, updated_at: now });
  console.log(`  points -> ${g.points}`);

  // 6. Soft-delete the merged accounts. Last, so a failure above leaves them
  //    live and the group simply still needs merging.
  for (const m of g.merged) {
    await patch('web_users', `id=eq.${encodeURIComponent(m.id)}`, {
      is_deleted: true, deleted_on: now, deleted_by: ACTOR, updated_at: now,
    });
    console.log(`  soft-deleted ${m.id}`);
  }
}

// --- verify -----------------------------------------------------------------
console.log('\n--- verify ---');
const after = (await readAll('web_users')).filter(u => !u.is_deleted);
const afterGroups = new Map();
for (const u of after) {
  const n = normalisePhone(u.phone);
  if (!n) continue;
  if (!afterGroups.has(n)) afterGroups.set(n, []);
  afterGroups.get(n).push(u);
}
const stillShared = [...afterGroups.entries()].filter(([, a]) => a.length > 1);

let ok = true;
for (const g of plan) {
  const keep = after.find(u => u.id === g.keep.id);
  if (!keep) { console.log(`FAIL ${g.keep.id} is no longer live`); ok = false; continue; }
  if (Number(keep.points) !== g.points) {
    console.log(`FAIL ${g.keep.id} points ${keep.points}, expected ${g.points}`); ok = false; continue;
  }
  const gone = g.merged.filter(m => after.some(u => u.id === m.id));
  if (gone.length) { console.log(`FAIL ${gone.length} merged account(s) still live`); ok = false; continue; }
  console.log(`ok   +91 ${mask(g.phone)} -> ${g.keep.id}, ${keep.points} points`);
}

const expectedShared = shared.length - plan.length;
console.log(
  `\n${after.length} live accounts (was ${users.length}). ` +
    `${stillShared.length} shared number(s) left, expected ${expectedShared} (the skipped staff group).`
);
if (stillShared.length !== expectedShared) ok = false;

console.log(ok ? '\nAll groups verified.' : `\nSOMETHING IS WRONG. Restore with --rollback=${BACKUP}`);
process.exit(ok ? 0 : 1);
