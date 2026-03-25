import { getLocalSession, upsertPushSubscription } from './appwrite'
import { requestNotificationPermission } from './notifications'
import type { UserRole } from './types'

const PUSH_STORAGE_KEY = 'ewaste_push_endpoint'

function toBase64Url(input: string): ArrayBuffer {
  const padding = '='.repeat((4 - (input.length % 4)) % 4)
  const normalized = (input + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const buffer = new ArrayBuffer(raw.length)
  const output = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }
  return buffer
}

function resolveVapidPublicKey(): string | null {
  const env = import.meta.env as Record<string, string | undefined>
  return env.VITE_PUSH_VAPID_PUBLIC_KEY || null
}

export async function ensurePushSubscription(roleOverride?: UserRole): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  const vapidPublicKey = resolveVapidPublicKey()
  if (!vapidPublicKey) return

  const permission = await requestNotificationPermission()
  if (permission !== 'granted') return

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()

  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toBase64Url(vapidPublicKey)
    }))

  const { role } = getLocalSession()
  const roleToUse = roleOverride || role
  if (!roleToUse) return

  const serialized = subscription.toJSON()
  const keys = serialized.keys || {}

  if (!serialized.endpoint || !keys.p256dh || !keys.auth) return

  const previousEndpoint = localStorage.getItem(PUSH_STORAGE_KEY)
  if (previousEndpoint === serialized.endpoint) return

  await upsertPushSubscription({
    role: roleToUse,
    endpoint: serialized.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent: navigator.userAgent,
    platform: navigator.platform || 'web'
  })

  localStorage.setItem(PUSH_STORAGE_KEY, serialized.endpoint)
}
