# Moving the storefront off Firebase onto Supabase

Firebase is not being deleted. Its Storage bucket keeps serving every product
image we already have, and the Firestore data stays where it is as a fallback
until each stage below is proven. Nothing here is a one-way door.

## What we found

The storefront has **118 Firestore call sites** across 16 files in `src/`, plus
the SSR server, the email poller and three build scripts. That number sounds
worse than it is, because the calls are not spread evenly — they sit behind two
abstractions that are already in place:

| Seam | What it is | Who depends on it |
|---|---|---|
| **Data** | the Zustand stores: `useProducts`, `useSettings`, `useOffers`, plus `cacheManager` | every catalogue page — `Shop`, `ProductCard`, `QuickViewModal`, `FNLJuice` query nothing themselves |
| **Auth** | `useAuth` and the helpers exported from `src/lib/firebase.ts` | every page that knows who is signed in |

Both halves of this migration go through one of those two seams. Pages that
only import `useAuth` need no change at all.

Concentration of the remaining calls:

```
src/pages/AdminDashboard.tsx   35   (30% of everything, one file)
src/store/useSettings.ts       20
src/lib/firebase.ts            11
src/pages/RecipeAI.tsx         10
src/lib/horecaPrices.ts         8
everything else               ≤5 each
```

### The schema is already built

The six Firestore collections — `products`, `orders`, `users`, `reviews`,
`horecaPrices`, `settings` — all have Supabase tables with the data already
backfilled:

```
web_products          444      web_orders         248
web_product_variants  445      web_order_items   2418
web_users             318      web_addresses      178
web_horeca_prices    3467      web_settings         6
web_recipe_chats       55      web_saved_recipes    3
web_reviews             0  <-- NOT backfilled yet
```

### RLS already works, and that decides the order of work

Checked against the live project with the anon key — what an anonymous browser
can read **today**, with no code changes at all:

```
web_products          444 rows readable
web_product_variants  445 rows readable
web_settings            6 rows readable
web_reviews             0 rows readable
web_users               BLOCKED
web_orders              BLOCKED
web_addresses           BLOCKED
web_horeca_prices       BLOCKED
```

The public catalogue is already servable from Supabase. The private half is
correctly sealed. So the catalogue can move **before** any auth work, and
carries none of the auth risk.

### The one real obstacle

`web_users.id` is `TEXT` — it holds the **Firebase uid**, not a generated id.
That was deliberate: every order, address and review is keyed on that uid, and a
Firebase JWT presents it as `sub`, so RLS could compare directly with no lookup
table. **22 policies** go through `web_firebase_uid()`.

Switching to Supabase Auth does *not* require rekeying any of that. The fix
mirrors what we already did for ERP staff:

1. add `web_users.auth_user_id UUID` referencing `auth.users`
2. change the **body** of `web_firebase_uid()` to resolve
   `auth.uid()` -> `web_users.auth_user_id` -> return the existing `id`

All 22 policies keep working untouched, because the function keeps its name and
its return type. One function body, not 22 policies.

Worth noting: Firebase was **never** wired into Supabase as a third-party auth
provider, so no production traffic depends on Firebase tokens reaching Postgres
today. The storefront has only ever reached Supabase through the service role,
via the order mirror. That makes this cheaper than it would have been.

## Stages

### Stage 1 — public catalogue (no auth, fully reversible)
`useProducts`, `useSettings`, `useOffers`, `cacheManager`, `Home`,
`ProductDetail`, and the `generate-feed` / `generate-meta` / `generate-sitemap`
build scripts. ~35 call sites in 6 files. Needs no auth and no new policies —
the tables are already readable. Put it behind a flag so it can be switched back
without a deploy.

Blocked on nothing. Backfill `web_reviews` as part of this, since it is the one
public table still empty.

### Stage 2 — auth
The `auth_user_id` column and the `web_firebase_uid()` body change above, then
Supabase Auth accounts for 318 existing customers.

