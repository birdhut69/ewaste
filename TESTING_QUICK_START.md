# E-Waste App: Complete Testing Quick Start
## All Three Roles + Push + PWA - 15 Minute Setup

---

## Pre-Flight Checklist (5 minutes)

```bash
# 1. Install dependencies
npm install

# 2. Run Appwrite backend setup
APPWRITE_API_KEY=your_api_key VITE_APPWRITE_PROJECT_ID=your_project_id node scripts/setup-appwrite.js

# 3. Generate VAPID keys for push notifications
npx web-push generate-vapid-keys
# ⚠️ SAVE THIS OUTPUT! You'll need it next.
```

### Step 1: Add VAPID Public Key to .env

After running `web-push generate-vapid-keys`, copy the **Public Key** and add to `.env`:

```bash
# In .env (add this line):
VITE_PUSH_VAPID_PUBLIC_KEY=paste_your_public_key_here
```

### Step 2: Configure Appwrite Function

Go to **Appwrite Console** → **Functions** → **push-notifier**:

1. **Environment Variables** (add these):
   - `APPWRITE_API_KEY`: Your Appwrite server API key
   - `APPWRITE_DB_ID`: `ewaste-db`
   - `APPWRITE_PUSH_COLLECTION_ID`: `push_subscriptions`
   - `PUSH_VAPID_SUBJECT`: `mailto:admin@example.com`
   - `PUSH_VAPID_PUBLIC_KEY`: From step 1 above
   - `PUSH_VAPID_PRIVATE_KEY`: Private key from web-push output

2. **Triggers** → Add both:
   - `databases.ewaste-db.collections.reports.documents.*.create`
   - `databases.ewaste-db.collections.reports.documents.*.update`

3. Click **Deploy** and wait for ✅ **Ready** status

---

## Quick Start: Run Full Test Suite (10 minutes)

### 1. Start Development Server

```bash
npm run dev
# Wait for: ✓ built in X.XXs
# Open: http://localhost:5173
```

### 2. Create Test Users

```bash
# In new terminal:
APPWRITE_API_KEY=your_api_key node scripts/create-test-users.js
# Output will show test credentials
```

### 3. Follow Test Scenario (Execute in Order)

#### Role 1: Citizen (Submit Report)

**URL**: `http://localhost:5173`

1. **Sign Up**
   - Email: `citizen@test.com`
   - Password: `Test123!@`
   - Name: `Test Citizen`
   - Click **Sign Up**

2. **Enable Notifications**
   - Prompt: "Enable Notifications?" → Click **Allow**
   - Verify: Browser/system asks for permission

3. **Submit E-Waste Report**
   - Button: **"Report E-Waste"**
   - Category: Select any (e.g., "Computer Monitor")
   - Photo: Take or upload
   - Location: Click map (or use GPS)
   - Notes: "Test report for E2E"
   - Click **Submit Report**

4. **Expected Result**
   - ✅ Report saved (you see success message)
   - ✅ Push notification sent to PMC & Driver
   - ✅ Check Appwrite Console → Database → reports (new document visible)

---

#### Role 2: PMC (Verify Report)

**New Browser Window/Incognito**

1. **Login as PMC**
   - Email: `pmc@test.com`
   - Password: `Test123!@`
   - Role: **PMC** (select from dropdown)
   - Click **Login**

2. **Enable Notifications**
   - Prompt appears → Click **Allow**

3. **Verify Citizen's Report**
   - Tab: **"Pending Reports"**
   - Click report from Citizen
   - Review: Photo, location, category
   - Scroll down → **Verification Section**
   - Status: Select **"Approved"** (or "Rejected")
   - Notes: Add comment (e.g., "Verified - safe")
   - Click **Save Verification**

4. **Expected Result**
   - ✅ Report status updated in Appwrite
   - ✅ Push sent to Driver
   - ✅ Success message shown

---

#### Role 3: Driver (View & Collect)

**Another Browser/Incognito**

1. **Login as Driver**
   - Email: `driver@test.com`
   - Password: `Test123!@`
   - Role: **Driver**
   - Click **Login**

2. **Enable Notifications**
   - Prompt → Click **Allow**
   - **Watch notification arrive** (5-10 seconds)
   - Should see: "New e-waste report" notification

3. **View & Collect Report**
   - Tab: **"Assigned Reports"**
   - Click report (now verified by PMC)
   - Review details
   - Button: **"Mark as Collected"**
   - Click button

