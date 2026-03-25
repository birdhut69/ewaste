import { useState, useEffect, useCallback, useRef } from 'react'
import { Home, Plus, Clock, User, MapPin, Camera, ChevronRight, ChevronLeft, Check, RefreshCw, LogOut, WifiOff, Sparkles, AlertCircle, Brain, ThumbsUp, ThumbsDown, Bell } from 'lucide-react'
import { createReport, uploadPhoto, logout, getLocalSession, getCurrentUserId, getMyReports, subscribeToReports, submitAIFeedback, invalidateReportsCache } from '@/lib/appwrite'
import { savePendingReport, getPendingCount, markReportSynced } from '@/lib/db'
import { timeAgo, getCategoryInfo, getStatusColor, getVerificationColor, generateId, isOnline } from '@/lib/utils'
import { detectEwasteLite } from '@/lib/ai'
import { EWASTE_CATEGORIES } from '@/lib/types'
import { useAI } from '@/lib/aiProvider'
import { CreateReportSchema } from '@/lib/validation'
import type { Report, LocalReport, AIDetectionResult, CategoryId } from '@/lib/types'
import { syncManager } from '@/lib/sync'
import { getAllAIFeedback, saveAIFeedback } from '@/lib/aiFeedback'
import { detectReportChanges, getNotificationPermission, notifyUser, requestNotificationPermission } from '@/lib/notifications'
import { ensurePushSubscription } from '@/lib/push'
import { toast } from 'sonner'
import { PullToRefresh } from '@/components/PullToRefresh'
import { compressImageFile, fileToDataUrl } from '@/lib/image'
import { requestCurrentLocation } from '@/lib/location'

type Tab = 'home' | 'report' | 'history' | 'profile'
type ReportStep = 'capture' | 'preview' | 'details' | 'success'
const AI_AUTO_SELECT_THRESHOLD = 52
const AI_SUGGESTION_THRESHOLD = 42
const AI_HIGH_CONFIDENCE_THRESHOLD = 70

interface CitizenAppProps {
  onLogout: () => void
}