**Passwords are the open question.** Supabase's official Firebase Auth guide
imports Firebase's scrypt hashes using the project's own hash parameters
(`base64_signer_key`, `salt_separator`, `rounds`, `mem_cost`, from Firebase
console -> Authentication -> Users -> three-dot menu -> "Password hash
parameters"). Reports conflict on whether this still works end to end, so it
must be proven on two or three test accounts before anyone commits to it. If it
works, no customer notices anything. If it does not, 318 people get a password
reset email — survivable, but not something to discover halfway through.

Google sign-in users have no password at all and instead need Google OAuth
configured on the Supabase project; Supabase links them by verified email.
**We cannot see the Google/email split from here** — it needs
`firebase auth:export` or the Firebase console, as there is no service account
key in either repo.

### Stage 3 — private reads and writes
`Orders`, `Profile`, `web_addresses`, `horecaPrices`, review writing, `RecipeAI`.
Depends entirely on Stage 2.

### Stage 4 — admin dashboard
`AdminDashboard.tsx` on its own is 35 call sites and 11 Storage calls, plus
`AdminNotifier`'s realtime listener. Only two realtime listeners exist in the
whole app, so Supabase Realtime is a small surface, not a big one.

### Stage 5 — Storage (deferrable indefinitely)
Existing image URLs keep working because the Firebase bucket is staying. Only
*new* uploads would need to point at Supabase Storage. There is no rush here and
no data to move.

## Sequencing hazards

- **`order_number` must move into Postgres before the website writes orders.**
  Allocation is `select max + 1` in the browser today. A second writer against
  that is a duplicate order number on the packing floor.
- Once the website writes orders straight to Supabase, the Firestore order
  mirror in `emailTriggers.ts` becomes redundant. Retire it in the same change
  that moves order writing, not before and not after.
- 186 unmapped SKUs are still outstanding and are not blocked by any of this.
- `emailTriggers.ts` still carries a hardcoded live credential
  (`system-email-trigger@freshnlocal.com` with its password on the next line).
  Stage 2 is the natural moment to fix it, since that account has to move too.
- ~30 one-off scratch scripts at the repo root import Firebase
  (`check_*.js`, `list_cats*.js`, `patch_*.js`, `test_*.ts`, `update_db_*.js`,
  `fix_*.js`). They are debris. Delete them rather than migrating them.
- `functions/` is dead code: no `firebase.json`, dependencies never installed,
  nothing references it. Delete, do not migrate.

## Recommendation

Start with Stage 1. It is a third of the call volume, it needs no auth, no new
policies and no data migration, and it proves the query pattern on real traffic
before anything irreversible happens. Fetch the Firebase password hash
parameters and the provider split in parallel, so Stage 2 can start the moment
Stage 1 is verified.

---

# Stage 1 as built

Done in code, **not yet switched on**. `VITE_CATALOGUE_SOURCE=firestore`, so the
site behaves exactly as it did before.

## What the survey turned up, which changed the shape of this stage

Measuring the live data rather than trusting the first backfill found four
things that would each have been a visible break:

1. **157 of 449 products are out of stock.** `inStock` was never carried into
   `web_products`, and the storefront gates its Add button on it in nine places.
   Defaulting it either way is wrong: false kills the shop, true takes orders
   for things that are not on the shelf.
2. **174 products were missing a size.** A Firestore product carries its own
   `unit`/`price` *and*, on 174 of them, a separate `variants` array, and the
   storefront renders both as `[defaults, ...variants]`. The first backfill kept
   only the variant. Fresh Dill is sold as 100 g for 20 and 200 g for 40;
   Supabase held only the 200 g. All 174 checked: every one differs from its
   first variant, so these are real sizes, not duplicates.
3. **275 products would have grown a duplicate option.** Every product got a
   variant row in the backfill, synthesised from the base fields when Firestore
   had no array. Read back naively that renders twice. Variant count cannot tell
   the cases apart -- 173 of the 174 real ones have exactly one entry -- so
   `has_own_variants` records it at sync time.
4. **100 products carry `isDeactivated: true` and are live on the site.** The
   field is read by nothing in either codebase. Wiring it to visibility, which
   is the obvious thing to do with a column of that name, would have silently
   removed 100 products from the shop.

Also: 5 products added since the 27 Oct backfill were absent, and
`public/sitemap.xml` was stale by 129 products (regenerated, so that diff is a
fix, not noise).

**Correction.** An earlier version of this document, and of the sync script,
said five of the six settings documents had drifted. They had not. All six were
identical. The comparison was `JSON.stringify(firestoreDoc) !==
JSON.stringify(supabaseValue)`, and Postgres `jsonb` does not preserve key
insertion order, so every nested document compared unequal on key order alone.
Checked again with a canonical deep comparison: six of six identical. The sync
script now canonicalises before comparing and reports `0 changed`.

`web_reviews` is empty because **Firestore `reviews` is empty**. Nothing to
backfill, and nothing was lost.

## Files

New:

```
src/lib/supabase.ts              client + the VITE_CATALOGUE_SOURCE flag
src/lib/catalogue.ts             products: query, mapper, fetchProductById
src/lib/webSettings.ts           the six settings documents
src/vite-env.d.ts                typed import.meta.env
scripts/syncCatalogueToSupabase.mjs    Firestore -> Supabase, dry run by default
scripts/verifyCatalogueParity.mjs      compares both sources, gates the flip
scripts/lib/catalogueSource.mjs        the same flag for the build scripts
fresh-n-local/supabase/updates/supabase_web_catalogue_stock.sql
```

Changed, 214 insertions against 89 deletions over nine files. Each read site got
a branch and the Firestore path was left alone -- `useProducts.ts` removes
exactly two lines, the import and a log message, and its Firestore read block is
byte-identical. That is deliberate: the old path is the rollback, so it is worth
more intact than tidy.

## Runbook, in this order

```bash
# 1. schema (Supabase SQL editor) -- additive, safe while live, safe twice
#    fresh-n-local/supabase/updates/supabase_web_catalogue_stock.sql

# 2. fill the new columns (dry run first; it prints what it would change)
cd Freshnlocal
node scripts/syncCatalogueToSupabase.mjs
node scripts/syncCatalogueToSupabase.mjs --apply

# 3. prove the two agree before trusting either
node scripts/verifyCatalogueParity.mjs      # exits 0 only if identical

# 4. only then, in .env
#    VITE_CATALOGUE_SOURCE=supabase
npm run build
```

Rollback is `VITE_CATALOGUE_SOURCE=firestore` and a rebuild. No code change, no
database change, and Firestore is never written to by any of this.

Verified already: `tsc` clean, client and server bundles build, the Firestore
path still reads 449 products, and the **service role key is not in the browser
bundle** -- checked on the key's own signature segment, because the service and
anon keys share a 110-character prefix and a naive substring check reports a
false positive.

## The open question this stage exposed

Reads can move. Writes have not. The admin dashboard still writes products and
settings to Firestore -- about ten product write sites and five settings ones --
so the moment someone edits anything, Supabase is stale until the sync runs
again. Products genuinely drift: five had been added in the roughly 24 hours
since the backfill and were missing. (The settings drift this section used to
cite was a measurement error -- see the correction above. Settings had not
drifted.)

For most fields a few minutes of lag is survivable. For one it is not:
`AdminDashboard.tsx:3488` is the out-of-stock toggle. Someone marks a product
unavailable and the site has to stop selling it immediately, not at the next
sync. With 157 products currently out of stock, that toggle gets used.

Three ways forward:

- **Dual-write** the ~15 admin write sites to both backends. The textbook
  migration bridge: reads can flip per surface, rollback stays live, nothing
  goes stale. Recommended, and it is the natural next piece.
- **Run the sync on a short interval.** No dashboard changes, but it re-reads
  449 Firestore documents every pass -- roughly 650k reads/day at one minute --
  and this codebase already has `isQuotaError` handling, which suggests the
  Firestore bill has bitten before. And it still leaves a lag window on the one
  field that cannot have one.
- **Leave the flag off** until Stage 4 moves the dashboard. Everything built
  here keeps working and gets switched on later.

The read path is worth having under all three.

## The parity check paid for itself

First run after the sync: **23 differences**, in two groups. Both were real
answers, and one was a bug in the new code.

**14 names.** Firestore holds `"Cut fansi "`, Supabase `"Cut fansi"`. The sync
trims when it writes, inherited from migrateFirestore.mjs, which has always
normalised strings. Trailing spaces are invisible in HTML and trimming is a
straight improvement, so the data was right and the *check* was wrong: it was
holding the sync to Firestore's typos rather than to its own rule. Fixed by
trimming on both sides.

**9 horecaPrice: Firestore `undefined` against Supabase `0`.** This one was a
genuine defect in `src/lib/catalogue.ts`. Nine products carry `horecaPrice: 0`
literally, and the Firestore path reads

```js
horecaPrice: data.horecaPrice ? Number(data.horecaPrice) : undefined
```

-- truthiness, so a literal 0 becomes absent. The new mapper used a null check
and kept the 0. Nothing visible depended on it, because `horecaUtils.ts:162`
guards with `product.horecaPrice && product.horecaPrice > 0` before using it,
but the two paths were handing the components different values and the next
reader would have inherited that. Fixed to match the original coercion exactly.

A third thing turned up while confirming the counts: **8 products had
`item_code = ''`** rather than NULL, because `?? null` catches null and
undefined but not an empty string. That column exists for the ERP join, where
`''` is a value other blank rows can match and NULL correctly means "no code".
Fixed, and the codes now read 441 real / 8 NULL / 0 empty.

After those three fixes:

```
Firestore: 449 products
Supabase:  449 products
Only in Firestore: 0
Only in Supabase:  0
Field differences:  0
```

Fresh Dill now reads back, with the anon key, as 100 g @ 20 plus a 200 g @ 40
variant -- two options, as the live site shows. 157 products read
`in_stock=false`, 174 carry real variants, and the 100 `is_deactivated`
products are still visible, exactly as on the live site.

**Parity is a snapshot, not a property.** It holds as of the sync. It stops
holding the next time someone edits a product in the admin dashboard, which is
the open question above.

---

# Dual-write

Admin edits now reach Supabase as they happen, so the catalogue cannot go stale
while writes still land in Firestore.

## Why it is a server route

`web_products`' write policy is `FOR ALL USING (web_is_admin())`, and
`web_is_admin()` resolves the caller through `web_firebase_uid()`, which reads a
Firebase uid out of the request's JWT. Supabase was never configured to accept
Firebase as a third-party auth provider, so that claim is always NULL and a
browser holding the anon key **cannot write these tables at all**. Until sign-in
moves to Supabase Auth, the only credential that can write is the service role
key, and that must never reach a browser.

So the browser says what changed and the server does the writing.

## The security property

`POST /api/admin/mirror-catalogue` accepts **ids only**. It never accepts row
data; it re-reads each document from Firestore itself and copies what it finds.
The worst a caller who defeated the auth could achieve is making the server
resync data Firestore already holds -- not writing anything of their own
choosing into the catalogue. That is why the authorisation check can afford to
be simple: the token is validated by Google's `accounts:lookup` (which checks
signature, audience and expiry), then the uid must be `admin` or `horeca_admin`
in `web_users`.

