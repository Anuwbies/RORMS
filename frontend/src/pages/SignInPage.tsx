import { useEffect, useRef, useState } from 'react'
import type { SyntheticEvent } from 'react'
import { 
  signInWithEmailAndPassword, 
  setPersistence, 
  browserLocalPersistence
} from 'firebase/auth'
import { auth } from '../firebase'
import { clearAuthSessionMode, saveAuthSessionMode } from '../utils/authSession'
import { Button } from '../components/Button'
import { TextInput } from '../components/TextInput'
import { ExclamationIcon } from '../components/Icons'
import { ArchitecturalBackground } from '../components/ArchitecturalBackground'
import { failedSignInAttempts, freshSignInAttempts, MAX_SIGN_IN_ATTEMPTS, readSignInAttempts, SIGN_IN_ATTEMPTS_KEY, writeSignInAttempts, type SignInAttempts } from '../utils/signInAttempts'

function loadSignInAttempts(fallback = freshSignInAttempts()): SignInAttempts {
  try { return readSignInAttempts(window.localStorage, fallback) }
  catch { return fallback.lockedUntil > 0 && fallback.lockedUntil <= Date.now()
    ? { failures: 0, lockedUntil: 0, lockouts: fallback.lockouts } : fallback }
}

function saveSignInAttempts(attempts: SignInAttempts): void {
  try { writeSignInAttempts(window.localStorage, attempts) }
  catch { /* Keep enforcing the limit in memory when browser storage is unavailable. */ }
}

const heroSlides = [
  {
    image: '/upang_main_building.jpg',
    headline: 'University of Pangasinan\nRoom Management System',
    subtitle: 'Streamlined classroom and laboratory scheduling for PHINMA UPang faculty and students.',
  },
  {
    image: '/upang_campus_stairs.jpg',
    headline: 'Modern Campus Facilities,\nConnected Academic Spaces',
    subtitle: 'Empowering academic heads and instructors with real-time room reservations and scheduling clarity.',
  },
  {
    image: '/upang_classroom_halls.jpg',
    headline: 'Smart Room Allocation,\nEfficient Hallway Management',
    subtitle: 'Transparent workflows for administrators, deans, program heads, and instructors across campus.',
  },
]

interface SignInPageProps {
  sessionError?: string | null
  onSignIn: () => void
  onForgotPassword: () => void
  currentSlide: number
  onSlideChange: (slide: number) => void
}

