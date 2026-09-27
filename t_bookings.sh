#!/bin/bash
# Live end-to-end test of the service booking flow against the running API.
API=http://127.0.0.1:4300/api
J='Content-Type: application/json'
SVC=d0000000-0000-0000-0000-000000000001   # service listing
PRD=d0000000-0000-0000-0000-000000000002   # product listing
pass=0; fail=0
ok(){ if [ "$1" = "1" ]; then pass=$((pass+1)); echo "  ✔ $2"; else fail=$((fail+1)); echo "  ✖ $2"; fi; }
has(){ echo "$1" | grep -q "$2" && echo 1 || echo 0; }
code(){ echo "$1" | tail -1; }
body(){ echo "$1" | sed '$d'; }

tok(){ curl -s -X POST $API/auth/login -H "$J" -d "{\"identifier\":\"$1\",\"password\":\"Passw0rd!\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))"; }
ADM=$(tok admin@test.com); VND=$(tok vendor@test.com); BUY=$(tok buyer@test.com)
[ -n "$ADM" ] && [ -n "$VND" ] && [ -n "$BUY" ] || { echo "login failed"; exit 1; }
echo "logged in: admin, vendor, buyer"

FUTURE=$(python3 -c "import datetime;print((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=2)).isoformat().replace('+00:00','Z'))")
PAST=$(python3   -c "import datetime;print((datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(days=2)).isoformat().replace('+00:00','Z'))")

echo; echo "--- creating a booking as a signed-out guest ---"
R=$(curl -s -X POST $API/bookings -H "$J" -d "{\"listing_id\":\"$SVC\",\"contact_name\":\"Amina Yusuf\",\"contact_phone\":\"+97433334444\",\"preferred_at\":\"$FUTURE\",\"preferred_note\":\"Shoulder length, please\"}")
ok $(has "$R" '"code":"BKG-') "guest can book without an account"
ok $(has "$R" '"status":"new"') "booking starts as 'new'"
ok $(has "$R" '"whatsapp":"https://wa.me/') "WhatsApp hand-off link returned"
ok $(has "$R" 'Booking%20reference%3A%20BKG-') "WhatsApp text carries the booking reference"
ok $(has "$R" '"quoted_price":\(150\|"150.00"\)') "advertised price snapshotted onto the booking"
ok $(has "$R" '"quoted_price_type":"from"') "price_type 'from' preserved"
BID=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin)['booking']['id'])")
BCODE=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin)['booking']['code'])")
echo "  booking: $BCODE"

echo; echo "--- rejections ---"
R=$(curl -s -w '\n%{http_code}' -X POST $API/bookings -H "$J" -d "{\"listing_id\":\"$PRD\",\"contact_name\":\"Amina\",\"contact_phone\":\"+97433334444\"}")
ok $([ "$(code "$R")" = "422" ] && echo 1 || echo 0) "booking a PRODUCT is rejected 422"
ok $(has "$(body "$R")" 'cart') "...and the message points to the cart"

R=$(curl -s -w '\n%{http_code}' -X POST $API/bookings -H "$J" -d "{\"listing_id\":\"$SVC\",\"contact_name\":\"Amina\",\"contact_phone\":\"+97433334444\",\"preferred_at\":\"$PAST\"}")
ok $([ "$(code "$R")" = "422" ] && echo 1 || echo 0) "a preferred time in the past is rejected 422"

R=$(curl -s -w '\n%{http_code}' -X POST $API/bookings -H "$J" -d "{\"listing_id\":\"$SVC\",\"contact_name\":\"A\",\"contact_phone\":\"+97433334444\"}")
ok $([ "$(code "$R")" = "400" ] && echo 1 || echo 0) "a one-character name is rejected 400"

echo; echo "--- the service must NOT be orderable through checkout ---"
R=$(curl -s -w '\n%{http_code}' -X POST $API/orders/quote -H "$J" \
  -d "{\"items\":[{\"listing_id\":\"$SVC\",\"qty\":1}],\"fulfilment_mode\":\"delivery\"}")
ok $([ "$(code "$R")" = "422" ] && echo 1 || echo 0) "quoting a service is rejected 422"
ok $(has "$(body "$R")" 'booking') "...and the message redirects to booking"

R=$(curl -s -w '\n%{http_code}' -X POST $API/orders/checkout -H "$J" \
  -d "{\"items\":[{\"listing_id\":\"$SVC\",\"qty\":1}],\"contact_name\":\"Amina Yusuf\",\"contact_phone\":\"+97433334444\",\"delivery_address\":\"Villa 12\",\"city\":\"Doha\",\"country\":\"Qatar\"}")
ok $([ "$(code "$R")" = "422" ] && echo 1 || echo 0) "checking out a service is rejected 422"

echo; echo "--- a product still checks out normally (no regression) ---"
R=$(curl -s -X POST $API/orders/checkout -H "$J" \
  -d "{\"items\":[{\"listing_id\":\"$PRD\",\"qty\":2}],\"contact_name\":\"Amina Yusuf\",\"contact_phone\":\"+97433334444\",\"delivery_address\":\"Villa 12\",\"city\":\"Doha\",\"country\":\"Qatar\",\"fulfilment_mode\":\"delivery\"}")
