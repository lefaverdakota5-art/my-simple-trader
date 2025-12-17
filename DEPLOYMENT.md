# Deployment Guide for Simple Trader

This guide covers deploying the Simple Trader application for 24/7 operation.

## Architecture Overview

**Frontend**: React SPA (Single Page Application)
**Backend**: Python FastAPI server
**Database**: Supabase (PostgreSQL + Auth)
**Mobile**: Capacitor Android APK

## Deployment Options

### Option 1: Fully Hosted (Recommended for Production)

**Frontend**: Vercel / Netlify (free tier available)
**Backend**: Railway / Render / Fly.io (free tier with limitations)
**Database**: Supabase (free tier: 500MB, 2GB bandwidth/month)

### Option 2: Self-Hosted (For Advanced Users)

**Frontend + Backend**: VPS (DigitalOcean, Linode, AWS, etc.)
**Database**: Supabase (cloud) or self-hosted PostgreSQL

### Option 3: Local/Development

**Frontend**: Vite dev server
**Backend**: Local Python server
**Database**: Supabase (cloud)

---

## Deploy Frontend to Vercel

### Prerequisites
- GitHub account
- Vercel account (free): https://vercel.com

### Steps

1. **Push code to GitHub** (if not done already)

2. **Connect to Vercel**:
   - Go to https://vercel.com/new
   - Import your GitHub repository
   - Select `my-simple-trader` repository

3. **Configure Build Settings**:
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

4. **Add Environment Variables**:
   In Vercel dashboard, add:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
   VITE_SUPABASE_PROJECT_ID=your_project_id
   ```

5. **Deploy**: Click "Deploy"

6. **Get URL**: Your app will be available at `https://your-app.vercel.app`

### Custom Domain (Optional)

1. In Vercel dashboard → Domains
2. Add your domain
3. Update DNS records as instructed

---

## Deploy Backend to Railway

### Prerequisites
- GitHub account
- Railway account (free): https://railway.app

### Steps

1. **Create New Project**:
   - Go to https://railway.app/new
   - Click "Deploy from GitHub repo"
   - Select `my-simple-trader` repository

2. **Configure Service**:
   - Root Directory: `.` (or leave empty)
   - Build Command: (leave empty)
   - Start Command: `python main.py`

3. **Add Environment Variables**:
   ```bash
   # Supabase
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   SUPABASE_PUSH_UPDATE_URL=https://your-project.supabase.co/functions/v1/push-update
   SUPABASE_WEBHOOK_SECRET=your_webhook_secret

   # Trading
   TRADING_MODE=paper
   MAX_NOTIONAL_PER_ORDER_USD=1.00
   MAX_ORDERS_PER_DAY=20

   # API Keys (or set via user interface)
   ALPACA_API_KEY=your_key
   ALPACA_SECRET=your_secret
   KRAKEN_KEY=your_key
   KRAKEN_SECRET=your_secret
   OPENAI_API_KEY=your_key

   # Port (Railway sets this automatically)
   PORT=${{PORT}}
   ```

4. **Deploy**: Railway will automatically deploy

5. **Get URL**: Note your backend URL (e.g., `https://your-app.up.railway.app`)

6. **Update Frontend**:
   - In your app Settings page, set backend URL to Railway URL

### Alternative: Deploy Backend to Render

1. **Create New Web Service**: https://render.com/
2. **Connect GitHub repo**
3. **Configure**:
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. **Add Environment Variables** (same as Railway)
5. **Deploy**

---

## Self-Hosted Deployment

### Prerequisites
- Linux server (Ubuntu 20.04+ recommended)
- Domain name (optional but recommended)
- SSH access

### 1. Setup Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y python3-pip python3-venv nginx certbot python3-certbot-nginx git

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. Clone Repository

```bash
cd /opt
sudo git clone https://github.com/your-username/my-simple-trader.git
cd my-simple-trader
```

### 3. Setup Python Backend

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
sudo nano .env
# Add all environment variables

# Test backend
python main.py
# Should start on port 8000
```

### 4. Setup Backend Service (systemd)

Create `/etc/systemd/system/simple-trader-backend.service`:

```ini
[Unit]
Description=Simple Trader Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/my-simple-trader
Environment="PATH=/opt/my-simple-trader/venv/bin"
ExecStart=/opt/my-simple-trader/venv/bin/python main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable simple-trader-backend
sudo systemctl start simple-trader-backend
sudo systemctl status simple-trader-backend
```

### 5. Build Frontend

```bash
cd /opt/my-simple-trader

# Install dependencies
npm install

# Build
npm run build
# Creates dist/ folder
```

### 6. Configure Nginx

Create `/etc/nginx/sites-available/simple-trader`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    location / {
        root /opt/my-simple-trader/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/simple-trader /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 7. Setup SSL with Let's Encrypt

```bash
sudo certbot --nginx -d your-domain.com
```

Follow prompts to get free SSL certificate.

### 8. Update Frontend Configuration

Update Settings in the app to point to:
- Backend: `https://your-domain.com/api`

