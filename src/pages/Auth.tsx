import { useEffect, useState } from 'react'
import {
  Recycle,
  Mail,
  ChevronRight,
  User,
  Truck,
  Building2,
  ShieldCheck,
  Settings2
} from 'lucide-react'
import { emailLogin, emailSignup, checkBackendReachability } from '@/lib/appwrite'
import type { UserRole } from '@/lib/types'
import { EmailSchema, PasswordSchema, UserRoleSchema } from '@/lib/validation'
import { toast } from 'sonner'

type AuthStep = 'role' | 'email'

interface AuthProps {
  onLogin: () => void
}

const ROLES: Array<{ id: UserRole; label: string; desc: string; icon: typeof User; accent: string }> = [
  { id: 'citizen', label: 'Citizen', desc: 'Report nearby e-waste with guided AI support.', icon: User, accent: 'bg-emerald-500/15 text-emerald-200' },
  { id: 'driver', label: 'Driver', desc: 'Collect and complete route stops with clarity.', icon: Truck, accent: 'bg-blue-500/20 text-blue-100' },
  { id: 'pmc', label: 'PMC Staff', desc: 'Track operations and service health city-wide.', icon: Building2, accent: 'bg-violet-500/20 text-violet-100' }
]

export default function Auth({ onLogin }: AuthProps) {
  const [step, setStep] = useState<AuthStep>('role')
  const [selectedRole, setSelectedRole] = useState<UserRole>('citizen')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isSignup, setIsSignup] = useState(false)
  const [connectionMessage, setConnectionMessage] = useState('')
  const [checkingConnection, setCheckingConnection] = useState(false)

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const roleParam = params.get('role')
      if (!roleParam) return
      const role = UserRoleSchema.safeParse(roleParam)
      if (!role.success) return
      setSelectedRole(role.data)
      setStep('email')
    } catch {
      // ignore
    }
  }, [])

  const selectedRoleMeta = ROLES.find((role) => role.id === selectedRole)

  const buildConnectivityHint = (): string => {
    const endpoint = (import.meta.env as Record<string, string | undefined>).VITE_APPWRITE_ENDPOINT || 'not set'
    return `Origin: ${window.location.origin} | Endpoint: ${endpoint}`
  }

  const toUserFacingError = (err: unknown, fallback: string): string => {
    const message = (err as { message?: string })?.message
    const lowered = message?.toLowerCase() || ''
    const isFetchFailure =
      lowered.includes('failed to fetch') ||
      lowered.includes('network') ||
      lowered.includes('cors')

    if (lowered.includes('unauthorized') || lowered.includes('invalid credentials')) {
      return 'Invalid email or password. If you are new here, create an account first.'
    }

    if (lowered.includes('already exists') || lowered.includes('already registered')) {
      return 'An account with this email already exists. Please sign in instead.'
    }

    if (lowered.includes('role access denied')) {
      return message || 'Role access denied for this account. Please login with your assigned role.'
    }

    if (isFetchFailure) {
      return (
        'Could not reach Appwrite from this device. Ensure your phone and backend are reachable and your current origin is allowlisted in Appwrite Platforms/CORS. ' +
        buildConnectivityHint()
      )
    }

    return message || fallback
  }

  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role)
    setStep('email')
    setError('')
  }



  const handleEmailLogin = async () => {
    const emailResult = EmailSchema.safeParse(email)
    const passwordResult = PasswordSchema.safeParse(password)
    const displayName = name.trim()

    if (!emailResult.success || !passwordResult.success) {
      const emailIssue = emailResult.success ? undefined : emailResult.error.issues[0]?.message
      const passwordIssue = passwordResult.success ? undefined : passwordResult.error.issues[0]?.message
      setError(emailIssue || passwordIssue || 'Please check your details.')
      return
    }

    if (isSignup && displayName.length < 2) {
      setError('Name must be at least 2 characters.')
      return
    }

    if (isSignup && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const role = UserRoleSchema.parse(selectedRole)
      if (isSignup) {
        await emailSignup(emailResult.data, passwordResult.data, displayName, role)
      } else {
        await emailLogin(emailResult.data, passwordResult.data, role)
      }
      onLogin()
    } catch (err) {
      const msg = toUserFacingError(err, isSignup ? 'Account creation failed.' : 'Login failed.')
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleConnectionCheck = async () => {
    setCheckingConnection(true)
    setConnectionMessage('')

    try {
      const result = await checkBackendReachability()
      const statusLine = result.status ? `Status ${result.status}. ` : ''
      const summary = `${statusLine}${result.details}`
      setConnectionMessage(`${summary} Origin: ${result.origin} | Endpoint: ${result.endpoint}`)

      if (result.ok) toast.success('Connection check passed.')
      else toast.error('Connection check failed. Review details below.')
    } finally {
      setCheckingConnection(false)
    }
  }

  return (
    <div className="min-h-screen role-citizen">
      <div className="screen-shell py-6 sm:py-10">
        <div className="grid gap-5 lg:grid-cols-[1.02fr_1fr] lg:gap-6">
          <section className="hero-panel min-h-[170px] sm:min-h-[230px] lg:min-h-[100%]">
            <div className="relative z-10">
              <p className="kicker text-white/75">Urban Circular Mission</p>
              <h1 className="text-display mt-3 text-white">Pune E-Waste Command</h1>
              <p className="text-body mt-4 max-w-lg text-white/85">
                A role-aware, mobile-first platform for reporting, routing, and collection operations across Pune.
              </p>

              <div className="mt-5 hidden sm:grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-panel border border-white/20 bg-white/10 p-3">
                  <p className="text-caption text-white/70">Citizen</p>
                  <p className="mt-1 text-sm font-semibold text-white">Report in under 30s</p>
                </div>
                <div className="rounded-panel border border-white/20 bg-white/10 p-3">
                  <p className="text-caption text-white/70">Driver</p>
                  <p className="mt-1 text-sm font-semibold text-white">Glanceable route actions</p>
                </div>
                <div className="rounded-panel border border-white/20 bg-white/10 p-3">
                  <p className="text-caption text-white/70">PMC</p>
                  <p className="mt-1 text-sm font-semibold text-white">Live operations oversight</p>
                </div>
              </div>

              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs text-white/90">
                <ShieldCheck className="h-4 w-4" />
                Appwrite-backed secure sessions
              </div>
            </div>

            <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-16 -left-12 h-52 w-52 rounded-full bg-accent-300/15 blur-2xl" />
          </section>

          <section className="card p-5 sm:p-6 lg:p-7">
            <header className="mb-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-caption text-primary-700">
                <Recycle className="h-3.5 w-3.5" />
                Sign in to continue
              </div>
              <h2 className="text-heading mt-3">{step === 'role' ? 'Choose your portal' : `Access ${selectedRoleMeta?.label || 'Portal'}`}</h2>
              <p className="muted-copy text-body mt-2">
                {step === 'role'
                  ? 'Select the role you are signing in as. You can switch later before login.'
                  : 'Enter your credentials to continue.'}
              </p>
            </header>

            {step === 'role' && (
              <div className="space-y-3 animate-fade-in">
                {ROLES.map((role) => {
                  const Icon = role.icon
                  return (
                    <button
                      key={role.id}
                      onClick={() => handleSelectRole(role.id)}
                      className="card card-hover w-full p-4 text-left"
                      aria-label={`Select role ${role.label}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-11 w-11 rounded-soft flex items-center justify-center ${role.accent}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-slate-900">{role.label}</p>
                          <p className="text-sm muted-copy">{role.desc}</p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-slate-400" />
                      </div>
                    </button>
                  )
                })}
              </div>
            )}



            {step === 'email' && (
              <div className="animate-fade-in space-y-4">
                <button onClick={() => setStep('role')} className="btn-ghost px-0 text-sm" aria-label="Back to role selection">
                  Back
                </button>

                <div>
                  <p className="font-semibold text-slate-900">{isSignup ? 'Create your account' : 'Sign in with email'}</p>
                  <p className="text-sm muted-copy mt-1">Use your work email for stable multi-device access.</p>
                </div>

                <div className="space-y-3">
                  {isSignup && (
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Full name"
                      className="input"
                      autoFocus
                      aria-label="Full name"
                    />
                  )}
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="input"
                    autoFocus={!isSignup}
                    aria-label="Email address"
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="input"
                    aria-label="Password"
                  />
                  {isSignup && (
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm password"
                      className="input"
                      aria-label="Confirm password"
                    />
                  )}
                </div>

                {error && <div className="state-surface-danger rounded-soft border p-3 text-sm">{error}</div>}

                <button onClick={handleEmailLogin} disabled={loading || !email || !password} className="btn-primary w-full" aria-label={isSignup ? 'Create account' : 'Login'}>
                  {loading ? <span className="spinner" /> : isSignup ? 'Create account' : 'Login'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setError('')
                    setIsSignup((prev) => !prev)
                  }}
                  className="w-full text-sm font-medium text-primary-700 hover:text-primary-800"
                >
                  {isSignup ? 'Already have an account? Login' : 'New user? Create account'}
                </button>

                <details className="rounded-soft border border-slate-200 bg-slate-50/80 p-3">
                  <summary className="cursor-pointer select-none text-sm font-medium text-slate-700 flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    Advanced diagnostics
                  </summary>
                  <div className="mt-3 space-y-3">
                    <p className="text-xs muted-copy">Run this if login fails on mobile network or LAN setup.</p>
                    <button
                      type="button"
                      onClick={handleConnectionCheck}
                      disabled={checkingConnection}
                      className="btn-secondary w-full"
                    >
                      {checkingConnection ? 'Checking backend connection...' : 'Run connection check'}
                    </button>
                    {connectionMessage && <p className="text-xs muted-copy break-words">{connectionMessage}</p>}
                  </div>
                </details>
              </div>
            )}
          </section>
        </div>

        <footer className="mt-5 text-center text-caption text-slate-500">
          Pune Municipal Corporation · E-Waste Operations Grid
        </footer>
      </div>
    </div>
  )
}