export default function CitizenApp({ onLogout }: CitizenAppProps) {
  const [activeTab, setActiveTab] = useState<Tab>('home')
  const [reports, setReports] = useState<Report[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [online, setOnline] = useState(isOnline())
  const [feedbackMap, setFeedbackMap] = useState<Record<string, { isCorrect: boolean; correctedCategory?: CategoryId; submittedAt: string }>>({})
  const { userName } = getLocalSession()
  const previousReportsRef = useRef<Report[] | null>(null)
  const loadingRef = useRef(false)
  const lastLoadTsRef = useRef(0)

  const loadData = useCallback(async (force = false) => {
    const now = Date.now()
    if (!force && loadingRef.current) return
    if (!force && now - lastLoadTsRef.current < 1500) return

    loadingRef.current = true
    try {
      if (force) {
        invalidateReportsCache()
      }

      const [reportData, pending] = await Promise.all([
        getMyReports(),
        getPendingCount()
      ])
      setReports(reportData)
      setPendingCount(pending)
      lastLoadTsRef.current = Date.now()
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [])

  const refreshPendingCount = async () => {
    try {
      const pending = await getPendingCount()
      setPendingCount(pending)
    } catch (error) {
      console.error('Failed to refresh pending count:', error)
    }
  }

  // Online/offline status
  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Load data
  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    const unsubscribe = subscribeToReports(() => {
      void loadData(true)
    })

    return () => unsubscribe()
  }, [loadData])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadData(true)
      }
    }

    const handleFocus = () => {
      void loadData(true)
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
    }
  }, [loadData])

  useEffect(() => {
    setFeedbackMap(getAllAIFeedback())
  }, [])

  useEffect(() => {
    if (loading) return

    const previousReports = previousReportsRef.current
    previousReportsRef.current = reports

    if (!previousReports) return

    const changes = detectReportChanges(previousReports, reports)
    for (const change of changes) {
      const category = getCategoryInfo(change.report.category).label

      if (change.type === 'created') {
        void notifyUser({
          title: 'Report submitted',
          body: `${category} added to your reports.`,
          dedupeKey: `citizen-created-${change.report.$id}`,
          tag: `citizen-${change.report.$id}`
        })
        continue
      }

      const statusLabel = change.report.status.replace('-', ' ')
      const title = change.report.status === 'collected' ? 'Pickup complete' : 'Report status updated'

      void notifyUser({
        title,
        body: `${category} is now ${statusLabel}.`,
        dedupeKey: `citizen-status-${change.report.$id}-${change.report.status}`,
        tag: `citizen-status-${change.report.$id}`
      })
    }

    for (const report of reports) {
      const previous = previousReports.find((item) => item.$id === report.$id)
      if (!previous) continue

      const prevVerification = previous.verificationStatus || 'pending-review'
      const nextVerification = report.verificationStatus || 'pending-review'
      if (prevVerification === nextVerification) continue

      const category = getCategoryInfo(report.category).label
      void notifyUser({
        title: 'PMC verification updated',
        body: `${category} image is now ${nextVerification}.`,
        dedupeKey: `citizen-verify-${report.$id}-${nextVerification}`,
        tag: `citizen-verify-${report.$id}`
      })
    }
  }, [loading, reports])

  useEffect(() => {
    const unsubscribe = syncManager.subscribe((event) => {
      if (event.type === 'report-synced' || event.type === 'sync-complete' || event.type === 'report-failed') {
        void refreshPendingCount()
      }
    })

    return () => unsubscribe()
  }, [])

  const handleLogout = async () => {
    await logout()
    onLogout()
  }

  const handleManualRefresh = async () => {
    await loadData(true)
  }

  const handleAIFeedback = async (report: Report, input: {
    isCorrect: boolean
    correctedCategory?: CategoryId
  }) => {
    const entry = {
      reportId: report.$id,
      isCorrect: input.isCorrect,
      correctedCategory: input.correctedCategory,
      predictedCategory: report.detectedCategory as CategoryId | undefined,
      predictedObjectName: report.detectedObjectName,
      submittedAt: new Date().toISOString()
    }

    saveAIFeedback(entry)
    setFeedbackMap(prev => ({ ...prev, [report.$id]: entry }))

    try {
      await submitAIFeedback(report.$id, {
        isCorrect: input.isCorrect,
        correctedCategory: input.correctedCategory
      })
      toast.success('Thanks for improving AI accuracy.')
    } catch {
      toast.message('Feedback saved locally. It will sync when backend supports feedback fields.')
    }
  }

  const stats = {
    total: reports.length,
    pending: reports.filter(r => r.status === 'pending').length,
    collected: reports.filter(r => r.status === 'collected').length
  }

  return (
    <PullToRefresh onRefresh={handleManualRefresh}>
    <div className="min-h-screen role-citizen pb-24">
      {/* Offline Banner */}
      {!online && (
        <div className="state-surface-warning border-b text-center py-2 text-sm flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4" />
          You're offline. Reports will sync when connected.
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'home' && (
        <HomeTab
          userName={userName}
          stats={stats}
          pendingCount={pendingCount}
          recentReports={reports.slice(0, 3)}
          onReport={() => setActiveTab('report')}
          loading={loading}
        />
      )}

      {activeTab === 'report' && (
        <ReportTab
          onBack={() => setActiveTab('home')}
          onSuccess={() => {
            setActiveTab('home')
            void refreshPendingCount()
          }}
          isOnline={online}
        />
      )}

      {activeTab === 'history' && (
        <HistoryTab reports={reports} loading={loading} feedbackMap={feedbackMap} onFeedback={handleAIFeedback} />
      )}

      {activeTab === 'profile' && (
        <ProfileTab
          userName={userName}
          stats={stats}
          onLogout={handleLogout}
        />
      )}

      {/* Bottom Navigation */}
      <nav className="bottom-nav">
        <div className="flex justify-around py-2">
          {[
            { id: 'home', icon: Home, label: 'Home' },
            { id: 'report', icon: Plus, label: 'Report' },
            { id: 'history', icon: Clock, label: 'History' },
            { id: 'profile', icon: User, label: 'Profile' }
          ].map(item => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as Tab)}
                className={`bottom-nav-item ${isActive ? 'bottom-nav-item-active' : ''}`}
                aria-label={`Open ${item.label}`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
    </PullToRefresh>
  )
}

// Home Tab
function HomeTab({
  userName, stats, pendingCount, recentReports, onReport, loading
}: {
  userName: string
  stats: { total: number; pending: number; collected: number }
  pendingCount: number
  recentReports: Report[]
  onReport: () => void
  loading: boolean
}) {
  return (
    <div className="animate-fade-in mx-auto w-full max-w-3xl">
      {/* Header */}
      <div className="hero-panel rounded-none rounded-b-[24px] px-4 pt-12 pb-8 sm:px-6">
        <p className="text-white/75 text-sm">Welcome back,</p>
        <h1 className="text-heading mt-1 text-white">{userName}</h1>
        
        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          <div className="bg-white/10 backdrop-blur rounded-panel p-3 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-primary-100">Total</p>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-panel p-3 text-center">
            <p className="text-2xl font-bold">{stats.pending}</p>
            <p className="text-xs text-primary-100">Pending</p>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-panel p-3 text-center">
            <p className="text-2xl font-bold">{stats.collected}</p>
            <p className="text-xs text-primary-100">Collected</p>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-4 sm:px-6">
        {/* Report CTA */}
        <button
          onClick={onReport}
          className="w-full card bg-gradient-to-r from-accent-600 to-accent-700 text-white p-4 flex items-center gap-4 shadow-medium"
          aria-label="Start new e-waste report"
        >
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
            <Camera className="w-6 h-6" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold">Report E-Waste</p>
            <p className="text-sm text-accent-100">Snap, locate, submit</p>
          </div>
          <ChevronRight className="w-5 h-5 text-white/70" />
        </button>

        {/* Pending Sync Badge */}
        {pendingCount > 0 && (
          <div className="mt-4 state-surface-warning rounded-panel border p-3 flex items-center gap-3">
            <RefreshCw className="w-5 h-5" />
            <p className="text-sm">
              <span className="font-semibold">{pendingCount}</span> report{pendingCount > 1 ? 's' : ''} waiting to sync
            </p>
          </div>
        )}

        {/* Recent Activity */}
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Recent Activity</h2>
          {loading ? (
            <div className="card p-8 flex justify-center">
              <div className="spinner" />
            </div>
          ) : recentReports.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-gray-500">No reports yet. Start by reporting e-waste!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentReports.map(report => {
                const cat = getCategoryInfo(report.category)
                return (
                  <div key={report.$id} className="card p-4 flex items-center gap-4">
                    <div className="text-2xl">{cat.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">{cat.label}</p>
                      <p className="text-sm text-gray-500">{timeAgo(report.createdAt)}</p>
                    </div>
                    <span className={`badge ${getStatusColor(report.status)}`}>
                      {report.status}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Report Tab - Multi-step Wizard with AI Detection
function ReportTab({
  onBack, onSuccess, isOnline
}: {
  onBack: () => void
  onSuccess: () => void
  isOnline: boolean
}) {
  const [step, setStep] = useState<ReportStep>('capture')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string>('')
  const [category, setCategory] = useState<CategoryId | ''>('')
  const [notes, setNotes] = useState('')
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationError, setLocationError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // AI detection state
  const [aiResult, setAiResult] = useState<AIDetectionResult | null>(null)
  const [aiDetecting, setAiDetecting] = useState(false)
  const [aiError, setAiError] = useState('')
  const [userOverride, setUserOverride] = useState(false)
  const { modelStatus: aiModelStatus, detect } = useAI()

  // Get location
  useEffect(() => {
    requestCurrentLocation()
      .then((result) => {
        setLocation({ lat: result.lat, lng: result.lng })
        setLocationError(result.source === 'cached' ? 'Using last known location. Refresh for latest GPS.' : '')
      })
      .catch((error) => {
        const msg = (error as Error)?.message || 'Could not get location.'
        setLocationError(msg)
        // Always provide a fallback location so form can submit
        setLocation({ lat: 18.5204, lng: 73.8567 })
      })
  }, [])

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      try {
        const compressedFile = await compressImageFile(file)
        setPhotoFile(compressedFile)
        const base64 = await fileToDataUrl(compressedFile)
        setPhotoPreview(base64)
        setStep('preview')
        runAIDetection(base64)
      } catch (error) {
        console.error('Image preparation failed:', error)
        setFormError('Could not process this image. Please try another photo.')
      }
    }
  }

  const runAIDetection = async (imageBase64: string) => {
    setAiDetecting(true)
    setAiError('')
    setAiResult(null)

    try {
      // Provider path keeps model warm and yields better responsiveness.
      let result: AIDetectionResult
      try {
        result = await detect(imageBase64)
      } catch {
        result = await detectEwasteLite(imageBase64)
      }

      setAiResult(result)

      const nameLower = result.detectedObjectName?.toLowerCase?.() ?? ''
      const appearsUnknown = nameLower.includes('unknown')

      // Auto-select only when confidence is good enough.
      if (!appearsUnknown && result.confidenceScore >= AI_AUTO_SELECT_THRESHOLD) {
        setCategory(result.detectedCategory)
        setUserOverride(false)
      }

      if (appearsUnknown) {
        setAiError('AI could not confidently identify the item. Please select the category manually.')
      }
    } catch (err) {
      console.error('AI detection failed:', err)
      setAiError('Could not analyze image. Please select category manually.')
    } finally {
      setAiDetecting(false)
    }
  }

  const handleCategoryChange = (newCategory: CategoryId) => {
    setCategory(newCategory)
    if (aiResult && newCategory !== aiResult.detectedCategory) {
      setUserOverride(true)
    } else {
      setUserOverride(false)
    }
  }

  const refreshLocation = async () => {
    try {
      const result = await requestCurrentLocation()
      setLocation({ lat: result.lat, lng: result.lng })
      setLocationError(result.source === 'cached' ? 'Using last known location. Try again outdoors for GPS lock.' : '')
    } catch (error) {
      setLocationError((error as Error)?.message || 'Could not refresh location.')
    }
  }

  const handleSubmit = async () => {
    if (!location || !category) return
    setFormError('')
    setSubmitting(true)

    const userId = getCurrentUserId()
    const reportId = generateId()

    const validation = CreateReportSchema.safeParse({
      citizenId: userId,
      latitude: location.lat,
      longitude: location.lng,
      category,
      notes,
      detectedObjectName: aiResult?.detectedObjectName,
      detectedCategory: aiResult?.detectedCategory,
      confidenceScore: aiResult?.confidenceScore,
      aiModelVersion: aiResult?.aiModelVersion,
      userOverrideCategory: userOverride
    })

    if (!validation.success) {
      setFormError(validation.error.issues[0]?.message || 'Invalid input')
      setSubmitting(false)
      return
    }

    const validated = validation.data
    const localReport: LocalReport = {
      $id: reportId,
      id: reportId,
      citizenId: userId,
      latitude: location.lat,
      longitude: location.lng,
      category: validated.category,
      status: 'pending',
      notes: validated.notes,
      createdAt: new Date().toISOString(),
      photoBase64: photoPreview,
      synced: false,
      syncStatus: 'pending',
      syncAttempts: 0,
      detectedObjectName: validated.detectedObjectName,
      detectedCategory: validated.detectedCategory,
      confidenceScore: validated.confidenceScore,
      aiModelVersion: validated.aiModelVersion,
      userOverrideCategory: userOverride
    }

    try {
      await savePendingReport(localReport)

      if (isOnline) {
        let photoFileId: string | undefined
        if (photoFile) {
          photoFileId = await uploadPhoto(photoFile, userId)
        }

        await createReport({
          citizenId: userId,
          latitude: location.lat,
          longitude: location.lng,
          category: validated.category,
          photoFileId,
          notes: validated.notes,
          detectedObjectName: validated.detectedObjectName,
          detectedCategory: validated.detectedCategory,
          confidenceScore: validated.confidenceScore,
          aiModelVersion: validated.aiModelVersion,
          userOverrideCategory: userOverride
        })

        // Prevent duplicate re-sync for reports that were already created online.
        await markReportSynced({
          ...localReport,
          syncStatus: 'synced',
          synced: true,
          photoBase64: undefined
        })
      }

      setStep('success')
      setTimeout(onSuccess, 2000)
    } catch (error) {
      console.error('Failed to submit report:', error)

      // If upload/create failed after local save, report remains queued and will sync later.
      if (isOnline) {
        setFormError((error as { message?: string })?.message || 'Saved locally. Will sync when network is stable.')
      }

      setStep('success')
      setTimeout(onSuccess, 2000)
    } finally {
      setSubmitting(false)
    }
  }

  const aiEngineHint =
    aiModelStatus === 'loaded'
      ? 'Enhanced AI ready (ImageNet + COCO)'
      : aiModelStatus === 'loading'
      ? 'Preparing enhanced AI model...'
      : aiModelStatus === 'failed'
      ? 'Using lite AI mode (network required for enhanced model)'
      : 'Initializing AI engine...'

  const aiConfidenceBadge =
    aiResult && aiResult.confidenceScore >= AI_HIGH_CONFIDENCE_THRESHOLD
      ? 'bg-emerald-100 text-emerald-800'
      : aiResult && aiResult.confidenceScore >= AI_AUTO_SELECT_THRESHOLD
      ? 'bg-violet-100 text-violet-800'
      : 'bg-amber-100 text-amber-800'

  return (
    <div className="min-h-screen role-citizen">
      {/* Progress Bar */}
      <div className="bg-white/90 border-b border-slate-200 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2 mb-3">
            <button onClick={onBack} className="p-1 -ml-1 rounded-lg hover:bg-gray-100 transition-colors" aria-label="Back to home tab">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="font-semibold text-slate-800">Report E-Waste</h1>
          </div>

          <div className="flex gap-2">
            {['capture', 'preview', 'details'].map((s, i) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full ${
                  step === 'success' || ['capture', 'preview', 'details'].indexOf(step) >= i
                    ? 'bg-primary-500'
                    : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="mx-auto w-full max-w-3xl px-4 py-4 pb-32 sm:px-6 sm:pt-6">
        {step === 'capture' && (
          <div className="animate-fade-in">
              <div className="card p-4 mb-4 state-surface-info flex items-center gap-3">
              <Brain className="w-5 h-5 text-primary-700 shrink-0" />
              <p className="text-sm">{aiEngineHint}</p>
            </div>

            <div className="aspect-[4/3] bg-gray-100 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center mb-6 text-center px-5">
              <Camera className="w-12 h-12 text-gray-400 mb-3" />
              <p className="text-gray-700 font-medium">Take a clear photo of the e-waste</p>
              <p className="text-sm text-gray-500 mt-1">Keep the item centered and avoid background clutter for better AI accuracy.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="btn-primary w-full justify-center cursor-pointer">
                <Camera className="w-5 h-5" />
                Open Camera
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleCapture}
                  className="hidden"
                />
              </label>

              <label className="btn-secondary w-full justify-center cursor-pointer">
                Choose from Gallery
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCapture}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="animate-fade-in">
            <div className="rounded-2xl overflow-hidden mb-4 border border-gray-200 bg-black flex justify-center">
              <div className="relative">
                <img src={photoPreview} alt="Preview" className="max-w-full max-h-[54vh] w-auto h-auto block" />
                
                {aiResult?.bbox && aiResult.imageWidth && aiResult.imageHeight && !aiDetecting && (
                  <div
                    className="absolute border-2 border-green-500 bg-green-500/20 z-10 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                    style={{
                      left: `${(aiResult.bbox[0] / aiResult.imageWidth) * 100}%`,
                      top: `${(aiResult.bbox[1] / aiResult.imageHeight) * 100}%`,
                      width: `${(aiResult.bbox[2] / aiResult.imageWidth) * 100}%`,
                      height: `${(aiResult.bbox[3] / aiResult.imageHeight) * 100}%`
                    }}
                  >
                    <div className="absolute -top-6 left-0 bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded font-medium truncate max-w-full">
                      {aiResult.detectedObjectName}
                    </div>
                  </div>
                )}

                {aiDetecting && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl p-4 flex items-center gap-3">
                      <div className="spinner" />
                      <span className="text-slate-800 font-medium">Analyzing with enhanced AI...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {aiResult && !aiDetecting && (
              <div className="card bg-white p-4 mb-4 border-violet-200">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-500 flex items-center justify-center shrink-0">
                    <Brain className="w-5 h-5 text-white" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900">AI Detection</p>
                    <p className="text-sm text-slate-600 mt-1">{aiResult.detectedObjectName}</p>

                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="text-xs bg-violet-100 text-violet-800 px-2 py-0.5 rounded-full">
                        {getCategoryInfo(aiResult.detectedCategory).label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${aiConfidenceBadge}`}>
                        {aiResult.confidenceScore}% confidence
                      </span>
                    </div>

                    {aiResult.alternativePredictions && aiResult.alternativePredictions.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {aiResult.alternativePredictions.slice(0, 3).map(prediction => (
                          <span key={prediction.category} className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                            {getCategoryInfo(prediction.category).label} {prediction.confidence}%
                          </span>
                        ))}
                      </div>
                    )}

                    {aiResult.confidenceScore < AI_AUTO_SELECT_THRESHOLD && (
                      <p className="text-xs text-amber-700 mt-3">
                        AI confidence is low. Please verify and choose category manually on the next step.
                      </p>
                    )}
                  </div>

                  <Sparkles className="w-5 h-5 text-violet-400 shrink-0" />
                </div>
              </div>
            )}

            {aiError && (
              <div className="card bg-amber-50 border-amber-200 p-3 mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-700">{aiError}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setStep('capture')} className="btn-secondary w-full">
                Retake
              </button>
              <button
                onClick={() => setStep('details')}
                className="btn-primary w-full"
                disabled={aiDetecting}
              >
                {aiDetecting ? 'Analyzing...' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {step === 'details' && (
          <div className="animate-fade-in">
            <div className="card p-3 mb-4 flex items-center gap-3">
              <img
                src={photoPreview}
                alt="Report item"
                className="w-16 h-16 rounded-lg object-cover border border-gray-200"
              />
              <div>
                <p className="text-sm font-medium text-slate-800">Review before submit</p>
                <p className="text-xs text-slate-500">Confirm the category and add any useful details.</p>
              </div>
            </div>

            <div className="card p-4 mb-4">
              <div className="flex items-start gap-3">
                <MapPin className={`w-5 h-5 mt-0.5 ${location ? 'text-primary-600' : 'text-gray-400'}`} />
                <div className="flex-1">
                  <p className="font-medium text-slate-800">Location</p>
                  {location ? (
                    <p className="text-sm text-gray-500">
                      {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                    </p>
                  ) : (
                    <p className="text-sm text-amber-600">{locationError || 'Getting location...'}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={refreshLocation} className="btn-secondary !min-h-0 px-2.5 py-1.5 text-xs">
                    Refresh
                  </button>
                  {location && <Check className="w-5 h-5 text-primary-600" />}
                </div>
              </div>
            </div>

            {aiResult && aiResult.confidenceScore >= AI_SUGGESTION_THRESHOLD && (
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 mb-4 flex items-center gap-3">
                <Brain className="w-5 h-5 text-violet-600 shrink-0" />
                <p className="text-sm text-violet-700 flex-1">
                  AI suggests: <strong>{getCategoryInfo(aiResult.detectedCategory).label}</strong> ({aiResult.confidenceScore}%)
                  {userOverride && <span className="text-violet-500"> (overridden)</span>}
                </p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">Category *</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                {EWASTE_CATEGORIES.map(cat => {
                  const isSelected = category === cat.id
                  const isAISuggested = aiResult?.detectedCategory === cat.id

                  return (
                    <button
                      key={cat.id}
                      onClick={() => handleCategoryChange(cat.id)}
                      className={`p-3 rounded-xl border-2 text-left transition-all relative min-h-[96px] flex flex-col ${
                        isSelected
                          ? 'border-primary-500 bg-primary-50'
                          : isAISuggested
                          ? 'border-violet-300 bg-violet-50/50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {isAISuggested && !isSelected && (
                        <span className="absolute -top-2 -right-2 w-5 h-5 bg-violet-500 rounded-full flex items-center justify-center">
                          <Sparkles className="w-3 h-3 text-white" />
                        </span>
                      )}

                      <span className="text-xl">{cat.icon}</span>
                      <p className="text-sm font-medium text-slate-800 mt-2 leading-tight">{cat.label}</p>
                    </button>
                  )
                })}
              </div>
              
              {userOverride && (
                <div className="mt-3 text-xs text-slate-600 bg-slate-100 border border-slate-200 p-2.5 rounded-lg flex items-start gap-2 animate-fade-in">
                  <span className="text-amber-500 text-sm mt-0.5">✎</span>
                  <span>
                    <strong>Thanks for the correction!</strong> We've noted that this is a <em>{getCategoryInfo(category).label}</em>, not {aiResult?.detectedCategory ? getCategoryInfo(aiResult.detectedCategory).label : 'what we thought'}. This helps train our model.
                  </span>
                </div>
              )}
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="E.g., Approximate quantity, specific items..."
                className="input min-h-[110px] resize-none"
              />
            </div>

            {formError && (
              <div className="card bg-red-50 border-red-200 p-3 mb-4 text-sm text-red-700">
                {formError}
              </div>
            )}

            <div className="sticky bottom-20 sm:bottom-4 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent pt-4">
              <button
                onClick={handleSubmit}
                disabled={!location || !category || submitting}
                className="btn-primary w-full"
              >
                {submitting ? <span className="spinner" /> : 'Submit Report'}
              </button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="animate-fade-in text-center py-12">
            <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-6">
              <Check className="w-10 h-10 text-primary-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">Report Submitted!</h2>
            <p className="text-gray-500">
              {isOnline
                ? 'Your e-waste report has been received.'
                : 'Saved locally. Will sync when online.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
// History Tab
function HistoryTab({
  reports,
  loading,
  feedbackMap,
  onFeedback
}: {
  reports: Report[]
  loading: boolean
  feedbackMap: Record<string, { isCorrect: boolean; correctedCategory?: CategoryId; submittedAt: string }>
  onFeedback: (report: Report, input: { isCorrect: boolean; correctedCategory?: CategoryId }) => void
}) {
  if (loading) {
    return (
      <div className="p-6 flex justify-center pt-20">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in mx-auto w-full max-w-3xl role-citizen">
      <div className="bg-white/90 border-b border-slate-200 px-4 py-4 backdrop-blur sm:px-6">
        <h1 className="text-heading text-slate-800">Report History</h1>
      </div>
      <div className="p-4 sm:p-6">
        {reports.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No reports yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map(report => {
              const cat = getCategoryInfo(report.category)
              const hasAI = Boolean(report.detectedObjectName)
              const feedback = feedbackMap[report.$id]
              return (
                <div key={report.$id} className="card p-4">
                  <div className="flex items-start gap-4">
                    <div className="text-3xl">{cat.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-semibold text-slate-800">{cat.label}</p>
                        <div className="flex items-center gap-2">
                          <span className={`badge ${getStatusColor(report.status)}`}>
                            {report.status}
                          </span>
                          <span className={`badge ${getVerificationColor(report.verificationStatus)}`}>
                            {report.verificationStatus || 'pending-review'}
                          </span>
                        </div>
                      </div>
                      {report.notes && (
                        <p className="text-sm text-gray-600 mb-2">{report.notes}</p>
                      )}

                      {hasAI && (
                        <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50 p-2.5">
                          <p className="text-xs text-violet-800">
                            AI predicted: {report.detectedObjectName} ({report.confidenceScore ?? 0}%)
                          </p>

                          {!feedback ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                onClick={() => onFeedback(report, { isCorrect: true })}
                                className="btn-secondary !min-h-0 px-2.5 py-1.5 text-xs"
                              >
                                <ThumbsUp className="w-3.5 h-3.5" />
                                Correct
                              </button>
                              <button
                                onClick={() => onFeedback(report, { isCorrect: false, correctedCategory: report.category as CategoryId })}
                                className="btn-secondary !min-h-0 px-2.5 py-1.5 text-xs"
                              >
                                <ThumbsDown className="w-3.5 h-3.5" />
                                Incorrect
                              </button>
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-emerald-700">
                              Feedback saved: {feedback.isCorrect ? 'Correct prediction' : `Incorrect, corrected as ${getCategoryInfo(feedback.correctedCategory || report.category).label}`}
                            </p>
                          )}
                        </div>
                      )}

                      <p className="text-xs text-gray-400">{timeAgo(report.createdAt)}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Profile Tab
function ProfileTab({
  userName, stats, onLogout
}: {
  userName: string
  stats: { total: number; pending: number; collected: number }
  onLogout: () => void
}) {
  const [notificationStatus, setNotificationStatus] = useState(getNotificationPermission())

  const handleEnableNotifications = async () => {
    const status = await requestNotificationPermission()
    setNotificationStatus(status)

    if (status === 'granted') {
      await ensurePushSubscription('citizen')
      toast.success('Notifications enabled on this device.')
      return
    }

    if (status === 'unsupported') {
      toast.message('This device/browser does not support push notifications.')
      return
    }

    toast.message('Notification permission was not granted. You can still receive in-app alerts.')
  }

  return (
    <div className="animate-fade-in mx-auto w-full max-w-3xl role-citizen">
      <div className="hero-panel rounded-none rounded-b-[24px] text-center px-4 pt-12 pb-8 sm:px-6">
        <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4 text-3xl">
          {userName.charAt(0).toUpperCase()}
        </div>
        <h1 className="text-xl font-semibold">{userName}</h1>
        <p className="text-primary-100 text-sm">Pune Citizen</p>
      </div>

      <div className="px-4 -mt-4 sm:px-6">
        {/* Stats */}
        <div className="card p-4 grid grid-cols-3 gap-4 text-center mb-6">
          <div>
            <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
            <p className="text-xs text-gray-500">Reports</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-primary-600">{stats.collected}</p>
            <p className="text-xs text-gray-500">Collected</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-500">{stats.pending}</p>
            <p className="text-xs text-gray-500">Pending</p>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <div className="card p-4">
            <p className="text-sm text-gray-500 mb-1">Impact</p>
            <p className="font-semibold text-slate-800">
              ~{(stats.collected * 2.5).toFixed(1)} kg e-waste recycled
            </p>
          </div>

          <button
            onClick={handleEnableNotifications}
            className="w-full card p-4 flex items-center gap-3 text-slate-700 hover:bg-slate-50 transition-colors"
            aria-label="Enable notifications"
          >
            <Bell className="w-5 h-5" />
            <span className="font-medium">
              {notificationStatus === 'granted' ? 'Notifications Enabled' : 'Enable Notifications'}
            </span>
          </button>

          <button
            onClick={onLogout}
            className="w-full card p-4 flex items-center gap-3 text-red-600 hover:bg-red-50 transition-colors"
            aria-label="Sign out"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  )
}
