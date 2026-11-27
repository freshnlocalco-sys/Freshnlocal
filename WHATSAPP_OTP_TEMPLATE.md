# The WhatsApp OTP template to apply for

You asked for the template to submit to Meta. Here it is, with the exact text
to paste, and one compatibility catch you should know about before you apply.

## The endpoint, settled

Your dashboard documents `POST /api/v1/send-message?token=…`, which takes a raw
Meta message object. That one **cannot send templates** — it answers:

```json
{"success":false,"message":"Template messages are not allowed on /send-message. Use /api/v2/send_templet (balance is deducted there)."}
```

So there are two different senders, and login needs the second:

| endpoint | takes | use |
|---|---|---|
| `/api/v1/send-message?token=` | raw Meta message object | free-form text/image, **no templates** |
| `/api/v2/send_templet` | `sendTo`, `templetName`, `exampleArr`, `token` (all in the **body**) | templates — **this is the OTP path** |

A cold number can only be reached by template, so an OTP must go through
`/api/v2/send_templet`. `/api/send_templet` and `/api/send-message` are not
mounted at all, and `/api/v2/send_templet` works but the provider's own error
text tells you to prefer v2 "(balance is deducted there)".

Probing v2 with a fake template name returned:

```json
{"success":false,"message":"Template \"…\" not found under WABA 453053869652978"}
```

Your token authenticates and your WhatsApp Business Account is live and
connected. **The template is the only thing missing.** `exampleArr` is also
confirmed to be a real array, not the string the old spec claims.

## The catch that remains

Meta **requires** every `AUTHENTICATION` template to carry exactly one button —
`COPY_CODE`, `ONE_TAP` or `ZERO_TAP` — and when sending one it wants the code
supplied **twice**: once as the body parameter and once as the button
parameter.

`/api/v2/send_templet` exposes only `exampleArr`, which is body variables. There
is nowhere to put the button parameter. I checked every way around it:

- `/api/v1/send-message` could express a full `components` array with a button
  parameter, but refuses templates (above).
- `/api/v2/send_templet` refuses a raw `messageObject` ("API keys not found").
- `/api/inbox/send_meta_templet` does take `{header, body, buttons}`, but needs
  a `chatId` — an existing inbox conversation — which a login OTP has not got.

So an `AUTHENTICATION` template may approve and then fail at send time with
Meta error `132000` (parameter count mismatch) — **unless** InstantBroadcast
fills the button parameter itself from the body variable. Plenty of BSPs do,
precisely because of this. It cannot be settled without an approved template.

That is why I still recommend applying for **both** templates below. Both are
free, approval is quick, and the template name is an env var, so switching is a
config change with no redeploy of logic.
---

## Template A — the correct one by policy (apply first)

| field | value |
|---|---|
| Name | `fnl_login_otp` |
| Category | **Authentication** |
| Language | English (`en`) |

Body — **Meta supplies this text; you do not type it.** In the template form you
tick the add-ons and Meta renders:

```
{{1}} is your verification code. For your security, do not share this code.
```

Settings to tick:

- [x] **Add security recommendation** → appends *"For your security, do not share this code."*
- [x] **Add expiry time for the code** → set **10 minutes** (matches the Supabase OTP lifetime we configure)
- Button: **Copy code**. Button text: `Copy code`
- Leave **zero-tap** and **one-tap** OFF. Both need an Android app signature hash, which a website does not have.

Sample value for the variable when Meta asks for one: `483920`

## Template B — the fallback that is guaranteed to send (apply at the same time)

Use this only if Template A fails at send time with a parameter error.

| field | value |
|---|---|
| Name | `fnl_login_code` |
| Category | **Utility** |
| Language | English (`en`) |

Body — type this exactly:

```
{{1}} is your Fresh N Local verification code. It expires in 10 minutes. Do not share it with anyone.
```

- **No buttons.** No header. No footer.
- Sample value for `{{1}}`: `483920`

No buttons means `exampleArr: ["483920"]` is the complete parameter set, so
`/api/v2/send_templet` can send it as-is.

One caveat, stated plainly: Meta's policy is that one-time passcodes belong in
the `AUTHENTICATION` category. A `UTILITY` template carrying an OTP is widely
used in India and normally approves, but Meta can re-categorise it later, which
would change your per-message rate. Treat B as the contingency, not the plan.

---

## How to apply

In the InstantBroadcast dashboard: **Templates → Add new template**, pick the
category, paste the body, add the button for A, save and submit. Approval for
authentication and utility templates is usually minutes to a few hours.

You can also create them through the API (`POST /api/user/add_meta_templet`),
but the dashboard form is less error-prone for a first authentication template
because it builds Meta's fixed body text for you.

## Tell me when it is approved

Send me the **exact** template name as it appears in
`GET /api/user/get_my_meta_templets` once approved. The storefront will read it
from:

```
IB_OTP_TEMPLATE_NAME=fnl_login_otp
```

Then the first thing I do is send one real OTP to a number you give me and read
back Meta's response, so we find out which of A or B actually works before a
single customer sees it.

## What I am building while you wait

Nothing here blocks the rest of the work. Supabase generates, stores, expires,
rate-limits and verifies the code and issues the session; InstantBroadcast is
only the delivery pipe, wired in behind a Supabase **Send SMS auth hook**. Until
a template is approved the hook logs the code instead of sending it, so the
whole login flow is testable end to end on localhost today.
