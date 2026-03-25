import { openDB, DBSchema, IDBPDatabase } from 'idb'
import type { LocalReport } from './types'

interface EWasteDB extends DBSchema {
  'pending-reports': {
    key: string
    value: LocalReport
    indexes: { 'by-date': string }
  }
  'synced-reports': {
    key: string
    value: LocalReport
  }
}

let dbInstance: IDBPDatabase<EWasteDB> | null = null

async function getDB(): Promise<IDBPDatabase<EWasteDB>> {
  if (dbInstance) return dbInstance
  
  dbInstance = await openDB<EWasteDB>('ewaste-db', 1, {
    upgrade(db) {
      // Pending reports store
      const pendingStore = db.createObjectStore('pending-reports', { keyPath: 'id' })
      pendingStore.createIndex('by-date', 'createdAt')
      
      // Synced reports store
      db.createObjectStore('synced-reports', { keyPath: 'id' })
    }
  })
  
  return dbInstance
}

// Save a report to pending queue
export async function savePendingReport(report: LocalReport): Promise<void> {
  const db = await getDB()
  await db.put('pending-reports', report)
}

// Get all pending reports
export async function getPendingReports(): Promise<LocalReport[]> {
  const db = await getDB()
  return db.getAll('pending-reports')
}

// Remove a report from pending (after sync)
export async function removePendingReport(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('pending-reports', id)
}

// Move report to synced store
export async function markReportSynced(report: LocalReport): Promise<void> {
  const db = await getDB()
  const syncedReport = { ...report, synced: true }
  await db.put('synced-reports', syncedReport)
  await db.delete('pending-reports', report.id)
}

// Get pending count for badge
export async function getPendingCount(): Promise<number> {
  const db = await getDB()
  const reports = await db.getAll('pending-reports')
  return reports.filter(report => report.syncStatus !== 'failed').length
}

// Clear all data (for logout)
export async function clearAllData(): Promise<void> {
  const db = await getDB()
  await db.clear('pending-reports')
  await db.clear('synced-reports')
}
