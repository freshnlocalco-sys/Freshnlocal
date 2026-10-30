/**
 * Firestore `users` (and their subcollections) -> what must change in Supabase.
 *
 * Pure: no network, no clock-dependent decisions, so the merge rules can be
 * tested without touching either database. scripts/syncCustomersToSupabase.mjs
 * does the reading and writing.
 *
 * Firestore is the source of truth for these tables: every points award,
 * redemption and address save lands there, and nothing writes them in Supabase
 * except erpMirror.ts's insert-if-missing. Three rules follow from that, each of
 * which exists because the obvious overwrite would lose something:
 *
 *   1. A blank in Firestore never wipes a value in Supabase. ensureCustomer()
 *      fills phone and email from an order's shipping details, so Supabase can
 *      know a number the Firestore profile does not.
 *   2. A soft-deleted row stays deleted, and only rows that differ are written.
 *   3. A missing `addresses` field means "unknown", not "removed everything".
 *      An empty array does mean removed.
 */

export const SYNC_ACTOR = 'firestore-customer-sync';

const ROLES = new Set(['admin', 'customer', 'horeca', 'horeca_admin']);

const USER_FIELDS = new Set([
  'uid', 'email', 'displayName', 'role', 'phone', 'address', 'addresses',
  'points', 'createdAt', 'updatedAt', 'savedRecipes', 'recipeChat', 'id',
]);
const ADDRESS_FIELDS = new Set([
  'id', 'label', 'name', 'phone', 'line1', 'line2', 'landmark', 'city',
  'state', 'pincode', 'isDefault',
]);

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const blank = v => v == null || String(v).trim() === '';
const text = v => (blank(v) ? null : String(v).trim());

/** Epoch ms, a Firestore Timestamp, or an ISO string -> ISO, else null. */
export function iso(v) {
  if (v == null) return null;
  if (isNum(v)) return v < 1e11 ? null : new Date(v).toISOString();
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (isNum(v._seconds)) return new Date(v._seconds * 1000).toISOString();
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(+d) ? null : d.toISOString();
  }
  return null;
}

// Key order is not a difference: jsonb does not preserve it.
const canon = v => {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    return Object.keys(v).sort().reduce((a, k) => { a[k] = canon(v[k]); return a; }, {});
  }
  return v;
};

function sameValue(col, a, b) {
  if (a == null || b == null) return a == null && b == null;
  if (col.endsWith('_at') || col.endsWith('_on')) return +new Date(a) === +new Date(b);
  if (col === 'points') return Number(a) === Number(b);
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
  }
  return a === b;
}

const differs = (live, row) =>
  !live || Object.keys(row).some(col => !sameValue(col, live[col], row[col]));

const LIVE = { is_deleted: false, deleted_on: null, deleted_by: null };

/**
 * @param firestoreUsers documents as {id, ...fields, savedRecipes: [], recipeChat: []}
 * @param live           {users, addresses, recipes, chats}: current Supabase rows
 * @param now            ISO timestamp for rows with no date of their own
 */
