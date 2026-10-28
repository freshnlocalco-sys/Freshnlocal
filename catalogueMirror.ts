/**
 * The per-write half of the catalogue migration: when an admin changes a
 * product or a settings document in Firestore, copy that change into Supabase
 * immediately.
 *
 * WHY THIS IS A SERVER ROUTE AND NOT A BROWSER WRITE
 *
 * web_products' write policy is `FOR ALL USING (web_is_admin())`, and
 * web_is_admin() resolves the caller through web_firebase_uid(), which reads a
 * Firebase uid out of the request's JWT. Supabase was never configured to
 * accept Firebase as a third-party auth provider, so that claim is always NULL
 * and a browser holding the anon key cannot write these tables at all. Until
 * sign-in moves to Supabase Auth, the only credential that can write is the
 * service role key, and that must never reach a browser. So: the browser says
 * what changed, the server does the writing.
 *
 * THE SECURITY PROPERTY THAT MATTERS
 *
 * This endpoint accepts IDS ONLY. It never accepts row data. It re-reads each
 * document from Firestore itself and copies what it finds. So the worst a
 * caller who defeats the auth below can achieve is to make the server resync
 * data that is already in Firestore -- not to write anything of their own
 * choosing into the catalogue. That is deliberate, and it is why the
 * authorisation check can afford to be simple.
 */

import type { Express, Request, Response } from 'express';
import { initializeApp, getApps } from 'firebase/app';
import { initializeFirestore, collection, doc, getDoc, getDocs } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';
import { transformProduct, transformSetting, SETTINGS_KEYS } from './catalogueTransform.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** At most this many ids per request. A full reorder touches every product. */
const MAX_IDS = 600;

const sbHeaders = () => ({
  apikey: SERVICE_ROLE_KEY as string,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
});

export const mirrorConfigured = (): boolean => Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

// --- Firestore, read anonymously -------------------------------------------
// Products and settings are publicly readable (firestore.rules: `allow read,
// list: if true`), which is how generate-sitemap.js and the website itself read
// them. No service account needed.
let firestore: ReturnType<typeof initializeFirestore> | null = null;
function getFirestoreClient() {
  if (!firestore) {
    const app = getApps().length
      ? getApps()[0]
      : initializeApp(firebaseConfig, 'catalogue-mirror');
    firestore = initializeFirestore(app, { experimentalForceLongPolling: true },
      (firebaseConfig as Record<string, string>).firestoreDatabaseId
        || 'ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67');
  }
  return firestore;
}

// --- auth -------------------------------------------------------------------

/**
 * The caller's Firebase uid, or null.
 *
 * Validated by Google rather than by us: accounts:lookup rejects a token with a
 * bad signature, the wrong audience or an expired clock, which is the whole job
 * and not something worth reimplementing. Needs only the public web API key.
 */
async function uidFromIdToken(idToken: string): Promise<string | null> {
  const apiKey = (firebaseConfig as Record<string, string>).apiKey;
  if (!apiKey || !idToken) return null;

  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
    if (!r.ok) return null;
    const body = await r.json() as { users?: Array<{ localId?: string }> };
    return body.users?.[0]?.localId ?? null;
  } catch {
    return null;
  }
}

/**
 * Is that uid an admin?
 *
 * Checked against web_users, which is the same table and the same roles
 * web_is_admin() uses, so the answer here and the answer the database would
 * give cannot diverge. web_users is a backfill and could in principle lag
 * Firestore on a very recently changed role -- acceptable precisely because of
 * the ids-only property above: a stale admin can trigger a resync and nothing
 * else.
 */
async function isAdmin(uid: string): Promise<boolean> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/web_users?id=eq.${encodeURIComponent(uid)}` +
    `&is_deleted=eq.false&role=in.(admin,horeca_admin)&select=id&limit=1`,
    { headers: sbHeaders() });
  if (!r.ok) return false;
  const rows = await r.json() as unknown[];
  return rows.length > 0;
}

// --- Supabase writes --------------------------------------------------------

async function upsert(table: string, rows: unknown[], conflict: string): Promise<void> {
  if (!rows.length) return;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`${table} upsert failed: ${r.status} ${await r.text()}`);
}

/**
 * A product that is gone from Firestore becomes soft-deleted here rather than
 * removed: web_products_read is `USING (is_deleted = FALSE)`, so the storefront
 * stops seeing it immediately, while web_sku_components and the ERP's mappings
 * keep the row they reference. deleted_on must be set in the same statement --
 * web_reviews-style soft-delete CHECK constraints refuse the inconsistent pair.
 */
async function softDelete(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const now = new Date().toISOString();
  const list = ids.map(encodeURIComponent).join(',');

  for (const [table, column] of [['web_products', 'id'], ['web_product_variants', 'web_product_id']]) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${column}=in.(${list})`, {
      method: 'PATCH',
      headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ is_deleted: true, deleted_on: now, deleted_by: 'catalogue-mirror' }),
    });
    if (!r.ok) throw new Error(`${table} soft delete failed: ${r.status} ${await r.text()}`);
  }
}

