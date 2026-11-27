/**
 * Writing a customer's own profile and address book to Supabase.
 *
 * Everything here runs under the CUSTOMER's session, not the service role, so
 * row level security is what confines each write to their own rows. There is no
 * "whose profile" parameter that could be pointed somewhere else: `uid` is
 * passed in for the WHERE clause, and RLS independently refuses it if it is not
 * the caller's.
 *
 * WHY THESE FUNCTIONS RETURN A BOOLEAN
 *
 * They report whether they handled the write. A customer signed in by WhatsApp
 * OTP has a Supabase session and is handled here; a staff member on Firebase
 * email+password is not, and the caller falls back to its existing Firestore
 * write. That keeps the staff path byte-for-byte what it was while the customer
 * path moves, rather than rewriting both at once.
 *
 * `uid` is a parameter rather than read from `useAuth` on purpose: reading it
 * would mean importing firebase.ts, which imports this file back.
 */

import { supabase } from './supabase';
import type { Address } from './firebase';

/** True when this browser holds a Supabase customer session. */
export async function hasSupabaseSession(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  } catch {
    return false;
  }
}

/**
 * Fields that live on the web_users row itself.
 *
 * Note what is absent: `points`. A customer must not write their own balance,
 * and after an order they no longer do -- orderCreate.ts deducts it server-side
 * through web_redeem_points(). Adding points here would hand that back.
 */
export interface ProfilePatch {
  display_name?: string;
  phone?: string;
  legacy_address?: string;
}

/**
 * Update the customer's own web_users row.
 *
 * Returns false when there is no Supabase session, meaning the caller should do
 * whatever it did before.
 */
export async function saveProfileFields(uid: string, patch: ProfilePatch): Promise<boolean> {
  if (!supabase || !(await hasSupabaseSession())) return false;

  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) clean[k] = v;
  }
  if (Object.keys(clean).length === 0) return true;  // nothing to do, but handled

  clean.updated_at = new Date().toISOString();

  const { error } = await supabase.from('web_users').update(clean).eq('id', uid);
  if (error) {
    console.error('[PROFILE] could not save profile fields:', error.message);
    throw new Error(error.message);
  }
  return true;
}

/**
 * Reconcile the whole address book to `addresses`.
 *
 * Firestore kept addresses as an array on the user document, so the pages hand
 * one around and expect to write it back whole. Supabase keeps them as rows in
 * web_addresses. Rather than change every page, this translates: rows that are
 * no longer in the array are soft-deleted, the rest are upserted.
 *
 * THE ORDER OF THE FOUR STEPS IS THE WHOLE TRICK
 *
 * `uq_web_addresses_one_default_live` is a unique index over (user_id) where
 * `is_deleted = FALSE AND is_default = TRUE`. So at no instant may a customer
 * have two live default addresses -- not even halfway through this function. If
 * the upsert ran first, promoting a new default while the old one still held
 * the flag would violate it and the whole save would fail.
 *
 * Hence: delete, clear every flag, upsert flagless, then set exactly one.
 *
 * Soft deletes, not hard ones: a removed address may still be referenced by
 * web_orders.address_id, and an order should not lose where it went because the
 * customer later tidied their address book.
 */
export async function saveAddresses(uid: string, addresses: Address[]): Promise<boolean> {
  if (!supabase || !(await hasSupabaseSession())) return false;

  const now = new Date().toISOString();
  const keep = addresses.filter(a => a?.id);
  const keepIds = new Set(keep.map(a => String(a.id)));

  // 1. Soft-delete the rows that are gone from the array.
  const { data: existing, error: readErr } = await supabase
    .from('web_addresses')
    .select('id')
    .eq('user_id', uid)
    .eq('is_deleted', false);

  if (readErr) {
    console.error('[PROFILE] could not read the address book:', readErr.message);
    throw new Error(readErr.message);
  }

  const gone = (existing ?? []).map(r => String(r.id)).filter(id => !keepIds.has(id));
  if (gone.length) {
    const { error } = await supabase
      .from('web_addresses')
      .update({ is_deleted: true, deleted_on: now, deleted_by: 'customer' })
      .in('id', gone);
    if (error) {
      console.error('[PROFILE] could not remove addresses:', error.message);
      throw new Error(error.message);
    }
  }

  if (keep.length === 0) return true;

  // 2. Clear every default flag this customer has, so step 3 cannot collide.
  const { error: clearErr } = await supabase
    .from('web_addresses')
    .update({ is_default: false })
    .eq('user_id', uid)
    .eq('is_deleted', false)
    .eq('is_default', true);
  if (clearErr) {
    console.error('[PROFILE] could not clear default addresses:', clearErr.message);
    throw new Error(clearErr.message);
  }

  // 3. Upsert every address, all with is_default false for the moment.
  const rows = keep.map(a => ({
    id: String(a.id),
    user_id: uid,
    label: a.label ?? '',
    name: a.name ?? null,
    phone: a.phone ?? null,
    line1: a.line1 ?? '',
    line2: a.line2 ?? '',
    landmark: a.landmark ?? null,
    city: a.city ?? '',
    state: a.state ?? '',
    pincode: a.pincode ?? '',
    is_default: false,
    is_deleted: false,
    deleted_on: null,
    deleted_by: null,
  }));

  const { error: upsertErr } = await supabase.from('web_addresses').upsert(rows, { onConflict: 'id' });
  if (upsertErr) {
    console.error('[PROFILE] could not save addresses:', upsertErr.message);
    throw new Error(upsertErr.message);
  }

  // 4. Exactly one default. If the array marks none, the first address is it --
  //    matching what the storefront has always shown, where the top of the list
  //    is the one checkout preselects.
  const wanted = keep.find(a => a.isDefault) ?? keep[0];
  if (wanted) {
    const { error } = await supabase
      .from('web_addresses')
      .update({ is_default: true })
      .eq('id', String(wanted.id));
    if (error) {
      console.error('[PROFILE] could not set the default address:', error.message);
      throw new Error(error.message);
    }
  }

  return true;
}