ok $(has "$R" '"code":"ORD-') "product checkout still works"
ok $(has "$R" '"subtotal":\(80\|"80.00"\)') "product subtotal 2 x 40 = 80"
ok $(has "$R" '"delivery_fee":\(25\|"25.00"\)') "vendor delivery fee applied"
ok $(has "$R" '"total":\(105\|"105.00"\)') "total 80 + 25 = 105 (displayed = charged)"

echo; echo "--- vendor inbox ---"
R=$(curl -s $API/bookings/vendor -H "Authorization: Bearer $VND")
ok $(has "$R" "$BCODE") "vendor sees the booking in their inbox"
ok $(has "$R" 'Dreadlocks Retwist') "listing title joined in"
ok $(has "$R" 'Amina Yusuf') "customer contact details present"
R=$(curl -s $API/bookings/vendor/counts -H "Authorization: Bearer $VND")
ok $(has "$R" '"new":1') "vendor 'new' count = 1 (drives the nav badge)"

echo; echo "--- another vendor's booking is not visible ---"
R=$(curl -s -w '\n%{http_code}' -X PATCH $API/bookings/$BID -H "$J" -H "Authorization: Bearer $BUY" -d '{"status":"confirmed"}')
ok $([ "$(code "$R")" = "403" ] && echo 1 || echo 0) "a buyer cannot PATCH a booking (403)"

echo; echo "--- vendor works the booking ---"
curl -s -X POST $API/bookings/$BID/seen -H "Authorization: Bearer $VND" > /dev/null
R=$(curl -s $API/bookings/vendor -H "Authorization: Bearer $VND")
ok $(has "$R" '"first_viewed_at":"2') "first_viewed_at stamped on open (response-time metric)"

R=$(curl -s -w '\n%{http_code}' -X PATCH $API/bookings/$BID -H "$J" -H "Authorization: Bearer $VND" -d '{"status":"confirmed"}')
ok $([ "$(code "$R")" = "422" ] && echo 1 || echo 0) "cannot confirm without an agreed time (422)"

R=$(curl -s -X PATCH $API/bookings/$BID -H "$J" -H "Authorization: Bearer $VND" \
  -d "{\"status\":\"confirmed\",\"scheduled_at\":\"$FUTURE\",\"vendor_note\":\"Bring reference photo\"}")
ok $(has "$R" '"status":"confirmed"') "vendor confirms with an agreed time"
ok $(has "$R" '"scheduled_at":"2') "scheduled_at saved"
ok $(has "$R" '"contacted_at":"2') "contacted_at auto-stamped on confirm"

R=$(curl -s -w '\n%{http_code}' -X PATCH $API/bookings/$BID -H "$J" -H "Authorization: Bearer $VND" -d "{\"scheduled_at\":\"$PAST\"}")
ok $([ "$(code "$R")" = "422" ] && echo 1 || echo 0) "cannot schedule into the past (422)"

echo; echo "--- public tracking ---"
R=$(curl -s "$API/bookings/track?code=$BCODE&phone=33334444")
ok $(has "$R" 'Dreadlocks Retwist') "buyer tracks by code + phone"
R=$(curl -s -w '\n%{http_code}' "$API/bookings/track?code=$BCODE&phone=99999999")
ok $([ "$(code "$R")" = "404" ] && echo 1 || echo 0) "wrong phone returns 404 (code alone leaks nothing)"

echo; echo "--- admin oversight ---"
R=$(curl -s $API/bookings/admin -H "Authorization: Bearer $ADM")
ok $(has "$R" "$BCODE") "admin sees the booking"
ok $(has "$R" 'Glow Salon') "provider name joined in"
R=$(curl -s "$API/bookings/admin?status=confirmed" -H "Authorization: Bearer $ADM")
ok $(has "$R" "$BCODE") "admin status filter works"
R=$(curl -s "$API/bookings/admin?status=cancelled" -H "Authorization: Bearer $ADM")
ok $([ "$(has "$R" "$BCODE")" = "0" ] && echo 1 || echo 0) "...and excludes non-matching statuses"

R=$(curl -s "$API/bookings/admin/stats?days=30" -H "Authorization: Bearer $ADM")
ok $(has "$R" 'Glow Salon') "provider demand stats returned"
ok $(has "$R" '"bookings":"1"') "demand count = 1"
ok $(has "$R" 'avg_response_hours') "average response time computed"

R=$(curl -s -w '\n%{http_code}' $API/bookings/admin -H "Authorization: Bearer $VND")
ok $([ "$(code "$R")" = "403" ] && echo 1 || echo 0) "a vendor cannot reach the admin view (403)"

echo; echo "--- the booking must NOT be commissioned ---"
R=$(curl -s -X POST $API/billing/statements/generate -H "$J" -H "Authorization: Bearer $ADM" \
  -d '{"period":"'"$(date +%Y-%m)"'"}')
ok $([ "$(has "$R" '150')" = "0" ] && echo 1 || echo 0) "the 150 service price appears nowhere in the statement run"

echo; echo "--- completion ---"
R=$(curl -s -X PATCH $API/bookings/$BID -H "$J" -H "Authorization: Bearer $VND" -d '{"status":"completed"}')
ok $(has "$R" '"status":"completed"') "vendor marks completed"
ok $(has "$R" '"completed_at":"2') "completed_at stamped"

echo; echo "================================"
echo "bookings live flow: $pass passed, $fail failed"
[ "$fail" = "0" ] || exit 1
