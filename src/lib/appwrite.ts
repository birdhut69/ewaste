import { Client, Account, Databases, Storage, ID, Query, Permission, Role } from 'appwrite'
import type { UserRole, AuthMode, Report, ReportStatus, StoredSession, AIDetectionResult, VerificationStatus } from './types'
import { CreateReportSchema, EmailSchema, OtpSchema, PasswordSchema, PhoneSchema, UserRoleSchema } from './validation'
import { clearAllData } from './db'

// Local storage keys
const SESSION_KEY = 'ewaste_session'
let inMemorySession: StoredSession | null = null

function resolveEnv(key: string, fallback?: string): string {
  const env = import.meta.env as Record<string, string | undefined>
  const value = env[key] || fallback
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

// Initialize Appwrite Client
const client = new Client()
  .setEndpoint(resolveEnv('VITE_APPWRITE_ENDPOINT', 'https://cloud.appwrite.io/v1'))
  .setProject(resolveEnv('VITE_APPWRITE_PROJECT_ID'))

export const account = new Account(client)
export const databases = new Databases(client)
export const storage = new Storage(client)

// Database config
export const DB_ID = resolveEnv('VITE_APPWRITE_DB_ID', 'ewaste-db')
export const COLL_REPORTS = 'reports'
export const COLL_USERS = 'users'
export const COLL_PUSH_SUBSCRIPTIONS = 'push_subscriptions'
export const BUCKET_PHOTOS = resolveEnv('VITE_APPWRITE_BUCKET_PHOTOS', 'photos')

// Access control (must match `scripts/setup-appwrite.js`).
// Citizens get access via per-document permissions (Role.user(citizenId)).
// Drivers/PMC get access via team-based collection/document permissions.
const TEAM_DRIVER_ID = resolveEnv('VITE_APPWRITE_TEAM_ID_DRIVER', 'ewaste-driver')
const TEAM_PMC_ID = resolveEnv('VITE_APPWRITE_TEAM_ID_PMC', 'ewaste-pmc')
const TEAM_DRIVER_ROLE = 'driver'
const TEAM_PMC_ROLE = 'pmc'

function buildReportPermissions(citizenId: string): string[] {
  return [
    // Citizen keeps full control of their own document.
    Permission.read(Role.user(citizenId)),
    Permission.update(Role.user(citizenId)),
    Permission.delete(Role.user(citizenId)),

    // Keep app operational across projects that do not use team roles in ACL.
    Permission.read(Role.users()),
    Permission.update(Role.users())
  ]
}

function buildPhotoPermissions(ownerUserId: string): string[] {
  // Storage file ACLs must use explicit permission actions.
  // Owner can edit/delete, and authenticated users can view for shared map/list UIs.
  return [
    Permission.read(Role.users()),
    Permission.update(Role.user(ownerUserId)),
    Permission.delete(Role.user(ownerUserId))
  ]
}

// ============================================
// Session Management
// ============================================

export function saveSession(session: StoredSession): void {
  inMemorySession = session
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch (error) {
    console.error('Could not persist session in localStorage:', error)
  }
}

export function getStoredSession(): StoredSession | null {
  try {
    const data = localStorage.getItem(SESSION_KEY)
    if (!data) return inMemorySession
    return JSON.parse(data) as StoredSession
  } catch (error) {
    console.error('Failed to read session from localStorage:', error)
    return inMemorySession
  }
}

export function clearSession(): void {
  inMemorySession = null
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch (error) {
    console.error('Could not clear session in localStorage:', error)
  }
}

export function getCurrentUserId(): string {
  const session = getStoredSession()
  if (!session?.userId) throw new Error('Not authenticated')
  return session.userId
}

export function getLocalSession(): {
  isAuth: boolean
  role: UserRole | null
  mode: AuthMode
  userName: string
  userId: string
} {
  const session = getStoredSession()
  if (!session) {
    return { isAuth: false, role: null, mode: 'appwrite', userName: '', userId: '' }
  }
  return {
    isAuth: true,
    role: session.role,
    mode: session.mode,
    userName: session.userName,
    userId: session.userId
  }
}

// ============================================
// Authentication
// ============================================

function hasActiveSessionError(error: unknown): boolean {
  const message = (error as { message?: string })?.message?.toLowerCase() || ''
  return message.includes('session is active') || message.includes('prohibited when a session is active')
}

function isUnauthorizedError(error: unknown): boolean {
  const err = error as { code?: number; status?: number; message?: string }
  const code = err?.code ?? err?.status
  const message = err?.message?.toLowerCase() || ''
  return code === 401 || message.includes('unauthorized')
}

function isPermissionValidationError(error: unknown): boolean {
  const message = (error as { message?: string })?.message?.toLowerCase() || ''
  return (
    message.includes('invalid permissions') ||
    message.includes('permissions must be one of') ||
    (message.includes('permission') && message.includes('not allowed')) ||
    (message.includes('role') && message.includes('not allowed'))
  )
}

function shouldInvalidateSession(error: unknown): boolean {
  return isUnauthorizedError(error) && !isPermissionValidationError(error)
}

function getUserRoleFromPrefs(prefs: unknown): UserRole | null {
  const role = (prefs as { role?: unknown })?.role
  const parsed = UserRoleSchema.safeParse(role)
  return parsed.success ? parsed.data : null
}

async function enforceRoleForCurrentSession(selectedRole: UserRole): Promise<{
  user: Awaited<ReturnType<typeof account.get>>
  role: UserRole
}> {
  const user = await account.get()
  const existingRole = getUserRoleFromPrefs(user.prefs)

  if (!existingRole) {
    await account.updatePrefs({ ...(user.prefs as Record<string, unknown>), role: selectedRole })
    return { user, role: selectedRole }
  }

  if (existingRole !== selectedRole) {
    throw new Error(`Role access denied. This account is registered for '${existingRole}'.`)
  }

  return { user, role: existingRole }
}

function getUnknownAttribute(error: unknown): string | null {
  const message = (error as { message?: string })?.message || ''
  const match = message.match(/Unknown attribute:\s*"([^"]+)"/i)
  return match?.[1] || null
}

