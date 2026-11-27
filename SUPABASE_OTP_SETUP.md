# Turning on WhatsApp OTP login — the dashboard steps

> ## Read this first
>
> **Do not let real customers sign in by OTP yet.** An audit on 23 Nov found
> that a customer holding a Supabase session has no Firebase user, so several
> parts of the storefront still write to Firestore and fail **silently** for
> them — the screen says it worked and the change is gone on reload.
>
> Checkout and order history are fixed. **Points, saved addresses, saved
> recipes, recipe chat and reviews are not.** The worst of them lets a customer
> redeem the same 100 points on every order, because the deduction never
> reaches the database.
>
> The full list is in `OTP_CUSTOMER_DATA_GAPS.md`.
>
> The steps below are still exactly right, and doing them is how the flow gets
> tested — just test it with your own number, not with customers.

Everything in code is built and tested. These are the settings only you can
change, in the order that makes each one verifiable.

Checked against Supabase's docs on 23 Nov 2026. **Send SMS hooks are available
on Free and Pro**, so your plan is not a blocker.

---

## 1. Run the migration (do this first)

**Supabase → SQL Editor → New query**. There are now **three**, each its own
transaction with a DOWN section and verify queries at the foot. Order does not
matter.

| file | what it does |
|---|---|
| `supabase_web_auth_user_id.sql` | links a Supabase login to the existing storefront account |
| `supabase_web_points_redeem.sql` | atomic server-side points deduction |
| `supabase_web_otp_throttle.sql` | per-number OTP send limit (3, then a lockout) |

All three live in `fresh-n-local/supabase/updates/`.

It is one transaction with a DOWN section at the foot. Until it runs, a
successful OTP login produces a session with **no storefront account behind
it** — `web_firebase_uid()` returns NULL and RLS correctly shows that session
nothing. So nothing below is testable without it.

The verify queries are in comments at the bottom of the file. The one worth
running straight away:

```sql
SELECT COUNT(*) FROM pg_policies
 WHERE schemaname = 'public'
   AND (qual LIKE '%web_firebase_uid%' OR with_check LIKE '%web_firebase_uid%');
-- expect 22
```

## 2. Enable the Phone provider

**Authentication → Sign In / Providers → Phone → Enable.**

Right now the API answers:

```json
{"code":400,"error_code":"phone_provider_disabled","msg":"Unsupported phone provider"}
```

and the sign-in form shows *"WhatsApp sign-in is not switched on yet."*

**The bit to watch.** The dashboard will ask you to pick an SMS provider
(Twilio, MessageBird, Vonage, Textlocal) and may demand credentials. You do not
have any of those accounts and should not open one. Supabase's docs say *"The
Send SMS Hook replaces Supabase's built-in SMS sending"*, but they do **not**
say whether the provider fields can be left blank once a hook is configured.
I could not settle this from the documentation.

So: if the Phone provider refuses to save without provider credentials,
**do step 3 first** and come back — a configured hook may make the fields
optional. If it still refuses, that is a question for Supabase support, and it
is the one genuine unknown left in this plan.

## 3. Configure the Send SMS hook

**Authentication → Hooks → Send SMS → Enable → HTTP Endpoint.**

URL: your deployed site plus `/api/auth/sms-hook`, e.g.

```
https://<your-vercel-domain>/api/auth/sms-hook
```

Supabase calls this from its own servers, so **`localhost` will not work** —
see "Testing before you deploy" below.

Supabase will show you a signing secret shaped `v1,whsec_<base64>`. Copy it
into `.env`:

```
SUPABASE_SMS_HOOK_SECRET=v1,whsec_…
```

Paste it **whole**, including the `v1,` prefix — the code strips it.

Without this secret the hook refuses every request with 401 and logs
*"SUPABASE_SMS_HOOK_SECRET is not set; refusing to send."* That is deliberate:
an unsigned hook is an open relay that would let anyone send a WhatsApp message
as Fresh N Local.

## 4. OTP expiry and single use

Set **Authentication → Providers → Phone → OTP Expiry** to **600 seconds**.

Three things have to agree on that number and currently do:

- the Supabase setting, which actually enforces it
- `VITE_OTP_EXPIRY_SECONDS=600` in `.env`, which drives the "Expires in 9:58"
  countdown on the form
- the approved template, which tells the customer 10 minutes

Supabase's own docs contradict themselves on the default (one page says an
hour, another 60 seconds), which is exactly why it is worth setting explicitly
rather than inheriting.

**Single use** is Supabase's behaviour, not something the storefront has to
add: verifying a code consumes it, and presenting it again fails. Confirm it in
the first live test (step 2 of the checklist below) rather than taking my word
for it — it is one extra paste of the same code.

Length is not configurable and does not need to be: Supabase's payload schema
fixes the SMS OTP at exactly six digits.

## 5. The template

**Done.** `authentication1` is approved and already set in `.env`. A real
message was delivered to the Fresh N Local business number on 24 Nov and
accepted by Meta as `messageType: "authentication"`.

The compatibility worry from earlier turned out to be real, and solvable. With
the code supplied once, Meta refused the send:

```json
{"success":false,"message":"(#100) Invalid parameter",
 "details":"button: Parameter 'text' is mandatory for component parameter type 'text'"}
```