// --- the mirror pass --------------------------------------------------------

async function mirrorProducts(ids: string[]) {
  const fdb = getFirestoreClient();
  const products: unknown[] = [];
  const variants: unknown[] = [];
  const gone: string[] = [];
  const notes: string[] = [];

  for (const id of ids) {
    // Per-document try/catch, because one unusable id must not sink the batch.
    // A reorder sends every product at once, and getDoc throws outright on an
    // id Firestore considers invalid -- anything matching __*__ is reserved, for
    // one -- so without this a single bad id would discard the other 499
    // products' worth of work and leave the catalogue half-updated.
    try {
      const snap = await getDoc(doc(fdb, 'products', id));
      if (!snap.exists()) { gone.push(id); continue; }

      const out = transformProduct({ id: snap.id, ...snap.data() },
        (kind: string, msg: string) => { notes.push(`${kind}: ${msg}`); });
      if (!out) { notes.push(`skipped: ${id} produced no row`); continue; }

      products.push(out.product);
      variants.push(...out.variants);
    } catch (err: unknown) {
      // Not pushed to `gone`: a read that failed is not evidence the product was
      // deleted, and soft-deleting on a transient error would take a live
      // product off the shop.
      notes.push(`unreadable: ${id} (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  await upsert('web_products', products, 'id');
  await upsert('web_product_variants', variants, 'id');
  await softDelete(gone);

  return { written: products.length, deleted: gone.length, notes };
}

async function mirrorSettings(keys: string[]) {
  const fdb = getFirestoreClient();
  const rows: unknown[] = [];
  const notes: string[] = [];

  for (const key of keys) {
    if (!SETTINGS_KEYS.includes(key)) { notes.push(`ignored: ${key} is not a public settings key`); continue; }
    try {
      const snap = await getDoc(doc(fdb, 'settings', key));
      // A settings document that does not exist is not an error: the storefront
      // treats a missing document as "nothing configured" and falls back to its
      // defaults, so there is nothing to mirror and nothing to delete.
      if (!snap.exists()) { notes.push(`absent: settings/${key}`); continue; }
      rows.push(transformSetting({ id: key, ...snap.data() }, 'catalogue-mirror'));
    } catch (err: unknown) {
      notes.push(`unreadable: settings/${key} (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  await upsert('web_settings', rows, 'key');
  return { written: rows.length, deleted: 0, notes };
}

// --- route ------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The request, independent of how it arrived
// ---------------------------------------------------------------------------
//
// Two transports reach this: server.ts's Express route in local development,
// and api/admin/mirror-catalogue.ts as a Vercel function in production. They
// share this function for the same reason the bulk sync and the mirror share
// catalogueTransform.mjs -- if the two disagreed about who counts as an admin,
// the answer would depend on which environment the request landed in.
//
// Returns a status and a body rather than touching a response object, so it
// owes nothing to either framework.

export async function handleMirrorRequest(
  body: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!mirrorConfigured()) {
    // Not an error the admin can act on, and not a reason to fail their edit:
    // the Firestore write has already succeeded by the time this is called.
    return { status: 503, body: { error: 'Supabase is not configured on the server.' } };
  }

  try {
    const { idToken, type, ids } = (body ?? {}) as {
      idToken?: string; type?: string; ids?: unknown;
    };

    if (type !== 'products' && type !== 'settings') {
      return { status: 400, body: { error: "type must be 'products' or 'settings'" } };
    }
    if (!Array.isArray(ids) || !ids.length) {
      return { status: 400, body: { error: 'ids must be a non-empty array' } };
    }
    if (ids.length > MAX_IDS) {
      return { status: 400, body: { error: `at most ${MAX_IDS} ids per request` } };
    }
    const cleanIds = [...new Set(ids.map(String).filter(Boolean))];

    const uid = await uidFromIdToken(String(idToken ?? ''));
    if (!uid) return { status: 401, body: { error: 'Not signed in.' } };
    if (!(await isAdmin(uid))) return { status: 403, body: { error: 'Not an admin.' } };

    const result = type === 'products'
      ? await mirrorProducts(cleanIds)
      : await mirrorSettings(cleanIds);

    if (result.notes.length) {
      console.log(`[CATALOGUE MIRROR] ${type} by ${uid}:`, result.notes.slice(0, 10));
    }
    console.log(`[CATALOGUE MIRROR] ${type}: ${result.written} written, ${result.deleted} soft-deleted`);
    return { status: 200, body: { ok: true, ...result } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[CATALOGUE MIRROR] failed:', message);
    return { status: 500, body: { error: message } };
  }
}

/** The local development transport. Production goes through api/admin/. */
export function registerCatalogueMirror(app: Express): void {
  app.post('/api/admin/mirror-catalogue', async (req: Request, res: Response) => {
    const { status, body } = await handleMirrorRequest(req.body);
    res.status(status).json(body);
  });
}

/** Unused by the route; exported so a script can reach the same code path. */
export { mirrorProducts, mirrorSettings };