function parseVerificationFromNotes(notes?: string): {
  verificationStatus?: VerificationStatus
  verificationNotes?: string
  verifiedBy?: string
  verifiedAt?: string
} {
  if (!notes) return {}

  const marker = notes
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('PMC verification:'))

  if (!marker) return {}

  const statusMatch = marker.match(/PMC verification:\s*(approved|rejected|pending-review)/i)
  const byMatch = marker.match(/by\s+([^|]+)\|/i)
  const atMatch = marker.match(/at\s+([^|]+)$/i)
  const noteMatch = marker.match(/notes\s*:\s*([^|]+)(\||$)/i)

  return {
    verificationStatus: (statusMatch?.[1]?.toLowerCase() as VerificationStatus | undefined) || 'pending-review',
    verifiedBy: byMatch?.[1]?.trim(),
    verifiedAt: atMatch?.[1]?.trim(),
    verificationNotes: noteMatch?.[1]?.trim()
  }
}

async function createReportDocumentWithFallback(
  reportData: Record<string, unknown>,
  permissions: string[]
): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = { ...reportData }
  const strippedAttributes = new Set<string>()
  let lastError: unknown

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await databases.createDocument(DB_ID, COLL_REPORTS, ID.unique(), payload, permissions) as unknown as Record<string, unknown>
    } catch (error) {
      lastError = error
      const unknownAttribute = getUnknownAttribute(error)

      if (!unknownAttribute || strippedAttributes.has(unknownAttribute)) {
        throw error
      }

      strippedAttributes.add(unknownAttribute)
      delete payload[unknownAttribute]
      console.warn(`Report attribute '${unknownAttribute}' not present in backend schema; retrying without it.`)
    }
  }

  throw lastError
}