---

## Database Setup (Supabase)

### 1. Create Supabase Project

1. Go to https://supabase.com
2. Create new project
3. Wait for project to provision (~2 minutes)

### 2. Run Migrations

1. In Supabase dashboard → SQL Editor
2. Run migrations from `supabase/migrations/` folder in order:
   - `20251212184706_*.sql`
   - `20251212193821_*.sql`
   - `20251212200135_*.sql`
   - `20251215060000_user_exchange_keys.sql`
   - `20251215061000_user_bot_daily_stats.sql`
   - `20251215073000_user_exchange_keys_openai.sql`
   - `20251215023500_plaid_tables.sql`

### 3. Deploy Edge Functions

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref your-project-ref

# Deploy functions
supabase functions deploy bot-actions
supabase functions deploy bot-tick
supabase functions deploy plaid
supabase functions deploy push-update
```

### 4. Configure Auth

1. In Supabase dashboard → Authentication → Providers
2. Enable Email provider
3. Configure email templates (optional)
4. Set up email provider (SMTP) for production

---

## Monitoring and Maintenance

### Logs

**Railway/Render**: View logs in dashboard

**Self-Hosted**:
```bash
# Backend logs
sudo journalctl -u simple-trader-backend -f

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Health Checks

Set up monitoring with:
- **UptimeRobot** (free): https://uptimerobot.com
- **BetterStack** (free tier): https://betterstack.com
- **Pingdom**: https://pingdom.com

Monitor these endpoints:
- Frontend: `https://your-domain.com`
- Backend: `https://your-domain.com/api/health`

### Backups

**Supabase**: Automatic daily backups on Pro plan

**Self-Hosted Database**:
```bash
# Create backup script
sudo nano /opt/backup-db.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups"
mkdir -p $BACKUP_DIR

# Backup SQLite (if using)
cp /opt/my-simple-trader/bot_data.sqlite $BACKUP_DIR/bot_data_$DATE.sqlite

# Keep only last 7 days
find $BACKUP_DIR -name "bot_data_*.sqlite" -mtime +7 -delete
```

```bash
chmod +x /opt/backup-db.sh

# Add to crontab (daily at 2 AM)
crontab -e
0 2 * * * /opt/backup-db.sh
```

### Updates

**Railway/Render**: Auto-deploys on git push

**Self-Hosted**:
```bash
cd /opt/my-simple-trader
sudo git pull
sudo systemctl restart simple-trader-backend
```

---

## Security Best Practices

### 1. API Keys
- Never commit to git
- Use environment variables
- Rotate regularly
- Use different keys for dev/prod

### 2. HTTPS
- Always use HTTPS in production
- Get free SSL from Let's Encrypt
- Enable HSTS headers

### 3. Firewall
```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### 4. Rate Limiting
Add to Nginx config:
```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

location /api {
    limit_req zone=api burst=20;
    # ... rest of config
}
```

### 5. CORS
Configure in `main.py` for production:
```python
CORS_ORIGINS=https://your-frontend-domain.com
```

---

## Cost Estimates

### Free Tier (Testing/Personal Use)
- Frontend: Vercel (free)
- Backend: Railway (free $5/month credit) or Render (free 750 hours/month)
- Database: Supabase (free)
- **Total: $0/month** (with limitations)

### Production (Small Scale)
- Frontend: Vercel Pro ($20/month) or self-hosted
- Backend: Railway ($5-20/month) or VPS ($5-10/month)
- Database: Supabase Pro ($25/month)
- Domain: $10-15/year
- **Total: ~$35-70/month**

### Self-Hosted
- VPS (2GB RAM): $10-20/month
- Domain: $10-15/year
- **Total: ~$10-20/month**

---

## Troubleshooting

### Backend won't start
```bash
# Check logs
sudo journalctl -u simple-trader-backend -n 50

# Check if port is in use
sudo lsof -i :8000

# Test manually
cd /opt/my-simple-trader
source venv/bin/activate
python main.py
```

### Frontend shows API errors
- Verify backend URL in Settings
- Check CORS configuration
- Verify backend is running: `curl https://your-backend/health`

### Database connection issues
- Verify Supabase credentials in .env
- Check Supabase project status
- Test connection with psql

---

## Next Steps

1. **Test in Paper Mode**: Run for 1-2 weeks
2. **Monitor Performance**: Track bot decisions and trades
3. **Adjust Parameters**: Fine-tune risk limits and strategies
4. **Enable Live Trading**: Only after thorough testing

---

For issues or questions, refer to:
- README_SETUP.md (main setup guide)
- APK_BUILD_GUIDE.md (mobile deployment)
- SWARM_BOT_INTEGRATION.md (strategy customization)
