export interface DeviceLocation {
  lat: number
  lng: number
  accuracy?: number
  timestamp: number
  source: 'live' | 'cached'
}

interface LocationOptions {
  highAccuracyTimeoutMs?: number
  fallbackTimeoutMs?: number
  maximumAgeMs?: number
}

const LOCATION_CACHE_KEY = 'ewaste_last_location'

function saveLastLocation(location: DeviceLocation): void {
  try {
    localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(location))
  } catch {
    // Ignore localStorage failures.
  }
}

export function getLastKnownLocation(): DeviceLocation | null {
  try {
    const raw = localStorage.getItem(LOCATION_CACHE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as DeviceLocation
    if (typeof value?.lat !== 'number' || typeof value?.lng !== 'number') return null
    return value
  } catch {
    return null
  }
}

function normalizeError(error: GeolocationPositionError): string {
  if (error.code === 1) return 'Location permission denied. Please allow location access in browser settings.'
  if (error.code === 2) return 'Location unavailable. Move to open sky and try again.'
  return 'Location request timed out. Please try again.'
}

function getCurrentPosition(opts: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, opts)
  })
}

export async function requestCurrentLocation(options?: LocationOptions): Promise<DeviceLocation> {
  if (!('geolocation' in navigator)) {
    const fallback = getLastKnownLocation()
    if (fallback) return { ...fallback, source: 'cached' }
    throw new Error('Geolocation is not supported on this device.')
  }

  const highAccuracyTimeoutMs = options?.highAccuracyTimeoutMs ?? 9000
  const fallbackTimeoutMs = options?.fallbackTimeoutMs ?? 11000
  const maximumAgeMs = options?.maximumAgeMs ?? 25000

  try {
    const high = await getCurrentPosition({
      enableHighAccuracy: true,
      timeout: highAccuracyTimeoutMs,
      maximumAge: 0,
    })

    const location: DeviceLocation = {
      lat: high.coords.latitude,
      lng: high.coords.longitude,
      accuracy: high.coords.accuracy,
      timestamp: Date.now(),
      source: 'live',
    }
    saveLastLocation(location)
    return location
  } catch (highError) {
    try {
      const low = await getCurrentPosition({
        enableHighAccuracy: false,
        timeout: fallbackTimeoutMs,
        maximumAge: maximumAgeMs,
      })

      const location: DeviceLocation = {
        lat: low.coords.latitude,
        lng: low.coords.longitude,
        accuracy: low.coords.accuracy,
        timestamp: Date.now(),
        source: 'live',
      }
      saveLastLocation(location)
      return location
    } catch (fallbackError) {
      const cached = getLastKnownLocation()
      if (cached) {
        return { ...cached, source: 'cached' }
      }

      const err = (fallbackError as GeolocationPositionError) || (highError as GeolocationPositionError)
      throw new Error(normalizeError(err))
    }
  }
}

export function startLocationTracking(
  onUpdate: (location: DeviceLocation) => void,
  onError?: (message: string) => void,
): () => void {
  if (!('geolocation' in navigator)) {
    const cached = getLastKnownLocation()
    if (cached) onUpdate({ ...cached, source: 'cached' })
    else onError?.('Geolocation is not supported on this device.')
    return () => {}
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      const location: DeviceLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: Date.now(),
        source: 'live',
      }
      saveLastLocation(location)
      onUpdate(location)
    },
    (error) => {
      const cached = getLastKnownLocation()
      if (cached) {
        onUpdate({ ...cached, source: 'cached' })
        return
      }
      onError?.(normalizeError(error))
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 20000,
    },
  )

  return () => navigator.geolocation.clearWatch(watchId)
}
