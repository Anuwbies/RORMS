import { useState } from 'react'
import type { SyntheticEvent } from 'react'
import { 
  signInWithEmailAndPassword, 
  setPersistence, 
  browserLocalPersistence, 
  browserSessionPersistence,
  signOut
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'
import InfoTabContent from '../components/InfoTabContent'
import { Button } from '../components/Button'
import { TextInput } from '../components/TextInput'
import { ExclamationIcon } from '../components/Icons'

type TabKey = 'home' | 'about' | 'contact'

interface SignInPageProps {
  onSignIn: () => void
  onNavigateToSignup?: () => void
  onNavigateToVerification?: () => void
}

function SignInPage({ onSignIn, onNavigateToSignup, onNavigateToVerification }: SignInPageProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('home')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const checkAndCreateUserDoc = async (user: any) => {
    const userDocRef = doc(db, 'users', user.uid)
    const userDocSnap = await getDoc(userDocRef)
    const userData = userDocSnap.data() || {}

    if (userDocSnap.exists() && userData.isActive === false) {
      throw new Error('account-inactive')
    }

    const updates: any = {
      updatedAt: serverTimestamp(),
      isVerify: user.emailVerified
    }

    // Ensure these fields exist, defaulting to empty strings if Auth doesn't have them
    if (userData.fullName === undefined) updates.fullName = user.displayName || ''
    if (userData.profilePicture === undefined) updates.profilePicture = user.photoURL || ''
    if (userData.email === undefined) updates.email = user.email || ''
    
    // Set initial defaults if document is new
    if (userData.createdAt === undefined) updates.createdAt = serverTimestamp()
    if (userData.isActive === undefined) updates.isActive = true

    await setDoc(userDocRef, updates, { merge: true })
  }

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      // Set persistence based on "Remember me" checkbox
      const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence
      await setPersistence(auth, persistence)

      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      await checkAndCreateUserDoc(userCredential.user)
      onSignIn()
    } catch (err: any) {
      console.error('Sign in error:', err)
      if (err.message === 'account-inactive') {
        await signOut(auth)
        setError('Your account has been deactivated. Please contact an administrator.')
        return
      }
      switch (err.code) {
        case 'auth/invalid-email':
          setError('Invalid email address.')
          break
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          setError('Incorrect email or password.')
          break
        case 'auth/too-many-requests':
          setError('Too many failed attempts. Please try again later.')
          break
        default:
          setError('Failed to sign in. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[var(--brand-surface)] lg:grid lg:grid-cols-[3fr_2fr]">
      <section className="relative flex min-h-[36vh] flex-col gap-8 overflow-hidden bg-[linear-gradient(150deg,#526f34_0%,var(--brand-color)_45%,#7b9d4f_100%)] px-6 py-6 text-[var(--brand-color)] lg:min-h-screen lg:p-10">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-2xl"></div>
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-black/15 blur-3xl"></div>
        <div aria-hidden className="pointer-events-none absolute top-1/2 right-12 hidden h-44 w-44 rounded-full border-[12px] border-white/10 lg:block"></div>

        <nav className="relative flex w-full flex-wrap items-center justify-between gap-5 rounded-2xl border border-gray-200/20 bg-[var(--card-surface)] px-4 py-2 shadow-[0_16px_40px_rgba(0,0,0,0.12)]">
          <div className="flex min-w-0 items-center gap-4">
            <img
              src="/logo2.png"
              alt="PHINMA UPang seal"
              className="h-14 w-14 shrink-0 object-contain"
            />
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-semibold uppercase leading-none tracking-[0.3em] text-[var(--brand-color)] sm:text-sm">
                PHINMA UPANG
              </p>
              <h1 className="text-sm font-semibold leading-none text-black sm:text-base">
                Registrar Office Room Management System
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-4 text-sm font-medium text-black">
            {(['home', 'about', 'contact'] as const).map((tab) => {
              const isActive = activeTab === tab
              const label = tab.charAt(0).toUpperCase() + tab.slice(1)

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`relative px-2 py-1.5 transition after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:rounded-full after:bg-[var(--brand-color)] after:transition-transform after:content-[''] ${
                    isActive
                      ? 'text-[var(--brand-color)] after:scale-x-100'
                      : 'text-black after:origin-center after:scale-x-0 hover:text-[var(--brand-color)] hover:after:scale-x-100'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </nav>

        <div className="relative flex w-full min-h-0 flex-1 items-stretch">
          <div className="h-full w-full rounded-3xl border border-gray-200/20 bg-[var(--brand-surface)] p-8 shadow-[0_24px_50px_rgba(0,0,0,0.12)]">
            <InfoTabContent activeTab={activeTab} />
          </div>
        </div>
      </section>

      <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10 sm:px-10 lg:px-12">
        <div aria-hidden className="pointer-events-none absolute -top-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-[var(--brand-color)]/5 blur-3xl"></div>
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-[var(--brand-color)]/5 blur-3xl"></div>

        <div className="relative w-full max-w-md animate-in rounded-3xl border border-gray-200 bg-[var(--card-surface)] p-8 shadow-[0_32px_64px_rgba(0,0,0,0.14)] sm:p-10">
          <p className="text-center text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand-color)]">
            Sign In
          </p>
          <h2 className="mt-3 text-center text-3xl font-semibold text-black">
            Welcome back
          </h2>
          <p className="mt-1 text-center text-sm leading-6 text-[var(--hint-color)]">
            Access the system with your account.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="flex items-start gap-2.5 animate-in rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-medium leading-relaxed text-red-600">
                <ExclamationIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
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
              <span
                role="button"
                className="text-sm font-medium text-[var(--brand-color)] cursor-pointer transition hover:text-[var(--brand-color-hover)] hover:underline"
              >
                Forgot password?
              </span>
            </div>

            <Button
              type="submit"
              variant="brand"
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          {(onNavigateToSignup || onNavigateToVerification) && (
            <div className="mt-8 pt-6 border-t border-gray-100">
              <p className="text-[11px] text-center font-bold text-gray-400 uppercase tracking-widest mb-3">
                Page Testing & Preview
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {onNavigateToSignup && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onNavigateToSignup}
                    className="!h-9 !text-xs !rounded-lg !font-semibold"
                  >
                    Test Sign Up
                  </Button>
                )}
                {onNavigateToVerification && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onNavigateToVerification}
                    className="!h-9 !text-xs !rounded-lg !font-semibold"
                  >
                    Test Verification
                  </Button>
                )}
              </div>
            </div>
          )}

          <p className="mt-8 text-center text-xs font-medium text-gray-400">
            &copy; 2026 RORMS &middot; PHINMA Education
          </p>
        </div>
      </section>
    </main>
  )
}

export default SignInPage