async function createSessionWithRetry<T>(factory: () => Promise<T>): Promise<T> {
  try {
    return await factory()
  } catch (error) {
    if (!hasActiveSessionError(error)) {
      throw error
    }

    try {
      await account.deleteSession('current')
    } catch {
      // Ignore if session is already invalid/expired.
    }

    return factory()
  }
}

// Phone OTP login (Appwrite SDK v15+)
export async function sendOTP(phone: string): Promise<{ userId: string }> {
  const validatedPhone = PhoneSchema.parse(phone)
  const token = await account.createPhoneToken(ID.unique(), `+91${validatedPhone}`)
  return { userId: token.userId }
}

export async function verifyOTP(userId: string, secret: string, role: UserRole): Promise<void> {
  OtpSchema.parse(secret)
  UserRoleSchema.parse(role)
  await createSessionWithRetry(() => account.createSession(userId, secret))
  const { user, role: resolvedRole } = await enforceRoleForCurrentSession(role)
  const session: StoredSession = {
    userId: user.$id,
    userName: user.name || user.phone || 'User',
    userPhone: user.phone,
    role: resolvedRole,
    mode: 'appwrite'
  }
  saveSession(session)
}

// Email login (Appwrite SDK v15+)
export async function emailLogin(email: string, password: string, role: UserRole): Promise<void> {
  EmailSchema.parse(email)
  PasswordSchema.parse(password)
  UserRoleSchema.parse(role)
  try {
    await createSessionWithRetry(() => account.createEmailPasswordSession(email, password))
    const { user, role: resolvedRole } = await enforceRoleForCurrentSession(role)
    const session: StoredSession = {
      userId: user.$id,
      userName: user.name || email.split('@')[0],
      userEmail: user.email,
      role: resolvedRole,
      mode: 'appwrite'
    }
    saveSession(session)
  } catch (error) {
    if (isUnauthorizedError(error)) {
      throw new Error('Invalid credentials')
    }
    throw error
  }
}

// Email signup
export async function emailSignup(email: string, password: string, name: string, role: UserRole): Promise<void> {
  if (role !== 'citizen') {
    throw new Error('Role access denied. Driver/PMC accounts must be provisioned by an admin.')
  }

  try {
    await account.create(ID.unique(), email, password, name)
  } catch (error) {
    const message = (error as { message?: string })?.message?.toLowerCase() || ''
    if (message.includes('already exists') || message.includes('already registered')) {
      throw new Error('Account already exists')
    }
    throw error
  }

  await emailLogin(email, password, role)
}

// Restore session on app reload
export async function restoreSession(): Promise<StoredSession | null> {
  const storedSession = getStoredSession()

  // If no stored session, return null
  if (!storedSession) return null

  // Defensive: older app versions may have stored demo sessions.
  if (storedSession.mode !== 'appwrite') return null

  // For appwrite mode, verify the session is still valid
  try {
    const user = await account.get()
    const prefs = user.prefs as { role?: UserRole }

    // Update stored session with fresh data
    const freshSession: StoredSession = {
      userId: user.$id,
      userName: user.name || user.email || user.phone || 'User',
      userEmail: user.email,
      userPhone: user.phone,
      role: prefs.role ?? storedSession.role,
      mode: 'appwrite'
    }
    saveSession(freshSession)
    return freshSession
  } catch (error) {
    if (isUnauthorizedError(error)) {
      // Session invalid or expired.
      clearSession()
      return null
    }

    // Transient error (network/server). Keep stored session and let caller retry.
    console.error('Session restore failed due to transient error:', error)
    return storedSession
  }
}

// Logout
export async function logout(): Promise<void> {
  const session = getStoredSession()

  if (session?.mode === 'appwrite') {
    try {
      await account.deleteSession('current')
    } catch {
      // Session may already be invalid
    }
  }

  clearSession()

  try {
    await clearAllData()
  } catch (error) {
    console.error('Failed to clear offline data during logout:', error)
  }
}

// ============================================
// Reports API
// ============================================

