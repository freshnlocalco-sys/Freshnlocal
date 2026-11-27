# Phone-OTP login + Firebase→Supabase: what the data says

Measured 23 Nov 2026 against the live Supabase project and the live
InstantBroadcast account. Every number below is counted, not estimated.

## 1. The WhatsApp sender works, but there is no template to send

`GET /api/user/get_me` confirms the account:

```
name:          Fresh N Local CO
uid:           T1YiuzHRDANNJe7aKGQxRuqrA179D2Bg
plan:          General API Access - 1 year (Active, expires ~27 Sep 2026+365d)
has_meta_api:  true
```

`GET /api/user/get_my_meta_templets` returns:

```json
{"success":true,"data":[],"template_created":0,"has_meta_api":true}
```

**Zero approved templates.** Not one OTP can be delivered until a Meta
`AUTHENTICATION` template exists and Meta approves it. This is the long pole:
everything else can be built while approval is pending.

### The send contract (from the account's own OpenAPI spec, v3.6.0)

`POST https://api.instantbroadcast.in/api/send_templet`

```json
{
  "sendTo": "+919xxxxxxxxx",
  "templetName": "<approved template name>",
  "exampleArr": ["123456"],
  "token": "<the JWT>"
}
```

The token goes in the **body**, not an `Authorization` header. Response is
`{"success":true,"metaResponse":{...}}`.

**InstantBroadcast does not issue or verify OTPs.** It is a pure message
sender. (`/api/user/verify_otp` is for InstantBroadcast's own account signup —
it takes an `email`, not a customer phone. Unrelated.)

That is the good news: it means Supabase can own the whole OTP lifecycle —
generate, store, expire, rate-limit, verify, issue the session — and
InstantBroadcast is only the delivery pipe, wired in as a **Send SMS auth
hook**. This is the opposite of the Message Central problem recorded on 2 Nov,
where the provider insisted on minting its own codes and so could not sit
behind the hook.

## 2. Phone number is not yet a unique identity

370 live `web_users` rows (0 soft-deleted):

| | count |
|---|---|
| valid Indian mobile (`[6-9]\d{9}` after stripping `+91`/`0`) | 251 |
| distinct valid numbers | 241 |
| phone present but unusable | 0 |
| **no phone at all** | **119** |

### 2a. 119 accounts cannot log in by phone

Of those 119: **3 have ordered**, **0 hold points**, and **4 are staff** —
3 `admin` and 1 `horeca`.

Those 4 are the problem. The admin accounts are how the storefront's own
AdminDashboard is reached. A phone-only cutover locks the client out of their
own admin panel.

### 2b. 4 numbers are shared by 14 accounts

| number | accounts | points held | ordered |
|---|---|---|---|
| `...2285` | 8 | 44, 186, 192, 630, 0, 0, 0, 0 | no |
| `...7155` | 2 | 24, 44 | 1 of 2 |
| `...7687` | 2 | 8, 20 | both |
| `...1418` | 2 | 62, 20 | both |

One OTP to `...2285` currently maps to eight accounts holding **1052 points**
between them. Three other numbers each cover two accounts, and in two of those
pairs **both** accounts have real order history. Phone-OTP cannot tell these
apart, so each group needs a deliberate merge or a post-OTP account chooser —
not a first-match-wins guess, which would silently strand points and orders.

## 3. Supabase state

`web_users` columns today:

```
id (TEXT = Firebase uid), email, display_name, role, phone, legacy_address,
points, created_at, updated_at, is_deleted, deleted_on, deleted_by
```

**There is no `auth_user_id` column.** The Stage-2 groundwork described in
`SUPABASE_MIGRATION.md` has not been applied yet. 22 RLS policies still route
through `web_firebase_uid()`.

Row counts (live):

```
web_products   449      web_orders      317      web_users      370
web_settings     6      web_addresses   184      web_reviews      0  <-- still empty
web_horeca_prices  3467
```

`web_reviews` has never been backfilled.

## 4. What is still on Firebase in the storefront

118 Firestore call sites / 16 files. Concentration:

```
src/pages/AdminDashboard.tsx   35
src/store/useSettings.ts       20
src/lib/firebase.ts            11   <-- all of auth
src/pages/RecipeAI.tsx         10
src/lib/horecaPrices.ts         8
everything else               <=5 each
```

`VITE_CATALOGUE_SOURCE=supabase`, and the browser console confirms it: the
storefront reads all 449 products and the six settings rows from Postgres on
load. Stage 1 is genuinely live. (The server's startup line about
`VITE_CATALOGUE_SOURCE=firestore` is static text inside an unrelated warning in
`catalogueMirror.ts` and does not reflect the setting — it misled me once.)

## 5. Recommended shape

1. **Supabase native phone auth**, with a Send SMS hook that forwards
   Supabase's own code to `POST /api/send_templet`. Supabase keeps expiry,
   rate limiting, replay protection and session issuance — none of that gets
   hand-rolled.
2. **Keep email+password for the 4 staff/horeca accounts**, drop it for
   customers. Staff are not customers and have no phone on file.
3. **Add `web_users.auth_user_id UUID`** and change only the *body* of
   `web_firebase_uid()` to resolve `auth.uid() -> auth_user_id -> id`. All 22
   policies keep working untouched, and every order, address and review stays
   keyed on the Firebase uid it already has. No rekeying.
4. **Resolve the 14 colliding accounts before cutover**, not during.
