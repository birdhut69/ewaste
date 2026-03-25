import { useState, useEffect, useCallback, useRef } from 'react'
import { LayoutDashboard, Map as MapIcon, Settings, LogOut, Menu, X, AlertTriangle, TrendingUp, Clock, CheckCircle, Package, MapPin, Bell, ShieldCheck, ShieldX } from 'lucide-react'
import { logout, getReports, getLocalSession, subscribeToReports, updateReportVerification, invalidateReportsCache } from '@/lib/appwrite'
import { detectHotspots, getCategoryInfo, getStatusColor, getVerificationColor, timeAgo, formatDate } from '@/lib/utils'
import { detectReportChanges, getNotificationPermission, notifyUser, requestNotificationPermission } from '@/lib/notifications'
import { ensurePushSubscription } from '@/lib/push'
import type { Report, Hotspot, VerificationStatus } from '@/lib/types'
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { toast } from 'sonner'
import { PullToRefresh } from '@/components/PullToRefresh'

// Fix Leaflet icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

type Page = 'dashboard' | 'map' | 'settings'

interface PMCAppProps {
  onLogout: () => void
}

export default function PMCApp({ onLogout }: PMCAppProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false)
  const [activePage, setActivePage] = useState<Page>('dashboard')
  const [reports, setReports] = useState<Report[]>([])
  const [hotspots, setHotspots] = useState<Hotspot[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [verifyingReportId, setVerifyingReportId] = useState<string | null>(null)
  const [notificationStatus, setNotificationStatus] = useState(getNotificationPermission())
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

      const data = await getReports()
      setLoadError('')
      setReports(data)
      const spots = detectHotspots(data, 2, 2)
      setHotspots(spots)
      lastLoadTsRef.current = Date.now()
    } catch (err) {
      console.error('Failed to load data:', err)
      setLoadError('Could not load dashboard data. Please check Appwrite configuration or network.')
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()

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

  const handleManualRefresh = async () => {
    await loadData(true)
  }

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
          title: 'New citizen report',
          body: `${category} submitted and waiting for pickup.`,
          dedupeKey: `pmc-created-${change.report.$id}`,
          tag: `pmc-${change.report.$id}`
        })
        continue
      }

      if (change.previousStatus === change.report.status) continue

      void notifyUser({
        title: 'Report status changed',
        body: `${category}: ${change.previousStatus} -> ${change.report.status}`,
        dedupeKey: `pmc-status-${change.report.$id}-${change.report.status}`,
        tag: `pmc-status-${change.report.$id}`
      })
    }
  }, [loading, reports])

  const handleEnableNotifications = async () => {
    const status = await requestNotificationPermission()
    setNotificationStatus(status)

    if (status === 'granted') {
      await ensurePushSubscription('pmc')
      toast.success('Admin notifications enabled.')
      return
    }

    if (status === 'unsupported') {
      toast.message('System notifications are not supported on this device.')
      return
    }

    toast.message('Notification permission not granted. In-app alerts remain active.')
  }

  const handleLogout = async () => {
    await logout()
    onLogout()
  }

  const handleVerification = async (report: Report, status: VerificationStatus) => {
    const notes = status === 'rejected'
      ? window.prompt('Add rejection reason (required):', report.verificationNotes || '')?.trim()
      : window.prompt('Optional verification note:', report.verificationNotes || '')?.trim()

    if (status === 'rejected' && !notes) {
      toast.error('Rejection reason is required.')
      return
    }

    try {
      setVerifyingReportId(report.$id)
      await updateReportVerification(report.$id, { status, notes })

      const reviewer = userName || 'PMC Reviewer'
      const verifiedAt = new Date().toISOString()

      setReports((prev) => prev.map((item) =>
        item.$id === report.$id
          ? {
              ...item,
              verificationStatus: status,
              verificationNotes: notes,
              verifiedBy: reviewer,
              verifiedAt
            }
          : item
      ))

      toast.success(`Image ${status === 'approved' ? 'approved' : 'rejected'}.`)
    } catch (error) {
      console.error('Failed to update verification:', error)
      toast.error('Could not update verification status.')
    } finally {
      setVerifyingReportId(null)
    }
  }

  const avgCollectionDays = reports.reduce(
    (acc, report) => {
      if (!report.collectedAt) return acc
      const createdTs = new Date(report.createdAt).getTime()
      const collectedTs = new Date(report.collectedAt).getTime()
      const elapsedDays = (collectedTs - createdTs) / (1000 * 60 * 60 * 24)

      if (!Number.isFinite(elapsedDays) || elapsedDays < 0) return acc

      return {
        totalDays: acc.totalDays + elapsedDays,
        count: acc.count + 1
      }
    },
    { totalDays: 0, count: 0 }
  )

  const stats = {
    total: reports.length,
    pending: reports.filter(r => r.status === 'pending').length,
    inProgress: reports.filter(r => r.status === 'in-progress').length,
    collected: reports.filter(r => r.status === 'collected').length,
    avgDays: avgCollectionDays.count > 0 ? avgCollectionDays.totalDays / avgCollectionDays.count : 0
  }

  const categoryBreakdown = reports.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'map', icon: MapIcon, label: 'Live Map' },
    { id: 'settings', icon: Settings, label: 'Settings' }
  ]

  return (
    <PullToRefresh onRefresh={handleManualRefresh}>
    <div className="flex h-screen role-pmc">
      {/* Sidebar - Desktop */}
      <aside
        className={`hidden md:flex flex-col bg-slate-900/95 text-white backdrop-blur-xl transition-all duration-300 ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        <div className="p-4 flex items-center justify-between border-b border-slate-700">
          {sidebarOpen && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
                <Package className="w-4 h-4" />
              </div>
              <span className="font-heading font-bold">PMC Portal</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map(item => {
            const Icon = item.icon
            const isActive = activePage === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id as Page)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-5 h-5" />
                {sidebarOpen && <span className="font-medium">{item.label}</span>}
              </button>
            )
          })}
        </nav>

        <div className="p-4 border-t border-slate-700">
          {sidebarOpen && (
            <div className="mb-4 p-3 bg-slate-800 rounded-xl">
              <p className="text-sm text-slate-400">Signed in as</p>
              <p className="font-medium truncate">{userName}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 rounded-xl transition-colors"
          >
            <LogOut className="w-5 h-5" />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-slate-900/95 backdrop-blur text-white z-40 px-4 py-3 flex items-center justify-between border-b border-slate-700/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
            <Package className="w-4 h-4" />
          </div>
          <span className="font-heading font-bold">PMC Portal</span>
        </div>
        <button
          onClick={() => setSidebarMobileOpen(!sidebarMobileOpen)}
          className="p-2"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile Sidebar */}
      {sidebarMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarMobileOpen(false)}
            aria-label="Close menu backdrop"
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-slate-900 text-white p-4">
            <div className="flex items-center justify-between mb-6">
              <span className="font-heading font-bold">Menu</span>
              <button onClick={() => setSidebarMobileOpen(false)} aria-label="Close menu">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="space-y-2">
              {navItems.map(item => {
                const Icon = item.icon
                const isActive = activePage === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActivePage(item.id as Page)
                      setSidebarMobileOpen(false)
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                      isActive ? 'bg-primary-600' : 'hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </nav>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 rounded-xl mt-4"
            >
              <LogOut className="w-5 h-5" />
              <span>Logout</span>
            </button>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto md:pt-0 pt-16">
        {loadError && (
          <div className="m-4 md:m-6 card state-surface-danger p-3 text-sm">
            {loadError}
          </div>
        )}

        {activePage === 'dashboard' && (
          <Dashboard
            stats={stats}
            hotspots={hotspots}
            categoryBreakdown={categoryBreakdown}
            reports={reports}
            loading={loading}
            verifyingReportId={verifyingReportId}
            onVerify={handleVerification}
          />
        )}
        {activePage === 'map' && <MapView reports={reports} hotspots={hotspots} />}
        {activePage === 'settings' && (
          <SettingsPage
            notificationStatus={notificationStatus}
            onEnableNotifications={handleEnableNotifications}
          />
        )}
      </main>
    </div>
    </PullToRefresh>
  )
}

// Dashboard Component
function Dashboard({
  stats, hotspots, categoryBreakdown, reports, loading, verifyingReportId, onVerify
}: {
  stats: { total: number; pending: number; inProgress: number; collected: number; avgDays: number }
  hotspots: Hotspot[]
  categoryBreakdown: Record<string, number>
  reports: Report[]
  loading: boolean
  verifyingReportId: string | null
  onVerify: (report: Report, status: VerificationStatus) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="spinner w-8 h-8" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6">
        <p className="kicker">Operations Console</p>
        <h1 className="text-heading text-slate-900 mt-2">City Collection Dashboard</h1>
        <p className="muted-copy">Live overview of e-waste service health across Pune.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-5 border-l-4 border-l-accent-500">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-gray-500 text-sm">Total Reports</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
        </div>

        <div className="card p-5 border-l-4 border-l-amber-500">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <span className="text-gray-500 text-sm">Pending</span>
          </div>
          <p className="text-3xl font-bold text-amber-600">{stats.pending}</p>
        </div>

        <div className="card p-5 border-l-4 border-l-emerald-500">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <span className="text-gray-500 text-sm">Collected</span>
          </div>
          <p className="text-3xl font-bold text-emerald-600">{stats.collected}</p>
        </div>

        <div className="card p-5 border-l-4 border-l-violet-500">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-violet-600" />
            </div>
            <span className="text-gray-500 text-sm">Avg Days</span>
          </div>
          <p className="text-3xl font-bold text-violet-600">{stats.avgDays.toFixed(1)}</p>
        </div>
      </div>

      {/* Hotspots Alert */}
      {hotspots.length > 0 && (
        <div className="card state-surface-danger p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="font-semibold">
                {hotspots.length} Hotspot{hotspots.length !== 1 ? 's' : ''} Detected
              </h3>
              <p className="text-sm mt-1">
                Areas with high concentration of pending reports need attention.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Category Distribution */}
        <div className="card p-6">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-gray-400" />
            Category Distribution
          </h3>
          <div className="space-y-3">
            {Object.entries(categoryBreakdown).map(([category, count]) => {
              const cat = getCategoryInfo(category)
              const percentage = (count / stats.total) * 100
              return (
                <div key={category}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="flex items-center gap-2">
                      <span>{cat.icon}</span>
                      <span className="text-slate-700">{cat.label}</span>
                    </span>
                    <span className="font-medium text-slate-900">{count}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Hotspots List */}
        <div className="card p-6">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-gray-400" />
            Collection Hotspots
          </h3>
          {hotspots.length > 0 ? (
            <div className="space-y-3">
              {hotspots.slice(0, 5).map((spot, i) => (
                <div key={i} className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-800">
                      Zone {i + 1}
                    </p>
                    <span className="badge badge-pending">{spot.reportCount} reports</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {spot.latitude.toFixed(4)}, {spot.longitude.toFixed(4)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm text-center py-8">
              No hotspots detected. Distribution is even.
            </p>
          )}
        </div>
      </div>

      {/* Recent Reports Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-slate-800">Recent Reports</h3>
        </div>
        {reports.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No reports yet. Waiting for citizen submissions.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 text-left text-sm">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-600">#</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Category</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Location</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Verification</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {reports.slice(0, 10).map((report, i) => {
                  const cat = getCategoryInfo(report.category)
                  return (
                    <tr key={report.$id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-500">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>{cat.icon}</span>
                          <span className="text-sm font-medium text-slate-800">{cat.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {report.latitude.toFixed(3)}, {report.longitude.toFixed(3)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${getStatusColor(report.status)}`}>
                          {report.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${getVerificationColor(report.verificationStatus)}`}>
                          {report.verificationStatus || 'pending-review'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {timeAgo(report.createdAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Verification Queue */}
      <div className="card p-6 mt-6">
        <h3 className="font-semibold text-slate-800 mb-4">Image Verification Queue</h3>

        {reports.filter(r => r.photoUrl).length === 0 ? (
          <p className="text-sm text-gray-500">No image reports available for verification.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {reports
              .filter((report) => report.photoUrl)
              .slice(0, 12)
              .map((report) => {
                const cat = getCategoryInfo(report.category)
                const isBusy = verifyingReportId === report.$id
                const verificationStatus = report.verificationStatus || 'pending-review'

                return (
                  <div key={report.$id} className="card p-4">
                    <img
                      src={report.photoUrl}
                      alt={`Uploaded ${cat.label}`}
                      className="w-full h-40 object-cover rounded-lg border border-slate-200 mb-3"
                    />

                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="font-semibold text-slate-800 truncate">{cat.icon} {cat.label}</p>
                      <span className={`badge ${getVerificationColor(verificationStatus)}`}>
                        {verificationStatus}
                      </span>
                    </div>

                    {report.verificationNotes && (
                      <p className="text-xs text-gray-600 mb-2">Note: {report.verificationNotes}</p>
                    )}

                    <p className="text-xs text-gray-500 mb-3">{timeAgo(report.createdAt)}</p>

                    <div className="flex gap-2">
                      <button
                        onClick={() => onVerify(report, 'approved')}
                        disabled={isBusy}
                        className="btn-secondary flex-1 text-sm"
                      >
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        Approve
                      </button>
                      <button
                        onClick={() => onVerify(report, 'rejected')}
                        disabled={isBusy}
                        className="btn-secondary flex-1 text-sm"
                      >
                        <ShieldX className="w-4 h-4 text-red-600" />
                        Reject
                      </button>
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

// Map View
function MapView({ reports, hotspots }: { reports: Report[]; hotspots: Hotspot[] }) {
  // Center of Pune
  const center: [number, number] = [18.5204, 73.8567]
  
  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="p-4 bg-white border-b shadow-sm z-10 flex justify-between items-center">
        <h1 className="text-xl font-heading font-bold text-slate-900">Live E-Waste Map</h1>
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500"></span>
            <span>Pending ({reports.filter(r => r.status === 'pending').length})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
            <span>Collected ({reports.filter(r => r.status === 'collected').length})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500/50 border border-red-500"></span>
            <span>Hotspots ({hotspots.length})</span>
          </div>
        </div>
      </div>
      
      <div className="flex-1 relative z-0">
        <MapContainer 
          center={center} 
          zoom={12} 
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          
          {/* Hotspots - Heatmap style circles */}
          {hotspots.map((spot, i) => (
            <Circle 
              key={`hotspot-${i}`}
              center={[spot.latitude, spot.longitude]}
              radius={800} // 800m radius
              pathOptions={{ 
                color: '#ef4444', 
                fillColor: '#ef4444', 
                fillOpacity: 0.2,
                weight: 1
              }}
            >
              <Popup>
                <div className="text-center">
                  <p className="font-bold text-red-600">High Density Zone</p>
                  <p className="text-sm">{spot.reportCount} reports nearby</p>
                  <p className="text-xs text-gray-500">Detected: {timeAgo(spot.detectedAt)}</p>
                </div>
              </Popup>
            </Circle>
          ))}

          {/* Individual Report Markers */}
          {reports.map((report) => {
            // Validate coordinates before rendering
            if (!Number.isFinite(report.latitude) || !Number.isFinite(report.longitude)) {
              console.warn('Invalid coordinates for report:', report.$id, report.latitude, report.longitude)
              return null
            }
            
            const catInfo = getCategoryInfo(report.category)
            
            // Skip if collected to reduce clutter, or make them smaller/transparent
            if (report.status === 'collected') return null
            
            return (
              <Marker 
                key={report.$id} 
                position={[report.latitude, report.longitude]}
              >
                <Popup>
                  <div className="min-w-[180px]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm flex items-center gap-1">
                        <span className="text-lg">{catInfo.icon}</span>
                        {catInfo.label}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${getStatusColor(report.status)} uppercase`}>
                        {report.status}
                      </span>
                    </div>
                    
                    {report.photoUrl && (
                      <img 
                        src={report.photoUrl} 
                        alt="E-waste" 
                        className="w-full h-24 object-cover rounded-lg mb-2 bg-gray-100"
                      />
                    )}
                    
                    {report.notes && <p className="text-xs text-gray-600 italic mb-2 bg-gray-50 p-1.5 rounded">"{report.notes}"</p>}
                    
                    <div className="text-xs text-gray-400 mt-1 flex justify-between">
                      <span>Reported by: Citizen</span>
                      <span>{timeAgo(report.createdAt)}</span>
                    </div>
                    
                    {report.detectedObjectName && (
                      <div className="mt-2 pt-2 border-t flex items-center gap-1 text-[10px] text-violet-600">
                        <span className="font-bold">AI Detected:</span> {report.detectedObjectName} ({report.confidenceScore}%)
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>
      </div>
    </div>
  )
}

// Settings Page
function SettingsPage({
  notificationStatus,
  onEnableNotifications
}: {
  notificationStatus: NotificationPermission | 'unsupported'
  onEnableNotifications: () => void
}) {
  const [settings, setSettings] = useState({
    frequency: 'daily',
    threshold: 5,
    notifications: true
  })

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-heading font-bold text-slate-900 mb-6">Settings</h1>

      <div className="card p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Collection Frequency
          </label>
          <select
            value={settings.frequency}
            onChange={(e) => setSettings(s => ({ ...s, frequency: e.target.value }))}
            className="input"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Bi-weekly</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Hotspot Alert Threshold (reports)
          </label>
          <input
            type="number"
            value={settings.threshold}
            onChange={(e) => setSettings(s => ({ ...s, threshold: parseInt(e.target.value) || 5 }))}
            min={1}
            max={20}
            className="input"
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-800">Email Notifications</p>
            <p className="text-sm text-gray-500">Receive alerts for new hotspots</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={settings.notifications}
              onChange={(e) => setSettings(s => ({ ...s, notifications: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
          </label>
        </div>

        <button
          type="button"
          onClick={onEnableNotifications}
          className="btn-secondary w-full"
        >
          <Bell className="w-4 h-4" />
          {notificationStatus === 'granted' ? 'System Notifications Enabled' : 'Enable System Notifications'}
        </button>

        <button className="btn-primary w-full mt-4" onClick={() => toast.success('Settings saved!')}>
          Save Preferences
        </button>
      </div>
    </div>
  )
}