## Shape

```
catalogueTransform.mjs          the row shaping, SHARED with the bulk sync
catalogueMirror.ts              the route: auth, Firestore re-read, upsert, soft-delete
src/lib/mirrorToSupabase.ts     the browser side: wrapped writes + id coalescing
```

The transform is shared deliberately. If the bulk pass and the per-write mirror
shaped rows differently, the catalogue would depend on which one ran last.

Rather than instrument thirty-odd call sites, the Firestore write functions are
wrapped: `setDocMirrored` / `updateDocMirrored` / `deleteDocMirrored` derive the
target from the `DocumentReference` itself, so there is no second list of
collection names and ids to keep in step with the first. Writes to collections
outside the mirror (`orders`, `users`, `reviews`) are left calling Firestore
directly -- they move in a later stage, and routing them through the wrapper now
would only obscure which writes are actually mirrored.

Wired: 15 sites in `AdminDashboard.tsx` (10 product, 5 settings), 16 in
`useSettings.ts`, 1 in `useOffers.ts`, and 3 `writeBatch` blocks that pass their
ids explicitly because a batch has no per-document hook. The 9 order and user
writes in `AdminDashboard.tsx` are deliberately untouched.

Ids are coalesced over 300ms and sent in one request, so a bulk reorder is one
call rather than four hundred. The wait also guarantees Firestore has settled
before the server reads it back.

