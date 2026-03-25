# E-Waste App: Complete Production Deployment Guide
## Full Setup on Appwrite Cloud + Frontend Hosting

---

## Overview

This guide covers **two main components**:

1. **Frontend Hosting** - React/Vite app (Vercel, Netlify, Firebase, etc.)
2. **Backend** - Appwrite (Cloud, Self-hosted, or Docker)

---

## Part 1: Frontend Hosting Options

### Option A: Vercel (Recommended - Easiest)

**Why Vercel?**
- ✅ Free tier available
- ✅ Automatic deployments from Git
- ✅ Built-in HTTPS
- ✅ CDN for fast loading
- ✅ Environment variables management
- ✅ One-click rollbacks

#### Step 1: Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/ewaste-app.git
git push -u origin main
```

#### Step 2: Connect to Vercel
1. Go to [vercel.com](https://vercel.com)
2. Sign up with GitHub account
3. Click **"New Project"**
4. Select your GitHub repository
5. Click **Import**

#### Step 3: Configure Environment Variables
In Vercel dashboard:
- Go to **Settings** → **Environment Variables**
- Add all variables from `.env`:

```
VITE_APPWRITE_ENDPOINT=https://sgp.cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=your_project_id
VITE_APPWRITE_DB_ID=ewaste-db
VITE_APPWRITE_BUCKET_PHOTOS=ewaste_images
VITE_APPWRITE_TEAM_ID_DRIVER=ewaste-driver
VITE_APPWRITE_TEAM_ID_PMC=ewaste-pmc
VITE_PUSH_VAPID_PUBLIC_KEY=your_public_key
```

#### Step 4: Deploy
```
Click "Deploy" button
```

**Result**:
- Automatic URL: `https://ewaste-app.vercel.app`
- Auto-redeploys on Git push
- HTTPS enabled by default

---

### Option B: Netlify

**Why Netlify?**
- ✅ Free tier with generous limits
- ✅ Simple Git integration
- ✅ Built-in HTTPS
- ✅ Fast global CDN
- ✅ Form handling (future: contact forms)

