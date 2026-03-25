import type { Report, Hotspot, EWASTE_CATEGORIES } from './types'

// Format relative time
export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// Format date
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Haversine distance in km
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

// Detect hotspots from reports
export function detectHotspots(
  reports: Report[],
  radiusKm: number = 2,
  minCount: number = 3
): Hotspot[] {
  const hotspots: Hotspot[] = []
  const processed = new Set<string>()
  
  for (const report of reports) {
    if (processed.has(report.$id)) continue
    
    const nearby = reports.filter(r => {
      const dist = haversineDistance(
        report.latitude, report.longitude,
        r.latitude, r.longitude
      )
      return dist <= radiusKm
    })
    
    if (nearby.length >= minCount) {
      const categories = [...new Set(nearby.map(r => r.category))]
      const avgLat = nearby.reduce((s, r) => s + r.latitude, 0) / nearby.length
      const avgLng = nearby.reduce((s, r) => s + r.longitude, 0) / nearby.length
      
      hotspots.push({
        latitude: avgLat,
        longitude: avgLng,
        concentration: nearby.length / (Math.PI * radiusKm * radiusKm),
        categories,
        reportCount: nearby.length,
        detectedAt: new Date().toISOString()
      })
      
      nearby.forEach(r => processed.add(r.$id))
    }
  }
  
  return hotspots.sort((a, b) => b.reportCount - a.reportCount)
}

// Optimize route using nearest neighbor algorithm
export function optimizeRoute(
  stops: Array<{ latitude: number; longitude: number; [key: string]: any }>,
  startLat?: number,
  startLng?: number
): typeof stops {
  if (stops.length <= 1) return stops
  
  const result: typeof stops = []
  const remaining = [...stops]
  
  let currentLat = startLat ?? stops[0].latitude
  let currentLng = startLng ?? stops[0].longitude
  
  while (remaining.length > 0) {
    let nearestIdx = 0
    let nearestDist = Infinity
    
    for (let i = 0; i < remaining.length; i++) {
      const dist = haversineDistance(
        currentLat, currentLng,
        remaining[i].latitude, remaining[i].longitude
      )
      if (dist < nearestDist) {
        nearestDist = dist
        nearestIdx = i
      }
    }
    
    const nearest = remaining.splice(nearestIdx, 1)[0]
    result.push(nearest)
    currentLat = nearest.latitude
    currentLng = nearest.longitude
  }
  
  return result
}

// Calculate total route distance
export function calculateRouteDistance(
  stops: Array<{ latitude: number; longitude: number }>
): number {
  let total = 0
  for (let i = 1; i < stops.length; i++) {
    total += haversineDistance(
      stops[i-1].latitude, stops[i-1].longitude,
      stops[i].latitude, stops[i].longitude
    )
  }
  return total
}

// Get category info
export function getCategoryInfo(categoryId: string): { label: string; icon: string } {
  const categories: Record<string, { label: string; icon: string }> = {
    mobile: { label: 'Mobile Phones', icon: '📱' },
    computer: { label: 'Computers & Laptops', icon: '💻' },
    monitor: { label: 'Monitors & TVs', icon: '🖥️' },
    cable: { label: 'Cables & Wires', icon: '🔌' },
    battery: { label: 'Batteries', icon: '🔋' },
    appliance: { label: 'Home Appliances', icon: '🏠' },
    other: { label: 'Other E-Waste', icon: '♻️' }
  }
  return categories[categoryId] || { label: categoryId, icon: '📦' }
}

// Status badge colors
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700 border-amber-200',
    assigned: 'bg-blue-100 text-blue-700 border-blue-200',
    'in-progress': 'bg-orange-100 text-orange-700 border-orange-200',
    collected: 'bg-emerald-100 text-emerald-700 border-emerald-200'
  }
  return colors[status] || 'bg-gray-100 text-gray-700 border-gray-200'
}

export function getVerificationColor(status?: string): string {
  const colors: Record<string, string> = {
    'pending-review': 'bg-slate-100 text-slate-700 border-slate-200',
    approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    rejected: 'bg-red-100 text-red-700 border-red-200'
  }

  return colors[status || 'pending-review'] || colors['pending-review']
}

// Generate unique ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// Debounce function
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>
  return (...args) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), ms)
  }
}

// Check if online
export function isOnline(): boolean {
  return navigator.onLine
}
