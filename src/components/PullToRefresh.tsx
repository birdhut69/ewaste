import { useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void
  children: React.ReactNode
  threshold?: number
}

export function PullToRefresh({ onRefresh, children, threshold = 72 }: PullToRefreshProps) {
  const startYRef = useRef<number | null>(null)
  const distanceRef = useRef(0)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const resetPull = () => {
    startYRef.current = null
    distanceRef.current = 0
    setPullDistance(0)
  }

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (refreshing) return
    if (window.scrollY > 0) return
    startYRef.current = event.touches[0]?.clientY ?? null
  }

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (refreshing) return
    if (startYRef.current === null) return
    if (window.scrollY > 0) {
      resetPull()
      return
    }

    const currentY = event.touches[0]?.clientY ?? startYRef.current
    const rawDistance = Math.max(0, currentY - startYRef.current)

    // Apply resistance so pull does not stretch too far.
    const eased = Math.min(110, rawDistance * 0.45)
    distanceRef.current = eased
    setPullDistance(eased)

    if (rawDistance > 4) {
      event.preventDefault()
    }
  }

  const handleTouchEnd = async () => {
    if (refreshing) return
    const shouldRefresh = distanceRef.current >= threshold
    resetPull()

    if (!shouldRefresh) return

    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      {(refreshing || pullDistance > 0) && (
        <div className="sticky top-0 z-40 flex justify-center py-2">
          <div className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs text-slate-600 shadow-sm backdrop-blur">
            <span className="inline-flex items-center gap-2">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : pullDistance >= threshold ? 'Release to refresh' : 'Pull to refresh'}
            </span>
          </div>
        </div>
      )}
      {children}
    </div>
  )
}
