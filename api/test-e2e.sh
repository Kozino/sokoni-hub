#!/usr/bin/env bash
# End-to-end smoke test of the Sokoni Hub API.
# Usage: API=http://localhost:4000 ./test-e2e.sh
set -uo pipefail
API="${API:-http://localhost:4000}"
PASS=0; FAIL=0
J() { python3 -c '
import sys, json
try: d = json.load(sys.stdin)
except Exception: sys.exit(1)
p = sys.argv[1] if len(sys.argv) > 1 else ""
try: print(eval("d" + p) if p else d)
except Exception: sys.exit(1)
' "$1" 2>/dev/null; }
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1  ($2)"; FAIL=$((FAIL+1)); }
check(){ [ "$2" = "$3" ] && ok "$1" || bad "$1" "expected $3 got $2"; }
code() { curl -s -o /tmp/body -w '%{http_code}' "$@"; }

# Reset state so the suite is idempotent (requires RESET_DB_URL, optional).
if [ -n "${RESET_DB_URL:-}" ]; then
  psql "$RESET_DB_URL" -q -c "truncate users, vendors, listings, orders, order_items, complaints, reviews, audit_log restart identity cascade;" \
    && echo "(database reset)"
fi

echo "=== 1. Health ==="
check "health endpoint" "$(code $API/api/health)" 200

echo "=== 2. Admin bootstrap ==="
ADMIN_NAME="Root Admin" ADMIN_PHONE="2340000000001" ADMIN_EMAIL="admin@sokoni.test" ADMIN_PASSWORD="AdminPass123" \
  npx tsx src/scripts/createAdmin.ts >/dev/null 2>&1
ADMIN_T=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"2340000000001","password":"AdminPass123"}' | J "['token']")
[ -n "$ADMIN_T" ] && ok "admin login" || bad "admin login" "no token"

echo "=== 3. Vendor registration ==="
VEND_T=$(curl -s -X POST $API/api/auth/register -H 'Content-Type: application/json' \
  -d '{"full_name":"Ngozi Eze","phone":"2348011111111","password":"Vendor123","role":"vendor"}' | J "['token']")
[ -n "$VEND_T" ] && ok "vendor register" || bad "vendor register" "no token"
check "duplicate phone rejected" "$(code -X POST $API/api/auth/register -H 'Content-Type: application/json' -d '{"full_name":"Xavier Duplicate","phone":"2348011111111","password":"Vendor123","role":"vendor"}')" 409

echo "=== 4. Onboarding + prohibited screening ==="
check "cosmetics business blocked" "$(code -X POST $API/api/vendors/onboard -H "Authorization: Bearer $VEND_T" -H 'Content-Type: application/json' \
  -d '{"business_name":"Glow Cosmetics","description":"We sell bleaching cream","whatsapp":"2348011111111","country":"Nigeria","city":"Lagos"}')" 422
check "legit onboarding accepted" "$(code -X POST $API/api/vendors/onboard -H "Authorization: Bearer $VEND_T" -H 'Content-Type: application/json' \
  -d '{"business_name":"Mama Ngozi Foodstuff","description":"Bulk rice beans and palm oil","whatsapp":"2348011111111","country":"Nigeria","city":"Lagos"}')" 201
VID=$(curl -s $API/api/vendors/me -H "Authorization: Bearer $VEND_T" | J "['vendor']['id']")
check "vendor starts pending" "$(curl -s $API/api/vendors/me -H "Authorization: Bearer $VEND_T" | J "['vendor']['status']")" pending

echo "=== 5. Unverified vendor cannot publish ==="
CAT=$(curl -s $API/api/meta/categories | python3 -c "import sys,json;print([c['id'] for c in json.load(sys.stdin)['categories'] if c['slug']=='grains-cereals'][0])")
check "publish blocked before verification" "$(code -X POST $API/api/listings -H "Authorization: Bearer $VEND_T" -H 'Content-Type: application/json' \
  -d "{\"category_id\":\"$CAT\",\"kind\":\"product\",\"title\":\"Rice 50kg\",\"price\":42000,\"quantity\":10,\"unit\":\"bag\"}")" 403

echo "=== 6. Admin verification ==="
check "vendor appears in pending queue" "$(curl -s "$API/api/admin/vendors?status=pending" -H "Authorization: Bearer $ADMIN_T" | J "['vendors'][0]['business_name']")" "Mama Ngozi Foodstuff"
check "admin verifies vendor" "$(code -X POST $API/api/admin/vendors/$VID/verify -H "Authorization: Bearer $ADMIN_T")" 200
check "non-admin blocked from admin API" "$(code $API/api/admin/overview -H "Authorization: Bearer $VEND_T")" 403

