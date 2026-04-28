import { useState, useEffect, useCallback, useRef } from 'react'
import { Navigation, List, Map, CheckCircle, Clock, LogOut, Play, MapPin, Phone, ChevronRight, RefreshCw, WifiOff, Bell, LayoutDashboard, Truck, FileText, Settings, User, Package, Search, Camera, Upload, AlertCircle, Menu, X } from 'lucide-react'
import { logout, getReports, updateReportStatus, getLocalSession, subscribeToReports, invalidateReportsCache } from '@/lib/appwrite'
import { optimizeRoute, calculateRouteDistance, getCategoryInfo, getStatusColor, getVerificationColor, haversineDistance, isOnline } from '@/lib/utils'
import type { Report } from '@/lib/types'
import { detectReportChanges, getNotificationPermission, notifyUser, requestNotificationPermission } from '@/lib/notifications'
import { ensurePushSubscription } from '@/lib/push'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { toast } from 'sonner'
import { PullToRefresh } from '@/components/PullToRefresh'
import { requestCurrentLocation, startLocationTracking } from '@/lib/location'

// Fix Leaflet icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

const MapUpdater = ({ center }: { center: [number, number] }) => {
  const map = useMap()
  useEffect(() => {
    map.flyTo(center, 15)
  }, [center, map])
  return null
}

type View = 'list' | 'map'

interface DriverAppProps {
  onLogout: () => void
}

interface RouteStop extends Report {
  order: number
  distance?: number
}

