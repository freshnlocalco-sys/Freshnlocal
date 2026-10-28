# Orders born in Supabase

Written 28 Oct 2026. The decision behind it: an order should be *created* in
Supabase, not created in Firestore and copied. Everything built on 28 Oct
treats Firestore as the origin and `web_orders` as a mirror of it. That was the
right bridge to get the ERP seeing orders the same day, and it is the wrong
destination.

This plan replaces the bridge. At the end of it, Firebase holds sign-in and
nothing else about an order.

---

## What makes this smaller than it looks

Three things are already true, and they change the shape of the work.

**1. The destination table already fits the order.** `web_orders` was designed
from the Firestore order's own shape. Every field checkout writes has a column:

| checkout writes | `web_orders` |
|---|---|
| `orderNumber`, `userId`, `customerType`, `isHoreca` | `order_number`, `user_id`, `customer_type`, `is_horeca` |
| `totalAmount`, `discount` | `total_amount`, `discount` |
| `pointsEarned`, `pointsRedeemed`, `pointsAwarded` | `points_earned`, `points_redeemed`, `points_awarded` |
| `status`, `paymentMethod`, `deliveryMethod` | `status`, `payment_method`, `delivery_method` |
| `shippingDetails{name,email,address,phone}` | `ship_name`, `ship_email`, `ship_address`, `ship_phone` |
| `freeGiftsAwarded[]` / `freeGiftAwarded` | `free_gift` (jsonb, holds either) |
| `items[]` | `web_order_items` rows |

Nothing needs inventing. `erpMirror.ts` already contains this exact translation
and has run correctly over 255 orders, so the mapping is proven, not guessed.

**2. Supabase can already identify a Firebase customer.** `web_firebase_uid()`
does not read a custom claim we would have to mint. It validates a Firebase ID
token on its own terms:

```sql
IF (claims ->> 'iss') = 'https://securetoken.google.com/freshnlocal-4a420'
   AND (claims ->> 'aud') = 'freshnlocal-4a420'
THEN RETURN claims ->> 'sub';
```

**3. The policies the browser needs already exist.**

```sql
web_orders_own_insert      FOR INSERT WITH CHECK (user_id = web_firebase_uid())
web_orders_own_read        FOR SELECT USING (user_id = web_firebase_uid() OR web_is_admin())
web_order_items_own_insert FOR INSERT WITH CHECK (... order belongs to the caller ...)
web_order_items_own_read   FOR SELECT USING (... same ...)
```

So the storefront can write and read orders in Supabase *as the customer*, the
same way it talks to Firestore today -- no server endpoint, no service-role key
in the browser's path, and the database enforcing ownership rather than our code
remembering to.

---

## Stage 0 — Prove the identity bridge (do this first; everything rests on it)

PostgREST verifies a JWT's signature. A Firebase token is signed by Google, so
Supabase has to be told to trust that issuer: **Authentication → Third-Party
Auth → Firebase**, project `freshnlocal-4a420`.

It may already be on -- the schema was written expecting it. One test settles
it.

This project is on Firebase v12, which is fully modular: there is no global
`firebase` object, so `firebase.auth()` does not exist in the console. On the
Vite dev server the source module can be imported directly instead. Signed in
on http://localhost:3001, in the browser console:

```js
const { auth } = await import("/src/lib/firebase.ts");
await auth.currentUser.getIdToken();
```

Then hand that token to the test script, which reads the Supabase URL and anon
key from .env and reports what the answer means:

```bash
bash stage0-token-test.sh "<the-token>"
```

* rows back → the bridge works, and Stages 1–3 are as written below;
* `401 invalid JWT` → either enable third-party auth, or fall back to a server
  endpoint that validates the token and writes with the service role. That
  fallback already exists in working form (`orderMirror.ts` validates a Firebase
  token through identitytoolkit) -- it is more code and more moving parts, which
  is why it is the fallback and not the plan.

**Nothing else starts until this is answered.**

---

## Stage 1 — Checkout writes Supabase first, Firestore second

Checkout already builds the whole order object. It gains a step *before* the
Firestore write: insert `web_orders`, then `web_order_items`.

The Firestore write stays, unchanged. Everything that reads Firestore orders
today -- the customer's history, the admin dashboard, the email poller, the new
order notifier -- keeps working exactly as it does now. That is the whole point:
this stage changes where an order is *born* without changing what anything can
*see*.

Reversible: delete the added step and checkout is back to today's behaviour.

**Two details that will bite if ignored:**

