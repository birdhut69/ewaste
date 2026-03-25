import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AIProvider } from './lib/aiProvider'
import { AppToaster } from './components/AppToaster'
import { registerSW } from 'virtual:pwa-register'

const requiredEnvVars = [
  'VITE_APPWRITE_ENDPOINT',
  'VITE_APPWRITE_PROJECT_ID',
  'VITE_APPWRITE_DB_ID',
  'VITE_APPWRITE_BUCKET_PHOTOS',
  'VITE_APPWRITE_TEAM_ID_DRIVER',
  'VITE_APPWRITE_TEAM_ID_PMC',
] as const

const missingEnvVars = requiredEnvVars.filter((key) => {
  const value = (import.meta.env as Record<string, string | undefined>)[key]
  return !value
})

if (missingEnvVars.length > 0) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-xl w-full rounded-2xl border border-red-500/40 bg-red-950/30 p-6">
          <h1 className="text-2xl font-semibold mb-3">Missing App Configuration</h1>
          <p className="text-red-100 mb-4">
            The app cannot start until required environment variables are set.
          </p>
          <ul className="text-sm text-red-100 space-y-1 list-disc pl-5">
            {missingEnvVars.map((envKey) => (
              <li key={envKey}>{envKey}</li>
            ))}
          </ul>
        </div>
      </div>
    </StrictMode>
  )
} else {
  registerSW({ immediate: true })

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <AIProvider>
            <App />
          </AIProvider>
        </BrowserRouter>
        <AppToaster />
      </ErrorBoundary>
    </StrictMode>,
  )
}
