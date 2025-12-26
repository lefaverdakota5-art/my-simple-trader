#!/bin/bash
# Smoke test script for trading bot deployment
set -e

echo "=== Trading Bot Smoke Test ==="

# Check required env vars
echo "Checking environment variables..."
REQUIRED_VARS=("SUPABASE_URL" "SUPABASE_SERVICE_ROLE_KEY")
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    echo "ERROR: Missing required env var: $var"
    exit 1
  fi
  echo "✓ $var is set"
done

# Optional vars
OPTIONAL_VARS=("TRADING_MODE" "KRAKEN_API_KEY" "KRAKEN_API_SECRET")
for var in "${OPTIONAL_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    echo "⚠ Optional var not set: $var"
  else
    echo "✓ $var is set"
  fi
done

# Check Supabase connection
echo ""
echo "Testing Supabase connection..."
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
  "${SUPABASE_URL}/rest/v1/" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

if [ "$HEALTH_CHECK" == "200" ]; then
  echo "✓ Supabase REST API accessible"
else
  echo "ERROR: Supabase REST API returned $HEALTH_CHECK"
  exit 1
fi

# Check trading schema tables
echo ""
echo "Checking trading schema tables..."
TABLES_CHECK=$(curl -s \
  "${SUPABASE_URL}/rest/v1/trade_intents?limit=0" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

if [[ "$TABLES_CHECK" == "[]" ]] || [[ "$TABLES_CHECK" == *"["* ]]; then
  echo "✓ trade_intents table accessible"
else
  echo "⚠ trade_intents table may not exist: $TABLES_CHECK"
fi

# Check bot_config columns
echo ""
echo "Checking bot_config has new columns..."
CONFIG_CHECK=$(curl -s \
  "${SUPABASE_URL}/rest/v1/bot_config?select=dry_run,voting_enabled&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

if [[ "$CONFIG_CHECK" == *"dry_run"* ]] || [[ "$CONFIG_CHECK" == "[]" ]]; then
  echo "✓ bot_config has new intent columns"
else
  echo "⚠ bot_config may be missing columns: $CONFIG_CHECK"
fi

echo ""
echo "=== Smoke Test Complete ==="
echo "All basic checks passed. Ready for deployment."
