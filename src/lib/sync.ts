// Sync Manager - Handles offline-first sync with retry and backoff
import { getPendingReports, markReportSynced, savePendingReport } from './db'
import { createReport, uploadPhoto, base64ToFile, getCurrentUserId, getStoredSession } from './appwrite'
import { isOnline } from './utils'
import type { LocalReport, SyncStatus } from './types'
import { CreateReportSchema } from './validation'

// Sync configuration
const MAX_RETRY_ATTEMPTS = 5
const BASE_BACKOFF_MS = 1000 // 1 second
const MAX_BACKOFF_MS = 60000 // 1 minute

type SyncEventType = 'sync-start' | 'sync-complete' | 'sync-error' | 'report-synced' | 'report-failed'

interface SyncEvent {
  type: SyncEventType
  data?: unknown
}

type SyncListener = (event: SyncEvent) => void

class SyncManager {
  private listeners: Set<SyncListener> = new Set()
  private isSyncing = false
  private syncInterval: ReturnType<typeof setInterval> | null = null
  private isInitialized = false
  private handleOnlineBound = () => this.onOnline()
  private handleOfflineBound = () => this.onOffline()

  // Initialize the sync manager
  init(): void {
    if (this.isInitialized) return
    this.isInitialized = true

    // Listen for online status changes
    window.addEventListener('online', this.handleOnlineBound)
    window.addEventListener('offline', this.handleOfflineBound)

    // Start periodic sync check (every 30 seconds)
    this.syncInterval = setInterval(() => {
      if (isOnline() && !this.isSyncing) {
        this.sync()
      }
    }, 30000)

    // Initial sync attempt
    if (isOnline()) {
      setTimeout(() => this.sync(), 2000) // Small delay on app start
    }
  }

