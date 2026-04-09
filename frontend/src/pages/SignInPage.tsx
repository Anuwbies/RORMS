import { useState } from 'react'
import type { SyntheticEvent } from 'react'
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'

type TabKey = 'home' | 'about' | 'contact'

interface SignInPageProps {
  onSignIn: () => void
}

function SignInPage({ onSignIn }: SignInPageProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('home')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const checkAndCreateUserDoc = async (user: any) => {
    try {
      const userDocRef = doc(db, 'users', user.uid)
      const userDocSnap = await getDoc(userDocRef)
      const userData = userDocSnap.data() || {}

      const updates: any = {
        updatedAt: serverTimestamp(),
        isVerify: user.emailVerified
      }

      // Fill in missing fields with defaults
      if (userData.email === undefined) updates.email = user.email
      if (userData.fullName === undefined) updates.fullName = user.displayName || ''
      if (userData.createdAt === undefined) updates.createdAt = serverTimestamp()
      if (userData.department === undefined) updates.department = ''
      if (userData.role === undefined) updates.role = 'member'
      if (userData.profilePicture === undefined) updates.profilePicture = user.photoURL || ''
      if (userData.isActive === undefined) updates.isActive = true

      await setDoc(userDocRef, updates, { merge: true })
    } catch (err) {
      console.error('Error checking user doc during sign in:', err)
    }
  }

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      await checkAndCreateUserDoc(userCredential.user)
      onSignIn()
    } catch (err: any) {
      console.error('Sign in error:', err)
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

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError(null)
    try {
      const provider = new GoogleAuthProvider()
      const userCredential = await signInWithPopup(auth, provider)
      await checkAndCreateUserDoc(userCredential.user)
      onSignIn()
    } catch (err: any) {
      console.error('Google sign in error:', err)
      setError('Google sign in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[var(--brand-surface)] lg:grid lg:grid-cols-[3fr_2fr]">
      <section className="flex min-h-[36vh] flex-col gap-8 bg-[var(--brand-color)] px-6 py-6 text-[var(--brand-color)] lg:min-h-screen lg:p-10">
        <nav className="flex w-full flex-wrap items-center justify-between gap-5 rounded-lg border border-gray-200/20 bg-[var(--card-surface)] px-4 py-2 shadow-[0_16px_40px_rgba(0,0,0,0.12)]">
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

        <div className="flex w-full min-h-0 flex-1 items-stretch">
          <div className="h-full w-full rounded-lg border border-gray-200/20 bg-[var(--brand-surface)] p-8 shadow-[0_24px_50px_rgba(0,0,0,0.12)]">
            {/* Content area left empty for all tabs as requested */}
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-6 py-10 sm:px-10 lg:px-12">
        <div className="w-full max-w-md rounded-lg border border-gray-200 bg-[var(--card-surface)] p-8 shadow-[0_32px_64px_rgba(0,0,0,0.14)] sm:p-10">
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
              <div className="rounded-md bg-red-50 p-3 text-xs text-red-600 border border-red-100">
                {error}
              </div>
            )}
            <label className="block">
              <span className="mb-2 block text-sm font-normal text-black">
                Email <span className="text-red-500">*</span>
              </span>
              <div className="group relative">
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[var(--hint-color)] transition group-focus-within:text-[var(--brand-color)]">
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
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example.up@phinmaed.com"
                  required
                  className="w-full rounded-md border border-[rgba(0,0,0,0.12)] bg-[var(--brand-surface)] px-4 py-3 pr-12 text-sm text-black outline-none transition placeholder:text-[var(--hint-color)] focus:border-[var(--brand-color)] focus:bg-[var(--brand-surface)]"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-normal text-black">
                Password <span className="text-red-500">*</span>
              </span>
              <div className="group relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full rounded-md border border-[rgba(0,0,0,0.12)] bg-[var(--brand-surface)] px-4 py-3 pr-12 text-sm text-black outline-none transition placeholder:text-[var(--hint-color)] focus:border-[var(--brand-color)] focus:bg-[var(--brand-surface)]"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute inset-y-0 right-0 flex items-center px-4 text-[var(--hint-color)] transition group-focus-within:text-[var(--brand-color)] hover:text-black"
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
              </div>
            </label>

            <div className="flex justify-end">
              <button
                type="button"
                className="text-sm font-medium text-[var(--brand-color)] transition hover:text-blue-600"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-[var(--brand-color)] px-4 py-3 text-sm font-semibold text-[var(--brand-surface)] transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-[rgba(0,0,0,0.12)]" />
            <span className="text-xs font-medium uppercase tracking-[0.22em] text-[var(--hint-color)]">
              Or continue with
            </span>
            <div className="h-px flex-1 bg-[rgba(0,0,0,0.12)]" />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-md border border-[rgba(0,0,0,0.12)] bg-white px-4 py-3 text-sm font-semibold text-[#1f1f1f] transition hover:bg-[#f8f8f8] disabled:opacity-50"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
            >
              <path
                d="M21.805 12.23c0-.78-.07-1.53-.2-2.25H12v4.26h5.49a4.7 4.7 0 0 1-2.04 3.08v2.56h3.3c1.93-1.78 3.055-4.4 3.055-7.65Z"
                fill="#4285F4"
              />
              <path
                d="M12 22c2.76 0 5.08-.91 6.77-2.47l-3.3-2.56c-.91.61-2.08.97-3.47.97-2.66 0-4.91-1.8-5.72-4.21H2.87v2.64A10 10 0 0 0 12 22Z"
                fill="#34A853"
              />
              <path
                d="M6.28 13.73A6 6 0 0 1 5.96 12c0-.6.11-1.17.32-1.73V7.63H2.87A10 10 0 0 0 2 12c0 1.61.39 3.13.87 4.37l3.41-2.64Z"
                fill="#FBBC05"
              />
              <path
                d="M12 6.06c1.5 0 2.84.52 3.9 1.55l2.92-2.92C17.07 3.07 14.75 2 12 2A10 10 0 0 0 2.87 7.63l3.41 2.64C7.09 7.86 9.34 6.06 12 6.06Z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </button>
        </div>
      </section>
    </main>
  )
}

export default SignInPage
