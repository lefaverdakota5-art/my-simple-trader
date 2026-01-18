# Production Deployment Checklist

## Pre-Deployment

### 1. Code Quality
- [x] All merge conflicts resolved
- [x] AI modules implemented with production-ready code
- [x] Comprehensive logging added
- [x] Error handling implemented
- [ ] All tests passing (run `npm run lint` and `python -m pytest`)
- [ ] No console.log or print() statements (use logger instead)
- [ ] Security vulnerabilities checked

### 2. Environment Configuration
- [ ] Copy `.env.production.example` to `.env.production`
- [ ] Fill in all REQUIRED environment variables
- [ ] Use strong, unique secrets (generate with `openssl rand -hex 32`)
- [ ] Set `TRADING_MODE=paper` initially
- [ ] Configure proper CORS origins (not *)
- [ ] Set appropriate rate limits

### 3. Database Setup
- [ ] Supabase project created
- [ ] Database migrations applied
- [ ] RLS policies enabled
- [ ] Edge functions deployed
- [ ] Service role key secured

### 4. Exchange Accounts
- [ ] Alpaca account created (paper trading enabled)
- [ ] Kraken account created with API keys
- [ ] 2FA enabled on all exchanges
- [ ] API keys have minimal required permissions
- [ ] Withdrawal whitelists configured
- [ ] IP whitelisting enabled (if supported)

### 5. Third-Party Services
- [ ] Plaid account setup (sandbox mode)
- [ ] OpenAI API key obtained
- [ ] Rate limits understood and configured
- [ ] Billing alerts set up

## Deployment

### Option 1: Railway

1. **Create Railway Project**
   ```bash
   railway init
   railway link
   ```

2. **Set Environment Variables**
   - Go to Railway dashboard → Variables
   - Add all variables from `.env.production.example`
   - Verify secrets are not exposed in logs

3. **Deploy Backend**
   ```bash
   railway up
   ```

4. **Verify Deployment**
   - Check Railway logs for errors
   - Test `/health` endpoint
   - Verify database connection

### Option 2: Docker

1. **Build Image**
   ```bash
   docker build -t ai-trader .
   ```

2. **Run Container**
   ```bash
   docker run -d \
     --name ai-trader \
     -p 8000:8000 \
     --env-file .env.production \
     -v /data:/var/data \
     ai-trader
   ```

3. **Monitor**
   ```bash
   docker logs -f ai-trader
   ```

### Option 3: Traditional VPS

1. **Install Dependencies**
   ```bash
   # Python
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   
   # Node.js
   npm install
   npm run build
   ```

2. **Configure Systemd Service**
   ```bash
   sudo cp deployment/ai-trader.service /etc/systemd/system/
   sudo systemctl enable ai-trader
   sudo systemctl start ai-trader
   ```

3. **Setup Nginx Reverse Proxy**
   ```bash
   sudo cp deployment/nginx.conf /etc/nginx/sites-available/ai-trader
   sudo ln -s /etc/nginx/sites-available/ai-trader /etc/nginx/sites-enabled/
   sudo systemctl reload nginx
   ```

## Post-Deployment

### 1. Health Checks
- [ ] `/health` returns 200 OK
- [ ] `/config/status` shows services configured
- [ ] Database connection working
- [ ] Logging functional

### 2. Functional Testing
- [ ] Can create user account
- [ ] Can login/logout
- [ ] Can deposit funds
- [ ] Can enable trading bot
- [ ] AI council makes decisions
- [ ] Trades execute in paper mode
- [ ] Withdrawals blocked in production

### 3. Monitoring Setup
- [ ] Error tracking configured (Sentry, etc.)
- [ ] Application monitoring (Datadog, New Relic, etc.)
- [ ] Log aggregation working
- [ ] Alerts configured for:
  - [ ] API errors (> 5% error rate)
  - [ ] High trade volume
  - [ ] Low balance warnings
  - [ ] API rate limit warnings
  - [ ] Database connection failures

### 4. Security Verification
- [ ] HTTPS enforced
- [ ] CORS properly configured
- [ ] API keys not exposed in logs
- [ ] RLS policies tested
- [ ] Rate limiting working
- [ ] SQL injection protection verified
- [ ] XSS protection verified

