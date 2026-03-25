# Push Notification Setup Guide
## Complete VAPID Configuration for E-Waste App

This guide walks you through enabling Web Push notifications with free VAPID keys.

---

## What You'll Get

✅ **Free web push notifications** (no paid service required)
✅ **Desktop browser notifications** (Chrome, Firefox, Edge)
✅ **Android mobile notifications** (Chrome, Brave, Samsung Internet)
✅ **Background push** (works when app is closed)
✅ **Full automation** (via Appwrite Functions triggered by database events)

---

## Step 1: Generate VAPID Keys

VAPID (Voluntary Application Server Identification) keys allow your server to send push notifications for free.

### Install web-push CLI

```bash
npm install --save-dev web-push
```

### Generate Keys

```bash
npx web-push generate-vapid-keys
```

**Output Example:**
```
Public Key: BOmyB5vx3qlOy7lLpuXD5wSZjP_...rest-of-key...
Private Key: Fk4mQ9xJ2kL5mN6pQ8sT1uV...rest-of-key...
```

**Save these securely!** Store in a safe location.

---

## Step 2: Add Public Key to Frontend .env

Edit `.env` in project root:

```bash
# Copy from VAPID output
VITE_PUSH_VAPID_PUBLIC_KEY=BOmyB5vx3qlOy7lLpuXD5wSZjP_rest-of-key
```

### Verify It Loads

```bash
npm run dev
# Open DevTools → Console
# Check: window.__VITE__PUBLIC_KEY or similar in app logs
```

---

## Step 3: Deploy Appwrite Function

The function sends push notifications when reports are created/updated.

### 3.1 Upload Function Code

1. Open Appwrite Console
2. Go to **Functions**
3. Click **Create Function**
4. Set:
   - **Name**: `push-notifier`
   - **Runtime**: `Node.js 20+`
   - **Source**: File Upload

5. Upload the folder: `/functions/push-notifier/`

### 3.2 Set Function Environment Variables

In the function settings, add environment variables:

```
APPWRITE_API_KEY=your_server_api_key_here
APPWRITE_DB_ID=ewaste-db
APPWRITE_PUSH_COLLECTION_ID=push_subscriptions
PUSH_VAPID_SUBJECT=mailto:admin@example.com
PUSH_VAPID_PUBLIC_KEY=BOmyB5vx3qlOy7lLpuXD5wSZjP_rest-of-key
PUSH_VAPID_PRIVATE_KEY=Fk4mQ9xJ2kL5mN6pQ8sT1uV_rest-of-key
```

**Important Notes:**
- `PUSH_VAPID_SUBJECT`: Use your email (e.g., `mailto:yourname@example.com`)
- **DO NOT share** the private key
- Both keys from Step 1 are needed

### 3.3 Add Database Triggers

1. Still in Function settings
2. Scroll to **Triggers**
3. Click **Add Event Trigger**
4. Select:
   - **Type**: Database
   - **Events**: Select both:
     - `databases.ewaste-db.collections.reports.documents.*.create`
     - `databases.ewaste-db.collections.reports.documents.*.update`