echo "=== 7. Listings ==="
check "product published after verification" "$(code -X POST $API/api/listings -H "Authorization: Bearer $VEND_T" -H 'Content-Type: application/json' \
  -d "{\"category_id\":\"$CAT\",\"kind\":\"product\",\"title\":\"Premium long grain rice 50kg\",\"description\":\"Bulk bag\",\"price\":420,\"currency\":\"USD\",\"quantity\":10,\"unit\":\"bag\",\"weight_kg\":50}")" 201
check "medicine listing blocked" "$(code -X POST $API/api/listings -H "Authorization: Bearer $VEND_T" -H 'Content-Type: application/json' \
  -d "{\"category_id\":\"$CAT\",\"kind\":\"product\",\"title\":\"Paracetamol tablets\",\"price\":5,\"quantity\":100,\"unit\":\"pack\"}")" 422
SCAT=$(curl -s $API/api/meta/categories | python3 -c "import sys,json;print([c['id'] for c in json.load(sys.stdin)['categories'] if c['slug']=='hair-styling'][0])")
check "service published" "$(code -X POST $API/api/listings -H "Authorization: Bearer $VEND_T" -H 'Content-Type: application/json' \
  -d "{\"category_id\":\"$SCAT\",\"kind\":\"service\",\"title\":\"Knotless braids medium\",\"price\":60,\"currency\":\"USD\",\"duration_mins\":180,\"service_area\":\"Lekki\"}")" 201
check "kind/category mismatch rejected" "$(code -X POST $API/api/listings -H "Authorization: Bearer $VEND_T" -H 'Content-Type: application/json' \
  -d "{\"category_id\":\"$SCAT\",\"kind\":\"product\",\"title\":\"Wrong kind\",\"price\":10,\"quantity\":1}")" 400
check "public browse shows 2 listings" "$(curl -s $API/api/listings | J "['total']")" 2
LID=$(curl -s "$API/api/listings?kind=product" | J "['listings'][0]['id']")

echo "=== 8. Checkout (guest, cash on delivery) ==="
ORD=$(curl -s -X POST $API/api/orders/checkout -H 'Content-Type: application/json' \
  -d "{\"items\":[{\"listing_id\":\"$LID\",\"qty\":3}],\"contact_name\":\"Amina Bello\",\"contact_phone\":\"2348022222222\",\"delivery_address\":\"12 Awolowo Road\",\"city\":\"Lagos\",\"country\":\"Nigeria\",\"payment_method\":\"cash_on_delivery\"}")
CODE=$(echo "$ORD" | J "['orders'][0]['code']")
[ -n "$CODE" ] && ok "guest order created ($CODE)" || bad "guest order" "$ORD"
check "order total = 3 x 420" "$(echo "$ORD" | J "['orders'][0]['total']")" "1260.00"
echo "$ORD" | grep -q 'wa.me' && ok "whatsapp deep link generated" || bad "whatsapp link" "missing"
check "stock decremented 10->7" "$(curl -s $API/api/listings/$LID | J "['listing']['quantity']")" 7
check "overselling rejected" "$(code -X POST $API/api/orders/checkout -H 'Content-Type: application/json' \
  -d "{\"items\":[{\"listing_id\":\"$LID\",\"qty\":999}],\"contact_name\":\"Test Buyer\",\"contact_phone\":\"2348029999999\",\"delivery_address\":\"addr here\",\"city\":\"Lagos\",\"country\":\"NG\"}")" 409
check "order tracking by code+phone" "$(curl -s "$API/api/orders/track?code=$CODE&phone=2348022222222" | J "['order']['status']")" pending
check "tracking with wrong phone fails" "$(code "$API/api/orders/track?code=$CODE&phone=9999")" 404

echo "=== 9. Vendor order fulfilment ==="
OID=$(curl -s $API/api/orders/vendor -H "Authorization: Bearer $VEND_T" | J "['orders'][0]['id']")
for S in confirmed dispatched delivered; do
  check "order -> $S" "$(code -X PATCH $API/api/orders/vendor/$OID/status -H "Authorization: Bearer $VEND_T" -H 'Content-Type: application/json' -d "{\"status\":\"$S\"}")" 200
done

echo "=== 10. Vendor dashboard analytics ==="
DASH=$(curl -s $API/api/vendors/dashboard -H "Authorization: Bearer $VEND_T")
check "dashboard active listings" "$(echo "$DASH" | J "['stats']['listings_active']")" 2
check "dashboard delivered revenue" "$(echo "$DASH" | J "['stats']['revenue_delivered']")" "1260.00"
check "sales trend has 30 days" "$(echo "$DASH" | J "['salesTrend'].__len__()")" 30