export async function getReports(filters?: {
  status?: ReportStatus
  citizenId?: string
  limit?: number
  cursorAfter?: string
}): Promise<Report[]> {
  try {
    const limit = Math.min(filters?.limit ?? 100, 500)
    const queries: string[] = [Query.orderDesc('$createdAt'), Query.limit(limit)]
    
    if (filters?.status) {
      queries.push(Query.equal('status', filters.status))
    }
    
    if (filters?.citizenId) {
      queries.push(Query.equal('citizenId', filters.citizenId))
    }

    if (filters?.cursorAfter) {
      queries.push(Query.cursorAfter(filters.cursorAfter))
    }

    const response = await databases.listDocuments(DB_ID, COLL_REPORTS, queries)
    
    // Map Appwrite documents to our Report type
    const reports = response.documents.map(doc => {
      const verificationFallback = parseVerificationFromNotes(typeof doc.notes === 'string' ? doc.notes : undefined)

      return {
        ...doc,
        createdAt: (doc as Record<string, unknown>).createdAt || (doc as Record<string, unknown>).$createdAt,
        // Ensure photoUrl is generated if photoFileId exists
        photoUrl: doc.photoFileId ? storage.getFileView(BUCKET_PHOTOS, doc.photoFileId).href : undefined,
        verificationStatus: (doc.verificationStatus as VerificationStatus | undefined) || verificationFallback.verificationStatus || 'pending-review',
        verifiedBy: (doc.verifiedBy as string | undefined) || verificationFallback.verifiedBy,
        verifiedAt: (doc.verifiedAt as string | undefined) || verificationFallback.verifiedAt,
        verificationNotes: (doc.verificationNotes as string | undefined) || verificationFallback.verificationNotes
      }
    }) as unknown as Report[]
    
    return reports
  } catch (error) {
    console.error('Failed to fetch from Appwrite:', error)
    if (shouldInvalidateSession(error)) {
      clearSession()
      throw new Error('Session expired. Please login again.')
    }
    throw new Error('Could not fetch reports from backend. Please try again.')
  }
}

export async function getMyReports(): Promise<Report[]> {
  const userId = getCurrentUserId()
  return getReports({ citizenId: userId })
}

// Create report with AI detection data
export async function createReport(data: {
  citizenId: string
  latitude: number
  longitude: number
  category: string
  photoFileId?: string
  notes?: string
  detectedObjectName?: string
  detectedCategory?: string
  confidenceScore?: number
  aiModelVersion?: string
  userOverrideCategory?: boolean
}): Promise<Report> {
  const validated = CreateReportSchema.parse({
    citizenId: data.citizenId,
    latitude: data.latitude,
    longitude: data.longitude,
    category: data.category,
    photoFileId: data.photoFileId,
    notes: data.notes,
    detectedObjectName: data.detectedObjectName,
    detectedCategory: data.detectedCategory,
    confidenceScore: data.confidenceScore,
    aiModelVersion: data.aiModelVersion,
    userOverrideCategory: data.userOverrideCategory
  })

  const reportData = {
    citizenId: validated.citizenId,
    latitude: validated.latitude,
    longitude: validated.longitude,
    category: validated.category,
    status: 'pending' as ReportStatus,
    notes: validated.notes,
    photoFileId: validated.photoFileId,
    detectedObjectName: validated.detectedObjectName,
    detectedCategory: validated.detectedCategory,
    confidenceScore: validated.confidenceScore,
    aiModelVersion: validated.aiModelVersion
  }

  try {
    const permissions = buildReportPermissions(validated.citizenId)
    let doc: Record<string, unknown>

    try {
      doc = await createReportDocumentWithFallback(reportData as unknown as Record<string, unknown>, permissions)
    } catch (error) {
      if (!isPermissionValidationError(error)) {
        throw error
      }

      // Some Appwrite projects reject custom ACL payloads. Retry with backend defaults.
      doc = await createReportDocumentWithFallback(reportData as unknown as Record<string, unknown>, [])
    }

    return {
      ...doc,
      createdAt: doc.createdAt || doc.$createdAt,
      photoUrl: validated.photoFileId ? storage.getFileView(BUCKET_PHOTOS, validated.photoFileId).href : undefined
    } as unknown as Report
  } catch (error) {
    console.error('Failed to create report:', error)
    if (shouldInvalidateSession(error)) {
      clearSession()
      throw new Error('Session expired. Please login again.')
    }
    throw error
  }
}