InstantBroadcast *does* build the copy-code button component — it just had
nothing to put in it. `exampleArr` is positional across **all** components, not
only the body, so the code goes in **twice**: `["483920","483920"]`. That is
what `IB_OTP_TEMPLATE_HAS_BUTTON=true` controls; set it false only for a
buttonless UTILITY template.

**Balance:** each OTP costs ₹0.15 and the account is at **₹49.85** — roughly
330 codes. A failed send is refunded (the rejected one above was). Worth a
top-up before any real traffic.

---

## 6. The abuse limits, and where they actually live

You asked for a cap on resends with a timer after it. There are two layers, and
only one of them is a security control.

**The real one — the Send SMS hook.** Every delivered message passes through
it, so it is the only choke point that cannot be walked around. It calls
`web_otp_throttle()` in Postgres, which counts sends per number under a row
lock. Config in `.env`:

```
OTP_MAX_SENDS=3
OTP_WINDOW_MINUTES=15
OTP_BLOCK_MINUTES=15
```

Three codes per number per 15 minutes; the fourth request starts a 15-minute
lockout, and the clock restarts from each attempt, so hammering the button
pushes your own unlock further away.

It is in Postgres rather than process memory for a reason: the site runs on
Vercel, so each request can land on a different instance with its own empty
counter, and every deploy would reset them all. An attacker would not even have
to try.

The allowance is spent **after** a successful delivery, not before. Supabase
retries a failed hook up to three times, and counting first would mean one
network blip costs a customer their whole allowance for a code they never
received.

If the throttle is unreachable — migration not run, database down — it **fails
open** and logs loudly. It is abuse mitigation, not authentication, and a
Postgres hiccup should not lock every customer out of their account. The hook
secret, by contrast, fails closed. Supabase's own per-project SMS cap sits
underneath as a backstop either way.

**The courtesy one — the sign-in form.** `src/lib/otpThrottle.ts` keeps the same
counts in `localStorage` so the customer sees *"Too many code requests. You can
try again in 11:15"* with a live countdown, instead of a generic failure with no
idea whether to wait ten seconds or ten minutes. Anyone can clear
`localStorage` and bypass it; that is fine, because the server refuses anyway.
The `VITE_OTP_*` values mirror the server ones and should be kept in step.

The form also stops after **5 wrong codes** (`VITE_OTP_MAX_VERIFY_ATTEMPTS`) and
makes the customer request a fresh one, shows tries remaining once they are
down to two, and disables the input when the code expires.

## 7. Test checklist for the first live run

Do these with your own number before anyone else sees it.

1. **Happy path.** Request a code, receive it on WhatsApp, sign in. Confirm the
   header shows your name and `web_users.auth_user_id` is now set for your row.
2. **Single use.** Sign out, request a new code, then paste the *previous* code.
   It must be rejected.
3. **Expiry.** Request a code, wait past 10 minutes, try it. Rejected, and the
   form should already be showing it as expired.
4. **Resend cap.** Request three codes in a row. The fourth attempt should be
   refused with a countdown, and the server log should show
   `[OTP] refused ...NNNN: limit reached`.
5. **Lockout lifts.** Wait out the 15 minutes and confirm a code sends again.
6. **Wrong codes.** Enter five wrong codes; the form should stop accepting and
   ask for a new one.

The server log is the honest account of 4 and 5 — the browser countdown is only
the UI's copy.

---

## Testing before you deploy

Supabase cannot reach `localhost`. Both `cloudflared` and `ngrok` are already
installed on this machine, so one command gives the hook a public URL:

```bash
cloudflared tunnel --url http://localhost:3001
```

It prints a `https://<random>.trycloudflare.com` address; the hook URL is that
plus `/api/auth/sms-hook`. Change it in Supabase → Hooks and you can run a real
login end to end against your dev server.

Worth being clear about what that does: it publishes your local dev server to
the open internet for as long as the tunnel runs. The URL is random and
unlisted, but anyone who has it can reach the site, and that dev server holds
live credentials. Stop the tunnel with Ctrl-C when you are done, and re-point
the hook at the deployed URL.

If you would rather not, deploy to Vercel first and configure the hook against
the real domain. Nothing is lost either way.

---

## What is already proven

Not predictions — these were run:

- **Signature verification.** Unsigned, wrong-signature, stale-timestamp and
  tampered-body requests all rejected with 401; a correctly signed request
  accepted with 200. Replay window 300 seconds.
- **The whole chain**, with a Supabase-shaped signed payload and a deliberately
  nonexistent template name: hook verified the signature, called
  InstantBroadcast, got `Template "__probe_only__" not found under WABA
  453053869652978`, classified it as permanent and returned
  `500 {"error":{"http_code":500,"message":"could not deliver the code"}}` with
  `Content-Type: application/json` and no `retry-after`.
- **Retry semantics.** Network failures, timeouts, provider 5xx and 429 return
  **503 with a `retry-after` header**, which is one of only two codes Supabase
  retries (three attempts, two seconds apart). A rejected template or a bad
  number returns 500 and is not retried, because it would fail identically.
- **Timeout 4 seconds**, inside Supabase's 5-second hook budget. A longer one
  cannot help — Supabase has already given up — and risks delivering a code for
  a login that has already errored.
- **The login UI**, in a browser: phone + code is the default with no password
  field for customers, and the staff email form is behind a toggle, unchanged.

