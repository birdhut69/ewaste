import { toast } from 'sonner'
import type { Report } from './types'

const NOTIF_DISMISS_KEY = 'ewaste_notifications_dismissed'
const NOTIF_DEDUPE_PREFIX = 'ewaste_notif_seen:'
const DEDUPE_TTL_MS = 6 * 60 * 60 * 1000

export interface ReportChange {
  type: 'created' | 'status-changed'
  report: Report
  previousStatus?: Report['status']
}

function supportsNotifications(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!supportsNotifications()) return 'unsupported'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!supportsNotifications()) return 'unsupported'

  try {
    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      localStorage.removeItem(NOTIF_DISMISS_KEY)
    }
    return permission
  } catch {
    return Notification.permission
  }
}

export function isNotificationMuted(): boolean {
  return localStorage.getItem(NOTIF_DISMISS_KEY) === '1'
}

export function muteNotifications(): void {
  localStorage.setItem(NOTIF_DISMISS_KEY, '1')
}

function shouldSkipDedupe(dedupeKey?: string): boolean {
  if (!dedupeKey) return false
  const key = `${NOTIF_DEDUPE_PREFIX}${dedupeKey}`
  const raw = sessionStorage.getItem(key)
  if (!raw) return false

  const previous = Number(raw)
  if (!Number.isFinite(previous)) return false

  return Date.now() - previous < DEDUPE_TTL_MS
}

function markDedupe(dedupeKey?: string): void {
  if (!dedupeKey) return
  const key = `${NOTIF_DEDUPE_PREFIX}${dedupeKey}`
  sessionStorage.setItem(key, String(Date.now()))
}

async function showSystemNotification(title: string, body: string, tag?: string): Promise<void> {
  if (!supportsNotifications() || Notification.permission !== 'granted') return

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready
      if (typeof registration.showNotification === 'function') {
        await registration.showNotification(title, {
          body,
          tag,
          badge: '/icons/pwa-192x192.png',
          icon: '/icons/pwa-192x192.png'
        })
        return
      }
    }
  } catch {
    // Fall back to plain Notification API below.
  }

  new Notification(title, {
    body,
    tag,
    icon: '/icons/pwa-192x192.png'
  })
}

export async function notifyUser(input: {
  title: string
  body: string
  dedupeKey?: string
  tag?: string
  toastOnly?: boolean
}): Promise<void> {
  if (isNotificationMuted()) return
  if (shouldSkipDedupe(input.dedupeKey)) return

  markDedupe(input.dedupeKey)

  toast.info(`${input.title}: ${input.body}`)

  if (!input.toastOnly) {
    await showSystemNotification(input.title, input.body, input.tag)
  }
}

export function detectReportChanges(previousReports: Report[], nextReports: Report[]): ReportChange[] {
  const changes: ReportChange[] = []
  const previousMap = new Map(previousReports.map((report) => [report.$id, report]))

  for (const report of nextReports) {
    const previous = previousMap.get(report.$id)

    if (!previous) {
      changes.push({ type: 'created', report })
      continue
    }

    if (previous.status !== report.status) {
      changes.push({
        type: 'status-changed',
        previousStatus: previous.status,
        report
      })
    }
  }

  return changes
}
