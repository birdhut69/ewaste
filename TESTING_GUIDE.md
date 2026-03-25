# E-Waste App: Full Testing Guide
## All Three Role Flows + Push Notifications + PWA

### Prerequisites
- Appwrite backend initialized (run `npm run setup-appwrite`)
- Live HTTPS server running (required for Service Workers)
- Mobile device (Android) or desktop browser for testing
- Test credentials for all three roles

---

## Part 1: Setup Push Notifications

### Step 1: Generate VAPID Keys (Free Web Push)

```bash
npm install -D web-push
npx web-push generate-vapid-keys
```

Save the output (you'll need these):
- **Public Key** → add to `.env` as `VITE_PUSH_VAPID_PUBLIC_KEY`
- **Private Key** → use for Appwrite Function environment variable
- **Subject** → email for VAPID subject (e.g., `mailto:admin@example.com`)

### Step 2: Add VAPID Keys to .env

```bash
# Add these lines to .env
VITE_PUSH_VAPID_PUBLIC_KEY=your_public_key_here
```

### Step 3: Deploy Appwrite Function

In Appwrite Console:

1. Go to **Functions** → Create Function
2. Set:
   - **Name**: `push-notifier`
   - **Runtime**: Node.js 20+
   - **Entry point**: `src/index.js`
   - **Source**: Upload `functions/push-notifier/` folder

3. Set environment variables:
   ```
   APPWRITE_API_KEY=your_server_api_key_here
   APPWRITE_DB_ID=ewaste-db
   APPWRITE_PUSH_COLLECTION_ID=push_subscriptions
   PUSH_VAPID_SUBJECT=mailto:admin@example.com
   PUSH_VAPID_PUBLIC_KEY=your_public_key
   PUSH_VAPID_PRIVATE_KEY=your_private_key
   ```

4. Click **Add Trigger** and add both:
   - `databases.ewaste-db.collections.reports.documents.*.create`
   - `databases.ewaste-db.collections.reports.documents.*.update`

5. Click **Deploy** and wait for "Ready" status

---

## Part 2: Test Scenario - Complete Role Flow

### Overview
```
Citizen App (Web/Mobile)
    ↓
    Creates Report + Photo
    ↓
    → Push sent to PMC & Driver
    ↓
PMC App (Web/Desktop)
    ↓
    Verifies Report + Notes
    ↓
    → Push sent to Driver
    ↓
Driver App (Mobile)
    ↓
    Views Verified Report
    ↓
    Marks as Collected
    ↓
    → Push sent to Citizen & PMC
```

### Role 1: Citizen - Submit E-Waste Report

**Test URL**: `http://localhost:5173/auth` → Citizen role

**Steps:**

1. Open app → **Sign up as Citizen**
   - Email: `citizen@test.com`
   - Password: `Test123!@`
   - Name: `Test Citizen`

2. **Enable Push Notifications**
   - When prompted: "Enable Notifications?" → Click **Yes**
   - Check browser console: Should log push subscription registered

3. **Submit Report**
   - Tap **"Report E-Waste"**
   - Category: **Computer Monitor**
   - Photo: Take or upload a photo
   - Location: Click map or use GPS
   - Notes: "Working condition, slightly dusty"
   - Tap **Submit**

**Expected Behavior:**
- ✅ Report saved to Appwrite (check in Appwrite Console)
- ✅ Push notification sent to PMC & Driver roles
- Check browser DevTools → Network: POST to `web-push` endpoint
- Citizen sees: "Report submitted successfully"

**Verify in Appwrite Console:**
- Dashboard → Database → `ewaste-db` → `reports` collection
- Should see new document with status: `pending-review`

---

### Role 2: PMC - Verify Report

**Test URL**: `http://localhost:5173/auth` → PMC role

**Requirements:**
- PMC user must exist in Appwrite Teams. If not, create via Appwrite Console:
  - Go to **Teams** → `ewaste-pmc`
  - Add user or use a pre-created PMC account

**Pre-test Steps:**
1. Create PMC test account:
   ```bash
   # Run: Create test user in Appwrite Console
   # OR use script: node scripts/create-test-users.js
   ```

**Testing:**

1. **Login as PMC**
   - Email: `pmc@test.com` (or your PMC account)
   - Password: `Test123!@`
   - Select **PMC** role on login

2. **Enable Push Notifications**
   - When prompted: Enable → **Yes**

3. **View Reports Tab**
   - Tap **"Pending Reports"**
   - Should see the report submitted by Citizen
   - Click on report card

4. **Verify Report**
   - Review Citizen's photo and details
   - Scroll down → **Verification Section**
   - Status: Change to **"Approved"** or **"Rejected"**
   - Category: Confirm or correct (e.g., "Computer Monitor")
   - Notes: Add PMC comment (e.g., "Verified - safe to collect")
   - Tap **"Save Verification"**

**Expected Behavior:**
- ✅ Report status updated to `verified` in Appwrite
- ✅ Push notification sent to Driver
- PMC sees: "Verification saved"
- Driver receives notification: "New e-waste report"

**Note:** If verification fails:
- Check Appwrite Function logs: **Functions** → `push-notifier` → **Executions**
- Verify Function has correct VAPID keys
- Check that Driver has active push subscription

---

### Role 3: Driver - View & Collect Report

**Test URL**: `http://localhost:5173/auth` → Driver role

**Pre-test Steps:**
1. Create Driver test account (similar to PMC setup)

**Testing:**

1. **Login as Driver**
   - Email: `driver@test.com`
   - Password: `Test123!@`
   - Select **Driver** role

2. **Enable Push Notifications**
   - When prompted: **Yes**
   - Wait ~5 seconds for push notification to arrive
   - **Notification should appear**: "New e-waste report - Computer Monitor is waiting for pickup"

3. **Open Assigned Reports**
   - Tap **"Assigned Reports"** or **My Tasks**
   - Should see the verified report from Citizen (via PMC)
   - Click report to view details

4. **View Report Details**
   - Check: Category, Location, Photo, Citizen contact
   - Verify button: **"Mark as Collected"**

5. **Collect Report**
   - Tap **"Mark as Collected"**
   - Optional: Add collection notes (e.g., "Picked up from residence")
   - Confirm action

**Expected Behavior:**
- ✅ Report status changes to `collected`
- ✅ Push notification sent to Citizen & PMC
- Citizen receives: "Pickup completed - Computer Monitor was marked as collected"
- PMC receives: "Report status updated"

---

## Part 3: Push Notification Validation

### Desktop Browser Testing

1. **Test on Chrome/Firefox:**
   - Open DevTools → Application → Service Workers
   - Should see registered Service Worker (status: active)
   
2. **Manually Trigger Push Notification:**
   ```bash
   # In Appwrite Console, update any report via API/CLI
   # This triggers the function and should send push notification
   ```

3. **Check Notification:**
   - Should appear in browser notification tray
   - Click notification: Should navigate to relevant app section

### Android Mobile Testing

1. **Test on Chrome Mobile / Brave:**
   - Install app to home screen (tap menu → "Install app")
   - Open app in standalone mode
   
2. **Enable Notifications:**
   - App should prompt for notification permission
   - Tap **Allow**
   
3. **Verify Subscription:**
   - Open Appwrite Console → Database → `push_subscriptions`
   - Should see entry with:
     - `role: "driver"` (or citizen/pmc)
     - `endpoint: ...` (long URL)
     - `active: true`

4. **Test Push:**
   - While app is **closed** (in background/minimized)
   - Create/update report from other role
   - **Notification should appear** in Android notification tray
   - Tap notification: Should open app and navigate correctly

---

## Part 4: PWA Installation & Offline Testing

### Installation Test (Per Role)

**Test 1: Citizen Role PWA Install**

1. **Open as Citizen**
   - Login as Citizen
   - Bottom-right corner: "Install Pune E-Waste app" card appears
   - Tap **"Install"** button

2. **Verify Installation**
   - On Android: App icon appears on home screen
   - On Desktop: App window opens separately from browser
   - Address bar shows app name (not URL)

3. **Test Installed App**
   - Open installed app from home screen
   - Should be in standalone mode (no browser address bar)
   - Check DevTools → Application → Manifest
   - `display: "standalone"` confirmed

### Offline/Online Transition Test

**Test 1: Citizen Offline Access**

1. **Step 1: Login & Cache Data (Online)**
   - Login as Citizen
   - Navigate through pages (Citizen home, Map, Submissions)
   - This caches app shell and data

2. **Step 2: Go Offline**
   - DevTools (F12) → Network tab → **Offline** checkbox
   - Or unplug network / toggle airplane mode

3. **Step 3: Test Offline Functionality**
   - Refresh page (should not error)
   - Navigation should work (cached pages load)
   - Try to create new report: Should show "offline" message
   - Map should display (cached)
   - Previous reports visible (cached from sync)

4. **Step 4: Go Back Online**
   - DevTools → Uncheck **Offline**
   - Or reconnect network / turn off airplane mode
   - App should auto-sync
   - New report creation button should work again
   - Any unsaved data should sync to backend

**Expected Offline Behavior:**
- ✅ App shell loads from cache
- ✅ Previously loaded data visible
- ✅ Navigation works (between cached pages)
- ✅ No white screen or crashes
- ✅ Clear "offline" mode indicator

**Expected Online Behavior:**
- ✅ Auto-sync triggers within 5 seconds
- ✅ Background syncs new data
- ✅ UI updates with fresh data
- ✅ Write operations available again

**Test 2: PMC Offline Test (same steps)**
- Repeat above for PMC role
- Focus on: Verification form accessibility, data caching

**Test 3: Driver Offline Test (same steps)**
- Repeat above for Driver role
- Focus on: Map caching, offline report list access

---

## Part 5: Comprehensive Test Checklist

### Push Notifications
- [ ] VAPID keys generated and configured
- [ ] Appwrite Function deployed successfully
- [ ] Function triggers enabled for both `.create` and `.update` events
- [ ] Citizen submits report → PMC receives push notification
- [ ] PMC verifies report → Driver receives push notification
- [ ] Driver collects report → Citizen receives push notification
- [ ] Desktop browser shows notification in tray
- [ ] Android mobile shows notification in notification tray
- [ ] Clicking notification navigates to correct page

### Citizen Role
- [ ] Can sign up with email
- [ ] Can enable push notifications
- [ ] Can submit report with photo
- [ ] Can view own submissions
- [ ] Receives push when report is collected
- [ ] PWA install prompt appears
- [ ] Works offline (can view cached reports)
- [ ] Auto-syncs when online

### PMC Role
- [ ] Can login (requires pre-created account in Appwrite Teams)
- [ ] Can enable push notifications
- [ ] Can view pending reports from Citizens
- [ ] Can verify/reject reports
- [ ] Can add verification notes
- [ ] Receives push for new reports
- [ ] PWA install works
- [ ] Offline access to cached verification form

### Driver Role
- [ ] Can login (requires pre-created Driver account)
- [ ] Can enable push notifications
- [ ] Can view assigned reports from PMC
- [ ] Can mark reports as collected
- [ ] Receives push for new assignments
- [ ] Receives push when PMC verifies
- [ ] PWA install works
- [ ] Offline map access (if previously cached)

### PWA Installation (All Roles)
- [ ] Install prompt appears (bottom-right)
- [ ] Install button works
- [ ] App icon appears on home screen
- [ ] App runs in standalone mode (no browser UI)
- [ ] Manifest loads correctly
- [ ] Theme colors apply

### Offline/Online Transitions (All Roles)
- [ ] App loads offline from cache
- [ ] Pages navigate smoothly offline
- [ ] No white screen or crashes
- [ ] "Offline" indicator visible
- [ ] Auto-syncs when back online
- [ ] Data updates correctly after sync
- [ ] Write operations work after reconnect

---

## Part 6: Troubleshooting

### Push Notifications Not Arriving

**Problem**: Submitted report but no push notification received

**Diagnostic Steps:**

1. **Check Function Status:**
   ```
   Appwrite Console → Functions → push-notifier → Executions
   ```
   - Look for recent execution
   - Check execution logs for errors

2. **Verify VAPID Keys:**
   - Appwrite Console → Functions → push-notifier
   - Check environment variables are set correctly
   - Keys must not have typos or extra whitespace

3. **Check Push Subscription:**
   ```
   Appwrite Console → Database → ewaste-db → push_subscriptions
   ```
   - Verify subscriber document exists
   - Check: `active: true`, `role: "driver"` (or appropriate role)
   - `endpoint` should be a valid HTTPS URL

4. **Check Service Worker:**
   - DevTools → Application → Service Workers
   - Should be "active and running"
   - Check for errors in console

5. **Verify Notification Permission:**
   - DevTools → Application → Manifest
   - Site permissions: Should show "Notifications: Allow"

**Common Issues:**

| Error | Solution |
|-------|----------|
| VAPID keys invalid | Regenerate with `npx web-push generate-vapid-keys` |
| 404 on endpoint | Subscription endpoint invalid; clear localStorage `ewaste_push_endpoint` and re-enable |
| "Active" is false | Subscription deactivated; delete doc and re-enable notifications |
| No Service Worker | Check Appwrite Setup ran; may need HTTPS |
| No push_subscriptions collection | Run `npm run setup-appwrite` again |

### PWA Not Installing

**Problem**: Install prompt doesn't appear

**Solutions:**
1. Check manifest loads: DevTools → Application → Manifest
2. Browser may require HTTPS (except localhost)
3. iOS: App should be installed via "Share → Add to Home Screen"
4. Check for: `not dismissed recently` (localStorage reset needed)

### Offline Access Not Working

**Problem**: App crashes or shows blank page when offline

**Solutions:**
1. Verify Service Worker registered: DevTools → Application → SWs
2. Check console for errors: F12 → Console tab
3. Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
4. Clear cache: DevTools → Application → Clear storage → Clear site data

---

## Part 7: Full Test Execution Script

```bash
#!/bin/bash
# Run this script to execute the full test suite

echo "🚀 Starting E-Waste App Full Test Suite"

# 1. Check environment variables
echo "✓ Checking environment setup..."
source .env 2>/dev/null || echo "⚠ .env file not loaded (might be OK if using system env)"

# 2. Start dev server
echo "✓ Starting dev server..."
npm run dev &
DEV_PID=$!

# 3. Wait for server to start
sleep 5
echo "✓ Dev server started (PID: $DEV_PID)"

# 4. Create test users
echo "✓ Creating test users..."
node scripts/create-test-users.js

echo ""
echo "════════════════════════════════════════════════════════"
echo "📱 TEST SUITE READY"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Open in browser: http://localhost:5173"
echo ""
echo "Follow these steps:"
echo "1. CITIZEN TEST:"
echo "   - Sign up: citizen@test.com / Test123!@"
echo "   - Enable notifications"
echo "   - Submit report with photo"
echo ""
echo "2. PMC TEST:"
echo "   - Login: pmc@test.com / Test123!@"
echo "   - Enable notifications"
echo "   - Verify citizen's report"
echo ""
echo "3. DRIVER TEST:"
echo "   - Login: driver@test.com / Test123!@"
echo "   - Enable notifications"
echo "   - View verified report"
echo "   - Mark as collected"
echo ""
echo "4. PWA INSTALL TEST (All roles):"
echo "   - Look for install prompt (bottom-right)"
echo "   - Click Install"
echo "   - Check app runs standalone"
echo ""
echo "5. OFFLINE TEST (All roles):"
echo "   - DevTools → Network → Offline"
echo "   - Try navigation and report viewing"
echo "   - Turn online → verify auto-sync"
echo ""
echo "════════════════════════════════════════════════════════"
echo "Press ENTER when tests complete..."
read -r

# Cleanup
kill $DEV_PID 2>/dev/null || true
echo "✓ Test suite complete"
```

**Run with:**
```bash
chmod +x test-full-flow.sh
./test-full-flow.sh
```

---

## Part 8: Expected Results Summary

✅ **All Tests Pass When:**

| Component | Status |
|-----------|--------|
| **Citizen Report Creation** | Report saved, push sent to PMC/Driver |
| **PMC Verification** | Status updated to `verified`, push sent to Driver |
| **Driver Collection** | Status updated to `collected`, push sent to Citizen/PMC |
| **Desktop Notifications** | Browser tray shows notifications |
| **Mobile Notifications** | Android notification tray shows notifications |
| **PWA Install** | Standalone app accessible from home screen |
| **Offline Mode** | App shell loads, cached data visible, no crashes |
| **Online Sync** | Auto-sync within 5 seconds, data updates |

---

**Document Last Updated**: March 2026
**Framework**: React 18 + Vite + Appwrite 15.0 + Service Workers + Web Push API