A deleted product becomes `is_deleted = true` rather than being removed:
`web_products_read` is `USING (is_deleted = FALSE)`, so the storefront stops
seeing it immediately while `web_sku_components` and the ERP's mappings keep the
row they reference.

## How failure behaves

The Firestore write has already succeeded by the time the mirror runs, so a
mirror failure never fails the admin's action. How loudly it complains depends
on where the shop is reading from: on Firestore it is a console error and the
next full sync repairs it; on Supabase the admin's change is **not live** and
they are the only person who can know that, so they get a toast, once.

## Tested

- Eight rejection cases on the route: missing/bad type, missing/empty ids, over
  the 600 cap, no token, bogus token. All rejected before the write path.
- The copy path directly, on a real product plus two ids that cannot resolve: 1
  written, 1 soft-deleted (matching zero rows), and the id Firestore rejects as
  reserved reported as `unreadable` rather than mistaken for a deletion.
- `tsc` clean, both bundles build, service role key absent from the client
  bundle, parity still 0 differences.

That last test found a real bug: `getDoc` throws on an id Firestore considers
invalid, and without a per-document `try`/`catch` one bad id would have
discarded a whole 500-product batch. An unreadable id is also deliberately not
treated as a deletion -- a read that failed is not evidence a product is gone,
and soft-deleting on a transient error would take a live product off the shop.

