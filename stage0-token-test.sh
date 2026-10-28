#!/usr/bin/env bash
# Stage 0 of ORDERS_TO_SUPABASE_PLAN.md — read-only.
#
# One question: will Supabase accept a FIREBASE ID TOKEN as an identity? If it
# does, the storefront can read and write orders in Supabase directly as the
# signed-in customer and every RLS policy already written applies as-is. If not,
# the same work needs server endpoints instead.
#
# This script is fussy about what it will test with, and the fussiness is the
# point. Two wrong inputs have already produced confident wrong answers:
#
#   * the literal placeholder <the-token> -> Supabase said 401 "Expected 3 parts
#     in JWT", and an earlier version of this script reported that as "your
#     Supabase configuration is wrong";
#   * the SERVICE ROLE key -> that bypasses RLS entirely. It would have returned
#     rows and been read as "the bridge works", proving nothing except that a
#     master key is a master key.
#
# So: anything that is not a Firebase ID token for this project is refused
# before a request is made.
#
# Usage:  bash stage0-token-test.sh "<firebase-id-token>"
set -u

WANT_ISS="https://securetoken.google.com/freshnlocal-4a420"
WANT_AUD="freshnlocal-4a420"

show_how() {
  echo
  echo "Signed in on http://localhost:3001, in the browser console:"
  echo '    const { auth } = await import("/src/lib/firebase.ts");'
  echo '    const t = await auth.currentUser.getIdToken();'
  echo '    console.log(`bash stage0-token-test.sh "${t}"`);'
  echo
  echo "Run what it prints. The token starts with eyJ and is several hundred characters."
}

TOKEN="${1:-}"
if [ -z "$TOKEN" ]; then echo "No token given."; show_how; exit 1; fi

cd "$(dirname "$0")" || exit 1

PARTS=$(printf '%s' "$TOKEN" | awk -F. '{print NF}')
if [ "$PARTS" != "3" ] || [ "${TOKEN:0:1}" = "<" ]; then
  echo "That is not a JWT (three dot-separated parts; this has $PARTS)."
  show_how; exit 1
fi

# --- what the token claims, decoded locally and never sent anywhere ----------
CLAIMS=$(printf '%s' "$TOKEN" | cut -d. -f2 | tr '_-' '/+' \
  | awk '{l=length($0)%4; if(l==2)$0=$0"=="; else if(l==3)$0=$0"="; print}' | base64 -d 2>/dev/null)

VERDICT=$(printf '%s' "$CLAIMS" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  let c; try { c = JSON.parse(s); } catch { console.log('UNREADABLE'); return; }
  if (c.role) { console.log('SUPABASE_KEY|' + c.role); return; }
  if (c.iss !== '$WANT_ISS' || c.aud !== '$WANT_AUD') {
    console.log('WRONG_ISSUER|' + (c.iss || '(none)') + '|' + (c.aud || '(none)'));
    return;
  }
  const left = Math.round((c.exp * 1000 - Date.now()) / 60000);
  console.log('FIREBASE|' + c.sub + '|' + left);
});")

KIND=${VERDICT%%|*}
case "$KIND" in
  UNREADABLE)
    echo "Could not read that token's payload."; show_how; exit 1 ;;
  SUPABASE_KEY)
    echo "That is a SUPABASE key (role: ${VERDICT#*|}), not a Firebase ID token."
    echo
    echo "Refusing to test with it. The service role bypasses RLS, so it would"
    echo "return rows no matter how Supabase is configured, and this script would"
    echo "have told you the bridge works when nothing had been proven at all."
    echo
    echo "It is also a secret: it opens your whole database. If it has been pasted"
    echo "anywhere it should not live, rotate it in the Supabase dashboard and"
    echo "update both .env files and the Vercel project."
    show_how; exit 1 ;;
  WRONG_ISSUER)
    REST=${VERDICT#*|}
    echo "That token is not from this Firebase project."
    echo "    iss: ${REST%%|*}   (expected $WANT_ISS)"
    echo "    aud: ${REST##*|}   (expected $WANT_AUD)"
    echo
    echo "web_firebase_uid() checks both and returns NULL otherwise, so RLS would"
    echo "hide every row and the result would mean nothing."
    show_how; exit 1 ;;
esac

SUB=$(printf '%s' "$VERDICT" | cut -d'|' -f2)
MINS=$(printf '%s' "$VERDICT" | cut -d'|' -f3)
echo "--- a Firebase ID token for freshnlocal-4a420 ---"
echo "    uid     : $SUB"
echo "    expires : in ${MINS} min"
if [ "$MINS" -lt 1 ]; then echo "    *** expired — get a fresh one ***"; show_how; exit 1; fi

URL=$(grep -m1 '^VITE_SUPABASE_URL=' .env | cut -d= -f2- | tr -d '"'"'"' ')
ANON=$(grep -m1 '^VITE_SUPABASE_ANON_KEY=' .env | cut -d= -f2- | tr -d '"'"'"' ')
[ -z "$URL" ] && { echo "VITE_SUPABASE_URL missing from .env"; exit 1; }

echo
echo "--- asking Supabase, as that customer ---"
BODY=$(mktemp)
CODE=$(curl -s -o "$BODY" -w '%{http_code}' \
  "$URL/rest/v1/web_orders?select=order_number,status,total_amount&order=created_at.desc&limit=5" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN")
echo "    HTTP $CODE"
head -c 400 "$BODY"; echo; echo

case "$CODE" in
  200)
    N=$(node -e "try{const r=require('$BODY');console.log(Array.isArray(r)?r.length:0)}catch(e){console.log(0)}")
    if [ "$N" -gt 0 ]; then
      echo "VERDICT: the bridge works. Supabase accepted a Firebase token, RLS"
      echo "resolved it to uid $SUB, and returned that customer's own orders."
      echo "Stages 1-3 proceed as written: the storefront writes orders to"
      echo "Supabase directly, as the customer."
    else
      echo "VERDICT: accepted, but zero rows — NOT a pass."
      echo "Either this customer has no live orders in web_orders, or"
      echo "web_firebase_uid() returned NULL and RLS filtered everything."
      echo "Check uid $SUB against web_orders.user_id before concluding anything."
    fi ;;
  401)
    if grep -qiE "parts in JWT|invalid compact|malformed" "$BODY"; then
      echo "VERDICT: the token was malformed in transit. Tells us nothing; retry."
    else
      echo "VERDICT: Supabase would not trust the token's signature. Third-party"
      echo "auth is not enabled for freshnlocal-4a420 (Authentication ->"
      echo "Third-Party Auth -> Firebase). Either enable it, or Stages 1-3 go"
      echo "through server endpoints instead -- more code, and the service-role"
      echo "key back in the request path."
    fi ;;
  *)
    echo "VERDICT: unexpected. The body above is the answer; neither outcome"
    echo "explains a $CODE." ;;
esac
rm -f "$BODY"
