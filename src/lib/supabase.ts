/**
 * The Supabase client the storefront reads its catalogue through, and the flag
 * that decides whether it reads from Supabase at all.
 *
 * Stage 1 of moving off Firebase (see SUPABASE_MIGRATION.md) replaces the
 * catalogue reads only: products, variants, settings and offers. Those four are
 * public data, readable with the anon key under row level security, so this
 * stage needs no sign-in and touches nothing a customer owns. Auth, orders,
 * addresses and the admin dashboard still go through Firebase.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Null when the environment is not configured, which is the whole rollback
 * story: no env, no client, and `catalogueSource()` falls back to Firestore.
 *
 * The anon key is meant to be public -- it identifies the project and carries
 * no privileges of its own, and every table it can reach is one an anonymous
 * visitor is allowed to read. The service role key is the opposite and must
 * never appear here; it lives in .env without a VITE_ prefix so Vite cannot
 * expose it to a browser bundle even by accident.
 *
 * Sessions are deliberately off. Stage 1 reads public data anonymously and has
 * no business writing to storage or racing Firebase's own auth state. Stage 2
 * turns persistSession and autoRefreshToken back on when sign-in moves over.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;

export type CatalogueSource = 'firestore' | 'supabase';

let warned = false;

/**
 * Which backend the catalogue comes from.
 *
 * Firestore unless VITE_CATALOGUE_SOURCE is exactly 'supabase' AND the client
 * is configured. Defaulting to Firestore means an unset or misspelt variable
 * leaves the live site on the path it has always used, rather than quietly
 * serving an empty shop.
 *
 * To roll back: unset VITE_CATALOGUE_SOURCE and rebuild. There is no code
 * change and no database change involved either way.
 */
export function catalogueSource(): CatalogueSource {
  const want = (import.meta.env.VITE_CATALOGUE_SOURCE as string | undefined)?.trim();

  if (want !== 'supabase') return 'firestore';

  if (!supabase) {
    if (!warned) {
      warned = true;
      console.warn(
        '[CATALOGUE] VITE_CATALOGUE_SOURCE=supabase but VITE_SUPABASE_URL / ' +
          'VITE_SUPABASE_ANON_KEY are not set. Falling back to Firestore.'
      );
    }
    return 'firestore';
  }

  return 'supabase';
}

/** True when the catalogue is being served from Postgres. */
export const usingSupabaseCatalogue = (): boolean => catalogueSource() === 'supabase';
