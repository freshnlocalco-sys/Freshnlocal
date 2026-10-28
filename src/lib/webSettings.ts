/**
 * Reading the public settings documents out of Supabase.
 *
 * Firestore keeps these as six documents in a `settings` collection:
 * heroBanners, categoriesConfig, categoryImages, spotlights, branding and
 * promotions. web_settings is the same six as key/value rows, where `value`
 * holds the Firestore document's data verbatim -- so a caller that did
 * `docSnap.data()` can use `fetchWebSetting(key)` and change nothing else.
 *
 * Writes are NOT here. The admin dashboard still writes these to Firestore,
 * which is why scripts/syncCatalogueToSupabase.mjs carries them across; see
 * SUPABASE_MIGRATION.md on how long that is tolerable.
 */

import { supabase } from './supabase';

export type WebSettingKey =
  | 'heroBanners'
  | 'categoriesConfig'
  | 'categoryImages'
  | 'spotlights'
  | 'branding'
  | 'promotions';

/**
 * One settings document, or null when the row does not exist.
 *
 * Null is the equivalent of Firestore's `!docSnap.exists()`, which every caller
 * already handles by falling back to a default. A read failure throws, because
 * the callers treat an exception as "keep the cached value" and a null as
 * "there is genuinely nothing configured" -- collapsing the two would quietly
 * reset a shopper's view to defaults whenever the network blipped.
 */
export async function fetchWebSetting<T = Record<string, unknown>>(
  key: WebSettingKey
): Promise<T | null> {
  if (!supabase) throw new Error('Supabase client is not configured.');

  const { data, error } = await supabase
    .from('web_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) throw error;
  return (data?.value ?? null) as T | null;
}

/**
 * Several settings in one request, as a key -> value map. Keys with no row are
 * absent from the map rather than present-and-null, so `?? fallback` works.
 *
 * fetchCategoryImages wants categoryImages and categoriesConfig together; two
 * round trips for what the UI treats as one load is a flicker nobody needs.
 */
export async function fetchWebSettings(
  keys: WebSettingKey[]
): Promise<Partial<Record<WebSettingKey, Record<string, unknown>>>> {
  if (!supabase) throw new Error('Supabase client is not configured.');

  const { data, error } = await supabase
    .from('web_settings')
    .select('key, value')
    .in('key', keys);

  if (error) throw error;

  const out: Partial<Record<WebSettingKey, Record<string, unknown>>> = {};
  for (const row of data ?? []) {
    if (row?.key != null && row.value != null) {
      out[row.key as WebSettingKey] = row.value as Record<string, unknown>;
    }
  }
  return out;
}