#### Step 1: Create Netlify Account
1. Go to [netlify.com](https://netlify.com)
2. Sign up with GitHub

#### Step 2: Connect Repository
1. Click **"New site from Git"**
2. Select GitHub
3. Choose your repository

#### Step 3: Configure Build Settings
```
Build command: npm run build
Publish directory: dist
```

#### Step 4: Add Environment Variables
Go to **Site settings** → **Build & deploy** → **Environment**

Add all `.env` variables (same as Vercel)

#### Step 5: Deploy
- Deploy triggers automatically on Git push

**Result**:
- URL: `https://ewaste-app.netlify.app` (or custom domain)
- HTTPS enabled
- Automatic preview deployments for PRs

---

### Option C: Firebase Hosting

**Why Firebase?**
- ✅ Free tier with good limits
- ✅ Integrated with Google Cloud
- ✅ Built-in HTTPS
- ✅ Realtime hosting updates
- ✅ Good for testing

#### Step 1: Create Firebase Project
1. Go to [firebase.google.com](https://firebase.google.com)
2. Click **"Go to console"**
3. **Create Project** → Name: "ewaste-app"
4. Disable Google Analytics (optional)

#### Step 2: Install Firebase CLI
```bash
npm install -g firebase-tools
firebase login
```

#### Step 3: Initialize Firebase
```bash
firebase init hosting
```

**Select options:**
- What do you want to use as your public directory? → `dist`
- Configure as single-page app? → `Y`
- Overwrite dist/index.html? → `N`

#### Step 4: Build App
```bash
npm run build
```

#### Step 5: Deploy
```bash
firebase deploy
```

**Result**:
- URL: `https://ewaste-app.web.app`
- HTTPS enabled
- Hosted on Google Cloud

---

### Option D: Self-Hosted (VPS)

For complete control, host on your own server:

#### Server Options:
- AWS EC2 - $5+/month
- DigitalOcean - $4+/month
- Linode - $5+/month
- Azure VM - $5+/month

#### Setup on DigitalOcean (Example):

```bash
# 1. Create Ubuntu 20.04 Droplet ($5/month)
# 2. SSH into server
ssh root@your_droplet_ip

# 3. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 4. Install Nginx
sudo apt-get install -y nginx

# 5. Clone repository
cd /var/www
git clone https://github.com/yourusername/ewaste-app.git
cd ewaste-app

# 6. Install dependencies
npm install

# 7. Build
npm run build

# 8. Install PM2 (process manager)
sudo npm install -g pm2

# 9. Start app
pm2 start "npm run preview" --name ewaste-app
pm2 startup
pm2 save

# 10. Configure Nginx
# Create /etc/nginx/sites-available/ewaste-app:
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# 11. Enable site
sudo ln -s /etc/nginx/sites-available/ewaste-app /etc/nginx/sites-enabled/

# 12. Test Nginx
sudo nginx -t

# 13. Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# 14. Install SSL (Let's Encrypt)
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com

# Done! App running at https://your-domain.com
```

---

## Part 2: Appwrite Backend Setup

### Option A: Use Appwrite Cloud (Easiest)

**Advantages**:
- ✅ No installation needed
- ✅ Automatic backups
- ✅ Support included
- ✅ Already using it!

**What you're already doing**:
```
Endpoint: https://sgp.cloud.appwrite.io/v1
Project: pune-ewaste (69c0ecc8002ac0f04fc8)
```

**Just verify in production:**

1. Go to [Appwrite Cloud Console](https://sgp.cloud.appwrite.io)
2. Login
3. Select project: **Pune E-Waste**
4. Go to **Settings** → **Platforms**
5. Add your domain(s):
   ```
   https://ewaste-app.vercel.app
   https://your-custom-domain.com
   https://localhost:5173  (for local testing)
   ```

This allows your frontend to communicate with Appwrite backend.

---

### Option B: Self-Hosted Appwrite

**When to use:**
- Complete data control
- Custom infrastructure
- On-premise requirements

#### Docker Setup (Recommended)

1. **Requirements:**
   - Docker & Docker Compose
   - 2GB RAM minimum
   - 10GB disk space

2. **Install Docker**
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   ```

3. **Get Appwrite Docker Compose**
   ```bash
   mkdir appwrite && cd appwrite
   git clone https://github.com/appwrite/appwrite.git docker
   cd docker
   ```

4. **Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your settings:
   # - _APP_DOMAIN=your-domain.com
   # - _APP_OPENSSL_KEY_V1=generate-key
   # etc.
   ```

5. **Start Appwrite**
   ```bash
   docker compose up -d
   ```

6. **Access Appwrite**
   ```
   Console: https://your-domain.com
   API: https://your-domain.com/v1
   ```

---

## Part 3: Configuration for Production

### Update Frontend .env

Create `.env.production`:

```env
# Production Appwrite
VITE_APPWRITE_ENDPOINT=https://sgp.cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=69c0ecc8002ac0f04fc8
VITE_APPWRITE_DB_ID=ewaste-db
VITE_APPWRITE_BUCKET_PHOTOS=ewaste_images
VITE_APPWRITE_TEAM_ID_DRIVER=ewaste-driver
VITE_APPWRITE_TEAM_ID_PMC=ewaste-pmc

# Production Push Notifications
VITE_PUSH_VAPID_PUBLIC_KEY=your_production_vapid_public_key

# Analytics (optional)
VITE_ANALYTICS_ID=your_google_analytics_id
```

### Update Appwrite Settings

1. **Platforms (CORS)**
   ```
   Settings → Platforms
   Add:
   - https://your-domain.com
   - https://www.your-domain.com
   - https://ewaste-app.vercel.app
   ```

2. **Function Environment Variables**
   ```
   Functions → push-notifier → Settings
   
   APPWRITE_API_KEY=your_production_key
   PUSH_VAPID_SUBJECT=mailto:admin@your-domain.com
   PUSH_VAPID_PUBLIC_KEY=your_public_key
   PUSH_VAPID_PRIVATE_KEY=your_private_key
   ```

3. **Function Triggers**
   ```
   Functions → push-notifier → Triggers
   Ensure both enabled:
   - databases.ewaste-db.collections.reports.documents.*.create
   - databases.ewaste-db.collections.reports.documents.*.update
   ```

---

## Part 4: Domain Setup

### Register Domain

Options:
- Namecheap ($8-12/year)
- GoDaddy ($10+/year)
- Google Domains ($12/year)

### Connect Domain to Host

**If using Vercel:**
1. Vercel Dashboard → Project Settings → Domains
2. Add domain name
3. Follow DNS instructions
4. Automatic SSL in 24 hours

**If using Netlify:**
1. Netlify Dashboard → Domain Settings
2. Add custom domain
3. Update DNS records
4. SSL auto-enabled

**If self-hosted:**
1. Point DNS A record to server IP
2. Install SSL certificate (Let's Encrypt)
3. Configure Nginx/Apache

---

## Part 5: Environment Variables Checklist

### Vercel/Netlify Dashboard

- [x] `VITE_APPWRITE_ENDPOINT` - Appwrite API endpoint
- [x] `VITE_APPWRITE_PROJECT_ID` - Your project ID
- [x] `VITE_APPWRITE_DB_ID` - Database ID (ewaste-db)
- [x] `VITE_APPWRITE_BUCKET_PHOTOS` - Storage bucket
- [x] `VITE_APPWRITE_TEAM_ID_DRIVER` - Driver team ID
- [x] `VITE_APPWRITE_TEAM_ID_PMC` - PMC team ID
- [x] `VITE_PUSH_VAPID_PUBLIC_KEY` - Web Push public key

### Appwrite Function Console

- [x] `APPWRITE_API_KEY` - Server API key
- [x] `APPWRITE_DB_ID` - Database ID
- [x] `APPWRITE_PUSH_COLLECTION_ID` - Push subscriptions collection
- [x] `PUSH_VAPID_SUBJECT` - Email for VAPID
- [x] `PUSH_VAPID_PUBLIC_KEY` - Public key
- [x] `PUSH_VAPID_PRIVATE_KEY` - Private key (SECRET!)

---

## Part 6: Production Deployment Checklist

### Pre-Deployment
- [ ] Code tested locally (npm run dev)
- [ ] All features working (citizen, PMC, driver roles)
- [ ] Push notifications tested
- [ ] PWA installation tested
- [ ] Offline functionality verified
- [ ] Build succeeds (npm run build)

### Frontend Deployment
- [ ] Repository pushed to GitHub
- [ ] Vercel/Netlify account created
- [ ] Project imported
- [ ] Environment variables added
- [ ] Domain configured (if custom domain)
- [ ] Deployment successful

### Backend Configuration
- [ ] Appwrite project active
- [ ] Collections created (reports, push_subscriptions, users)
- [ ] Indexes created
- [ ] Storage bucket configured
- [ ] Teams created (driver, pmc)
- [ ] Function deployed (push-notifier)
- [ ] Function triggers enabled
- [ ] CORS platforms added

### Security Checklist
- [ ] HTTPS enabled everywhere
- [ ] VAPID keys secure (private key not exposed)
- [ ] API keys rotated (if old ones leaked)
- [ ] Function only accessible via triggers
- [ ] Database permissions set correctly
- [ ] Storage bucket permissions restricted

### Testing in Production
- [ ] Visit production URL
- [ ] Create test account (citizen)
- [ ] Submit report with photo
- [ ] Check photo uploads to storage
- [ ] Verify push notification sent
- [ ] Check Appwrite Console for new reports
- [ ] Test PWA installation
- [ ] Test offline functionality

### Monitoring
- [ ] Set up error tracking (Sentry/Rollbar)
- [ ] Monitor Appwrite Function executions
- [ ] Monitor database storage usage
- [ ] Set up uptime monitoring
- [ ] Configure email alerts

---

## Part 7: Post-Deployment

### Analytics Setup
```
1. Google Analytics:
   - Add VITE_ANALYTICS_ID to .env.production
   - Verify tracking code in production

2. Appwrite Dashboard:
   - Monitor API calls
   - Check function executions
   - Watch database growth
```

### Monitoring Stack (Free Options)

**Error Tracking**: Sentry (free tier)
- Captures JavaScript errors
- Alerts on crashes

**Uptime Monitoring**: UptimeRobot (free tier)
- Monitors if site is up
- Alerts if down

**Analytics**: Google Analytics (free)
- User behavior
- Traffic sources
- Conversion tracking

### Maintenance Schedule

**Daily**:
- Check for error alerts
- Monitor function executions
- Verify no database issues

**Weekly**:
- Review Appwrite logs
- Check storage usage trending
- Backup database (if self-hosted)

**Monthly**:
- Review analytics
- Plan new features
- Security audit
- Update dependencies (npm outdated)

---

## Part 8: Scaling for Production

### When You Need More Power

**Early Stage (0-1000 users)**:
- Vercel Free / Netlify Free ($0)
- Appwrite Cloud ($10-50/mo)
- Total: ~$10-50/month

**Growth (1000-10000 users)**:
- Vercel Pro ($20/mo)
- Appwrite Cloud Standard ($50+/mo)
- CDN for assets (Cloudflare Free)
- Total: ~$70-100/month

**Scale (10000+ users)**:
- Multiple Vercel instances or self-hosted
- Appwrite on dedicated infrastructure
- Database read replicas
- Dedicated support
- Total: $200+/month

---

## Part 9: Troubleshooting Production Issues

### App Won't Load

**Check:**
1. Frontend deployment status (Vercel/Netlify dashboard)
2. Network tab in DevTools (broken requests?)
3. CORS errors? → Add domain to Appwrite platforms
4. API endpoint correct in .env? → Check all variables

### Push Notifications Not Working

**Check:**
1. Function deployment status (Functions → push-notifier)
2. Function environment variables set correctly
3. VAPID keys still valid
4. Check function executions for errors
5. Push subscriptions exist in database

### Database Errors

**Check:**
1. Database exists (ewaste-db)
2. Collections exist (reports, push_subscriptions)
3. Database not full? → Check Appwrite Dashboard usage
4. Permissions correct? → Verify ACL settings

### File Uploads Not Working

**Check:**
1. Storage bucket exists (ewaste_images)
2. Bucket permissions allow file upload
3. File size under limit (usually 500MB)
4. Storage not full? → Check usage

---

## Part 10: Rollback Procedure

If something breaks:

**Vercel:**
```
Dashboard → Deployments → Click previous working deployment
Click: "Redeploy" or marked as current
Automatic rollback in 1-2 minutes
```

**Netlify:**
```
Dashboard → Deploys → Click previous deployment
Click: "Publish deploy"
Rollback immediate
```

**Git Rollback:**
```bash
git log --oneline  # Find good commit
git revert <commit-hash>
git push origin main
# Auto-redeploy starts
```

---

## Quick Summary

### Fastest Way to Deploy (Vercel)

```bash
# 1. Build locally
npm run build

# 2. Push to GitHub
git push origin main

# 3. Connect Vercel
# Visit: vercel.com
# Import your GitHub repo
# Add environment variables
# Click: Deploy

# Result: Live at https://ewaste-app.vercel.app ✅
```

### Time Estimates
- **Frontend Setup**: 15 minutes (Vercel)
- **Environment Variables**: 5 minutes
- **Verify Everything Works**: 10 minutes
- **Custom Domain**: 10 minutes (+ 24h DNS propagation)
- **Total**: ~30 minutes to live app!

---

## Reference Links

- [Vercel Docs](https://vercel.com/docs)
- [Netlify Docs](https://docs.netlify.com)
- [Firebase Hosting](https://firebase.google.com/docs/hosting)
- [Appwrite Cloud](https://appwrite.io)
- [Let's Encrypt](https://letsencrypt.org) (SSL certs)
- [Nginx Config](https://nginx.org/en/docs/)

---

## Support

**Questions?**
- Vercel: [vercel.com/support](https://vercel.com/support)
- Netlify: [netlify.com/support](https://netlify.com/support)
- Appwrite: [appwrite.io/docs](https://appwrite.io/docs)

---

**Status**: ✅ Ready to Deploy

**Next Step**: Choose your hosting (Vercel recommended), follow steps above, and deploy! 🚀
