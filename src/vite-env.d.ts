/// <reference types="vite/client" />

/**
 * The environment the browser bundle is allowed to see.
 *
 * Vite only exposes variables prefixed VITE_, which is the mechanism keeping
 * SUPABASE_SERVICE_ROLE_KEY out of the client: it is in .env without the
 * prefix, so it reaches server.ts and the scripts and cannot reach here.
 * Declaring these explicitly rather than relying on the index signature means
 * a typo in a variable name is a type error instead of a silent undefined.
 */
interface ImportMetaEnv {
  /** Supabase project URL. Public. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon key. Public by design, privileged only by RLS. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** 'supabase' serves the catalogue from Postgres. Anything else, Firestore. */
  readonly VITE_CATALOGUE_SOURCE?: 'firestore' | 'supabase' | string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
