import { useEffect, useMemo, useState } from 'react'
import { Download, X } from 'lucide-react'

type InstallChoiceOutcome = 'accepted' | 'dismissed'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: InstallChoiceOutcome; platform: string }>
  prompt: () => Promise<void>
}

const DISMISS_KEY = 'ewaste_pwa_install_dismissed'

function isStandaloneMode(): boolean {
  const mediaQueryMatch = window.matchMedia('(display-mode: standalone)').matches
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return mediaQueryMatch || iosStandalone
}

function isIOSDevice(): boolean {
  const ua = window.navigator.userAgent.toLowerCase()
  return /iphone|ipad|ipod/.test(ua)
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    setIsInstalled(isStandaloneMode())
    setIsIOS(isIOSDevice())

    const initiallyDismissed = localStorage.getItem(DISMISS_KEY) === '1'
    setDismissed(initiallyDismissed)

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
      localStorage.removeItem(DISMISS_KEY)
      setDismissed(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const canInstall = useMemo(
    () => !isInstalled && !dismissed && (Boolean(deferredPrompt) || isIOS),
    [deferredPrompt, dismissed, isInstalled, isIOS]
  )

  const handleInstall = async () => {
    if (!deferredPrompt) {
      if (isIOS) {
        setShowIOSGuide(true)
      }
      return
    }

    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice

    if (choice.outcome === 'accepted') {
      setDeferredPrompt(null)
      return
    }

    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  if (!canInstall) return null

  return (
    <div className="fixed right-4 bottom-24 z-50 sm:right-6 sm:bottom-6">
      <div className="card max-w-xs border-primary-200/70 bg-white/95 p-3 backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-soft bg-primary-100 p-2 text-primary-700">
            <Download className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Install Pune E-Waste app</p>
            <p className="mt-0.5 text-xs muted-copy">Launch faster from home screen with stronger offline behavior.</p>
            <button onClick={handleInstall} className="btn-primary mt-2 text-sm px-3 py-2" aria-label="Install PWA on this device">
              {deferredPrompt ? 'Install App' : 'Show Install Steps'}
            </button>
            {showIOSGuide && isIOS && (
              <div className="state-surface-warning mt-2 rounded-soft border p-2 text-xs space-y-1">
                <p>Safari iPhone install:</p>
                <p>1. Tap Share icon.</p>
                <p>2. Tap Add to Home Screen.</p>
                <p>3. Tap Add.</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Dismiss install prompt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
