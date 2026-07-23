#!/usr/bin/env bash
# Post-deploy smoke test for the full path. Usage:
#   BASE_URL=https://your-app.vercel.app ADMIN_SECRET=... scripts/smoke.sh
set -euo pipefail

BASE_URL=${BASE_URL:?set BASE_URL}
ADMIN_SECRET=${ADMIN_SECRET:?set ADMIN_SECRET}
AUTH=(-H "Authorization: Bearer ${ADMIN_SECRET}")

echo "1. Auth wall up?"
code=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/desk")
[ "$code" = "401" ] && echo "   ok (401 unauthenticated)" || { echo "   FAIL: got $code"; exit 1; }

echo "2. Desk reachable with secret?"
code=$(curl -s -o /dev/null -w "%{http_code}" "${AUTH[@]}" "${BASE_URL}/desk")
[ "$code" = "200" ] && echo "   ok" || { echo "   FAIL: got $code"; exit 1; }

echo "3. Generate acceptance design (Consider the lilies, Matthew 6:28, KJV)"
resp=$(curl -s "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{"concept":"vintage botanical engraving of three lilies","verseRef":"Matthew 6:28","translation":"KJV"}' \
  "${BASE_URL}/api/designs/generate")
echo "   -> ${resp}"
echo "${resp}" | grep -q designId || { echo "   FAIL: no designId"; exit 1; }

echo "4. Bad verse is rejected up front?"
code=$(curl -s -o /dev/null -w "%{http_code}" "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{"concept":"x","verseRef":"Matthew 99:1","translation":"KJV"}' \
  "${BASE_URL}/api/designs/generate")
[ "$code" = "400" ] && echo "   ok (400)" || { echo "   FAIL: got $code"; exit 1; }

echo
echo "Now watch /desk: the design should move generating -> ready with a"
echo "populated checks list and mockups, then approve it and verify the"
echo "Shopify product, the IG post, and the quota meter at 1/25."
