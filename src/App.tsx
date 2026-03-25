import { useState, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Auth from '@/pages/Auth'
import CitizenApp from '@/apps/citizen'
import PMCApp from '@/apps/pmc'
import DriverApp from '@/apps/driver'
import { getLocalSession, restoreSession, getStoredSession } from '@/lib/appwrite'
import { syncManager } from '@/lib/sync'
import { ensurePushSubscription } from '@/lib/push'
import type { UserRole } from '@/lib/types'
import { Skeleton, SkeletonLine } from '@/components/Skeleton'
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt'

function getRolePath(role: UserRole): '/citizen' | '/pmc' | '/driver' {
  switch (role) {
    case 'citizen':
      return '/citizen'
    case 'pmc':
      return '/pmc'
    case 'driver':
      return '/driver'
  }
}

function getDefaultPath(isAuthenticated: boolean, role: UserRole | null): '/auth' | '/citizen' | '/pmc' | '/driver' {
  if (!isAuthenticated || !role) return '/auth'
  return getRolePath(role)
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Check auth state and restore session on mount
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // First check if we have a stored session
        const storedSession = getStoredSession()

        if (storedSession) {
          // We have a stored session, try to restore it
          const restoredSession = await restoreSession()

          if (restoredSession) {
            setIsAuthenticated(true)
            setUserRole(restoredSession.role)
          } else {
            // Session expired or invalid, fall back to local check
            const { isAuth, role } = getLocalSession()
            setIsAuthenticated(isAuth)
            setUserRole(role)
          }
        } else {
          // No stored session, check local state
          const { isAuth, role } = getLocalSession()
          setIsAuthenticated(isAuth)
          setUserRole(role)
        }
      } catch (error) {
        console.error('Failed to restore session:', error)
        // Fall back to local session check
        const { isAuth, role } = getLocalSession()
        setIsAuthenticated(isAuth)
        setUserRole(role)
      } finally {
        setIsLoading(false)
      }
    }

    initializeApp()

    return () => {
      syncManager.destroy()
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      syncManager.destroy()
      return
    }

    syncManager.init()
    void ensurePushSubscription(userRole || undefined)

    return () => {
      syncManager.destroy()
    }
  }, [isAuthenticated, userRole])

  const handleLogin = () => {
    const { isAuth, role } = getLocalSession()
    setIsAuthenticated(isAuth)
    setUserRole(role)
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    setUserRole(null)
  }

  const renderProtectedRoute = (expectedRole: UserRole, app: JSX.Element) => {
    if (!isAuthenticated || !userRole) {
      return <Navigate to="/auth" replace />
    }

    if (userRole !== expectedRole) {
      return <Navigate to={getRolePath(userRole)} replace />
    }

    return app
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card p-6 text-center min-w-[220px]">
          <Skeleton className="w-12 h-12 mx-auto mb-4 rounded-full" />
          <SkeletonLine lines={2} />
        </div>
      </div>
    )
  }

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={<Navigate to={getDefaultPath(isAuthenticated, userRole)} replace />}
        />
        <Route
          path="/auth"
          element={
            !isAuthenticated || !userRole
              ? <Auth onLogin={handleLogin} />
              : <Navigate to={getRolePath(userRole)} replace />
          }
        />
        <Route
          path="/citizen"
          element={renderProtectedRoute('citizen', <CitizenApp onLogout={handleLogout} />)}
        />
        <Route
          path="/pmc"
          element={renderProtectedRoute('pmc', <PMCApp onLogout={handleLogout} />)}
        />
        <Route
          path="/driver"
          element={renderProtectedRoute('driver', <DriverApp onLogout={handleLogout} />)}
        />
        <Route
          path="*"
          element={<Navigate to={getDefaultPath(isAuthenticated, userRole)} replace />}
        />
      </Routes>
      <PWAInstallPrompt />
    </>
  )
}
