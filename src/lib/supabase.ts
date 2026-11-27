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
 * Sessions are ON as of Stage 2 (customer phone + WhatsApp OTP login). Stage 1
 * had all three off, because reading a public catalogue anonymously has no
 * business writing to storage or racing Firebase's auth state. Now that a
 * customer's session lives here, it has to survive a refresh and refresh its
 * own access token, so the first two are back on.
 *
 * detectSessionInUrl stays OFF. It exists for OAuth and magic-link redirects
 * that come back with tokens in the URL fragment, and phone OTP has no redirect
 * at all -- the code is typed into the page that asked for it. Leaving it on
 * would mean the client scans every URL the storefront is ever loaded with,
 * which is a parser we do not need pointed at our query strings.
 *
 * Staff still sign in through Firebase, so two auth systems are live at once.
 * src/lib/authSession.ts arbitrates which one owns the current session; without
 * it, whichever listener fired last would win and sign the other out.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
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
