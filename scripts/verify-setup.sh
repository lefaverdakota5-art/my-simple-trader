#!/bin/bash

# =============================================================================
# AI Simple Trader - Setup Verification Script
# =============================================================================
# This script validates that all configuration is correct and ready for deployment
# Run this before deploying to Railway or starting local development
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

# =============================================================================
# Helper Functions
# =============================================================================

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_check() {
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    echo -e "${BLUE}[CHECK $TOTAL_CHECKS]${NC} $1"
}

print_pass() {
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    echo -e "  ${GREEN}✓${NC} $1"
}

print_fail() {
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
    echo -e "  ${RED}✗${NC} $1"
}

print_warning() {
    WARNING_CHECKS=$((WARNING_CHECKS + 1))
    echo -e "  ${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "  ${BLUE}ℹ${NC} $1"
}

# =============================================================================
# Check 1: Supabase Project ID Consistency
# =============================================================================

check_supabase_consistency() {
    print_header "1. Supabase Project ID Consistency"
    
    print_check "Checking Supabase project ID across configuration files"
    
    # Expected project ID
    EXPECTED_PROJECT_ID="whdljtbtqisoszbrzdwq"
    
    # Check supabase/config.toml
    if [ -f "supabase/config.toml" ]; then
        CONFIG_PROJECT_ID=$(grep 'project_id = ' supabase/config.toml | cut -d'"' -f2)
        if [ "$CONFIG_PROJECT_ID" = "$EXPECTED_PROJECT_ID" ]; then
            print_pass "supabase/config.toml has correct project ID: $CONFIG_PROJECT_ID"
        else
            print_fail "supabase/config.toml has wrong project ID: $CONFIG_PROJECT_ID (expected: $EXPECTED_PROJECT_ID)"
        fi
    else
        print_warning "supabase/config.toml not found"
    fi
    
    # Check .env file
    if [ -f ".env" ]; then
        ENV_PROJECT_ID=$(grep 'VITE_SUPABASE_PROJECT_ID' .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        if [ "$ENV_PROJECT_ID" = "$EXPECTED_PROJECT_ID" ]; then
            print_pass ".env has correct project ID: $ENV_PROJECT_ID"
        else
            print_fail ".env has wrong project ID: $ENV_PROJECT_ID (expected: $EXPECTED_PROJECT_ID)"
        fi
        
        ENV_URL=$(grep 'VITE_SUPABASE_URL' .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        if [[ "$ENV_URL" == *"$EXPECTED_PROJECT_ID"* ]]; then
            print_pass ".env has correct Supabase URL: $ENV_URL"
        else
            print_fail ".env has wrong Supabase URL: $ENV_URL"
        fi
    else
        print_warning ".env file not found (copy from .env.example)"
    fi
    
    # Check .env.example
    if [ -f ".env.example" ]; then
        EXAMPLE_PROJECT_ID=$(grep 'VITE_SUPABASE_PROJECT_ID' .env.example | cut -d'=' -f2)
        if [[ "$EXAMPLE_PROJECT_ID" == *"$EXPECTED_PROJECT_ID"* ]]; then
            print_pass ".env.example has correct project ID"
        else
            print_fail ".env.example has wrong project ID"
        fi
    fi
}

# =============================================================================
# Check 2: Required Environment Variables
# =============================================================================

check_required_env_vars() {
    print_header "2. Required Environment Variables"
    
    print_check "Checking for required environment variables in .env"
    
    if [ ! -f ".env" ]; then
        print_fail ".env file not found - create from .env.example"
        return
    fi
    
    # Load .env file safely
    set -a
    source .env 2>/dev/null || true
    set +a
    
    # Check required variables
    REQUIRED_VARS=(
        "VITE_SUPABASE_URL"
        "VITE_SUPABASE_PROJECT_ID"
        "VITE_SUPABASE_PUBLISHABLE_KEY"
    )
    
    for VAR in "${REQUIRED_VARS[@]}"; do
        VALUE="${!VAR}"
        if [ -n "$VALUE" ] && [ "$VALUE" != "your_"* ]; then
            print_pass "$VAR is set"
        else
            print_fail "$VAR is not set or uses placeholder value"
        fi
    done
    
    # Check optional but recommended variables
    print_check "Checking optional backend environment variables"
    
    OPTIONAL_VARS=(
        "SUPABASE_SERVICE_ROLE_KEY"
        "SUPABASE_PUSH_UPDATE_URL"
        "TRADING_MODE"
    )
    
    for VAR in "${OPTIONAL_VARS[@]}"; do
        VALUE="${!VAR}"
        if [ -n "$VALUE" ] && [ "$VALUE" != "your_"* ]; then
            print_pass "$VAR is set"
        else
            print_warning "$VAR is not set (optional for frontend, required for backend)"
        fi
    done
}

# =============================================================================
# Check 3: Database Schema
# =============================================================================

check_database_schema() {
    print_header "3. Database Schema & Migrations"
    
    print_check "Checking Supabase migration files"
    
    if [ -d "supabase/migrations" ]; then
        MIGRATION_COUNT=$(find supabase/migrations -name "*.sql" | wc -l)
        print_pass "Found $MIGRATION_COUNT migration files"
        
        # List key migrations
        print_info "Key migrations:"
        if [ -f "supabase/migrations/20251215023500_plaid_tables.sql" ]; then
            print_info "  ✓ Plaid tables migration exists"
        fi
        if [ -f "supabase/migrations/20251215073000_user_exchange_keys_openai.sql" ]; then
            print_info "  ✓ User exchange keys migration exists"
        fi
    else
        print_fail "supabase/migrations directory not found"
    fi
    
    print_check "Verifying Supabase CLI is installed"
    
    if command -v supabase &> /dev/null; then
        SUPABASE_VERSION=$(supabase --version 2>&1 | head -1)
        print_pass "Supabase CLI is installed: $SUPABASE_VERSION"
        
        print_info "To push migrations: npx supabase db push"
        print_info "To check status: npx supabase db remote ls"
    else
        print_warning "Supabase CLI not installed (install: npm install -g supabase)"
    fi
}

# =============================================================================
# Check 4: Edge Functions
# =============================================================================

check_edge_functions() {
    print_header "4. Edge Functions"
    
    print_check "Checking edge function files"
    
    if [ -d "supabase/functions" ]; then
        EXPECTED_FUNCTIONS=(
            "push-update"
            "bot-actions"
            "bot-tick"
            "kraken-withdraw"
            "plaid"
        )
        
        for FUNC in "${EXPECTED_FUNCTIONS[@]}"; do
            if [ -f "supabase/functions/$FUNC/index.ts" ]; then
                print_pass "Edge function '$FUNC' exists"
            else
                print_fail "Edge function '$FUNC' not found"
            fi
        done
        
        print_info "To deploy functions: npx supabase functions deploy <function-name>"
        print_info "To list deployed: npx supabase functions list"
    else
        print_fail "supabase/functions directory not found"
    fi
    
    print_check "Checking edge function configuration in config.toml"
    
    if [ -f "supabase/config.toml" ]; then
        if grep -q "\[functions.push-update\]" supabase/config.toml; then
            print_pass "Edge functions configured in config.toml"
        else
            print_warning "Edge functions not configured in config.toml"
        fi
    fi
}

# =============================================================================
# Check 5: Railway Configuration
# =============================================================================

check_railway_config() {
    print_header "5. Railway Configuration"
    
    print_check "Checking railway.json"
    
    if [ -f "railway.json" ]; then
        print_pass "railway.json exists"
        
        # Check if it references Dockerfile
        if grep -q "DOCKERFILE" railway.json; then
            print_pass "railway.json configured for Dockerfile build"
        else
            print_warning "railway.json doesn't specify Dockerfile builder"
        fi
    else
        print_fail "railway.json not found"
    fi
    
    print_check "Checking Dockerfile"
    
    if [ -f "Dockerfile" ]; then
        print_pass "Dockerfile exists"
        
        # Check Python version
        PYTHON_VERSION=$(grep "FROM python:" Dockerfile | cut -d':' -f2 | cut -d'-' -f1)
        print_info "Using Python version: $PYTHON_VERSION"
        
        # Check if uvicorn is exposed
        if grep -q "uvicorn" Dockerfile; then
            print_pass "Dockerfile configured to run uvicorn"
        else
            print_warning "Dockerfile may not be configured correctly for FastAPI"
        fi
        
        # Check port exposure
        if grep -q "EXPOSE 8000" Dockerfile; then
            print_pass "Port 8000 exposed in Dockerfile"
        else
            print_warning "Port 8000 not explicitly exposed"
        fi
    else
        print_fail "Dockerfile not found"
    fi
    
    print_check "Checking requirements.txt"
    
    if [ -f "requirements.txt" ]; then
        print_pass "requirements.txt exists"
        
        # Check key dependencies
        KEY_DEPS=("fastapi" "uvicorn" "alpaca" "krakenex" "requests")
        for DEP in "${KEY_DEPS[@]}"; do
            if grep -qi "$DEP" requirements.txt; then
                print_info "  ✓ $DEP dependency found"
            else
                print_warning "  ✗ $DEP dependency not found in requirements.txt"
            fi
        done
    else
        print_fail "requirements.txt not found"
    fi
}

# =============================================================================
# Check 6: API Configuration
# =============================================================================

check_api_config() {
    print_header "6. API Keys Configuration"
    
    print_check "Checking API key configuration methods"
    
    if [ -f ".env" ]; then
        set -a
        source .env 2>/dev/null || true
        set +a
    fi
    
    # Check Alpaca
    if [ -n "$ALPACA_API_KEY" ] && [ "$ALPACA_API_KEY" != "your_"* ]; then
        print_pass "Alpaca API key configured in .env"
    else
        print_info "Alpaca API key not in .env (can be set via Settings UI)"
    fi
    
    # Check Kraken
    if [ -n "$KRAKEN_KEY" ] && [ "$KRAKEN_KEY" != "your_"* ]; then
        print_pass "Kraken API key configured in .env"
    else
        print_info "Kraken API key not in .env (can be set via Settings UI)"
    fi
    
    # Check Plaid
    if [ -n "$PLAID_CLIENT_ID" ] && [ "$PLAID_CLIENT_ID" != "your_"* ]; then
        print_pass "Plaid client ID configured in .env"
    else
        print_info "Plaid client ID not in .env (can be set via Settings UI)"
    fi
    
    # Check OpenAI
    if [ -n "$OPENAI_API_KEY" ] && [ "$OPENAI_API_KEY" != "your_"* ]; then
        print_pass "OpenAI API key configured in .env"
    else
        print_info "OpenAI API key not in .env (optional, can be set via Settings UI)"
    fi
    
    print_check "Checking safety settings"
    
    # Check trading mode
    if [ -n "$TRADING_MODE" ]; then
        if [ "$TRADING_MODE" = "paper" ]; then
            print_pass "Trading mode is 'paper' (safe for testing)"
        elif [ "$TRADING_MODE" = "dry_run" ]; then
            print_pass "Trading mode is 'dry_run' (no orders will be placed)"
        elif [ "$TRADING_MODE" = "live" ]; then
            print_warning "Trading mode is 'live' - REAL MONEY AT RISK!"
        else
            print_warning "Unknown trading mode: $TRADING_MODE"
        fi
    fi
    
    # Check Kraken trading
    if [ "$KRAKEN_ENABLE_TRADING" = "true" ]; then
        print_warning "Kraken trading is ENABLED - orders will be placed!"
    else
        print_pass "Kraken trading is disabled (safe)"
    fi
    
    # Check Kraken withdrawals
    if [ "$KRAKEN_ENABLE_WITHDRAWALS" = "true" ]; then
        print_warning "Kraken withdrawals are ENABLED - funds can be withdrawn!"
    else
        print_pass "Kraken withdrawals are disabled (safe)"
    fi
}

# =============================================================================
# Check 7: File Structure
# =============================================================================

check_file_structure() {
    print_header "7. Project File Structure"
    
    print_check "Checking essential project files"
    
    ESSENTIAL_FILES=(
        "main.py"
        "requirements.txt"
        "Dockerfile"
        "railway.json"
        ".env.example"
        ".env.production.example"
        "SETUP.md"
        "README.md"
        "package.json"
    )
    
    for FILE in "${ESSENTIAL_FILES[@]}"; do
        if [ -f "$FILE" ]; then
            print_pass "$FILE exists"
        else
            print_fail "$FILE is missing"
        fi
    done
    
    print_check "Checking documentation files"
    
    DOCS=(
        "SETUP.md"
        "README.md"
        "QUICKSTART.md"
    )
    
    for DOC in "${DOCS[@]}"; do
        if [ -f "$DOC" ]; then
            print_info "  ✓ $DOC exists"
        fi
    done
}

# =============================================================================
# Check 8: Security Best Practices
# =============================================================================

check_security() {
    print_header "8. Security Best Practices"
    
    print_check "Checking for exposed secrets in git"
    
    # Check .gitignore
    if [ -f ".gitignore" ]; then
        if grep -q "^\.env$" .gitignore; then
            print_pass ".env is in .gitignore"
        else
            print_fail ".env is NOT in .gitignore - SECURITY RISK!"
        fi
        
        if grep -q "bot_data.sqlite" .gitignore; then
            print_pass "SQLite database is in .gitignore"
        else
            print_warning "SQLite database should be in .gitignore"
        fi
    else
        print_fail ".gitignore not found"
    fi
    
    print_check "Checking for hardcoded secrets in code"
    
    # Check main.py for hardcoded keys (basic check)
    if [ -f "main.py" ]; then
        if grep -q "sk-" main.py 2>/dev/null; then
            print_fail "Possible OpenAI API key found in main.py"
        fi
        
        if grep -q '"password":[[:space:]]*"[^{]' main.py 2>/dev/null; then
            print_warning "Possible hardcoded password in main.py"
        fi
        
        print_info "Manual code review recommended for secrets"
    fi
    
    print_check "Checking CORS configuration"
    
    if [ -f ".env" ]; then
        export $(grep -v '^#' .env | xargs 2>/dev/null || true)
        
        if [ "$BOT_CORS_ORIGINS" = "*" ]; then
            print_warning "CORS is set to '*' (open to all origins) - OK for development, change for production"
        elif [ -n "$BOT_CORS_ORIGINS" ]; then
            print_pass "CORS is configured to specific origins: $BOT_CORS_ORIGINS"
        else
            print_info "CORS not explicitly configured (will default to '*')"
        fi
    fi
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                        ║${NC}"
    echo -e "${GREEN}║     AI Simple Trader - Setup Verification Script      ║${NC}"
    echo -e "${GREEN}║                                                        ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Run all checks
    check_supabase_consistency
    check_required_env_vars
    check_database_schema
    check_edge_functions
    check_railway_config
    check_api_config
    check_file_structure
    check_security
    
    # Summary
    print_header "Verification Summary"
    
    echo ""
    echo -e "${BLUE}Total Checks:${NC} $TOTAL_CHECKS"
    echo -e "${GREEN}Passed:${NC} $PASSED_CHECKS"
    echo -e "${RED}Failed:${NC} $FAILED_CHECKS"
    echo -e "${YELLOW}Warnings:${NC} $WARNING_CHECKS"
    echo ""
    
    if [ $FAILED_CHECKS -eq 0 ]; then
        echo -e "${GREEN}✓ All critical checks passed!${NC}"
        
        if [ $WARNING_CHECKS -gt 0 ]; then
            echo -e "${YELLOW}⚠ There are $WARNING_CHECKS warnings to review${NC}"
        fi
        
        echo ""
        echo "Next steps:"
        echo "1. Review any warnings above"
        echo "2. Set missing environment variables in .env or Railway"
        echo "3. Deploy edge functions: npx supabase functions deploy <name>"
        echo "4. Push database migrations: npx supabase db push"
        echo "5. Deploy to Railway or run locally: python main.py"
        echo ""
        exit 0
    else
        echo -e "${RED}✗ $FAILED_CHECKS critical check(s) failed${NC}"
        echo ""
        echo "Please fix the issues above before deploying."
        echo "Refer to SETUP.md for detailed configuration instructions."
        echo ""
        exit 1
    fi
}

# Run main function
main
