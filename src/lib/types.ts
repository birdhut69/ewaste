// Domain types for Pune E-Waste PWA

export type UserRole = 'citizen' | 'pmc' | 'driver'

export type AuthMode = 'appwrite'

export type ReportStatus = 'pending' | 'assigned' | 'in-progress' | 'collected'

export type VerificationStatus = 'pending-review' | 'approved' | 'rejected'

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed'

export interface User {
  $id: string
  name: string
  email?: string
  phone?: string
  role: UserRole
  zone?: string
  createdAt: string
}

// AI Detection result for uploaded photos
export interface AIDetectionResult {
  detectedObjectName: string
  detectedCategory: CategoryId
  confidenceScore: number
  aiModelVersion: string
  bbox?: [number, number, number, number]
  imageWidth?: number
  imageHeight?: number
  alternativePredictions?: Array<{
    category: CategoryId
    confidence: number
  }>
}

export interface Report {
  $id: string
  citizenId: string
  latitude: number
  longitude: number
  category: string
  status: ReportStatus
  notes?: string
  photoFileId?: string
  photoUrl?: string
  zoneId?: string
  assignedDriverId?: string
  createdAt: string
  collectedAt?: string
  // AI Detection fields
  detectedObjectName?: string
  detectedCategory?: string
  confidenceScore?: number
  aiModelVersion?: string
  userOverrideCategory?: boolean
  verificationStatus?: VerificationStatus
  verifiedBy?: string
  verifiedAt?: string
  verificationNotes?: string
}

export interface Route {
  $id: string
  driverId: string
  status: 'pending' | 'active' | 'completed'
  stops: RouteStop[]
  startTime?: string
  endTime?: string
  totalDistance?: number
  createdAt: string
}

export interface RouteStop {
  reportId: string
  latitude: number
  longitude: number
  category: string
  notes?: string
  status: 'pending' | 'in-progress' | 'collected'
  collectedAt?: string
  order: number
}

export interface Zone {
  $id: string
  name: string
  bounds: {
    north: number
    south: number
    east: number
    west: number
  roboflowDetections?: Array<{
    label: string
    confidence: number
  }>
}
  assignedDriverId?: string
}

export interface Hotspot {
  latitude: number
  longitude: number
  concentration: number
  categories: string[]
  reportCount: number
  detectedAt: string
}

export interface LocalReport extends Report {
  id: string
  photoBase64?: string
  synced: boolean
  syncStatus: SyncStatus
  syncAttempts: number
  lastSyncAttempt?: string
  syncError?: string
}

export const EWASTE_CATEGORIES = [
  { id: 'mobile', label: 'Mobile Phones', icon: '📱', keywords: ['phone', 'smartphone', 'mobile', 'cell', 'iphone', 'android'] },
  { id: 'computer', label: 'Computers & Laptops', icon: '💻', keywords: ['laptop', 'computer', 'pc', 'notebook', 'desktop', 'macbook'] },
  { id: 'monitor', label: 'Monitors & TVs', icon: '🖥️', keywords: ['monitor', 'tv', 'television', 'screen', 'display', 'lcd', 'led'] },
  { id: 'cable', label: 'Cables & Wires', icon: '🔌', keywords: ['cable', 'wire', 'cord', 'charger', 'usb', 'hdmi', 'power'] },
  { id: 'battery', label: 'Batteries', icon: '🔋', keywords: ['battery', 'cell', 'power bank', 'lithium', 'rechargeable'] },
  { id: 'appliance', label: 'Home Appliances', icon: '🏠', keywords: ['appliance', 'microwave', 'toaster', 'blender', 'fan', 'heater', 'iron'] },
  { id: 'other', label: 'Other E-Waste', icon: '♻️', keywords: ['electronic', 'device', 'gadget'] }
] as const

export type CategoryId = typeof EWASTE_CATEGORIES[number]['id']

// Auth session stored in localStorage
export interface StoredSession {
  userId: string
  userName: string
  userEmail?: string
  userPhone?: string
  role: UserRole
  mode: AuthMode
  expiresAt?: string
}