**Not yet exercised: the browser-to-server leg with a real admin session.** That
needs an admin's Firebase ID token, which is theirs to produce, not mine to
mint. To confirm: edit a product in the dashboard and watch the server log for
`[CATALOGUE MIRROR] products: 1 written`.

---

# The prerequisite that was not on the list

This stage ships the Supabase anon key in the browser bundle, which is only safe
if row level security actually covers everything the key can reach. Checking
that before flipping anything turned up three objects it did not cover:

```
platform_item_rates        1025 rows   table   the per-platform rate card
inward_shipments           1423 rows   VIEW
marketplace_mapping_rows    640 rows   VIEW
```

plus `deliveries`, `delivery_returns` and `stock_adjustments`, readable but
empty, so they would have started leaking on first write.

This was already live and had nothing to do with the storefront: the ERP reads
the same key from `NEXT_PUBLIC_SUPABASE_ANON_KEY`, Next.js inlines
`NEXT_PUBLIC_*` into its client bundle, and that bundle is served from Vercel.
Anyone who had loaded the ERP already had the key.

Fixed in `fresh-n-local/supabase/updates/supabase_erp_rls_uncovered_tables.sql`.
Confirmed with the anon key over the REST API, which is the credential an
attacker holds, rather than from inside the database:

```
platform_item_rates        blocked 401
inward_shipments           blocked 401
marketplace_mapping_rows   blocked 401
deliveries                 blocked 401
delivery_returns           blocked 401
stock_adjustments          blocked 401

web_products               449 rows readable   <- public catalogue, as intended
web_product_variants       450 rows readable
web_settings                 6 rows readable
web_users / web_orders / web_addresses / web_horeca_prices   0 rows
```

## Why it took three attempts, which is the part worth keeping

The first two runs of that file changed nothing, and the reason matters more
than the fix:

**Two of the six are views, and RLS is a property of a table.** `ALTER TABLE
inward_shipments ENABLE ROW LEVEL SECURITY` fails on a view. It was the second
statement in the file, the Supabase SQL editor runs a script in one transaction,
so that failure rolled back the one statement that had succeeded -- every time.

Two confident diagnoses along the way were both wrong:

1. A `string_agg(relname, ...)` type error in the verification block. Real --
   `relname` is `name`, which `string_agg` has no overload for -- but execution
   never reached it. Fixing it fixed nothing.
2. Ownership. Plausible, and killed by measurement: owner is `postgres` on all
   six, `pg_has_role` confirms it may alter them, and the grants read
   `anon=.../postgres`, so postgres granted them and could revoke them.

What found it was a row count: the diagnostic returned four rows for six names,
because it filtered `relkind IN ('r','p')`.

Four things came out of that and are now built into the file:

- **No top-level `ALTER`.** It loops over the objects, asks `pg_class` what each
  one is, and branches: tables get RLS and a policy, views get
  `security_invoker = true`, materialized views get only the revoke.
- **`RAISE WARNING`, never `RAISE EXCEPTION`.** A check must not be able to roll
  back the fix it exists to confirm, which is precisely what happened.
- **The `security_invoker` call sits in its own exception handler**, because it
  needs PostgreSQL 15 and for a view the `REVOKE` *is* the protection. The
  secondary hardening is allowed to fail; the primary fix is not.