// Update report status
export async function updateReportStatus(reportId: string, status: ReportStatus): Promise<void> {
  try {
    const updateData: Partial<Report> = { status }
    if (status === 'collected') {
      updateData.collectedAt = new Date().toISOString()
    }
    await databases.updateDocument(DB_ID, COLL_REPORTS, reportId, updateData)
  } catch (error) {
    console.error(`Failed to update report ${reportId}:`, error)
    if (shouldInvalidateSession(error)) {
      clearSession()
      throw new Error('Session expired. Please login again.')
    }
    throw error
  }
}

export async function updateReportVerification(reportId: string, input: {
  status: VerificationStatus
  notes?: string
}): Promise<void> {
  const verifier = getStoredSession()?.userName || 'PMC Reviewer'
  const verifiedAt = new Date().toISOString()
  const payload: Record<string, unknown> = {
    verificationStatus: input.status,
    verificationNotes: input.notes,
    verifiedBy: verifier,
    verifiedAt
  }

  try {
    await databases.updateDocument(DB_ID, COLL_REPORTS, reportId, payload)
    return
  } catch (error) {
    const unknownAttribute = getUnknownAttribute(error)
    if (!unknownAttribute) {
      throw error
    }
  }

  // Fallback for schemas that do not yet include verification attributes.
  const existing = await databases.getDocument(DB_ID, COLL_REPORTS, reportId) as unknown as Record<string, unknown>
  const previousNotes = typeof existing.notes === 'string' ? existing.notes.trim() : ''
  const marker = `PMC verification: ${input.status}${input.notes ? ` | notes: ${input.notes}` : ''} | by ${verifier} | at ${verifiedAt}`
  const nextNotes = previousNotes ? `${previousNotes}\n${marker}` : marker
  await databases.updateDocument(DB_ID, COLL_REPORTS, reportId, { notes: nextNotes })
}

// Assign report to driver
export async function assignReport(reportId: string, driverId: string): Promise<void> {
  await databases.updateDocument(DB_ID, COLL_REPORTS, reportId, {
    assignedDriverId: driverId,
    status: 'assigned'
  })
}

export async function submitAIFeedback(reportId: string, input: {
  isCorrect: boolean
  correctedCategory?: string
}): Promise<void> {
  const feedbackAt = new Date().toISOString()
  const payload: Record<string, unknown> = {
    aiFeedbackCorrect: input.isCorrect,
    aiFeedbackCategory: input.correctedCategory,
    aiFeedbackAt: feedbackAt
  }

  try {
    await databases.updateDocument(DB_ID, COLL_REPORTS, reportId, payload)
    return
  } catch (error) {
    const unknownAttribute = getUnknownAttribute(error)
    if (!unknownAttribute) {
      throw error
    }
  }

  // Fallback for projects where feedback attributes are not yet present.
  const existing = await databases.getDocument(DB_ID, COLL_REPORTS, reportId) as unknown as Record<string, unknown>
  const previousNotes = typeof existing.notes === 'string' ? existing.notes.trim() : ''
  const feedbackMarker = `AI feedback: ${input.isCorrect ? 'correct' : `incorrect (${input.correctedCategory || 'unspecified'})`} at ${feedbackAt}`
  const nextNotes = previousNotes ? `${previousNotes}\n${feedbackMarker}` : feedbackMarker
  await databases.updateDocument(DB_ID, COLL_REPORTS, reportId, { notes: nextNotes })
}

