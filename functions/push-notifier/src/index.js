import { Client, Databases, Query } from 'node-appwrite'
import webPush from 'web-push'

const DB_ID = process.env.APPWRITE_DB_ID || process.env.VITE_APPWRITE_DB_ID || 'ewaste-db'
const REPORTS_COLLECTION_ID = process.env.APPWRITE_REPORTS_COLLECTION_ID || 'reports'
const PUSH_COLLECTION_ID = process.env.APPWRITE_PUSH_COLLECTION_ID || 'push_subscriptions'

const VAPID_SUBJECT = process.env.PUSH_VAPID_SUBJECT
const VAPID_PUBLIC = process.env.PUSH_VAPID_PUBLIC_KEY
const VAPID_PRIVATE = process.env.PUSH_VAPID_PRIVATE_KEY

if (VAPID_SUBJECT && VAPID_PUBLIC && VAPID_PRIVATE) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
}

const client = new Client()
  .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
  .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY)

const databases = new Databases(client)

function parseData() {
  const raw =
    process.env.APPWRITE_FUNCTION_EVENT_DATA ||
    process.env.APPWRITE_FUNCTION_DATA ||
    process.env.APPWRITE_FUNCTION_PAYLOAD ||
    '{}'

  if (!raw) return {}

  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function getEventName() {
  return process.env.APPWRITE_FUNCTION_EVENT || ''
}

function roleTargetsForEvent(eventName, report) {
  if (eventName.includes('.create')) {
    return {
      roles: ['driver', 'pmc'],
      title: 'New e-waste report',
      body: `${report.category || 'Item'} is waiting for pickup.`,
      url: '/driver'
    }
  }

  if (eventName.includes('.update') && report.status === 'collected') {
    return {
      roles: ['citizen', 'pmc'],
      title: 'Pickup completed',
      body: `${report.category || 'Item'} was marked as collected.`,
      url: report.citizenId ? '/citizen' : '/'
    }
  }

  if (eventName.includes('.update') && report.status) {
    return {
      roles: ['pmc'],
      title: 'Report status updated',
      body: `${report.category || 'Item'} is now ${String(report.status)}.`,
      url: '/pmc'
    }
  }

  return null
}

async function listSubscriptionsByRoles(roles) {
  if (!roles.length) return []

  const response = await databases.listDocuments(DB_ID, PUSH_COLLECTION_ID, [
    Query.equal('active', true),
    Query.equal('role', roles),
    Query.limit(500)
  ])

  return response.documents
}

async function deactivateSubscription(documentId) {
  try {
    await databases.updateDocument(DB_ID, PUSH_COLLECTION_ID, documentId, {
      active: false,
      lastError: 'Unsubscribed or invalid endpoint'
    })
  } catch (error) {
    console.error('Failed to deactivate subscription', documentId, error?.message || error)
  }
}

async function sendPush(subscriptionDoc, payload) {
  const subscription = {
    endpoint: subscriptionDoc.endpoint,
    keys: {
      p256dh: subscriptionDoc.p256dh,
      auth: subscriptionDoc.auth
    }
  }

  try {
    await webPush.sendNotification(subscription, JSON.stringify(payload))
    return { ok: true }
  } catch (error) {
    const status = error?.statusCode || error?.status

    if (status === 404 || status === 410) {
      await deactivateSubscription(subscriptionDoc.$id)
    }

    return { ok: false, status, message: error?.message || 'Unknown push error' }
  }
}

export default async ({ res }) => {
  if (!VAPID_SUBJECT || !VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.json({ ok: false, message: 'Missing VAPID secrets in function environment.' }, 500)
  }

  const eventName = getEventName()
  const report = parseData()

  if (!eventName.includes(`databases.${DB_ID}.collections.${REPORTS_COLLECTION_ID}.documents`)) {
    return res.json({ ok: true, skipped: true, reason: 'Unrelated event.' })
  }

  const targetConfig = roleTargetsForEvent(eventName, report)
  if (!targetConfig) {
    return res.json({ ok: true, skipped: true, reason: 'No target roles for event.' })
  }

  const subscriptions = await listSubscriptionsByRoles(targetConfig.roles)
  const targetSubscriptions = subscriptions.filter((doc) => {
    if (targetConfig.roles.includes('citizen') && doc.role === 'citizen' && report.citizenId) {
      return doc.userId === report.citizenId
    }
    return true
  })

  const payload = {
    title: targetConfig.title,
    body: targetConfig.body,
    tag: `report-${report.$id || 'unknown'}`,
    url: targetConfig.url
  }

  let sent = 0
  let failed = 0

  for (const subscriptionDoc of targetSubscriptions) {
    const result = await sendPush(subscriptionDoc, payload)
    if (result.ok) sent += 1
    else failed += 1
  }

  return res.json({
    ok: true,
    event: eventName,
    roles: targetConfig.roles,
    subscriptions: targetSubscriptions.length,
    sent,
    failed
  })
}