export default function DriverApp({ onLogout }: DriverAppProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'route' | 'completed' | 'notifications' | 'reports' | 'settings'>('route')
  const [allReports, setAllReports] = useState<Report[]>([])
  const [stops, setStops] = useState<RouteStop[]>([])
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationError, setLocationError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [routeStarted, setRouteStarted] = useState(false)
  const [currentStopIndex, setCurrentStopIndex] = useState(0)
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false)
  const [online, setOnline] = useState(isOnline())
  const [notificationStatus, setNotificationStatus] = useState(getNotificationPermission())
  const { userName } = getLocalSession()
  const previousStopsRef = useRef<RouteStop[] | null>(null)
  const loadingRef = useRef(false)
  const lastLoadTsRef = useRef(0)

  const loadStops = useCallback(async (force = false) => {
    if (!currentLocation) return
    const now = Date.now()
    if (!force && loadingRef.current) return
    if (!force && now - lastLoadTsRef.current < 1500) return

    loadingRef.current = true

    try {
      if (force) {
        invalidateReportsCache()
      }

      const reports = await getReports()
      setLoadError('')

      setAllReports(reports)

      const pendingReports = reports.filter((report) => report.status === 'pending' && report.verificationStatus !== 'rejected')

      const optimized = optimizeRoute(
        pendingReports,
        currentLocation.lat,
        currentLocation.lng
      ).map((stop, i) => ({
        ...stop,
        order: i + 1,
        distance: haversineDistance(currentLocation.lat, currentLocation.lng, stop.latitude, stop.longitude)
      }))

      setStops(optimized as RouteStop[])
      lastLoadTsRef.current = Date.now()
    } catch (err) {
      console.error('Failed to load stops:', err)
      setLoadError('Could not load pending pickups. Please check your connection and retry.')
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [currentLocation])

  // Online/offline tracking
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

  // Get current location
  useEffect(() => {
    requestCurrentLocation()
      .then((location) => {
        setCurrentLocation({ lat: location.lat, lng: location.lng })
        setLocationError(location.source === 'cached' ? 'Using last known location.' : '')
      })
      .catch((error) => {
        setLocationError((error as Error)?.message || 'Could not get location')
        setCurrentLocation({ lat: 18.5204, lng: 73.8567 })
      })

    const stopWatch = startLocationTracking(
      (location) => {
        setCurrentLocation({ lat: location.lat, lng: location.lng })
        if (location.source === 'live') {
          setLocationError('')
        }
      },
      (message) => {
        setLocationError(message)
      }
    )

    return () => stopWatch()
  }, [])

  // Load pending reports
  useEffect(() => {
    void loadStops()
  }, [loadStops])

  useEffect(() => {
    const unsubscribe = subscribeToReports(() => {
      void loadStops(true)
    })

    return () => unsubscribe()
  }, [loadStops])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadStops(true)
      }
    }

    const handleFocus = () => {
      void loadStops(true)
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
    }
  }, [loadStops])

  const handleManualRefresh = async () => {
    await loadStops(true)
  }

  useEffect(() => {
    if (loading) return

    const previousStops = previousStopsRef.current
    previousStopsRef.current = stops

    if (!previousStops) return

    const changes = detectReportChanges(previousStops as Report[], stops as Report[])
    for (const change of changes) {
      if (change.type !== 'created' || change.report.status !== 'pending') continue

      const category = getCategoryInfo(change.report.category).label
      void notifyUser({
        title: 'New pickup request',
        body: `${category} added to today’s route.`,
        dedupeKey: `driver-pending-${change.report.$id}`,
        tag: `driver-${change.report.$id}`
      })
    }
  }, [loading, stops])

  const handleEnableNotifications = async () => {
    const status = await requestNotificationPermission()
    setNotificationStatus(status)

    if (status === 'granted') {
      await ensurePushSubscription('driver')
      toast.success('Driver notifications enabled.')
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

  const handleStartRoute = () => {
    setRouteStarted(true)
    setCurrentStopIndex(0)
  }

  const handleMarkCollected = async (reportId: string) => {
    try {
      await updateReportStatus(reportId, 'collected')
      const collectedAt = new Date().toISOString()

      setAllReports(prev =>
        prev.map(report =>
          report.$id === reportId
            ? { ...report, status: 'collected', collectedAt }
            : report
        )
      )

      setStops(prev =>
        prev.map(stop =>
          stop.$id === reportId ? { ...stop, status: 'collected' } : stop
        )
      )

      setCurrentStopIndex(prev => prev + 1)
    } catch (err) {
      console.error('Failed to mark collected:', err)
      toast.error('Could not update pickup status. Please try again.')
    }
  }

  const handleNavigate = (lat: number, lng: number) => {
    // Open in Google Maps or Apple Maps
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
    window.open(url, '_blank')
  }

  const pendingStops = allReports.filter(s => s.status === 'pending')
  const collectedStops = allReports.filter(s => s.status === 'collected')
  const recentReports = allReports.slice(0, 6)
  const historyReports = collectedStops.slice(0, 8)
  const totalDistance = currentLocation
    ? calculateRouteDistance(optimizeRoute(allReports, currentLocation.lat, currentLocation.lng))
    : 0
  const currentStop = routeStarted ? stops[currentStopIndex] : null

  return (
    <PullToRefresh onRefresh={handleManualRefresh}>
    <div className="flex h-screen overflow-hidden bg-[#f4f7f6]">
      {/* Sidebar */}
      <aside className="w-64 bg-[#1a4731] text-white flex flex-col hidden md:flex">
        <div className="p-6 flex flex-col items-center border-b border-[#2d6a4f]/50">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-3 relative">
            <img src="https://i.pravatar.cc/150?img=11" alt="Driver Profile" className="w-full h-full rounded-full object-cover border-4 border-white" />
          </div>
          <h2 className="text-white font-bold text-lg">Driver</h2>
          <span className="text-emerald-300 text-xs flex items-center gap-1 mt-1"><span className="w-2 h-2 rounded-full bg-emerald-400"></span> Online</span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'route', icon: Navigation, label: 'Today\'s Route' },
            { id: 'completed', icon: CheckCircle, label: 'Completed Pickups' },
            { id: 'notifications', icon: Bell, label: 'Notifications', badge: pendingStops.length },
            { id: 'reports', icon: FileText, label: 'Reports' },
            { id: 'settings', icon: Settings, label: 'Settings' }
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all ${
                item.id === activeTab
                  ? 'bg-[#2d6a4f] text-white border-l-4 border-emerald-400'
                  : 'text-emerald-100 hover:bg-[#2d6a4f]'
              }`}
            >
              <div className="flex items-center gap-3">
                <item.icon className="w-5 h-5" />
                <span className="font-medium text-sm">{item.label}</span>
              </div>
              {item.badge && <span className="bg-[#1a4731] text-white text-xs font-bold px-2 py-0.5 rounded-full">{item.badge}</span>}
            </button>
          ))}
        </nav>
        
        <div className="p-4 mt-auto border-t border-[#2d6a4f]/50">
           <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 text-emerald-100 hover:bg-[#2d6a4f] rounded-lg">
             <LogOut className="w-5 h-5" /> <span className="font-medium text-sm">Logout</span>
           </button>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      {sidebarMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarMobileOpen(false)}
            aria-label="Close menu backdrop"
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-[#1a4731] text-white p-4 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <span className="font-heading font-bold">Driver Menu</span>
              <button onClick={() => setSidebarMobileOpen(false)} aria-label="Close menu">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex flex-col items-center border-b border-[#2d6a4f]/50 pb-6 mb-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-3 relative">
                <img src="https://i.pravatar.cc/150?img=11" alt="Driver Profile" className="w-full h-full rounded-full object-cover border-2 border-white" />
              </div>
              <h2 className="text-white font-bold">{userName || 'Driver'}</h2>
            </div>

            <nav className="flex-1 space-y-2">
              {[
                { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
                { id: 'route', icon: Navigation, label: 'Today\'s Route' },
                { id: 'completed', icon: CheckCircle, label: 'Completed Pickups' },
                { id: 'notifications', icon: Bell, label: 'Notifications', badge: pendingStops.length },
                { id: 'reports', icon: FileText, label: 'Reports' },
                { id: 'settings', icon: Settings, label: 'Settings' }
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id as any)
                    setSidebarMobileOpen(false)
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all ${
                    item.id === activeTab
                      ? 'bg-[#2d6a4f] text-white border-l-4 border-emerald-400'
                      : 'text-emerald-100 hover:bg-[#2d6a4f]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium text-sm">{item.label}</span>
                  </div>
                  {item.badge && <span className="bg-[#1a4731] text-white text-xs font-bold px-2 py-0.5 rounded-full">{item.badge}</span>}
                </button>
              ))}
            </nav>
            <div className="mt-auto border-t border-[#2d6a4f]/50 pt-4">
               <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 text-emerald-100 hover:bg-[#2d6a4f] rounded-lg">
                 <LogOut className="w-5 h-5" /> <span className="font-medium text-sm">Logout</span>
               </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Topbar */}
        <div className="flex items-center justify-between bg-white px-4 md:px-8 py-4 shadow-sm z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarMobileOpen(true)} className="md:hidden p-1 text-slate-600">
              <Menu className="w-6 h-6" />
            </button>
            <div className="w-8 h-8 bg-emerald-800 text-white rounded-full flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
            <span className="font-bold text-slate-800 text-lg hidden md:block">Smart E-Waste Management System</span>
            <span className="font-bold text-slate-800 text-lg md:hidden">E-Waste</span>
          </div>
          <div className="flex items-center gap-6">
             <Bell className="w-5 h-5 text-gray-500 cursor-pointer" />
             <div className="flex items-center gap-2">
               <img src="https://i.pravatar.cc/150?img=11" alt="Driver" className="w-8 h-8 rounded-full border border-gray-200" />
               <span className="text-sm font-medium text-slate-700 hidden sm:block">Driver</span>
             </div>
          </div>
        </div>

        {!online && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-center py-2 text-sm flex items-center justify-center gap-2">
            <WifiOff className="w-4 h-4" />
            You're offline. Map and syncing may be limited.
          </div>
        )}

        <main className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold text-slate-800 mb-6">
              {activeTab === 'route' ? (
                <>Welcome, <span className="text-emerald-800">{userName || 'Driver'}!</span></>
              ) : (
                [
                  { id: 'dashboard', label: 'Dashboard' },
                  { id: 'completed', label: 'Completed Pickups' },
                  { id: 'notifications', label: 'Notifications' },
                  { id: 'reports', label: 'Reports' },
                  { id: 'settings', label: 'Settings' }
                ].find(t => t.id === activeTab)?.label
              )}
            </h1>

            {['dashboard', 'route'].includes(activeTab) && (
              <div className="grid lg:grid-cols-[1fr_350px] gap-6">
              
              {/* Left Column */}
              <div className="space-y-6">
                
                {/* Today's Tasks & Map */}
                <div className="card p-6 shadow-sm">
                  <h3 className="font-bold text-slate-800 text-lg mb-1">Today's Tasks</h3>
                  <div className="flex items-end gap-2 mb-4">
                    <span className="text-4xl font-bold text-slate-800">{stops.length}</span>
                    <span className="text-slate-600 font-medium mb-1">Pickups</span>
                  </div>
                  <p className="text-sm text-slate-500 mb-4">{pendingStops.length} pending / {collectedStops.length} completed</p>
                  
                  <div className="h-64 w-full bg-slate-100 rounded-xl overflow-hidden relative">
                    {currentLocation ? (
                      <MapContainer center={[currentLocation.lat, currentLocation.lng]} zoom={13} style={{ height: '100%', width: '100%', zIndex: 1 }}>
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <Marker position={[currentLocation.lat, currentLocation.lng]}><Popup>You are here</Popup></Marker>
                        {stops.map(stop => (
                          <Marker key={stop.$id} position={[stop.latitude, stop.longitude]} opacity={stop.status === 'collected' ? 0.5 : 1} />
                        ))}
                      </MapContainer>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-400">Loading Map...</div>
                    )}
                  </div>
                </div>

                {/* Today's Route List */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-slate-800 text-lg">Today's Route</h3>
                    {stops.length > 0 && !routeStarted ? (
                      <button onClick={handleStartRoute} className="bg-[#1a4731] hover:bg-[#2d6a4f] text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors shadow-sm">
                        <Play className="w-4 h-4" /> Start Route
                      </button>
                    ) : routeStarted ? (
                      <span className="bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Route Active
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-3 relative">
                    <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-gray-200 z-0 hidden sm:block"></div>
                    
                    {stops.map((stop, i) => {
                      const isPast = stop.status === 'collected'
                      const isCurrent = routeStarted && !isPast && i === currentStopIndex
                      return (
                        <div key={stop.$id} className={`card p-4 flex items-center gap-4 relative z-10 shadow-sm transition-all ${isCurrent ? 'ring-2 ring-emerald-500 bg-emerald-50/50 scale-[1.02]' : 'bg-white'}`}>
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0 transition-colors ${isPast ? 'bg-[#1a4731] text-white' : isCurrent ? 'bg-emerald-500 text-white shadow-md' : 'bg-emerald-100 text-emerald-800'}`}>
                            {stop.order}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className={`font-bold text-sm sm:text-base truncate ${isCurrent ? 'text-emerald-900' : 'text-slate-800'}`}>Pickup {stop.order} Pune</h4>
                            <div className="flex items-center gap-2 sm:gap-4 mt-1 text-xs text-gray-500">
                               <span className="flex items-center gap-1 font-medium text-slate-600"><Package className="w-3 h-3" /> {getCategoryInfo(stop.category).label}</span>
                               <span className="hidden sm:inline">{stop.distance?.toFixed(1)} km away</span>
                            </div>
                          </div>
                          <div className="text-right">
                             {isPast ? (
                               <button className="px-4 py-2 bg-[#1a4731] text-white text-sm font-medium rounded-lg opacity-80 cursor-default">Completed</button>
                             ) : (
                               <div className="text-xs text-gray-500 flex flex-col items-end">
                                 <span>Scheduled: {i+1}:00 PM</span>
                                 <button 
                                   onClick={() => handleMarkCollected(stop.$id)} 
                                   disabled={!routeStarted}
                                   className={`mt-2 font-semibold px-3 py-1.5 rounded-md transition-colors ${
                                     routeStarted 
                                       ? isCurrent ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm' : 'text-emerald-600 hover:bg-emerald-50'
                                       : 'text-gray-400 cursor-not-allowed bg-gray-50'
                                   }`}
                                 >
                                   Mark Done
                                 </button>
                               </div>
                             )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                
                {/* Pickup Progress */}
                <div className="card p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-slate-800 text-lg">Pickup Progress</h3>
                    <span className="text-emerald-600 font-bold text-lg">{Math.round((stops.filter(s => s.status === 'collected').length / Math.max(1, stops.length)) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full mb-6 overflow-hidden">
                    <div className="h-full bg-[#1a4731] transition-all duration-500" style={{width: `${(stops.filter(s => s.status === 'collected').length / Math.max(1, stops.length)) * 100}%`}}></div>
                  </div>
                  <div className="space-y-4">
                    {stops.slice(0, 5).map(stop => (
                      <div key={stop.$id} className="flex items-center gap-3">
                         <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${stop.status === 'collected' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300'}`}>
                           {stop.status === 'collected' && <CheckCircle className="w-3 h-3" />}
                         </div>
                         <span className={`text-sm ${stop.status === 'collected' ? 'text-slate-800 font-medium' : 'text-gray-500'}`}>Pickup {stop.order}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Upload Proof */}
                <div className="card p-6 shadow-sm">
                  <h3 className="font-bold text-slate-800 text-lg mb-4">Upload Proof Photo</h3>
                  <div className="w-full aspect-video bg-emerald-50 rounded-xl mb-4 flex flex-col items-center justify-center border-2 border-dashed border-emerald-200">
                     <Camera className="w-8 h-8 text-emerald-400 mb-2" />
                     <span className="text-sm font-medium text-emerald-700">Capture Proof</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => toast.success('Proof photo saved locally and ready for sync.')} className="flex-1 bg-[#1a4731] hover:bg-[#2d6a4f] text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                      <Camera className="w-4 h-4" /> Take Photo
                    </button>
                    <button onClick={() => toast.success('Upload dialog opened')} className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center border border-slate-200 transition-colors">
                      <Upload className="w-4 h-4 text-slate-600" />
                    </button>
                  </div>
                </div>

                {/* Daily Summary */}
                <div className="card p-6 shadow-sm bg-gradient-to-br from-emerald-50 to-white border border-emerald-100">
                  <h3 className="font-bold text-slate-800 text-lg mb-6">Daily Summary</h3>
                  <div className="space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-[#1a4731] text-white rounded-xl flex items-center justify-center">
                        <Truck className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-lg font-bold text-slate-800">{stops.length} Pickups</p>
                        <p className="text-xs text-slate-500">Total Route</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-[#1a4731] text-white rounded-xl flex items-center justify-center">
                        <MapPin className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-lg font-bold text-slate-800">{totalDistance.toFixed(2)} km</p>
                        <p className="text-xs text-slate-500">Total Distance</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-[#1a4731] text-white rounded-xl flex items-center justify-center">
                        <Package className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-lg font-bold text-slate-800">~ 45 kg</p>
                        <p className="text-xs text-slate-500">Total E-Waste</p>
                      </div>
                    </div>
                  </div>
                  <button className="w-full mt-6 bg-[#1a4731] text-white py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 shadow-sm">
                    <Upload className="w-4 h-4" /> Finalize Summary
                  </button>
                </div>
              </div>
            </div>
            )}

            {activeTab === 'completed' && (
              <div className="card p-6 shadow-sm">
                <div className="space-y-4">
                  {collectedStops.length === 0 ? (
                    <p className="text-slate-500 text-center py-8">No completed pickups yet today.</p>
                  ) : (
                    collectedStops.map(stop => (
                      <div key={stop.$id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-[#1a4731] flex items-center justify-center text-white">
                            <CheckCircle className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-800">{getCategoryInfo(stop.category).label}</h4>
                            <span className="text-xs text-slate-500">Collected at {new Date(stop.collectedAt || stop.createdAt).toLocaleTimeString()}</span>
                          </div>
                        </div>
                        <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">Verified</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {['notifications', 'reports', 'settings'].includes(activeTab) && (
              <div className="card p-12 shadow-sm text-center flex flex-col items-center justify-center min-h-[300px]">
                <Settings className="w-12 h-12 text-slate-300 mb-4" />
                <h3 className="text-lg font-bold text-slate-700">Module under construction</h3>
                <p className="text-slate-500 mt-2">This feature is being prepared for the next release.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
    </PullToRefresh>
  )
}