- **The file ends with a plain `SELECT` that names the file in its first
  column.** Two similarly-named scripts in one folder had already cost a round
  trip of reading the read-only diagnostic's output as the fix's. The
  diagnostic has since been deleted; its findings are in the fix's header.

There is also a lesson about the check in `supabase_erp_rls.sql` itself: its
19-table list was built by reading the migrations in `supabase/`, and none of
these six objects -- nor the `rls_auto_enable` function -- appears in any
migration. A list cannot protect what it does not know exists, which is why the
fix ends by reporting *everything* anon can still reach rather than just
confirming the six. Run that after any schema change.

---

# Flipped

`VITE_CATALOGUE_SOURCE=supabase`. Confirmed from the built artifact rather than
from the source, because what matters is what Vite inlined:

```js
function Rde(){ return "supabase".trim() !== "supabase" ? "firestore" : $u ? "supabase" : (...) }
```

The literal is `"supabase"`, so the comparison is false and the catalogue comes
from Postgres. All three build scripts report `449 products from supabase`.

Flipping turned up two things.

## 1. Collation changes the order, which mattered more than it looks

The Supabase-built sitemap had **exactly the same 454 URLs** as the
Firestore-built one, in a different order. Firestore orders document ids by
UTF-8 bytes, so uppercase sorts before lowercase; Postgres uses the database
collation, which is broadly case-insensitive. `0FN8kkvx` before `0c7wbr5J` on
one, after it on the other.

Harmless for a sitemap. Not harmless for the catalogue, for a reason that was
not obvious: **38 orderIndex values are shared, and `999` -- the default -- by 88
products.** `Array.prototype.sort` is stable, so tied products keep the order
they arrived in, and the two backends do not agree on that. The shop would have
shown the same products in a different sequence.

Fixed by making the sort fully determined rather than by chasing collations --
`orderIndex`, then id as a tiebreak, compared with `<` and `>` so it reproduces
the byte ordering the site has today:

```ts
products.sort((a, b) =>
  (a.orderIndex ?? 999) - (b.orderIndex ?? 999) ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
);
```

The same sort went into the build scripts' reader, so the generated sitemap is
now **byte-identical** whichever source produced it. That is also the strongest
evidence the two read paths agree: same 449 products, same order, same output.

A comment in `catalogue.ts` claiming the read order had to match Firestore for
the juice de-duplication to be correct was wrong and has been corrected. The
de-duplication never fires -- no two juices share a name and category -- and the
tiebreak makes the result order-independent regardless.

## 2. The mirror route did not exist in production

`vercel.json` rewrites everything to `/index.html`: on Vercel this is a static
SPA plus serverless functions in `api/`. **`server.ts` is the local development
server and is not deployed.** The Express route registered there does not exist
in production, so the browser would have POSTed `/api/admin/mirror-catalogue`,
got a 404, and reported a mirror failure on every single admin edit -- while
`VITE_CATALOGUE_SOURCE=supabase` made that failure mean the change was not live.

Added `api/admin/mirror-catalogue.ts` as a Vercel function. Both transports now
call one `handleMirrorRequest(body)` in `catalogueMirror.ts`, which returns a
status and a body and owes nothing to either framework -- so local and
production cannot disagree about who counts as an admin.

Also added `api` to `tsconfig.json`'s `include`. It was never typechecked, which
is how a route that only worked in development could look finished. Zero new
errors.

## Still to do on the host

The local `.env` is only the local build. For the deployed site, Vercel needs:

```
VITE_SUPABASE_URL           build time -- Vite inlines it
VITE_SUPABASE_ANON_KEY      build time -- public, privileged only by RLS
VITE_CATALOGUE_SOURCE       build time -- set to `supabase`
SUPABASE_URL                runtime, for the mirror function
SUPABASE_SERVICE_ROLE_KEY   runtime, for the mirror function -- NEVER VITE_
```

The three `VITE_` ones are read at build time, so they must be set before the
build runs or the deployed bundle silently falls back to Firestore.

Rollback is still one variable: set `VITE_CATALOGUE_SOURCE=firestore` and
redeploy. No code change, no database change.

Unrelated gap noticed while looking: the client calls
`/api/emails/send-status-email`, and `api/emails/` contains only
`cancel-order.ts`. That endpoint 404s in production. Pre-existing, untouched.
