/**
 * Telling the server that a product or settings document just changed, so it
 * can copy the change from Firestore into Supabase.
 *
 * The admin dashboard still writes to Firestore. The storefront may be reading
 * its catalogue from Supabase. Without this, the two diverge the moment anyone
 * edits anything -- and the edit that cannot afford to lag is the out-of-stock
 * toggle, because a product marked unavailable has to stop selling now.
 *
 * Only ids go over the wire. The server re-reads Firestore itself, which is why
 * nothing here needs to be trusted; see catalogueMirror.ts.
 */

import toast from 'react-hot-toast';
import {
  setDoc as fsSetDoc,
  updateDoc as fsUpdateDoc,
  deleteDoc as fsDeleteDoc,
  type DocumentReference,
  type DocumentData,
  type SetOptions,
} from 'firebase/firestore';
import { auth } from './firebase';
import { usingSupabaseCatalogue } from './supabase';

type MirrorType = 'products' | 'settings';

/** The collections this mirror knows how to carry. Anything else is ignored. */
const MIRRORED_COLLECTIONS: Record<string, MirrorType> = {
  products: 'products',
  settings: 'settings',
};

/** The server refuses more than 600 in one request. */
const CHUNK = 500;

/**
 * Writes arrive in loops -- a bulk category change or a reorder touches every
 * product one document at a time -- so ids are collected and sent together
 * rather than one request per document. The wait also means Firestore has
 * certainly settled by the time the server reads it back.
 */
const FLUSH_DELAY_MS = 300;

const pending: Record<MirrorType, Set<string>> = {
  products: new Set(),
  settings: new Set(),
};

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let warnedThisSession = false;

async function post(type: MirrorType, ids: string[]): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('not signed in');

  const idToken = await user.getIdToken();

  for (let i = 0; i < ids.length; i += CHUNK) {
    const res = await fetch('/api/admin/mirror-catalogue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, type, ids: ids.slice(i, i + CHUNK) }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${res.status} ${body.slice(0, 200)}`);
    }
  }
}

function reportFailure(type: MirrorType, count: number, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[CATALOGUE MIRROR] ${count} ${type} did not reach Supabase:`, message);

  // How loudly this matters depends entirely on where the shop is reading from.
  // On Firestore, a failed mirror costs nothing today and the next full sync
  // repairs it, so console is the right volume. On Supabase, the change the
  // admin just made is NOT live, and they are the only person who can know
  // that -- so say it, once, rather than letting the shop quietly disagree with
  // the dashboard.
  if (usingSupabaseCatalogue() && !warnedThisSession) {
    warnedThisSession = true;
    toast.error(
      'Saved, but the live catalogue was not updated. Reload and check, or re-run the catalogue sync.',
      { duration: 10000 }
    );
  }
}

async function flush(): Promise<void> {
  flushTimer = null;

  for (const type of ['products', 'settings'] as MirrorType[]) {
    const ids = [...pending[type]];
    if (!ids.length) continue;
    pending[type].clear();

    try {
      await post(type, ids);
    } catch (err) {
      reportFailure(type, ids.length, err);
    }
  }
}

/** Queue ids to mirror. Never throws and never blocks the caller. */
export function queueMirror(type: MirrorType, ids: string[]): void {
  const usable = ids.map(String).filter(Boolean);
  if (!usable.length) return;

  for (const id of usable) pending[type].add(id);

  if (flushTimer === null) {
    flushTimer = setTimeout(() => { void flush(); }, FLUSH_DELAY_MS);
  }
}

/** Send whatever is queued right now. For tests and for explicit checkpoints. */
export async function flushMirror(): Promise<void> {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flush();
}

/** The mirror target for a document reference, or null if it is not mirrored. */
function targetFor(ref: DocumentReference): { type: MirrorType; id: string } | null {
  const collectionId = ref.parent?.id;
  const type = collectionId ? MIRRORED_COLLECTIONS[collectionId] : undefined;
  return type ? { type, id: ref.id } : null;
}

function mirrorRef(ref: DocumentReference): void {
  const target = targetFor(ref);
  if (target) queueMirror(target.type, [target.id]);
}

// ---------------------------------------------------------------------------
// Firestore writes that also tell the server
// ---------------------------------------------------------------------------
//
// Drop-in replacements, same arguments and same return value. Wrapping the
// write rather than instrumenting each of the thirty-odd call sites means the
// target is derived from the DocumentReference itself -- there is no second
// list of collection names and document ids to keep in step with the first.
//
// Writes to collections outside MIRRORED_COLLECTIONS (orders, users, reviews)
// pass straight through and queue nothing. That is intentional: those move in a
// later stage, and routing them through here now would only hide which writes
// are actually mirrored.

// DocumentData, not Record<string, unknown>: callers pass declared interfaces
// such as FreeGiftOffer, and an interface has no index signature, so
// Record<string, unknown> rejects exactly the well-typed call sites it should
// accept. DocumentData is what Firestore's own setDoc takes.
export async function setDocMirrored(
  ref: DocumentReference,
  data: DocumentData,
  options?: SetOptions
): Promise<void> {
  // Mirror only after Firestore has accepted the write, so a rejected write is
  // never announced -- and so the server reads back the value that stuck.
  if (options) {
    await fsSetDoc(ref, data, options);
  } else {
    await fsSetDoc(ref, data);
  }
  mirrorRef(ref);
}

export async function updateDocMirrored(
  ref: DocumentReference,
  data: DocumentData
): Promise<void> {
  await fsUpdateDoc(ref, data);
  mirrorRef(ref);
}

export async function deleteDocMirrored(ref: DocumentReference): Promise<void> {
  await fsDeleteDoc(ref);
  // The server will find the document gone and soft-delete the Supabase row,
  // which is what takes it out of the storefront's read.
  mirrorRef(ref);
}

/**
 * For writeBatch, which has no per-document hook. Call after batch.commit()
 * with the product ids the batch touched.
 */
export function mirrorProductIds(ids: string[]): void {
  queueMirror('products', ids);
}