function SignInPage({ sessionError, onSignIn, onForgotPassword, currentSlide, onSlideChange }: SignInPageProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [attempts, setAttempts] = useState(loadSignInAttempts)
  const [now, setNow] = useState(Date.now)
  const submitting = useRef(false)
  const remainingSeconds = Math.max(0, Math.ceil((attempts.lockedUntil - now) / 1000))
  const isLocked = remainingSeconds > 0
  const cooldownMessage = isLocked
    ? `Too many failed attempts. Try again in ${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}.`
    : null

  useEffect(() => {
    const syncAttempts = () => {
      setNow(Date.now())
      setAttempts(current => loadSignInAttempts(current))
    }
    const handleStorage = (event: StorageEvent) => {
      if ((event.key === SIGN_IN_ATTEMPTS_KEY || event.key === null) && event.newValue === null) {
        setAttempts(freshSignInAttempts())
        setNow(Date.now())
        return
      }
      if (event.key === SIGN_IN_ATTEMPTS_KEY || event.key === null) syncAttempts()
    }
    window.addEventListener('storage', handleStorage)
    window.addEventListener('focus', syncAttempts)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('focus', syncAttempts)
    }
  }, [])

  useEffect(() => {
    if (!attempts.lockedUntil) return
    const timer = window.setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= attempts.lockedUntil) setAttempts(current => loadSignInAttempts(current))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [attempts.lockedUntil])

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submitting.current) return
    const currentAttempts = loadSignInAttempts(attempts)
    setAttempts(currentAttempts)
    setNow(Date.now())
    if (currentAttempts.lockedUntil > Date.now()) return
    submitting.current = true
    setLoading(true)
    setError(null)
    
    try {
      // Firebase's session persistence is tab-scoped; local persistence shares auth across tabs.
      await setPersistence(auth, browserLocalPersistence)
      saveAuthSessionMode(rememberMe)

      // App validates the profile before granting access and monitors it for deactivation.
      await signInWithEmailAndPassword(auth, email, password)
      saveSignInAttempts(freshSignInAttempts())
      setAttempts(freshSignInAttempts())
      onSignIn()
    } catch (err: unknown) {
      clearAuthSessionMode()
      console.error('Sign in error:', err)
      const code = err !== null && typeof err === 'object' && 'code' in err ? err.code : null
      if (['auth/invalid-email', 'auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential', 'auth/too-many-requests'].includes(String(code))) {
        const latestAttempts = loadSignInAttempts(currentAttempts)
        const nextAttempts = failedSignInAttempts(code === 'auth/too-many-requests'
          ? { ...latestAttempts, failures: MAX_SIGN_IN_ATTEMPTS - 1 } : latestAttempts)
        saveSignInAttempts(nextAttempts)
        setAttempts(nextAttempts)
        setNow(Date.now())
        const remaining = MAX_SIGN_IN_ATTEMPTS - nextAttempts.failures
        setError(remaining > 0
          ? `Incorrect email or password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : null)
        return
      }
      switch (code) {
        case 'auth/network-request-failed':
          setError('Unable to connect. Check your internet connection and try again. This does not count as a failed attempt.')
          break
        default:
          setError('Failed to sign in. Please try again.')
      }
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }

  return (
    <main className="relative h-screen w-screen max-h-screen overflow-hidden flex p-3 sm:p-4 lg:p-5 gap-6 lg:gap-8">
      {/* Architectural Blueprint & Topographic Campus Matrix Background */}
      <ArchitecturalBackground />

      {/* Left Hero Banner (60% Width) with Animated Carousel */}
      <section className="relative z-10 hidden lg:flex lg:w-[60%] h-full flex-col justify-between overflow-hidden rounded-2xl sm:rounded-3xl p-6 sm:p-8 lg:p-12 text-white shadow-2xl shrink-0 select-none border border-slate-200/40">
        {/* Background Image Carousel with Cross-fade */}
        {heroSlides.map((slide, idx) => (
          <div
            key={slide.image}
            className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out ${
              idx === currentSlide ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            style={{ backgroundImage: `url('${slide.image}')` }}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/50" />

        {/* Top Branding */}
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <img
              src="/logo2.png"
              alt="PHINMA UPang seal"
              className="h-12 w-12 shrink-0 rounded-full bg-white p-0.5 object-contain drop-shadow"
            />
            <div className="space-y-0.5">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/90">
                Room Track
              </p>
              <h1 className="text-sm font-semibold leading-tight text-white drop-shadow">
                Phinma UPANG Room Management System
              </h1>
            </div>
          </div>

          <div className="hidden sm:inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur-md">
            PHINMA Education
          </div>
        </div>

        {/* Bottom Headline & Interactive Carousel Indicators */}
        <div className="relative z-10 space-y-4">
          <div className="min-h-[100px] flex flex-col justify-end">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white drop-shadow-md whitespace-pre-line transition-all duration-500">
              {heroSlides[currentSlide].headline}
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-white/80 font-normal drop-shadow transition-all duration-500">
              {heroSlides[currentSlide].subtitle}
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            {heroSlides.map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Go to slide ${idx + 1}`}
                onClick={() => onSlideChange(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                  idx === currentSlide
                    ? 'w-10 bg-white'
                    : 'w-6 bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Right Form Area (40% Width) */}
      <section className="relative z-10 w-full lg:w-[40%] h-full flex flex-col justify-center px-2 sm:px-6 lg:px-8 overflow-y-auto">
        <div className="w-full max-w-md mx-auto my-auto rounded-2xl sm:rounded-3xl bg-white/85 backdrop-blur-xl p-6 sm:p-8 md:p-10 shadow-[0_15px_45px_rgba(49,70,30,0.08)] border border-white/90 sm:border-slate-200/50">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--brand-color)]">
            Sign In
          </p>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900">
            Welcome back
          </h2>
          <p className="mt-1 text-sm text-[var(--hint-color)]">
            Access the system with your account.
          </p>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              {(cooldownMessage || error || sessionError) && (
                <div className="flex items-start gap-2.5 animate-in rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-medium leading-relaxed text-red-600">
                  <ExclamationIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span role="status">{cooldownMessage || error || sessionError}</span>
                </div>
              )}
              <fieldset disabled={loading} className="m-0 min-w-0 space-y-5 border-0 p-0">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-black">
                  Email <span className="text-red-500">*</span>
                </span>
                <TextInput
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="example.up@phinmaed.com"
                  required
                  autoComplete="email"
                  rightIcon={
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 6.75h16A1.25 1.25 0 0 1 21.25 8v8A1.25 1.25 0 0 1 20 17.25H4A1.25 1.25 0 0 1 2.75 16V8A1.25 1.25 0 0 1 4 6.75Z" />
                      <path d="m3.5 8 8.01 6.01a.83.83 0 0 0 .98 0L20.5 8" />
                    </svg>
                  }
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-black">
                  Password <span className="text-red-500">*</span>
                </span>
                <TextInput
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={setPassword}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  rightElement={
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((current) => !current)}
                      className="flex items-center text-[var(--hint-color)] transition hover:text-black focus:outline-none"
                    >
                      {showPassword ? (
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 3l18 18" />
                          <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
                          <path d="M9.88 5.09A10.94 10.94 0 0 1 12 4.91c5.05 0 9.27 3.11 10.5 7.09a11.8 11.8 0 0 1-2.41 3.97" />
                          <path d="M6.61 6.61A11.84 11.84 0 0 0 1.5 12c1.23 3.98 5.45 7.09 10.5 7.09 1.8 0 3.51-.39 5.04-1.09" />
                        </svg>
                      ) : (
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M1.5 12S5.5 4.91 12 4.91 22.5 12 22.5 12 18.5 19.09 12 19.09 1.5 12 1.5 12Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  }
                />
              </label>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-[var(--brand-color)] focus:ring-[var(--brand-color)] transition cursor-pointer"
                  />
                  <span className="text-sm font-medium text-black group-hover:text-[var(--brand-color)] transition">
                    Remember me
                  </span>
                </label>
                <button
                  type="button"
                  onClick={onForgotPassword}
                  className="text-sm font-medium text-[var(--brand-color)] cursor-pointer transition hover:text-[var(--brand-color-hover)] hover:underline"
                >
                  Forgot password?
                </button>
              </div>

              <Button
                type="submit"
                variant="brand"
                disabled={loading || isLocked}
                className="w-full"
              >
                {loading ? 'Signing in...' : isLocked ? 'Try again later' : 'Sign in'}
              </Button>
              </fieldset>
            </form>

            <p className="mt-8 text-center text-xs font-medium text-gray-400">
              &copy; 2026 Room Track &middot; PHINMA Education
            </p>
          </div>
        </section>
    </main>
  )
}

export default SignInPage
