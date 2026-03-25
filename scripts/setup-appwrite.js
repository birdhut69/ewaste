import { Client, Databases, Storage, Teams, ID, Permission, Role } from 'node-appwrite'
import 'dotenv/config'

// Get credentials from environment variables
const ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1'
const PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID
const API_KEY = process.env.APPWRITE_API_KEY
const DB_ID = process.env.VITE_APPWRITE_DB_ID || 'ewaste-db'
const BUCKET_ID = process.env.VITE_APPWRITE_BUCKET_PHOTOS || 'photos'

// Team IDs used for access control (must match app/client-side constants)
const TEAM_DRIVER_ID = process.env.VITE_APPWRITE_TEAM_ID_DRIVER || 'ewaste-driver'
const TEAM_PMC_ID = process.env.VITE_APPWRITE_TEAM_ID_PMC || 'ewaste-pmc'

const TEAM_DRIVER_ROLE = 'driver'
const TEAM_PMC_ROLE = 'pmc'

if (!PROJECT_ID || !API_KEY) {
  console.error('\x1b[31mError: Missing VITE_APPWRITE_PROJECT_ID or APPWRITE_API_KEY environment variables.\x1b[0m')
  console.log('Usage: APPWRITE_API_KEY=YOUR_KEY VITE_APPWRITE_PROJECT_ID=YOUR_PROJECT_ID node scripts/setup-appwrite.js')
  process.exit(1)
}

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY)

const databases = new Databases(client)
const storage = new Storage(client)
const teams = new Teams(client)