5. Add both triggers (you'll see two separate trigger entries)

### 3.4 Deploy

Click **Deploy** button and wait for:
```
✅ Function Status: Ready
```

---

## Step 4: Verify Service Worker Registration

Your browser needs a Service Worker to receive push notifications.

### Check Service Worker

1. Open app: `http://localhost:5173`
2. Open DevTools: `F12`
3. Go to: **Application** → **Service Workers**
4. Should see:
   ```
   https://localhost:5173/sw.js (active and running)
   ```

If red ❌:
- Check console for errors
- May need HTTPS (production) or localhost (development)
- Clear cache: DevTools → Application → **Clear storage** → Clear site data

---

## Step 5: Test Notification Permission

### Desktop Browser Test

1. Open app
2. Should see prompt: **"Enable Notifications?"**
3. Click **"Allow"** (may vary by browser)
4. Check DevTools → Application → **Manifest** → **Permissions**
5. Should show: `Notifications: Allow`

### Android Browser Test

1. Open app on Android device
2. Should see permission prompt
3. Tap **Allow**
4. Check Settings → Apps → Chrome → Permissions → Notifications → **On**

---

## Step 6: Verify Push Subscription

After enabling notifications, user data is stored in `push_subscriptions` collection.

### Check in Appwrite Console

1. Open Appwrite Console
2. Go to: **Database** → `ewaste-db` → `push_subscriptions`
3. Should see documents like:

```json
{
  "userId": "user123...",
  "role": "driver",
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "p256dh": "BG6...",
  "auth": "sY...",
  "platform": "web",
  "active": true,
  "lastSeenAt": "2026-03-25T10:30:00.000Z"
}
```

If **no documents**:
- Notifications not enabled in browser
- User didn't grant permission
- Service Worker not active (check step 4)

---

## Step 7: Trigger Test Notification

### Method 1: Via App

1. Login as Citizen
2. Submit e-waste report
3. Check if PMC/Driver received push notification
4. Check Appwrite Function **Executions** for logs

### Method 2: Via Appwrite Console API

1. Go to: **Database** → `ewaste-db` → `reports`
2. Click any report document
3. Click **Edit**
4. Change `status` from `pending-review` to `assigned`
5. Click **Update**
6. Function automatically triggers
7. Check: **Functions** → `push-notifier` → **Executions**
8. Should see successful execution with `"sent": 1` or more

### Method 3: Manual Function Execution (testing)

1. Go to: **Functions** → `push-notifier`
2. Click **Execute Now**
3. Function executes (may skip if no matching events)
4. Check logs for issues

---

## Step 8: Desktop Notification Display

Notifications appear in different ways depending on OS:

### Windows
- Bottom-right corner of screen
- Notification tray (swipe up from taskbar)
- Click notification to focus app

### macOS
- Top-right corner (Notification Center)
- Notification Center sidebar
- Click or interact with notification

### Linux
- System notification tray
- Varies by desktop environment

### Android
- System notification tray (swipe down from top)
- Lock screen (if device locked)
- Notification LED/vibration (if configured)

**Notification includes:**
- **Title**: "New e-waste report" / "Pickup completed" / "Report updated"
- **Body**: Dynamic message with report details
- **Icon**: App icon from manifest
- **Click Action**: Navigates to relevant app page

---

## Troubleshooting

### Problem: Notifications Not Arriving

**Symptom**: Report created but no notification appears

**Diagnostic Checklist:**

1. **Check Function Logs**
   ```
   Appwrite Console → Functions → push-notifier → Executions
   ```
   - Look for most recent execution
   - Check if it shows errors
   - Look for: `"failed": N` or error messages

2. **Verify VAPID Keys**
   - Log in to Appwrite Console
   - Re-check function environment variables
   - Keys must be exact (no typos, whitespace)
   - Try regenerating keys if in doubt

3. **Check Push Subscription**
   - Verify `push_subscriptions` collection has entries
   - Check `active: true`
   - Verify `role` matches who should receive notification

4. **Service Worker Status**
   - DevTools → Application → Service Workers
   - Must show ✅ "active and running"
   - Not red ❌ or yellow ⚠️

5. **Notification Permission**
   - DevTools → Application → Manifest
   - Check notification permission is "Allow"
   - Or: DevTools → Sensors → Emulate... (if testing)

**Common Error Messages:**

```
"Error: Missing VAPID secrets in function environment"
→ Solution: Set all three VAPID env vars in function config
```

```
"status 404 or 410 on endpoint"
→ Solution: User unsubscribed or endpoint invalid
   Clear localStorage and re-enable notifications
```

```
"VAPID keys invalid"
→ Solution: Regenerate keys and update function + .env
```

---

### Problem: Service Worker Not Registering

**Symptom**: DevTools shows no service worker

**Solutions:**

1. **Check HTTPS (Production)**
   - Service Workers require HTTPS in production
   - localhost and 127.0.0.1 are exempt for development

2. **Clear Cache**
   ```
   DevTools → Application → Clear storage → Clear site data
   ```
   Then refresh page

3. **Check Console Errors**
   - F12 → Console tab
   - Look for red errors during page load
   - May indicate registration failure

4. **Restart Dev Server**
   ```bash
   npm run dev
   # Ctrl+C to stop, then rerun
   ```

5. **Check manifest.json**
   - DevTools → Application → Manifest
   - Should load without errors
   - Check `"scope": "/"` and `"start_url": "/"`

---

### Problem: Permission Prompt Not Showing

**Symptom**: No "Enable Notifications?" dialog

**Why This Happens:**
- User previously dismissed it (can't be shown again easily)
- Browser blocked it for security
- localStorage key: `ewaste_push_dismissed` prevents showing

**Solution:**

1. **Clear localStorage:**
   ```js
   // In DevTools console:
   localStorage.removeItem('ewaste_push_dismissed')
   location.reload()
   ```

2. **Or access Chrome settings directly:**
   - Chrome: Settings → Privacy → Site Settings → Notifications
   - Find your domain and reset to "Ask"
   - Refresh app

3. **Or test in Incognito:**
   - Ctrl+Shift+N (Chrome)
   - No saved dismissals in private mode
   - Prompt should appear fresh

---

### Problem: Android Notifications Not Showing

**Android-Specific Issues:**

1. **Chrome Not Updated**
   - Play Store → Chrome → Update
   - Must be latest version

2. **Battery Optimization Disabled Notifications**
   - Settings → Battery → Battery Optimizer
   - Remove app from optimization list
   - Allow app to run in background

3. **Notification Settings Disabled**
   - Settings → Apps → Chrome → Notifications → **On**
   - Settings → Apps → Your App → Notifications → **On**

4. **Developer Options / USB Debugging**
   - Settings → About Phone → Build Number (tap 7x)
   - Developer Options → USB Debugging → **On**
   - May help with testing

5. **No Mobile Network/WiFi**
   - Notifications require internet
   - Check WiFi or mobile data is connected

---

## Testing Checklist

- [ ] VAPID keys generated with `npx web-push generate-vapid-keys`
- [ ] Public key added to `.env` as `VITE_PUSH_VAPID_PUBLIC_KEY`
- [ ] Function deployed with all three VAPID env vars set
- [ ] Function triggers added for `.create` and `.update` events
- [ ] Service Worker shows "active and running" in DevTools
- [ ] Notification permission granted when prompted
- [ ] `push_subscriptions` collection shows active subscriptions
- [ ] Report creation triggers function execution (check logs)
- [ ] Notification appears in browser/system tray
- [ ] Clicking notification navigates to correct page
- [ ] Desktop browser receives notifications
- [ ] Android mobile receives notifications (checked in background)

---

## Example Complete Workflow

### Setup (One-time)
```bash
# 1. Generate keys
npx web-push generate-vapid-keys

# 2. Update .env with public key
echo "VITE_PUSH_VAPID_PUBLIC_KEY=YOUR_PUBLIC_KEY" >> .env

# 3. Create/configure Appwrite Function
# (Manual in Appwrite Console or via API)

# 4. Deploy function with VAPID env vars
```

### Test Flow
```
1. Start app: npm run dev
2. Login as Citizen
3. Enable notifications → "Allow" permission prompt
4. Submit e-waste report
5. Check: Push notification sent to PMC & Driver
6. Login as PMC (new browser or logout)
7. Enable notifications
8. Verify report in pending list
9. Verify report → save
10. Check: Push sent to Driver
11. Login as Driver
12. Enable notifications
13. See verified report
14. Mark collected
15. Check: Push sent to Citizen & PMC
```

---

**Last Updated**: March 2026
**Framework**: Appwrite 15.0, Web Push API, Service Workers
**Status**: ✅ Production Ready