### 5. Performance Testing
- [ ] Load testing completed
- [ ] Response times acceptable (< 200ms avg)
- [ ] Database queries optimized
- [ ] Caching configured where appropriate
- [ ] Memory usage stable
- [ ] No memory leaks detected

## Gradual Rollout

### Phase 1: Paper Trading (Week 1-2)
- Deploy with `TRADING_MODE=paper`
- Monitor for 1-2 weeks
- Verify AI decisions are reasonable
- Check for any bugs or crashes
- Review logs daily

### Phase 2: Limited Live Trading (Week 3-4)
- Switch to `TRADING_MODE=live`
- Keep `MAX_NOTIONAL_PER_ORDER_USD=1.00`
- Keep `MAX_ORDERS_PER_DAY=10`
- Monitor closely every day
- Review all trades manually

### Phase 3: Increased Limits (Month 2+)
- Gradually increase order limits
- Based on performance and confidence
- Never exceed your risk tolerance
- Keep daily monitoring routine

## Rollback Plan

If issues occur:

1. **Immediate Actions**
   ```bash
   # Stop all active bots
   curl -X POST https://your-api.com/admin/stop-all-bots
   
   # Sell all positions to cash
   curl -X POST https://your-api.com/actions/sell_to_cash
   ```

2. **Revert Deployment**
   ```bash
   # Railway
   railway rollback
   
   # Docker
   docker stop ai-trader
   docker run -d --name ai-trader ai-trader:previous-tag
   
   # Systemd
   sudo systemctl stop ai-trader
   git checkout <previous-commit>
   sudo systemctl start ai-trader
   ```

3. **Investigation**
   - Review logs for errors
   - Check recent trades
   - Verify account balances
   - Document the issue
   - Create bug report

## Monitoring Checklist (Daily)

- [ ] Check application logs for errors
- [ ] Verify bots are running
- [ ] Review trades executed
- [ ] Check account balances
- [ ] Verify API rate limits not exceeded
- [ ] Check for any security alerts
- [ ] Review AI council decisions
- [ ] Monitor API costs (OpenAI, Plaid)

## Monitoring Checklist (Weekly)

- [ ] Review performance metrics
- [ ] Analyze win rate and profitability
- [ ] Update AI model parameters if needed
- [ ] Review and rotate API keys
- [ ] Check for software updates
- [ ] Backup database
- [ ] Review security logs

## Monitoring Checklist (Monthly)

- [ ] Full security audit
- [ ] Performance optimization review
- [ ] Cost analysis and optimization
- [ ] Update dependencies
- [ ] Review and update documentation
- [ ] Test disaster recovery procedures
- [ ] Review and update trading strategies

## Emergency Contacts

- **Exchange Support**
  - Alpaca: support@alpaca.markets
  - Kraken: support@kraken.com

- **Service Providers**
  - Supabase: Support dashboard
  - Railway: Support dashboard
  - Plaid: Support dashboard

- **Security Issues**
  - Report immediately to exchange
  - Freeze API keys if compromised
  - Document timeline of events

## Success Metrics

Track these KPIs:

- **Uptime**: Target 99.9%
- **API Response Time**: < 200ms average
- **Error Rate**: < 1%
- **Trading Performance**: Based on strategy goals
- **Cost per Trade**: Monitor API costs
- **User Satisfaction**: If multi-user app

## Notes

- Always test changes in paper mode first
- Never trade more than you can afford to lose
- Keep detailed logs of all configuration changes
- Regularly backup your database
- Stay informed about exchange API changes
- Keep dependencies up to date
- Monitor for security vulnerabilities

## Additional Resources

- [FastAPI Production Deployment](https://fastapi.tiangolo.com/deployment/)
- [Supabase Production Checklist](https://supabase.com/docs/guides/platform/going-into-prod)
- [Railway Deployment Guide](https://docs.railway.app/)
- [Kraken API Documentation](https://docs.kraken.com/rest/)
- [Alpaca API Documentation](https://alpaca.markets/docs/)
