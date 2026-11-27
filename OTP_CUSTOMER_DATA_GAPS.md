# Customer data paths under OTP login

**Status 24 Nov 2026: clear.** Every customer-facing Firestore path has moved.
What remains on Firestore is staff-only and deliberate.

A customer signed in with phone + WhatsApp OTP holds a **Supabase** session and
has **no Firebase user at all** — `auth.currentUser` is `null`. Anything that
reached Firestore from the browser was therefore an unauthenticated request,
refused by Firestore rules.

The dangerous part was always *how* it was refused. Nearly every one of these
calls sat inside `try { … } catch { console.warn(…) }`, and several updated
local React state **before** the write. The screen said it worked and the change
was gone on the next reload. No error reached the customer.

---

## Fixed

| what | was | now |
|---|---|---|
| **Checkout** (`createOrder`) | `auth.currentUser` → "not signed in" for every OTP customer. **Nobody could place an order.** | `getCallerToken()` — sends whichever token exists |
| **Order history** (`fetchMyOrders`) | same | same |
| **Server identity** (`lookupCaller`) | Firebase ID tokens only | accepts a Supabase access token too; both resolve to a `web_users.id` |
| **Points deduction** (`Cart.tsx`) | browser wrote a balance to Firestore; silent no-op, so the same 100 points could be redeemed on every order | deducted server-side in `orderCreate.ts` via atomic `web_redeem_points()` |
| **Checkout address + phone** | same Firestore write, silently lost | `saveProfileFields()` / `saveAddresses()` → Supabase |
| **Address book** (4 helpers in `firebase.ts`) | Firestore; edits reverted on reload | `saveAddresses()` → `web_addresses` |
| **Reviews** (`ProductReviews.tsx`) | Firestore read + write | reads direct from Supabase (public), writes via `/api/reviews/*` |
| **Saved recipes** (`Profile`, `RecipeAI`) | `users/{uid}/savedRecipes` | `web_saved_recipes` via `recipeStore.ts` |
| **Recipe chats** (`RecipeAI`, 6 sites) | `users/{uid}/recipeChat` | `web_recipe_chats` via `recipeStore.ts` |
| **Admin reviews tab** | read Firestore `reviews` — would have shown an empty list forever while customers posted to Supabase | `fetchAllReviews()` |
| **Admin points award** | `increment()` to Firestore `users/{uid}` — credited a document nobody reads | `/api/admin/award-points` → `web_award_points()` |

The last two were not pre-existing: this migration created them. Moving reviews
and balances to Supabase left AdminDashboard writing to the old place, which
would have meant **loyalty points silently never reaching customers** and an
empty moderation list.

## The two patterns used, and why

**Direct client writes under RLS** — addresses, profile fields, recipes,
recipe chats. The customer's own Supabase session is the authority and RLS
confines each write to their own rows. `recipeStore.ts` and
`customerProfile.ts` fall back to Firestore when there is no Supabase session,
so a staff member gets a working page rather than a silent no-op.

**Through the server with the service role** — reviews, points in both
directions. Needed wherever **staff** must be able to act: an admin holds a
Firebase token, so `web_firebase_uid()` is NULL for them, `web_is_admin()` is
false, and a direct write matches no rows. PostgREST answers 200 with an empty
array — success, affecting nothing. That is the same silent failure in a new
place, so those paths go through `lookupCaller()`, which accepts either token
type, with the permission check done in our own code.

Points never move from the browser in either direction now. `web_users` has a
trigger (`trg_web_users_guard_privileged_columns`) that refuses a shopper
changing `role` or `points`, which is exactly why.

## Still on Firestore, on purpose

**AdminDashboard**, apart from the two rows above. Staff keep Firebase
email+password, so `auth.currentUser` is a real user for them and Firestore
rules are satisfied. Roughly 33 call sites that can stay where they are
indefinitely.

Also `src/lib/firebase.ts` (the staff auth listener and the fallback branches
inside the Supabase-first helpers) and the Firestore halves of `recipeStore.ts`
and `customerProfile.ts`. All deliberate.

## Before any of it works

Three migrations, **none run**, in `fresh-n-local/supabase/updates/`:

```
supabase_web_auth_user_id.sql     links a login to the storefront account
supabase_web_points_redeem.sql    web_redeem_points() + web_award_points()
supabase_web_otp_throttle.sql     per-number OTP send limit
```

Until the first one runs, an OTP login resolves to no account at all and RLS
correctly shows it nothing.

## A note on reviews

`web_reviews` has 0 rows, and so does Firestore `reviews` — checked directly,
there has never been any review data on either side. The earlier warning about
backfilling first was precautionary and turned out to be moot.
`scripts/backfillReviewsToSupabase.mjs` exists and reports cleanly; it is there
in case reviews appear in Firestore before the switch, and needs no service
account because `firestore.rules` makes reviews publicly readable.
