import { useState, useEffect, useCallback, useRef } from 'react'
import { LayoutDashboard, Map as MapIcon, Settings, LogOut, Menu, X, AlertTriangle, TrendingUp, Clock, CheckCircle, Package, MapPin, Bell, ShieldCheck, ShieldX, Search, User, PieChart, BarChart2, Activity, Cpu } from 'lucide-react'
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
    if (verifyingReportId) return

    let notes: string | undefined = undefined

    if (status === 'rejected') {
      const reason = window.prompt('Add rejection reason (required):', report.verificationNotes || '')
      if (!reason?.trim()) {
        toast.error('Rejection reason is required.')
        return
      }
      notes = reason.trim()
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
        className={`hidden md:flex flex-col bg-[#1a4731] text-white transition-all duration-300 ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        <div className="p-6 flex items-center justify-between">
          {sidebarOpen && (
            <div className="flex flex-col items-center w-full">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                <User className="w-8 h-8 text-emerald-800" />
              </div>
              <h2 className="text-white font-bold text-lg">Admin</h2>
              <span className="text-emerald-300 text-xs flex items-center gap-1 mt-1"><span className="w-2 h-2 rounded-full bg-emerald-400"></span> Online</span>
            </div>
          )}
          {!sidebarOpen && (
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <User className="w-4 h-4 text-emerald-800" />
            </div>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          {navItems.map(item => {
            const Icon = item.icon
            const isActive = activePage === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id as Page)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? 'bg-[#2d6a4f] text-white border-l-4 border-emerald-400'
                    : 'text-emerald-100 hover:bg-[#2d6a4f]'
                }`}
              >
                <Icon className="w-5 h-5" />
                {sidebarOpen && <span className="font-medium">{item.label}</span>}
              </button>
            )
          })}
        </nav>

        <div className="p-4">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-emerald-100 hover:bg-[#2d6a4f] rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-[#1a4731]/95 backdrop-blur text-white z-40 px-4 py-3 flex items-center justify-between border-b border-[#2d6a4f]/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Package className="w-4 h-4 text-emerald-800" />
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
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-[#1a4731] text-white p-4">
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
                      isActive ? 'bg-[#2d6a4f]' : 'hover:bg-[#2d6a4f]'
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
              className="w-full flex items-center gap-3 px-4 py-3 text-emerald-100 hover:bg-[#2d6a4f] rounded-xl mt-4"
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
            userName={userName}
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
  stats, hotspots, categoryBreakdown, reports, loading, verifyingReportId, onVerify, userName
}: {
  stats: { total: number; pending: number; inProgress: number; collected: number; avgDays: number }
  hotspots: Hotspot[]
  categoryBreakdown: Record<string, number>
  reports: Report[]
  loading: boolean
  verifyingReportId: string | null
  onVerify: (report: Report, status: VerificationStatus) => void
  userName?: string
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="spinner w-8 h-8" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto animate-fade-in bg-slate-50 min-h-full">
      {/* Topbar */}
      <div className="hidden md:flex items-center justify-between mb-8 bg-white p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-800 text-white rounded-full flex items-center justify-center">
            <Package className="w-5 h-5" />
          </div>
          <span className="font-bold text-slate-800 text-lg">Smart E-Waste Management System</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="relative">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="text" placeholder="Search..." className="pl-10 pr-4 py-2 bg-slate-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 w-64" />
          </div>
          <Bell className="w-5 h-5 text-gray-500 cursor-pointer hover:text-emerald-600" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
              <User className="w-5 h-5 text-emerald-800" />
            </div>
            <span className="text-sm font-medium text-slate-700">Admin</span>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Welcome, {userName || 'Anna'}!</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-5 bg-white border-t-4 border-t-slate-800 flex flex-col justify-center items-center text-center shadow-sm">
          <p className="text-3xl font-bold text-slate-800">{stats.total}</p>
          <span className="text-gray-500 text-sm mt-1">Total Reports</span>
        </div>

        <div className="card p-5 bg-amber-50 border border-amber-100 flex flex-col justify-center items-center text-center shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <p className="text-3xl font-bold text-amber-600">{stats.pending}</p>
          </div>
          <span className="text-amber-800/70 text-sm">Pending</span>
        </div>

        <div className="card p-5 bg-emerald-50 border border-emerald-100 flex flex-col justify-center items-center text-center shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
            <p className="text-3xl font-bold text-emerald-600">{stats.collected}</p>
          </div>
          <span className="text-emerald-800/70 text-sm">Collected</span>
        </div>

        <div className="card p-5 bg-red-50 border border-red-100 flex flex-col justify-center items-center text-center shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <ShieldX className="w-5 h-5 text-red-600" />
            <p className="text-3xl font-bold text-red-600">119</p>
          </div>
          <span className="text-red-800/70 text-sm">Hazardous</span>
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

      {/* Live Reports Map Placeholder */}
      <div className="card mb-6 shadow-sm overflow-hidden">
        <div className="p-4 border-b flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <h3 className="font-bold text-slate-800 shrink-0">Live Reports Map</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select className="text-sm border-gray-200 rounded-md py-1 max-w-[130px] sm:max-w-none"><option>Apr 10 - Apr 17</option></select>
            <select className="text-sm border-gray-200 rounded-md py-1"><option>All Categories</option></select>
            <select className="text-sm border-gray-200 rounded-md py-1"><option>All Statuses</option></select>
            <button className="bg-[#1a4731] text-white px-4 py-1.5 rounded-md text-sm font-medium">Filter</button>
          </div>
        </div>
        <div className="h-64 bg-slate-100 w-full relative">
          <div className="absolute inset-0 flex items-center justify-center">
            {/* Real map could go here, for now a placeholder text */}
            <span className="text-slate-400 font-medium">Map View</span>
          </div>
          <MapContainer center={[18.5204, 73.8567]} zoom={11} style={{ height: '100%', width: '100%', zIndex: 1 }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {hotspots.map((spot, i) => (
              <Circle key={i} center={[spot.latitude, spot.longitude]} radius={1500} pathOptions={{ color: 'orange', fillColor: 'orange', fillOpacity: 0.4, weight: 0 }} />
            ))}
          </MapContainer>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="font-bold text-slate-800 mb-4 text-lg">Reports Summary</h3>
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Category Distribution */}
          <div className="card p-6 shadow-sm">
            <h4 className="font-semibold text-slate-600 mb-4 text-center">Waste Categories</h4>
            <div className="relative w-32 h-32 mx-auto mb-4">
              <svg viewBox="0 0 36 36" className="w-full h-full">
                <path className="text-emerald-500" strokeWidth="4" strokeDasharray="64, 100" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path className="text-amber-500" strokeWidth="4" strokeDasharray="20, 100" strokeDashoffset="-64" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path className="text-red-500" strokeWidth="4" strokeDasharray="16, 100" strokeDashoffset="-84" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center font-bold text-slate-800">64%</div>
            </div>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500"></span>Collected</span><span>64%</span></div>
              <div className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-500"></span>Recyclable</span><span>20%</span></div>
              <div className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500"></span>Hazardous</span><span>16%</span></div>
            </div>
          </div>

          <div className="card p-6 shadow-sm">
            <h4 className="font-semibold text-slate-600 mb-4 text-center">E-Waste Collected</h4>
            <div className="h-32 flex items-end justify-around gap-2 px-4 mb-4">
              {[322, 534, 997, 690, 320].map((val, i) => (
                <div key={i} className="w-8 bg-[#2d6a4f] rounded-t-sm" style={{ height: `${(val/1000)*100}%` }}></div>
              ))}
            </div>
            <div className="flex justify-around text-xs text-slate-500">
              <span>Apr 11</span><span>Apr 12</span><span>Apr 15</span><span>Apr 16</span><span>Apr 17</span>
            </div>
          </div>

          <div className="card p-6 shadow-sm">
            <h4 className="font-semibold text-slate-600 mb-4 text-center">Collection Trends</h4>
            <div className="h-32 flex items-end justify-around px-4 mb-4 relative">
               <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                 <path d="M0 80 Q 25 70, 50 40 T 100 20 L 100 100 L 0 100 Z" fill="#d2f1e6" opacity="0.5" />
                 <path d="M0 80 Q 25 70, 50 40 T 100 20" fill="none" stroke="#00946c" strokeWidth="2" />
               </svg>
            </div>
            <div className="flex justify-between text-xs text-slate-500 px-2">
              <span>Dec</span><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Reports Table */}
      <div className="card overflow-hidden shadow-sm">
        <div className="p-4 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white">
          <h3 className="font-bold text-slate-800 text-lg">Reports List</h3>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>Show 10 entries</span> <select className="border-gray-200 rounded-md py-1"><option>Filter</option></select>
          </div>
        </div>
        {reports.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No reports yet. Waiting for citizen submissions.
          </div>
        ) : (
          <div className="overflow-x-auto bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-6 py-4 font-semibold text-slate-600">Report ID</th>
                  <th className="px-6 py-4 font-semibold text-slate-600">Waste Type</th>
                  <th className="px-6 py-4 font-semibold text-slate-600">Location</th>
                  <th className="px-6 py-4 font-semibold text-slate-600">Status</th>
                  <th className="px-6 py-4 font-semibold text-slate-600">Driver</th>
                  <th className="px-6 py-4 font-semibold text-slate-600">Accuracy</th>
                  <th className="px-6 py-4 font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reports.slice(0, 5).map((report, i) => {
                  const cat = getCategoryInfo(report.category)
                  return (
                    <tr key={report.$id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-700">{report.$id.slice(-5).toUpperCase()}</td>
                      <td className="px-6 py-4 text-slate-600">{cat.label}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {report.latitude.toFixed(2)}, {report.longitude.toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${report.status === 'collected' ? 'bg-emerald-100 text-emerald-700' : report.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                          {report.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center"><User className="w-3 h-3 text-emerald-800" /></div>
                        <span className="text-slate-600">Ajay</span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{report.confidenceScore || 85}%</td>
                      <td className="px-6 py-4">
                        {report.verificationStatus === 'approved' ? (
                          <span className="text-emerald-600 font-medium text-xs bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">Approved</span>
                        ) : report.verificationStatus === 'rejected' ? (
                          <span className="text-red-600 font-medium text-xs bg-red-50 px-2 py-1 rounded-md border border-red-100">Rejected</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onVerify(report, 'approved')}
                              disabled={verifyingReportId === report.$id}
                              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium rounded-md transition-colors disabled:opacity-50"
                            >
                              {verifyingReportId === report.$id ? '...' : 'Approve'}
                            </button>
                            <button
                              onClick={() => onVerify(report, 'rejected')}
                              disabled={verifyingReportId === report.$id}
                              className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium rounded-md transition-colors disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        <div className="card p-6 shadow-sm">
          <h4 className="font-semibold text-slate-800 mb-4">Analytics Overview</h4>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="font-medium text-slate-800">Hazardous items</p>
              <p className="text-red-600 font-bold">119</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-medium text-slate-800">AI Accuracy</p>
              <p className="text-emerald-600 font-bold">92%</p>
            </div>
          </div>
        </div>

        <div className="card p-6 shadow-sm bg-gradient-to-br from-emerald-50 to-white flex flex-col justify-center items-center relative overflow-hidden">
          <h4 className="font-semibold text-slate-800 mb-2 z-10">AI Accuracy</h4>
          <p className="text-5xl font-bold text-slate-800 z-10 mb-2">92%</p>
          <div className="absolute -bottom-4 -right-4 w-32 h-32 opacity-20">
             <Cpu className="w-full h-full text-emerald-600" />
          </div>
        </div>

        <div className="card p-6 shadow-sm">
           <h4 className="font-semibold text-slate-800 mb-4">Bin Fill Level</h4>
           <div className="space-y-4">
             <div>
               <div className="flex justify-between text-sm mb-1"><span className="text-slate-600">Zone A</span><span className="font-medium">79%</span></div>
               <div className="h-2 bg-slate-100 rounded-full"><div className="h-full bg-amber-500 rounded-full" style={{width: '79%'}}></div></div>
             </div>
             <div>
               <div className="flex justify-between text-sm mb-1"><span className="text-slate-600">Zone B</span><span className="font-medium">92%</span></div>
               <div className="h-2 bg-slate-100 rounded-full"><div className="h-full bg-red-500 rounded-full" style={{width: '92%'}}></div></div>
             </div>
             <div>
               <div className="flex justify-between text-sm mb-1"><span className="text-slate-600">Zone C</span><span className="font-medium">20%</span></div>
               <div className="h-2 bg-slate-100 rounded-full"><div className="h-full bg-emerald-500 rounded-full" style={{width: '20%'}}></div></div>
             </div>
           </div>
        </div>
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
          style={{ height: '100%', width: '100%', zIndex: 1 }}
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