  // Clean up resources
  destroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
    window.removeEventListener('online', this.handleOnlineBound)
    window.removeEventListener('offline', this.handleOfflineBound)
    this.isInitialized = false
  }

  // Subscribe to sync events
  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // Emit event to all listeners
  private emit(event: SyncEvent): void {
    this.listeners.forEach(listener => listener(event))
  }

  // Called when device comes online
  private onOnline(): void {
    console.log('[Sync] Device online - starting sync')
    this.sync()
  }

  // Called when device goes offline
  private onOffline(): void {
    console.log('[Sync] Device offline - sync paused')
  }

  // Calculate exponential backoff with jitter
  private getBackoffTime(attempt: number): number {
    const exponentialBackoff = Math.min(
      BASE_BACKOFF_MS * Math.pow(2, attempt),
      MAX_BACKOFF_MS
    )
    // Add jitter (0-25% of backoff time)
    const jitter = exponentialBackoff * Math.random() * 0.25
    return exponentialBackoff + jitter
  }

  // Main sync function
  async sync(): Promise<void> {
    if (this.isSyncing || !isOnline()) {
      return
    }

    const session = getStoredSession()
    if (!session?.userId) {
      return
    }

    this.isSyncing = true
    this.emit({ type: 'sync-start' })

    try {
      const pendingReports = await getPendingReports()

      if (pendingReports.length === 0) {
        this.emit({ type: 'sync-complete', data: { synced: 0 } })
        return
      }

      console.log(`[Sync] Processing ${pendingReports.length} pending reports`)

      let successCount = 0
      let failCount = 0

      for (const report of pendingReports) {
        // Skip if max attempts reached
        if (report.syncAttempts >= MAX_RETRY_ATTEMPTS) {
          const syncError = report.syncError?.toLowerCase() || ''
          const authOrPermissionFailure =
            syncError.includes('session expired') ||
            syncError.includes('not authenticated') ||
            syncError.includes('invalid permissions') ||
            syncError.includes('permission') ||
            syncError.includes('unknown attribute')

          // Allow auto-recovery when auth/permission issues are fixed later.
          if (authOrPermissionFailure) {
            await savePendingReport({
              ...report,
              syncAttempts: 0,
              syncStatus: 'pending',
              syncError: undefined,
              lastSyncAttempt: undefined
            })
            console.log(`[Sync] Reset attempts for report ${report.id} after auth/permission recovery`) 
            continue
          }

          await savePendingReport({
            ...report,
            syncStatus: 'failed',
            syncError: report.syncError || 'Max sync attempts reached'
          })

          console.log(`[Sync] Report ${report.id} exceeded max attempts, skipping`)
          failCount++
          continue
        }

        // Check backoff time
        if (report.lastSyncAttempt) {
          const timeSinceLastAttempt = Date.now() - new Date(report.lastSyncAttempt).getTime()
          const requiredBackoff = this.getBackoffTime(report.syncAttempts)
          if (timeSinceLastAttempt < requiredBackoff) {
            console.log(`[Sync] Report ${report.id} in backoff, skipping`)
            continue
          }
        }

        const success = await this.syncReport(report)
        if (success) {
          successCount++
        } else {
          failCount++
        }
      }

      this.emit({
        type: 'sync-complete',
        data: { synced: successCount, failed: failCount, total: pendingReports.length }
      })
    } catch (error) {
      console.error('[Sync] Sync error:', error)
      this.emit({ type: 'sync-error', data: { error } })
    } finally {
      this.isSyncing = false
    }
  }

  // Sync a single report
  private async syncReport(report: LocalReport): Promise<boolean> {
    // Update sync status
    const updatedReport: LocalReport = {
      ...report,
      syncStatus: 'syncing' as SyncStatus,
      syncAttempts: report.syncAttempts + 1,
      lastSyncAttempt: new Date().toISOString()
    }
    await savePendingReport(updatedReport)

    try {
      const currentUserId = getCurrentUserId()
      if (currentUserId !== report.citizenId) {
        const failedReport: LocalReport = {
          ...updatedReport,
          syncStatus: 'failed',
          syncError: 'Report belongs to a different account. Please re-submit under current user.'
        }
        await savePendingReport(failedReport)
        this.emit({
          type: 'report-failed',
          data: {
            reportId: report.id,
            error: failedReport.syncError,
            attempts: updatedReport.syncAttempts
          }
        })
        return false
      }

      const validation = CreateReportSchema.safeParse({
        citizenId: report.citizenId,
        latitude: report.latitude,
        longitude: report.longitude,
        category: report.category,
        notes: report.notes,
        detectedObjectName: report.detectedObjectName,
        detectedCategory: report.detectedCategory,
        confidenceScore: report.confidenceScore,
        aiModelVersion: report.aiModelVersion,
        userOverrideCategory: report.userOverrideCategory
      })

      if (!validation.success) {
        const failedReport: LocalReport = {
          ...updatedReport,
          syncStatus: 'failed',
          syncError: validation.error.issues[0]?.message || 'Invalid report payload'
        }
        await savePendingReport(failedReport)

        this.emit({
          type: 'report-failed',
          data: {
            reportId: report.id,
            error: failedReport.syncError,
            attempts: updatedReport.syncAttempts
          }
        })
        return false
      }

      // Upload photo if exists
      let photoFileId: string | undefined
      if (report.photoBase64) {
        const file = base64ToFile(report.photoBase64, `report-${report.id}.jpg`)
        photoFileId = await uploadPhoto(file, report.citizenId)
      }

      // Create report in backend
      await createReport({
        citizenId: validation.data.citizenId,
        latitude: validation.data.latitude,
        longitude: validation.data.longitude,
        category: validation.data.category,
        photoFileId,
        notes: validation.data.notes,
        detectedObjectName: validation.data.detectedObjectName,
        detectedCategory: validation.data.detectedCategory,
        confidenceScore: validation.data.confidenceScore,
        aiModelVersion: validation.data.aiModelVersion,
        userOverrideCategory: validation.data.userOverrideCategory
      })

      // Mark as synced
      await markReportSynced({
        ...updatedReport,
        syncStatus: 'synced' as SyncStatus,
        synced: true
      })

      console.log(`[Sync] Report ${report.id} synced successfully`)
      this.emit({ type: 'report-synced', data: { reportId: report.id } })
      return true
    } catch (error: any) {
      console.error(`[Sync] Failed to sync report ${report.id}:`, error)

      // Update with error status
      const errorMessage = error?.message || 'Unknown error'
      const failedReport: LocalReport = {
        ...updatedReport,
        syncStatus: updatedReport.syncAttempts >= MAX_RETRY_ATTEMPTS ? 'failed' : 'pending',
        syncError: errorMessage
      }
      await savePendingReport(failedReport)

      this.emit({
        type: 'report-failed',
        data: { reportId: report.id, error: errorMessage, attempts: updatedReport.syncAttempts }
      })
      return false
    }
  }

  // Force retry a specific report (reset attempts)
  async retryReport(reportId: string): Promise<boolean> {
    const reports = await getPendingReports()
    const report = reports.find(r => r.id === reportId)

    if (!report) {
      console.warn(`[Sync] Report ${reportId} not found`)
      return false
    }

    // Reset attempts and error
    const resetReport: LocalReport = {
      ...report,
      syncAttempts: 0,
      syncStatus: 'pending',
      syncError: undefined,
      lastSyncAttempt: undefined
    }
    await savePendingReport(resetReport)

    // Attempt sync immediately
    return this.syncReport(resetReport)
  }

  // Get current sync status
  getStatus(): { isSyncing: boolean; isOnline: boolean } {
    return {
      isSyncing: this.isSyncing,
      isOnline: isOnline()
    }
  }
}

// Singleton instance
export const syncManager = new SyncManager()

// Hook for React components
export function useSyncStatus(): {
  isSyncing: boolean
  isOnline: boolean
} {
  // This is a simplified version - in a real app you'd use useSyncExternalStore
  return syncManager.getStatus()
}