export async function checkBackendReachability(): Promise<{
  ok: boolean
  status?: number
  origin: string
  endpoint: string
  details: string
}> {
  const endpoint = resolveEnv('VITE_APPWRITE_ENDPOINT', 'https://cloud.appwrite.io/v1')
  const normalized = endpoint.replace(/\/+$/, '')
  const healthUrl = `${normalized}/health`

  try {
    const response = await fetch(healthUrl, {
      method: 'GET',
      cache: 'no-store'
    })

    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        origin: window.location.origin,
        endpoint,
        details: 'Backend reachable from this device.'
      }
    }

    return {
      ok: false,
      status: response.status,
      origin: window.location.origin,
      endpoint,
      details: `Endpoint responded with HTTP ${response.status}.`
    }
  } catch (error) {
    return {
      ok: false,
      origin: window.location.origin,
      endpoint,
      details:
        'Cannot reach Appwrite from this device. Check that this phone and backend are on reachable network and this origin is allowed in Appwrite Platforms/CORS.',
    }
  }
}

// Realtime report subscription for live dashboards and route updates.
export function subscribeToReports(onChange: () => void): () => void {
  const channel = `databases.${DB_ID}.collections.${COLL_REPORTS}.documents`

  try {
    const unsubscribe = client.subscribe(channel, () => {
      onChange()
    })

    return () => {
      try {
        unsubscribe()
      } catch (error) {
        console.error('Failed to unsubscribe from report updates:', error)
      }
    }
  } catch (error) {
    console.error('Failed to subscribe to report updates:', error)
    return () => {}
  }
}

// ============================================
// Photo Storage
// ============================================

export async function uploadPhoto(file: File, ownerUserId: string): Promise<string> {
  if (!ownerUserId) {
    throw new Error('uploadPhoto: ownerUserId is required')
  }

  const permissions = buildPhotoPermissions(ownerUserId)
  try {
    let response
    try {
      response = await storage.createFile(BUCKET_PHOTOS, ID.unique(), file, permissions)
    } catch (error) {
      if (!isPermissionValidationError(error)) {
        throw error
      }

      // Retry without explicit ACL to support buckets that enforce backend defaults.
      response = await storage.createFile(BUCKET_PHOTOS, ID.unique(), file)
    }

    return response.$id
  } catch (error) {
    const message = (error as { message?: string })?.message || 'Unknown upload error'
    const missingBucket =
      message.includes('Storage bucket with the requested ID could not be found') ||
      message.includes('bucket') && message.includes('not be found')

    if (missingBucket) {
      throw new Error(
        `Photo upload bucket "${BUCKET_PHOTOS}" was not found. ` +
        'Set VITE_APPWRITE_BUCKET_PHOTOS to an existing bucket ID and restart the dev server.'
      )
    }

    if (shouldInvalidateSession(error)) {
      clearSession()
      throw new Error('Session expired. Please login again.')
    }

    throw error
  }
}

export function getPhotoUrl(fileId: string): string {
  if (!fileId) return ''

  // Use .href property from URL object returned by getFileView
  return storage.getFileView(BUCKET_PHOTOS, fileId).href
}

export async function upsertPushSubscription(input: {
  role: UserRole
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string
  platform?: string
}): Promise<void> {
  const userId = getCurrentUserId()

  const existing = await databases.listDocuments(DB_ID, COLL_PUSH_SUBSCRIPTIONS, [
    Query.equal('userId', userId),
    Query.equal('endpoint', input.endpoint),
    Query.limit(1)
  ])

  const payload = {
    userId,
    role: input.role,
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth: input.auth,
    userAgent: input.userAgent,
    platform: input.platform,
    active: true,
    lastSeenAt: new Date().toISOString(),
    lastError: ''
  }

  if (existing.total > 0 && existing.documents[0]) {
    await databases.updateDocument(DB_ID, COLL_PUSH_SUBSCRIPTIONS, existing.documents[0].$id, payload)
    return
  }

  await databases.createDocument(DB_ID, COLL_PUSH_SUBSCRIPTIONS, ID.unique(), payload)
}

// Convert File to base64 for offline storage
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Convert base64 to File for sync
export function base64ToFile(base64: string, filename: string): File {
  const arr = base64.split(',')
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg'
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new File([u8arr], filename, { type: mime })
}
