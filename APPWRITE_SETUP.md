## Appwrite Configuration Guide

To fully activate the backend, please perform the following setup in your Appwrite Console.

### 1. Create Project
- **Name:** Pune E-Waste
- **ID:** `pune-ewaste` (or update `.env` with your ID)

### 2. Create Database
- **Name:** E-Waste DB
- **ID:** `ewaste-db`

### 3. Create Collections
Create the following collections inside `ewaste-db`:

#### **Collection: Reports** (`reports`)
| Attribute Key | Type | Size | Required | Array |
|---|---|---|---|---|
| `citizenId` | String | 36 | Yes | No |
| `latitude` | Float | - | Yes | No |
| `longitude` | Float | - | Yes | No |
| `category` | String | 32 | Yes | No |
| `status` | String | 16 | Yes | No |
| `notes` | String | 1000 | No | No |
| `photoFileId` | String | 36 | No | No |
| `assignedDriverId` | String | 36 | No | No |
| `collectedAt` | Datetime | - | No | No |
| `detectedObjectName` | String | 128 | No | No |
| `detectedCategory` | String | 32 | No | No |
| `confidenceScore` | Integer | - | No | No |
| `aiModelVersion` | String | 64 | No | No |
| `verificationStatus` | String | 24 | No | No |
| `verifiedBy` | String | 128 | No | No |
| `verifiedAt` | Datetime | - | No | No |
| `verificationNotes` | String | 512 | No | No |

**Indexes:**
- `status_idx`: Key: `status`, Type: Key, Order: ASC
- `citizen_idx`: Key: `citizenId`, Type: Key, Order: ASC
- `driver_idx`: Key: `assignedDriverId`, Type: Key, Order: ASC
- `created_idx`: Key: `$createdAt`, Type: Key, Order: DESC
- `verification_idx`: Key: `verificationStatus`, Type: Key, Order: ASC

**Permissions:**
- Role: `any` -> Read, Create
- Role: `users` -> Read, Create, Update

---

### 4. Create Storage Bucket
- **Name:** E-Waste Photos
- **ID:** `photos`
- **Permissions:** 
  - Role: `any` -> Read
  - Role: `users` -> Create

### 5. Environment Variables
Create a `.env` file in the root directory:

```env
VITE_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=pune-ewaste
VITE_APPWRITE_DB_ID=ewaste-db
VITE_APPWRITE_BUCKET_PHOTOS=photos
```

Once configured, the app will automatically switch from "Demo Mode" to "Production Mode".

---

## Background Push Notifications (Fully Free)

This app now supports true background push via Web Push + Appwrite Functions.
No paid provider is required.

### 1. Add Push Collection

Run setup script again (safe and idempotent):

```bash
APPWRITE_API_KEY=YOUR_KEY VITE_APPWRITE_PROJECT_ID=YOUR_PROJECT_ID node scripts/setup-appwrite.js
```

It creates a `push_subscriptions` collection with attributes/indexes used by mobile devices.

### 2. Generate VAPID Keys (Free Web Push)

```bash
npx web-push generate-vapid-keys
```

Copy output values:
- Public Key -> app `.env` as `VITE_PUSH_VAPID_PUBLIC_KEY`
- Private Key -> Appwrite Function env as `PUSH_VAPID_PRIVATE_KEY`
- Subject -> Appwrite Function env as `PUSH_VAPID_SUBJECT` (example: `mailto:admin@example.com`)

Add to your app `.env`:

```env
VITE_PUSH_VAPID_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY
```

### 3. Deploy Function `push-notifier`

Create function in Appwrite Console:
- Runtime: Node.js 20+
- Entry point: `src/index.js`
- Source folder: `functions/push-notifier`

Function env vars:

```env
APPWRITE_API_KEY=YOUR_SERVER_API_KEY
APPWRITE_DB_ID=ewaste-db
APPWRITE_REPORTS_COLLECTION_ID=reports
APPWRITE_PUSH_COLLECTION_ID=push_subscriptions
PUSH_VAPID_SUBJECT=mailto:admin@example.com
PUSH_VAPID_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY
PUSH_VAPID_PRIVATE_KEY=YOUR_VAPID_PRIVATE_KEY
```

Function permissions/scopes for API key:
- `databases.read`
- `databases.write`

### 4. Add Function Event Triggers

In function triggers add:

- `databases.ewaste-db.collections.reports.documents.*.create`
- `databases.ewaste-db.collections.reports.documents.*.update`

### 5. Mobile Browser Requirements

- Use HTTPS in production (required for Push API and Service Worker).
- User must tap "Enable Notifications" once.
- On iOS, app should be installed to home screen for best push reliability.

### Notification Routing Implemented

- New report created: Driver + PMC notified.
- Report collected: Citizen + PMC notified.
- Other status updates: PMC notified.