*Order numbers.* `orderNumber` is `FNL-${randomDigits}`, and Supabase has
`uq_web_orders_number_live` -- a unique index on live order numbers. Firestore
has no such constraint, so a collision today passes silently and would now
**fail the checkout**. The insert needs a retry with a fresh number on unique
violation. (The ERP solved the same problem properly with
`next_order_number()`; the website could borrow that idea later, but a retry is
enough here.)

*Double points.* `points_awarded` exists on both sides. While both are being
written, exactly one of them must own awarding, or a customer earns twice.
Firestore keeps it in this stage.

**Done when:** a real checkout produces a `web_orders` row with its items, and
the ERP panel lists it -- with the mirror switched off, proving the row came
from checkout rather than from the copy.

---

## Stage 2 — The customer reads their orders from Supabase

Three read sites move behind a flag, the way the catalogue moved:

* `src/pages/Orders.tsx:205` — order history (the page the customer sees)
* `src/pages/Profile.tsx:162` — orders in the profile
* `src/pages/Home.tsx:491` — recent orders / reorder

**Gate: the history has to be complete before this flips.** `web_orders` holds
255 orders. The poller only ever read the 50 most recent, so anything older is
there because the 27 Oct backfill put it there. If Firestore holds orders that
`web_orders` does not, those customers lose their history the moment this flag
flips. Count both sides and reconcile first -- this is the one step in the plan
that can lose data a customer can see.

Reversible: the flag goes back to `firestore`.

---

## Stage 3 — Status, admin and automation move

This is where orders stop living in two places with two truths.

* **AdminDashboard** — 7 `updateDoc` sites plus a delete, all on order status.
* **emailTriggers poller** — reads orders and sends confirmations.
  `confirmation_email_sent` already exists as a column.
* **AdminNotifier** — the Firestore `onSnapshot` listener becomes a Supabase
  realtime subscription. (The ERP wants this too: nothing currently tells the
  packing floor that a website order has arrived.)

Finishing this closes the gap found on 28 Oct: the mirror runs **once per order**
(`if (order.erpMirroredAt) continue;`) and nothing ever clears that flag, so
today a cancelled order still reads `pending` in the ERP and is offered for
packing. One row, one status, and that cannot happen.

**The decision this stage needs from the business:** when the ERP marks an order
`Dispatch Done`, what does the customer see on the website? Today the two
systems hold separate statuses and never disagree because they never speak.
Afterwards they are the same row, so the mapping from packing states
(`Pending To Start → Packing In Progress → Ready To Dispatch → Dispatch Done`)
to customer-facing states (`pending → confirmed → ready → shipped → delivered`)
has to be stated deliberately. This is worth real thought: it is the first time
the shop could show a customer the truth from the packing floor.

---

## Stage 4 — Stop writing Firestore orders

Remove the dual-write. What retires with it:

* `erpMirror.ts`, `api/orders/mirror.ts`, `orderMirror.ts`, `src/lib/mirrorOrder.ts`
* the poller's `mirrorOrdersToErp` and the `erpMirroredAt` flag
* `web_orders.erp_pushed_at` keeps its meaning (imported into the ERP) --
  that is about packing, not about mirroring, and it stays.

Firestore then holds users, addresses, reviews, recipes and sign-in. Orders are
gone from it.

---

## Stage 5 — Sign-in (already planned separately, blocked)

Blocked on one number: of the 322 accounts, how many are Google sign-ins rather
than email/password. `firebase auth:export` answers it. Lazy migration is the
agreed approach for password users; Google users re-login.

Worth noting the ordering: **orders can move before auth does**, because
`web_firebase_uid()` accepts a Firebase token. That is the single reason this
plan is possible now rather than after a months-long auth migration.

---

## What could go wrong, in the order it would hurt

1. **Incomplete history at Stage 2** — a customer opens "My Orders" and finds
   them missing. Gate on a reconciled count; this is the one irreversible-feeling
   failure, even though the data is still in Firestore.
2. **Order-number collision at Stage 1** — a checkout fails that would have
   succeeded. Retry on unique violation.
3. **Double points** — decide the owner per stage, never "both".
4. **Status mapping at Stage 3** — a customer told "delivered" when it is on the
   van. Write the mapping down before writing the code.
5. **Third-party auth not enabled** — Stage 0 catches it before anything is built.

## Sequencing

Stage 0 is a test, not a build. Stage 1 is self-contained and ships alone.
Stage 2 waits on a data reconciliation, not on code. Stage 3 is the largest and
wants the status decision settled first. Stage 4 is deletion, and deletion is
the easy part once nothing reads it.

Nothing here requires the auth migration, and nothing here is a big-bang
cutover: every stage is a flag or an added write, and every stage goes back the
way it came.
