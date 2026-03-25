import React from 'react'
import { toast } from 'sonner'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    // Avoid leaking internal details to users.
    toast.error('Something went wrong. Please try again.')
    console.error('Unhandled error caught by ErrorBoundary:', error)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full card p-6 text-center">
          <p className="kicker justify-center">System Recovery</p>
          <p className="text-heading text-slate-900 mt-2 mb-2">Unexpected error</p>
          <p className="text-body muted-copy mb-5">The app encountered an issue. Reload to recover your session safely.</p>
          <button
            className="btn-primary w-full"
            onClick={() => window.location.reload()}
            aria-label="Reload application"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}

