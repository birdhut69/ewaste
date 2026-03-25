#!/usr/bin/env node

/**
 * Test User Creation Script
 * Creates test users for all three roles: Citizen, PMC, Driver
 * 
 * Usage:
 *   APPWRITE_API_KEY=your_key node scripts/create-test-users.js
 * 
 * This script creates test accounts that can be used for E2E testing
 */

import { Client, Account, Teams, ID, Databases, Query } from 'node-appwrite'
import 'dotenv/config'

const ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1'
const PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID
const API_KEY = process.env.APPWRITE_API_KEY
const TEAM_DRIVER_ID = process.env.VITE_APPWRITE_TEAM_ID_DRIVER || 'ewaste-driver'
const TEAM_PMC_ID = process.env.VITE_APPWRITE_TEAM_ID_PMC || 'ewaste-pmc'
const DB_ID = process.env.VITE_APPWRITE_DB_ID || 'ewaste-db'

if (!PROJECT_ID || !API_KEY) {
  console.error('❌ Missing VITE_APPWRITE_PROJECT_ID or APPWRITE_API_KEY')
  console.log('Usage: APPWRITE_API_KEY=YOUR_KEY node scripts/create-test-users.js')
  process.exit(1)
}

const adminClient = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY)

const adminAccount = new Account(adminClient)
const adminTeams = new Teams(adminClient)
const adminDatabases = new Databases(adminClient)

/**
 * Test user definitions
 */
const TEST_USERS = [
  {
    type: 'citizen',
    email: 'citizen@test.com',
    password: 'Test123!@',
    name: 'Test Citizen',
    team: null
  },
  {
    type: 'pmc',
    email: 'pmc@test.com',
    password: 'Test123!@',
    name: 'Test PMC Officer',
    team: TEAM_PMC_ID
  },
  {
    type: 'driver',
    email: 'driver@test.com',
    password: 'Test123!@',
    name: 'Test Driver',
    team: TEAM_DRIVER_ID
  }
]

/**
 * Create or get user
 */
async function createOrGetUser(email, password, name, role) {
  try {
    // Try to create user
    const user = await adminAccount.create(ID.unique(), email, password, name)
    console.log(`✅ Created user: ${email} (${role})`)
    return user.$id
  } catch (error) {
    const msg = error?.message?.toLowerCase() || ''
    if (msg.includes('already exists') || msg.includes('already registered')) {
      console.log(`⚠️  User already exists: ${email}`)
      // Try to get user via search - Actually we can't search users directly
      // Just return placeholder - real lookup would require listing and filtering
      return null
    }
    throw error
  }
}

/**
 * Add user to team
 */
async function addUserToTeam(userId, teamId, role) {
  try {
    await adminTeams.createMembership(teamId, ['user:' + userId], role)
    console.log(`✅ Added user to team: ${teamId} as ${role}`)
  } catch (error) {
    const msg = error?.message?.toLowerCase() || ''
    if (msg.includes('already exists') || msg.includes('already a member')) {
      console.log(`⚠️  User already in team: ${teamId}`)
      return
    }
    throw error
  }
}

/**
 * Create test report for demo purposes
 */
async function createTestReport(citizenId) {
  try {
    const report = await adminDatabases.createDocument(
      DB_ID,
      'reports',
      ID.unique(),
      {
        citizenId,
        latitude: 18.5204,
        longitude: 73.8567,
        category: 'Computer Monitor',
        status: 'pending-review',
        notes: 'Test report created for E2E testing',
        detectedCategory: 'Electronics',
        confidenceScore: 95
      },
      [
        'read("user:' + citizenId + '")',
        'update("user:' + citizenId + '")',
        'delete("user:' + citizenId + '")',
        'read("users")',
        'update("users")'
      ]
    )
    console.log(`✅ Created test report: ${report.$id}`)
    return report
  } catch (error) {
    console.error(`⚠️  Could not create test report:`, error?.message)
  }
}

/**
 * Main setup function
 */
async function setup() {
  console.log('\n🚀 Creating Test Users for E-Waste App\n')
  console.log(`Endpoint: ${ENDPOINT}`)
  console.log(`Project: ${PROJECT_ID}\n`)

  const createdUserIds = {}

  for (const testUser of TEST_USERS) {
    try {
      console.log(`\n📱 Setting up ${testUser.type.toUpperCase()} user...`)

      // Create user account
      const userId = await createOrGetUser(testUser.email, testUser.password, testUser.name, testUser.type)

      if (userId) {
        createdUserIds[testUser.type] = userId

        // Add to team if applicable (PMC/Driver)
        if (testUser.team) {
          await addUserToTeam(userId, testUser.team, testUser.type)
        }

        // For citizen, optionally create a test report
        if (testUser.type === 'citizen' && userId) {
          console.log(`Creating demo report...`)
          await createTestReport(userId)
        }
      }
    } catch (error) {
      console.error(`❌ Failed to setup ${testUser.type}:`, error?.message)
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  console.log('\n════════════════════════════════════════════════════════')
  console.log('✅ Test Users Setup Complete!\n')

  console.log('📧 Test Credentials:\n')
  console.log('CITIZEN:')
  console.log('  Email: citizen@test.com')
  console.log('  Password: Test123!@\n')

  console.log('PMC:')
  console.log('  Email: pmc@test.com')
  console.log('  Password: Test123!@\n')

  console.log('DRIVER:')
  console.log('  Email: driver@test.com')
  console.log('  Password: Test123!@\n')

  console.log('════════════════════════════════════════════════════════')
  console.log('\n🎯 Next Steps:')
  console.log('1. Start the dev server: npm run dev')
  console.log('2. Open http://localhost:5173')
  console.log('3. Login with one of the test accounts above')
  console.log('4. Enable push notifications when prompted')
  console.log('5. Follow TESTING_GUIDE.md for full test scenarios\n')
}

setup().catch(console.error)
