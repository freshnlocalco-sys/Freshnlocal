/**
 * Saved recipes and Freshi chat history.
 *
 * Firestore kept these as subcollections of the user document --
 * `users/{uid}/savedRecipes` and `users/{uid}/recipeChat`. Supabase keeps them
 * as `web_saved_recipes` and `web_recipe_chats`, rows owned by a user_id under
 * row level security.
 *
 * Every function here takes the same shape: try Supabase when the browser holds
 * a customer session, and otherwise do exactly what the page used to do against
 * Firestore. Staff are the only people left on the Firebase path and they are
 * not the audience for a recipe assistant, but a staff member who opens it
 * should get a working page rather than a silent no-op -- which is what a
 * straight port to Supabase would have given them.
 *
 * Shapes are translated back to what the pages already render (`updatedAt` and
 * `createdAt` in epoch milliseconds, `recipeMarkdown`), so RecipeAI and Profile
 * keep their existing state handling.
 */

import { supabase } from './supabase';
import { db } from './firebase';
import {
  collection, doc, setDoc, addDoc, deleteDoc, getDocs, query, orderBy,
} from 'firebase/firestore';

export interface ChatSessionRow {
  id: string;
  title: string;
  messages: any[];
  updatedAt: number;
}

export interface SavedRecipeRow {
  id: string;
  title: string | null;
  recipeMarkdown: string;
  createdAt: number;
}

/** True when this browser holds a Supabase customer session. */
async function onSupabase(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  } catch {
    return false;
  }
}

const ms = (v: any): number => {
  if (v == null) return 0;
  const n = Number(v);
  if (Number.isFinite(n) && n > 1e11) return n;       // already epoch ms
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

// ---------------------------------------------------------------------------
// Chat sessions
// ---------------------------------------------------------------------------

export async function listChats(uid: string): Promise<ChatSessionRow[]> {
  if (await onSupabase()) {
    const { data, error } = await supabase!
      .from('web_recipe_chats')
      .select('id, title, messages, updated_at, created_at')
      // Filtered here, not left to RLS. web_recipe_chats_own is
      // `USING (user_id = web_firebase_uid() OR web_is_admin())`, so for a
      // staff caller the policy stops narrowing and this would return every
      // customer's chat history as if it were theirs.
      .eq('user_id', uid)
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false, nullsFirst: false });
    if (error) {
      console.error('[RECIPES] could not load chats:', error.message);
      return [];
    }
    return (data ?? []).map(r => ({
      id: String(r.id),
      title: r.title || 'New Chef Chat',
      messages: Array.isArray(r.messages) ? r.messages : [],
      updatedAt: ms(r.updated_at ?? r.created_at),
    }));
  }

  const snap = await getDocs(
    query(collection(db, 'users', uid, 'recipeChat'), orderBy('updatedAt', 'desc'))
  );
  return snap.docs.map(d => {
    const data = d.data() as any;
    return {
      id: d.id,
      title: data.title || 'New Chef Chat',
      messages: Array.isArray(data.messages) ? data.messages : [],
      updatedAt: ms(data.updatedAt),
    };
  });
}

/** Create or replace one session. Same call for both, as setDoc always was. */
export async function saveChat(
  uid: string,
  id: string,
  session: { title: string; messages: any[]; updatedAt: number }
): Promise<void> {
  if (await onSupabase()) {
    const { error } = await supabase!.from('web_recipe_chats').upsert(
      {
        id,
        user_id: uid,
        title: session.title ?? '',
        // The column is jsonb with a CHECK that it is an array, so an undefined
        // or object `messages` would be rejected outright rather than stored
        // and found later.
        messages: Array.isArray(session.messages) ? session.messages : [],
        updated_at: new Date(session.updatedAt || Date.now()).toISOString(),
        is_deleted: false,
        deleted_on: null,
        deleted_by: null,
      },
      { onConflict: 'id' }
    );
    if (error) {
      console.error('[RECIPES] could not save chat:', error.message);
      throw new Error(error.message);
    }
    return;
  }

  await setDoc(doc(db, 'users', uid, 'recipeChat', id), {
    messages: session.messages,
    title: session.title,
    updatedAt: session.updatedAt,
  });
}

export async function deleteChat(uid: string, id: string): Promise<void> {
  if (await onSupabase()) {
    // Soft delete, matching every other customer-owned table here: a chat the
    // customer removed is still theirs, and hard deletes leave nothing to
    // restore when someone removes the wrong one.
    const { error } = await supabase!
      .from('web_recipe_chats')
      .update({ is_deleted: true, deleted_on: new Date().toISOString(), deleted_by: 'customer' })
      .eq('id', id)
      .eq('user_id', uid);      // never delete someone else's, policy or no policy
    if (error) {
      console.error('[RECIPES] could not delete chat:', error.message);
      throw new Error(error.message);
    }
    return;
  }

  await deleteDoc(doc(db, 'users', uid, 'recipeChat', id));
}

// ---------------------------------------------------------------------------
// Saved recipes
// ---------------------------------------------------------------------------

export async function listSavedRecipes(uid: string): Promise<SavedRecipeRow[]> {
  if (await onSupabase()) {
    const { data, error } = await supabase!
      .from('web_saved_recipes')
      .select('id, title, recipe_markdown, created_at')
      .eq('user_id', uid)        // see the note in listChats
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[RECIPES] could not load saved recipes:', error.message);
      return [];
    }
    return (data ?? []).map(r => ({
      id: String(r.id),
      title: r.title ?? null,
      recipeMarkdown: r.recipe_markdown || '',
      createdAt: ms(r.created_at),
    }));
  }

  const snap = await getDocs(
    query(collection(db, 'users', uid, 'savedRecipes'), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map(d => {
    const data = d.data() as any;
    return {
      id: d.id,
      title: data.title ?? null,
      recipeMarkdown: data.recipeMarkdown || data.recipe || '',
      createdAt: ms(data.createdAt),
    };
  });
}

/** Returns the new row's id, which the page keeps so it can unsave it again. */
export async function saveRecipe(
  uid: string,
  recipeMarkdown: string,
  title?: string
): Promise<string> {
  if (await onSupabase()) {
    // Minted here rather than by the database: the caller needs the id
    // immediately to mark the message as saved, and Firestore's addDoc gave it
    // one synchronously too.
    const id = `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const { error } = await supabase!.from('web_saved_recipes').insert({
      id,
      user_id: uid,
      title: title ?? null,
      recipe_markdown: recipeMarkdown,
    });
    if (error) {
      console.error('[RECIPES] could not save recipe:', error.message);
      throw new Error(error.message);
    }
    return id;
  }

  const ref = await addDoc(collection(db, 'users', uid, 'savedRecipes'), {
    recipeMarkdown,
    createdAt: Date.now(),
    ...(title ? { title } : {}),
  });
  return ref.id;
}

export async function deleteSavedRecipe(uid: string, id: string): Promise<void> {
  if (await onSupabase()) {
    const { error } = await supabase!
      .from('web_saved_recipes')
      .update({ is_deleted: true, deleted_on: new Date().toISOString(), deleted_by: 'customer' })
      .eq('id', id)
      .eq('user_id', uid);      // never delete someone else's, policy or no policy
    if (error) {
      console.error('[RECIPES] could not delete saved recipe:', error.message);
      throw new Error(error.message);
    }
    return;
  }

  await deleteDoc(doc(db, 'users', uid, 'savedRecipes', id));
}