4. **Expected Result**
   - ✅ Status changes to "Collected"
   - ✅ Push sent to Citizen & PMC
   - ✅ Citizen receives notification

---

## Verify Everything Worked

### Check Notifications Received

**Desktop Browser:**
1. Open DevTools: F12
2. Go to: **Console** tab
3. Look for log entries like:
   ```
   ✓ Push subscription registered
   ✓ Notification received
   ```

**Android Mobile:**
1. While app is **closed/background**
2. Look for notification in tray (swipe down from top)
3. Should show app icon + message

### Verify Data in Appwrite

1. Open **Appwrite Console**
2. Go to: **Database** → `ewaste-db`
3. Check collections:
   - **reports**: Should see all three documents (created, verified, collected)
   - **push_subscriptions**: Should see subscriptions for each role with `active: true`

---

## Test PWA Installation (5 minutes)

### Desktop Installation

1. **While logged in as any role**
2. Look for: Install prompt (bottom-right or address bar button)
3. Click **Install**
4. App window opens (no address bar)
5. Verify: Window title shows "Pune E-Waste" not URL

### Android Installation

1. **While logged in on mobile**
2. Bottom-right: "Install app" prompt appears
3. Tap **Install**
4. Icon appears on home screen
5. Tap icon → app opens in full-screen

---

## Test Offline Functionality (5 minutes)

### Quick Offline Test

1. **Login as Citizen**
2. Navigate through app to cache data
3. **DevTools → Network → Offline** checkbox
4. **Refresh page**
5. **Expected**: Page loads without error
6. **Navigation**: Should work (pages cached)
7. **Uncheck Offline**
8. **Expected**: Auto-sync, data updates

---

## Troubleshooting at a Glance

| Problem | Quick Fix |
|---------|-----------|
| No install prompt | Check: Browser supports PWA (Chrome/Edge/Firefox) |
| Notification blank screen after offline | Hard refresh: Ctrl+Shift+R (Mac: Cmd+Shift+R) |
| Push notifications not arriving | Check Appwrite Function status → look at Executions logs |
| Create test users failing | Verify: APPWRITE_API_KEY is correct & has server permissions |
| Service Worker not registering | Check: DevTools → Application → Service Workers (should show ✅ active) |

---

## Files Created/Updated

All comprehensive guides have been created:

- ✅ **TESTING_GUIDE.md** - Full test scenarios & role flows
- ✅ **PUSH_NOTIFICATION_SETUP.md** - VAPID key setup & troubleshooting
- ✅ **PWA_TESTING_GUIDE.md** - Installation & offline testing
- ✅ **scripts/create-test-users.js** - Test user creation (run once)
- ✅ **APPWRITE_SETUP.md** - Already in place
- ✅ **This file** - Quick start checklist

---

## Next Steps for Full Documentation

### For Deployment

See [APPWRITE_SETUP.md](./APPWRITE_SETUP.md) and [PUSH_NOTIFICATION_SETUP.md](./PUSH_NOTIFICATION_SETUP.md)

### For Deep Testing

See [TESTING_GUIDE.md](./TESTING_GUIDE.md)

### For PWA Features

See [PWA_TESTING_GUIDE.md](./PWA_TESTING_GUIDE.md)

---

## Test Completion Checklist

After running through all steps above, verify:

- [ ] **Citizen can submit reports** with notifications
- [ ] **PMC can verify reports** sent by citizens  
- [ ] **Driver can collect reports** verified by PMC
- [ ] **Push notifications work** (browser + mobile)
- [ ] **PWA installs** on desktop and mobile
- [ ] **Offline mode works** (app shell loads without network)
- [ ] **Auto-sync works** (data syncs when back online)

**All checked?** ✅ Your app is production-ready!

---

## Next Immediate Actions

1. **Start dev server**: `npm run dev`
2. **In another terminal**: Create test users (see above)
3. **Follow test scenario**: Citizen → PMC → Driver
4. **Test PWA Install**: Install on device
5. **Test Offline**: DevTools → Offline mode
6. **Verify Success**: Check all 3 roles, all notifications, all features

---

**Time to Complete**: ~15-20 minutes for full test cycle
**Success Criteria**: All 7 checkboxes above marked ✅
**Support**: See individual guide files for detailed troubleshooting

Happy Testing! 🚀