echo "=== 11. Complaints ==="
CMP=$(curl -s -X POST $API/api/complaints -H 'Content-Type: application/json' \
  -d "{\"subject\":\"Short measure on rice\",\"body\":\"The bag delivered weighed less than advertised.\",\"vendor_id\":\"$VID\",\"order_code\":\"$CODE\",\"reporter_name\":\"Amina\",\"reporter_phone\":\"2348022222222\"}")
CC=$(echo "$CMP" | J "['complaint']['code']")
[ -n "$CC" ] && ok "complaint filed ($CC)" || bad "complaint" "$CMP"
check "public complaint tracking" "$(curl -s $API/api/complaints/track/$CC | J "['complaint']['status']")" open
check "vendor sees complaint" "$(curl -s $API/api/complaints/vendor -H "Authorization: Bearer $VEND_T" | J "['complaints'][0]['code']")" "$CC"
CID=$(curl -s "$API/api/admin/complaints?status=open" -H "Authorization: Bearer $ADMIN_T" | J "['complaints'][0]['id']")
check "admin resolves complaint" "$(code -X PATCH $API/api/admin/complaints/$CID -H "Authorization: Bearer $ADMIN_T" -H 'Content-Type: application/json' \
  -d '{"status":"resolved","admin_note":"Vendor refunded the difference."}')" 200
check "resolution visible publicly" "$(curl -s $API/api/complaints/track/$CC | J "['complaint']['status']")" resolved

echo "=== 12. Admin overview + moderation ==="
OV=$(curl -s $API/api/admin/overview -H "Authorization: Bearer $ADMIN_T")
check "overview verified vendors" "$(echo "$OV" | J "['stats']['vendors_verified']")" 1
check "overview GMV" "$(echo "$OV" | J "['stats']['gmv']")" "1260.00"
# regression: topVendors previously multiplied GMV by the listing count (join fan-out)
TVG=$(echo "$OV" | J "['topVendors'][0]['gmv']")
check "top-vendor GMV not inflated by fan-out" "$(awk -v v="$TVG" 'BEGIN{printf "%.2f", v}')" "1260.00"
check "top-vendor listing count correct" "$(echo "$OV" | J "['topVendors'][0]['listings']")" 2
AUD=$(echo "$OV" | J "['recentActivity'].__len__()"); check "audit log populated" "$([ "${AUD:-0}" -gt 5 ] && echo yes)" yes
check "admin removes listing" "$(code -X POST $API/api/admin/listings/$LID/remove -H "Authorization: Bearer $ADMIN_T" -H 'Content-Type: application/json' -d '{"reason":"test"}')" 200
check "removed listing hidden from public" "$(curl -s $API/api/listings | J "['total']")" 1
check "admin restores listing" "$(code -X POST $API/api/admin/listings/$LID/restore -H "Authorization: Bearer $ADMIN_T")" 200

echo "=== 13. Suspension cascade ==="
check "admin suspends vendor" "$(code -X POST $API/api/admin/vendors/$VID/suspend -H "Authorization: Bearer $ADMIN_T" -H 'Content-Type: application/json' -d '{"reason":"Testing suspension"}')" 200
check "suspended store hidden from public" "$(curl -s $API/api/listings | J "['total']")" 0
check "suspended vendor cannot publish" "$(code -X POST $API/api/listings -H "Authorization: Bearer $VEND_T" -H 'Content-Type: application/json' \
  -d "{\"category_id\":\"$CAT\",\"kind\":\"product\",\"title\":\"Beans 25kg\",\"price\":100,\"quantity\":5,\"unit\":\"bag\"}")" 403
check "admin reinstates vendor" "$(code -X POST $API/api/admin/vendors/$VID/reinstate -H "Authorization: Bearer $ADMIN_T")" 200

echo "=== 14. Auth guards ==="
check "no token -> 401" "$(code $API/api/vendors/dashboard)" 401
check "bad token -> 401" "$(code $API/api/vendors/dashboard -H 'Authorization: Bearer garbage')" 401
check "wrong password -> 401" "$(code -X POST $API/api/auth/login -H 'Content-Type: application/json' -d '{"identifier":"2348011111111","password":"wrong"}')" 401
check "validation error -> 400" "$(code -X POST $API/api/auth/register -H 'Content-Type: application/json' -d '{"full_name":"A"}')" 400
check "unknown route -> 404" "$(code $API/api/nope)" 404

echo
echo "════════════════════════════════"
echo "  PASSED: $PASS    FAILED: $FAIL"
echo "════════════════════════════════"
[ "$FAIL" -eq 0 ]
