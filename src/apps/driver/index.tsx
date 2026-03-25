import { useState, useEffect, useCallback, useRef } from 'react'
import { Navigation, List, Map, CheckCircle, Clock, LogOut, Play, MapPin, Phone, ChevronRight, RefreshCw, WifiOff, Bell } from 'lucide-react'
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
  const [view, setView] = useState<View>('list')
  const [allReports, setAllReports] = useState<Report[]>([])
  const [stops, setStops] = useState<RouteStop[]>([])
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationError, setLocationError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [routeStarted, setRouteStarted] = useState(false)
  const [currentStopIndex, setCurrentStopIndex] = useState(0)
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

      const pendingReports = reports.filter((report) => report.status === 'pending')

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

      setStops(prev => {
        const remainingStops = prev.filter(s => s.$id !== reportId)
        const nextStops = remainingStops.map((stop, index) => ({
          ...stop,
          order: index + 1
        }))

        setCurrentStopIndex((prevIndex) => Math.min(prevIndex, Math.max(nextStops.length - 1, 0)))

        return nextStops
      })
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
    <div className="min-h-screen role-driver">
      {/* Offline Banner */}
      {!online && (
        <div className="state-surface-warning border-b text-center py-2 text-sm flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4" />
          Offline mode. Collections will sync when connected.
        </div>
      )}

      {/* Header */}
      <header className="hero-panel rounded-none rounded-b-[24px] px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/75 text-sm">Hi, {userName}</p>
            <h1 className="text-lg font-semibold">Today's Route</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleEnableNotifications}
              className="p-2 hover:bg-black/20 rounded-lg"
              title={notificationStatus === 'granted' ? 'Notifications enabled' : 'Enable notifications'}
              aria-label={notificationStatus === 'granted' ? 'Notifications enabled' : 'Enable notifications'}
            >
              <Bell className="w-5 h-5" />
            </button>
            <button onClick={handleLogout} className="p-2 hover:bg-black/20 rounded-lg" aria-label="Logout">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-white/10 backdrop-blur rounded-panel p-3 text-center">
            <p className="text-2xl font-bold">{pendingStops.length}</p>
            <p className="text-xs text-white/70">Pending</p>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-panel p-3 text-center">
            <p className="text-2xl font-bold text-emerald-400">{collectedStops.length}</p>
            <p className="text-xs text-white/70">Collected</p>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-panel p-3 text-center">
            <p className="text-2xl font-bold">{allReports.length}</p>
            <p className="text-xs text-white/70">Total</p>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-panel p-3 text-center">
            <p className="text-2xl font-bold">{totalDistance.toFixed(1)}</p>
            <p className="text-xs text-white/70">km total</p>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setView('list')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-colors ${
              view === 'list' ? 'bg-white text-slate-900' : 'bg-black/20 text-white'
            }`}
            aria-label="Show route list"
          >
            <List className="w-4 h-4" />
            <span className="text-sm font-medium">List</span>
          </button>
          <button
            onClick={() => setView('map')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-colors ${
              view === 'map' ? 'bg-white text-slate-900' : 'bg-black/20 text-white'
            }`}
            aria-label="Show map view"
          >
            <Map className="w-4 h-4" />
            <span className="text-sm font-medium">Map</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-3xl p-4 pb-24">
        {loadError && (
          <div className="card border-red-200 bg-red-50 p-3 mb-4 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="spinner w-8 h-8" />
          </div>
        ) : allReports.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-800 mb-2">No Reports Yet</h2>
            <p className="text-gray-500">Waiting for pickup requests to appear.</p>
          </div>
        ) : view === 'list' ? (
          <div className="space-y-3">
            {pendingStops.length === 0 && (
              <div className="card p-5 text-center">
                <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <h2 className="text-lg font-semibold text-slate-800 mb-1">All Done!</h2>
                <p className="text-sm text-gray-500">No pending pickups. Check recent and history below.</p>
              </div>
            )}

            {/* Current Stop Highlight */}
            {routeStarted && currentStop && currentStop.status === 'pending' && (
              <div className="card bg-primary-50 border-2 border-primary-500 p-4 mb-4">
                <div className="flex items-center gap-2 text-primary-700 text-sm font-medium mb-2">
                  <Navigation className="w-4 h-4" />
                  Next Stop
                </div>
                <div className="flex gap-4">
                  <div className="text-3xl">{getCategoryInfo(currentStop.category).icon}</div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">
                      {getCategoryInfo(currentStop.category).label}
                    </p>
                    {currentStop.notes && (
                      <p className="text-sm text-gray-600 mt-1">{currentStop.notes}</p>
                    )}
                    {currentStop.distance && (
                      <p className="text-sm text-primary-600 mt-1 font-medium">
                        {currentStop.distance.toFixed(1)} km away
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => handleNavigate(currentStop.latitude, currentStop.longitude)}
                    className="btn-primary flex-1"
                  >
                    <Navigation className="w-4 h-4" />
                    Navigate
                  </button>
                  <button
                    onClick={() => handleMarkCollected(currentStop.$id)}
                    className="btn bg-emerald-500 text-white hover:bg-emerald-600 flex-1"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Mark Collected
                  </button>
                </div>
              </div>
            )}

            {/* Pending Stops */}
            {stops.map((stop, i) => {
              const cat = getCategoryInfo(stop.category)
              const isCurrent = routeStarted && i === currentStopIndex && stop.status === 'pending'
              const isPast = stop.status === 'collected'
              
              if (isCurrent) return null // Already shown above
              
              return (
                <div
                  key={stop.$id}
                  className={`card p-4 ${isPast ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="relative">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                        isPast
                          ? 'bg-emerald-100 text-emerald-600'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {isPast ? <CheckCircle className="w-4 h-4" /> : stop.order}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-slate-800 flex items-center gap-2">
                          <span>{cat.icon}</span>
                          {cat.label}
                        </p>
                        <div className="flex gap-2">
                          <span className={`badge ${getStatusColor(stop.status)}`}>
                            {stop.status}
                          </span>
                          <span className={`badge ${getVerificationColor(stop.verificationStatus)}`}>
                            {stop.verificationStatus || 'pending-review'}
                          </span>
                        </div>
                      </div>
                      {stop.notes && (
                        <p className="text-sm text-gray-500 mt-1 truncate">{stop.notes}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {stop.latitude.toFixed(3)}, {stop.longitude.toFixed(3)}
                        </span>
                        {stop.distance && (
                          <span>{stop.distance.toFixed(1)} km</span>
                        )}
                      </div>
                    </div>
                    {!isPast && (
                      <button
                        onClick={() => handleNavigate(stop.latitude, stop.longitude)}
                        className="p-2 text-gray-400 hover:text-primary-600"
                        aria-label={`Navigate to stop ${stop.order}`}
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    )}
                  </div>

                  {!isPast && !routeStarted && (
                    <div className="flex gap-2 mt-3 pt-3 border-t">
                      <button
                        onClick={() => handleNavigate(stop.latitude, stop.longitude)}
                        className="btn-secondary flex-1 text-sm"
                      >
                        <Navigation className="w-4 h-4" />
                        Navigate
                      </button>
                      <button
                        onClick={() => handleMarkCollected(stop.$id)}
                        className="btn bg-emerald-500 text-white hover:bg-emerald-600 flex-1 text-sm"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Collected
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            <div className="pt-2">
              <h3 className="text-sm font-semibold text-slate-600 mb-2">Recent Reports</h3>
              <div className="space-y-2">
                {recentReports.map((report) => {
                  const cat = getCategoryInfo(report.category)
                  return (
                    <div key={`recent-${report.$id}`} className="card p-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{cat.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{cat.label}</p>
                          <p className="text-xs text-gray-500">{report.createdAt ? new Date(report.createdAt).toLocaleString() : 'Just now'}</p>
                        </div>
                        <div className="flex gap-1">
                          <span className={`badge ${getStatusColor(report.status)}`}>{report.status}</span>
                          <span className={`badge ${getVerificationColor(report.verificationStatus)}`}>{report.verificationStatus || 'pending-review'}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="pt-2">
              <h3 className="text-sm font-semibold text-slate-600 mb-2">Collection History</h3>
              {historyReports.length === 0 ? (
                <div className="card p-4 text-sm text-gray-500">No collected history yet.</div>
              ) : (
                <div className="space-y-2">
                  {historyReports.map((report) => {
                    const cat = getCategoryInfo(report.category)
                    return (
                      <div key={`history-${report.$id}`} className="card p-3 border-emerald-100 bg-emerald-50/30">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{cat.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{cat.label}</p>
                            <p className="text-xs text-gray-500">
                              Collected {report.collectedAt ? new Date(report.collectedAt).toLocaleString() : 'recently'}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <span className="badge badge-collected">collected</span>
                            <span className={`badge ${getVerificationColor(report.verificationStatus)}`}>
                              {report.verificationStatus || 'pending-review'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Map View */
          <div className="h-[calc(100vh-200px)] rounded-xl overflow-hidden shadow-sm border border-slate-200 relative z-0">
            {currentLocation ? (
              <MapContainer 
                center={[currentLocation.lat, currentLocation.lng]} 
                zoom={14} 
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <MapUpdater center={[currentLocation.lat, currentLocation.lng]} />
                
                {/* Current Location Marker */}
                <Marker position={[currentLocation.lat, currentLocation.lng]}>
                  <Popup>You are here</Popup>
                </Marker>

                {/* Report Markers */}
                {allReports.map((stop, index) => {
                  const isPending = stop.status === 'pending'
                  const catInfo = getCategoryInfo(stop.category)
                  
                  return (
                    <Marker 
                      key={stop.$id} 
                      position={[stop.latitude, stop.longitude]}
                      opacity={isPending ? 1 : 0.5}
                    >
                      <Popup>
                        <div className="min-w-[160px]">
                          <p className="font-semibold text-sm flex items-center gap-1 mb-1">
                            <span className="text-lg">{catInfo.icon}</span>
                            {index + 1}. {catInfo.label}
                          </p>
                          <p className={`text-xs px-2 py-0.5 rounded-full inline-block mb-2 ${getStatusColor(stop.status)}`}>
                            {stop.status}
                          </p>
                          <p className={`text-xs px-2 py-0.5 rounded-full inline-block mb-2 ml-1 ${getVerificationColor(stop.verificationStatus)}`}>
                            {stop.verificationStatus || 'pending-review'}
                          </p>
                          {stop.notes && <p className="text-xs text-gray-500 italic mb-2">"{stop.notes}"</p>}
                          
                          {isPending && (
                            <div className="flex gap-1 mt-1">
                              <button 
                                onClick={() => handleNavigate(stop.latitude, stop.longitude)}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs py-1 px-2 rounded flex-1"
                              >
                                Navigate
                              </button>
                              <button 
                                onClick={() => handleMarkCollected(stop.$id)}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs py-1 px-2 rounded flex-1"
                              >
                                Collect
                              </button>
                            </div>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  )
                })}
              </MapContainer>
            ) : (
              <div className="h-full flex items-center justify-center bg-gray-100">
                <div className="text-center p-4">
                  <div className="spinner mb-3 mx-auto"></div>
                  <p className="text-gray-500">Getting your location...</p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom Action */}
      {!loading && stops.length > 0 && pendingStops.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t p-4 pb-safe">
          {!routeStarted ? (
            <button onClick={handleStartRoute} className="btn-primary w-full">
              <Play className="w-5 h-5" />
              Start Route ({pendingStops.length} stops)
            </button>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Progress</p>
                <p className="font-semibold text-slate-800">
                  {collectedStops.length} of {stops.length} collected
                </p>
              </div>
              <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${(collectedStops.length / stops.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Location Error Toast */}
      {locationError && (
        <div className="fixed bottom-20 left-4 right-4 bg-amber-500 text-white px-4 py-3 rounded-xl text-sm">
          {locationError}. Using approximate location.
        </div>
      )}
    </div>
    </PullToRefresh>
  )
}