export function planSync(firestoreUsers, live, now) {
  const notes = [];
  const note = (kind, detail) => notes.push({ kind, detail });

  const liveUsers = new Map(live.users.map(u => [u.id, u]));
  const liveAddresses = new Map(live.addresses.map(a => [a.id, a]));
  const liveRecipes = new Map(live.recipes.map(r => [r.id, r]));
  const liveChats = new Map(live.chats.map(c => [c.id, c]));

  // uq_web_users_email_live: one refused row would fail its whole batch.
  const emailOwner = new Map();
  for (const u of live.users) {
    if (!u.is_deleted && u.email) emailOwner.set(u.email.toLowerCase(), u.id);
  }

  // Row ids are only unique per user in Firestore, and globally unique here.
  const taken = new Set();
  const claim = (liveRows, raw, uid, fallback) => {
    const owner = raw ? liveRows.get(raw)?.user_id : null;
    if (!blank(raw) && !taken.has(raw) && (!owner || owner === uid)) {
      taken.add(raw);
      return raw;
    }
    if (!blank(raw)) note('id-collision', `${uid}: ${raw} already belongs to another row, used ${fallback}`);
    taken.add(fallback);
    return fallback;
  };

  const users = [], addresses = [], recipes = [], chats = [];
  const keepAddresses = new Set(), keepRecipes = new Set(), keepChats = new Set();
  const coveredForAddresses = new Set(), covered = new Set();
  const roleChanges = [], unmappedFields = {};
  const counted = field => { unmappedFields[field] = (unmappedFields[field] ?? 0) + 1; };

  // Which columns a run changes, so the report shows why a row is in it.
  const changedColumns = {};
  const record = (table, current, row, list) => {
    if (!differs(current, row)) return;
    list.push(row);
    const cols = current
      ? Object.keys(row).filter(col => !sameValue(col, current[col], row[col]))
      : ['(new row)'];
    for (const col of cols) {
      const key = `${table}.${col}`;
      changedColumns[key] = (changedColumns[key] ?? 0) + 1;
    }
  };

  let firestorePoints = 0, pointsChanged = 0, skippedDeleted = 0;
  let newCustomers = 0, newCustomerPoints = 0;

  for (const d of firestoreUsers) {
    const uid = String(d.id);
    const existing = liveUsers.get(uid);

    if (existing?.is_deleted) {
      skippedDeleted++;
      note('soft-deleted-user-left-alone', uid);
      continue;
    }

    for (const k of Object.keys(d)) if (!USER_FIELDS.has(k)) counted(`users.${k}`);
    if (d.uid != null && String(d.uid) !== uid) note('uid-mismatch', `document ${uid} carries a different uid field`);

    let role = String(d.role ?? existing?.role ?? 'customer');
    if (!ROLES.has(role)) {
      note('unknown-role', `${uid}: ${JSON.stringify(role)} not accepted, kept ${existing?.role ?? 'customer'}`);
      role = existing?.role ?? 'customer';
    }
    if (existing && existing.role !== role) roleChanges.push({ id: uid, from: existing.role, to: role });

    let points = isNum(d.points) ? d.points : Number(existing?.points ?? 0);
    if (d.points != null && !isNum(d.points)) note('points-not-a-number', `${uid}: kept ${points}`);
    if (points < 0) {
      note('negative-points', `${uid}: ${points} set to 0, the CHECK refuses negatives`);
      points = 0;
    }
    firestorePoints += points;
    if (!existing) { newCustomers++; newCustomerPoints += points; }
    if (!existing || Number(existing.points) !== points) pointsChanged++;

    let email = text(d.email) ?? existing?.email ?? null;
    const owner = email ? emailOwner.get(email.toLowerCase()) : null;
    if (owner && owner !== uid) {
      note('email-held-by-another-account', `${uid} shares an email with ${owner}; left unchanged`);
      email = existing?.email ?? null;
    }
    if (email) emailOwner.set(email.toLowerCase(), uid);

    const row = {
      id: uid,
      email,
      display_name: text(d.displayName) ?? existing?.display_name ?? null,
      role,
      phone: text(d.phone) ?? existing?.phone ?? null,
      legacy_address: text(d.address) ?? existing?.legacy_address ?? null,
      points,
      created_at: existing?.created_at ?? iso(d.createdAt) ?? now,
      updated_at: iso(d.updatedAt) ?? existing?.updated_at ?? null,
    };
    record('web_users', existing, row, users);

    covered.add(uid);

    if (Array.isArray(d.addresses)) {
      coveredForAddresses.add(uid);
      let defaultSeen = false;
      d.addresses.forEach((a, i) => {
        for (const k of Object.keys(a ?? {})) if (!ADDRESS_FIELDS.has(k)) counted(`addresses.${k}`);
        const id = claim(liveAddresses, a?.id == null ? null : String(a.id), uid, `${uid}__a${i}`);
        let isDefault = a?.isDefault === true;
        if (isDefault && defaultSeen) {
          note('multiple-default-addresses', `${uid}: kept the first default`);
          isDefault = false;
        }
        if (isDefault) defaultSeen = true;
        keepAddresses.add(id);

        const current = liveAddresses.get(id);
        const addressRow = {
          id,
          user_id: uid,
          label: String(a?.label ?? ''),
          // Verbatim, as line1 and line2 are. 133 live rows hold landmark = '',
          // so normalising it would report them all as changed.
          name: a?.name ?? null,
          phone: a?.phone ?? null,
          line1: String(a?.line1 ?? ''),
          line2: String(a?.line2 ?? ''),
          landmark: a?.landmark ?? null,
          city: String(a?.city ?? ''),
          state: String(a?.state ?? ''),
          pincode: String(a?.pincode ?? ''),
          is_default: isDefault,
          created_at: current?.created_at ?? iso(d.createdAt) ?? now,
          ...LIVE,
        };
        record('web_addresses', current, addressRow, addresses);
      });
    }

    for (const r of d.savedRecipes ?? []) {
      const id = claim(liveRecipes, String(r.id), uid, `${uid}__${r.id}`);
      keepRecipes.add(id);
      const current = liveRecipes.get(id);
      const recipeRow = {
        id,
        user_id: uid,
        title: r.title ?? null,
        recipe_markdown: r.recipeMarkdown ?? '',
        created_at: current?.created_at ?? iso(r.createdAt) ?? now,
        ...LIVE,
      };
      record('web_saved_recipes', current, recipeRow, recipes);
    }

    for (const c of d.recipeChat ?? []) {
      const id = claim(liveChats, String(c.id), uid, `${uid}__${c.id}`);
      keepChats.add(id);
      const current = liveChats.get(id);
      const chatRow = {
        id,
        user_id: uid,
        title: c.title ?? '',
        messages: Array.isArray(c.messages) ? c.messages : [],
        created_at: current?.created_at ?? iso(c.createdAt) ?? iso(c.updatedAt) ?? now,
        updated_at: iso(c.updatedAt) ?? current?.updated_at ?? null,
        ...LIVE,
      };
      record('web_recipe_chats', current, chatRow, chats);
    }
  }

  // Removed in Firestore -> soft-deleted here, so a customer who deleted an
  // address does not see it come back.
  const stale = (rows, keep, scope) => rows
    .filter(r => !r.is_deleted && scope.has(r.user_id) && !keep.has(r.id))
    .map(r => r.id);

  const staleAddresses = stale(live.addresses, keepAddresses, coveredForAddresses);
  const staleSet = new Set(staleAddresses);

  // uq_web_addresses_one_default_live is checked row by row, so moving a default
  // from A to B has to clear A before B is written.
  const incoming = new Map(addresses.map(a => [a.id, a]));
  const clearDefaults = live.addresses
    .filter(a => !a.is_deleted && a.is_default && !staleSet.has(a.id) && incoming.get(a.id)?.is_default === false)
    .map(a => a.id);

  const firestoreIds = new Set(firestoreUsers.map(d => String(d.id)));
  const supabaseOnly = live.users.filter(u => !u.is_deleted && !firestoreIds.has(u.id));
  const livePoints = live.users
    .filter(u => covered.has(u.id))
    .reduce((sum, u) => sum + Number(u.points), 0);

  return {
    users, addresses, recipes, chats, clearDefaults,
    softDeletes: {
      web_addresses: staleAddresses,
      web_saved_recipes: stale(live.recipes, keepRecipes, covered),
      web_recipe_chats: stale(live.chats, keepChats, covered),
    },
    notes,
    stats: {
      firestorePoints, livePoints, pointsChanged, skippedDeleted, roleChanges,
      newCustomers, newCustomerPoints, changedColumns, unmappedFields,
      supabaseOnly: supabaseOnly.map(u => u.id),
    },
  };
}

/** True when nothing is left to write: the definition of "in sync". */
export const planIsEmpty = plan =>
  !plan.users.length && !plan.addresses.length && !plan.recipes.length &&
  !plan.chats.length && !plan.clearDefaults.length &&
  Object.values(plan.softDeletes).every(ids => !ids.length);