async function setup() {
  console.log('\x1b[36mStarting Appwrite Setup...\x1b[0m')

  // 1. Create Database
  try {
    await databases.get(DB_ID)
    console.log(`✓ Database '${DB_ID}' already exists.`)
  } catch {
    console.log(`Creating database '${DB_ID}'...`)
    await databases.create(DB_ID, 'E-Waste DB')
    console.log(`✓ Created database '${DB_ID}'.`)
  }

  // 2. Create Reports Collection
  const REPORTS_COLL = 'reports'
  const PUSH_COLL = 'push_subscriptions'
  try {
    await databases.getCollection(DB_ID, REPORTS_COLL)
    console.log(`✓ Collection '${REPORTS_COLL}' already exists.`)
  } catch {
    console.log(`Creating collection '${REPORTS_COLL}'...`)
    await databases.createCollection(
      DB_ID, 
      REPORTS_COLL, 
      'Reports', 
      [
        // Collection-level access is restricted to PMC/Driver teams.
        // Citizens get access to their own documents via per-document permissions set on createDocument().
        Permission.read(Role.team(TEAM_PMC_ID, TEAM_PMC_ROLE)),
        Permission.read(Role.team(TEAM_DRIVER_ID, TEAM_DRIVER_ROLE)),

        // Only authenticated users can create reports.
        Permission.create(Role.users()),

        // Only drivers/PMC can update report status.
        Permission.update(Role.team(TEAM_PMC_ID, TEAM_PMC_ROLE)),
        Permission.update(Role.team(TEAM_DRIVER_ID, TEAM_DRIVER_ROLE)),

        // Only PMC can delete reports.
        Permission.delete(Role.team(TEAM_PMC_ID, TEAM_PMC_ROLE))
      ]
    )
    console.log(`✓ Created collection '${REPORTS_COLL}'.`)
  }

  // 2b. Create Push Subscriptions Collection
  try {
    await databases.getCollection(DB_ID, PUSH_COLL)
    console.log(`✓ Collection '${PUSH_COLL}' already exists.`)
  } catch {
    console.log(`Creating collection '${PUSH_COLL}'...`)
    await databases.createCollection(
      DB_ID,
      PUSH_COLL,
      'Push Subscriptions',
      [
        Permission.read(Role.users()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users())
      ]
    )
    console.log(`✓ Created collection '${PUSH_COLL}'.`)
  }

  // 3. Create Access Control Teams
  // Note: If teams already exist, we don't alter their role definitions (Appwrite allows only owner changes).
  async function ensureTeam(teamId, teamName, roles) {
    try {
      await teams.get(teamId)
      console.log(`✓ Team '${teamId}' already exists.`)
    } catch {
      console.log(`Creating team '${teamId}'...`)
      await teams.create({ teamId, name: teamName, roles })
      console.log(`✓ Created team '${teamId}'.`)
    }
  }

  await ensureTeam(TEAM_DRIVER_ID, 'E-Waste Drivers', [TEAM_DRIVER_ROLE])
  await ensureTeam(TEAM_PMC_ID, 'E-Waste PMC', [TEAM_PMC_ROLE])

  // 4. Create Attributes for Reports
  const attributes = [
    { key: 'citizenId', type: 'string', size: 36, required: true },
    { key: 'latitude', type: 'double', required: true },
    { key: 'longitude', type: 'double', required: true },
    { key: 'category', type: 'string', size: 32, required: true },
    { key: 'status', type: 'string', size: 16, required: true },
    { key: 'notes', type: 'string', size: 1000, required: false },
    { key: 'photoFileId', type: 'string', size: 36, required: false },
    { key: 'assignedDriverId', type: 'string', size: 36, required: false },
    { key: 'collectedAt', type: 'datetime', required: false },
    { key: 'detectedObjectName', type: 'string', size: 128, required: false },
    { key: 'detectedCategory', type: 'string', size: 32, required: false },
    { key: 'confidenceScore', type: 'integer', required: false },
    { key: 'aiModelVersion', type: 'string', size: 64, required: false },
    { key: 'verificationStatus', type: 'string', size: 24, required: false },
    { key: 'verifiedBy', type: 'string', size: 128, required: false },
    { key: 'verifiedAt', type: 'datetime', required: false },
    { key: 'verificationNotes', type: 'string', size: 512, required: false }
  ]

  for (const attr of attributes) {
    try {
      if (attr.type === 'string') {
        await databases.createStringAttribute(DB_ID, REPORTS_COLL, attr.key, attr.size, attr.required)
      } else if (attr.type === 'double') {
        await databases.createFloatAttribute(DB_ID, REPORTS_COLL, attr.key, attr.required)
      } else if (attr.type === 'integer') {
        await databases.createIntegerAttribute(DB_ID, REPORTS_COLL, attr.key, attr.required)
      } else if (attr.type === 'datetime') {
        await databases.createDatetimeAttribute(DB_ID, REPORTS_COLL, attr.key, attr.required)
      }
      console.log(`✓ Created attribute '${attr.key}'`)
    } catch (error) {
      // Attribute might already exist
      if (error.code === 409) {
        console.log(`✓ Attribute '${attr.key}' already exists.`)
      } else {
        console.error(`✗ Failed to create attribute '${attr.key}':`, error.message)
      }
    }
    // Wait slightly between requests to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  // 5. Create Indexes
  const indexes = [
    { key: 'status_idx', type: 'key', attributes: ['status'] },
    { key: 'citizen_idx', type: 'key', attributes: ['citizenId'] },
    { key: 'driver_idx', type: 'key', attributes: ['assignedDriverId'] },
    { key: 'verification_idx', type: 'key', attributes: ['verificationStatus'] },
    { key: 'created_idx', type: 'key', attributes: ['$createdAt'], order: 'DESC' }
  ]
  
  for (const idx of indexes) {
    try {
      await databases.createIndex(DB_ID, REPORTS_COLL, idx.key, idx.type, idx.attributes, [idx.order || 'ASC'])
      console.log(`✓ Created index '${idx.key}'`)
    } catch (error) {
       if (error.code === 409) {
        console.log(`✓ Index '${idx.key}' already exists.`)
      } else {
        console.error(`✗ Failed to create index '${idx.key}':`, error.message)
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  // 5b. Create Attributes for Push Subscriptions
  const pushAttributes = [
    { key: 'userId', type: 'string', size: 36, required: true },
    { key: 'role', type: 'string', size: 16, required: true },
    { key: 'endpoint', type: 'string', size: 2048, required: true },
    { key: 'p256dh', type: 'string', size: 255, required: true },
    { key: 'auth', type: 'string', size: 255, required: true },
    { key: 'userAgent', type: 'string', size: 512, required: false },
    { key: 'platform', type: 'string', size: 64, required: false },
    { key: 'active', type: 'boolean', required: true },
    { key: 'lastSeenAt', type: 'datetime', required: false },
    { key: 'lastError', type: 'string', size: 512, required: false }
  ]

  for (const attr of pushAttributes) {
    try {
      if (attr.type === 'string') {
        await databases.createStringAttribute(DB_ID, PUSH_COLL, attr.key, attr.size, attr.required)
      } else if (attr.type === 'boolean') {
        await databases.createBooleanAttribute(DB_ID, PUSH_COLL, attr.key, attr.required, false)
      } else if (attr.type === 'datetime') {
        await databases.createDatetimeAttribute(DB_ID, PUSH_COLL, attr.key, attr.required)
      }
      console.log(`✓ Created push attribute '${attr.key}'`)
    } catch (error) {
      if (error.code === 409) {
        console.log(`✓ Push attribute '${attr.key}' already exists.`)
      } else {
        console.error(`✗ Failed to create push attribute '${attr.key}':`, error.message)
      }
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  const pushIndexes = [
    { key: 'push_user_idx', type: 'key', attributes: ['userId'] },
    { key: 'push_role_idx', type: 'key', attributes: ['role'] },
    { key: 'push_active_idx', type: 'key', attributes: ['active'] }
  ]

  for (const idx of pushIndexes) {
    try {
      await databases.createIndex(DB_ID, PUSH_COLL, idx.key, idx.type, idx.attributes, ['ASC'])
      console.log(`✓ Created push index '${idx.key}'`)
    } catch (error) {
      if (error.code === 409) {
        console.log(`✓ Push index '${idx.key}' already exists.`)
      } else {
        console.error(`✗ Failed to create push index '${idx.key}':`, error.message)
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  // 6. Create Storage Bucket
  try {
    try {
      await storage.getBucket(BUCKET_ID)
      console.log(`✓ Bucket '${BUCKET_ID}' already exists.`)
    } catch {
      console.log(`Creating bucket '${BUCKET_ID}'...`)
      await storage.createBucket(
        BUCKET_ID,
        'E-Waste Photos',
        [
          // Keep bucket read restricted to operator teams.
          // Citizen-owned photos are still readable via per-file permissions set on upload.
          Permission.read(Role.team(TEAM_PMC_ID, TEAM_PMC_ROLE)),
          Permission.read(Role.team(TEAM_DRIVER_ID, TEAM_DRIVER_ROLE)),

          // Citizens (and operators) can upload.
          Permission.create(Role.users()),

          // Only PMC can update/delete (optional hardening).
          Permission.update(Role.team(TEAM_PMC_ID, TEAM_PMC_ROLE)),
          Permission.delete(Role.team(TEAM_PMC_ID, TEAM_PMC_ROLE))
        ],
        false,
        true,
        undefined,
        ['jpg', 'jpeg', 'png', 'webp']
      )
      console.log(`✓ Created bucket '${BUCKET_ID}'.`)
    }
  } catch (error) {
    console.error(`✗ Failed to create bucket:`, error.message)
    try {
      console.log('Listing existing buckets...')
      const buckets = await storage.listBuckets()
      console.log('Existing buckets:', JSON.stringify(buckets.buckets.map(b => ({ id: b.$id, name: b.name })), null, 2))
    } catch (listError) {
      console.error('Failed to list buckets:', listError.message)
    }
  }

  console.log('\n\x1b[32mAppwrite Setup Complete! 🚀\x1b[0m')
  console.log('You can now run the app with real backend integration.')
}

setup().catch(console.error)