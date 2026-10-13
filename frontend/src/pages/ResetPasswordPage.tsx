import { useEffect, useState } from 'react'
import type { SyntheticEvent } from 'react'
import { FirebaseError } from 'firebase/app'
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth'
import { auth } from '../firebase'
import { Button } from '../components/Button'
import { TextInput } from '../components/TextInput'
import { ExclamationIcon } from '../components/Icons'
import { ArchitecturalBackground } from '../components/ArchitecturalBackground'
import { getPasswordError, MIN_PASSWORD_LENGTH, PASSWORD_REQUIREMENTS } from '../utils/passwordPolicy'

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

interface ResetPasswordPageProps {
  onBackToSignIn: () => void
  currentSlide: number
  onSlideChange: (slide: number) => void
}

function getCodeError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/expired-action-code':
        return 'This password reset link has expired. Request a new one to continue.'
      case 'auth/invalid-action-code':
        return 'This password reset link is invalid or has already been used.'
      case 'auth/user-disabled':
        return 'This account has been deactivated. Please contact an administrator.'
      case 'auth/network-request-failed':
        return 'Unable to connect. Check your internet connection and try again.'
      case 'auth/weak-password':
      case 'auth/password-does-not-meet-requirements':
        return PASSWORD_REQUIREMENTS
      default:
        return 'We could not process this password reset. Please request a new link.'
    }
  }

  return 'We could not process this password reset. Please request a new link.'
}

function ResetPasswordPage({ onBackToSignIn, currentSlide, onSlideChange }: ResetPasswordPageProps) {
  const [actionCode] = useState(() => new URLSearchParams(window.location.search).get('oobCode') || '')
  const [accountEmail, setAccountEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkingCode, setCheckingCode] = useState(true)
  const [loading, setLoading] = useState(false)
  const [resetComplete, setResetComplete] = useState(false)

  useEffect(() => {
    if (!actionCode) {
      setError('This password reset link is missing its security code.')
      setCheckingCode(false)
      return
    }

    let isMounted = true

    verifyPasswordResetCode(auth, actionCode)
      .then((email) => {
        if (!isMounted) return
        setAccountEmail(email)
        setCheckingCode(false)
      })
      .catch((caughtError: unknown) => {
        if (!isMounted) return
        setError(getCodeError(caughtError))
        setCheckingCode(false)
      })

    return () => {
      isMounted = false
    }
  }, [actionCode])

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    const passwordError = getPasswordError(password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    setLoading(true)
    setError(null)

    try {
      await confirmPasswordReset(auth, actionCode, password)
      setResetComplete(true)
    } catch (caughtError: unknown) {
      console.error('Password reset confirmation error:', caughtError)
      setError(getCodeError(caughtError))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative h-screen w-screen max-h-screen overflow-hidden flex p-3 sm:p-4 lg:p-5 gap-6 lg:gap-8">
      <ArchitecturalBackground />

      <section className="relative z-10 hidden lg:flex lg:w-[60%] h-full flex-col justify-between overflow-hidden rounded-2xl sm:rounded-3xl p-6 sm:p-8 lg:p-12 text-white shadow-2xl shrink-0 select-none border border-slate-200/40">
        {heroSlides.map((slide, index) => (
          <div
            key={slide.image}
            className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out ${
              index === currentSlide ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            style={{ backgroundImage: `url('${slide.image}')` }}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/50" />

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
            {heroSlides.map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Go to slide ${index + 1}`}
                onClick={() => onSlideChange(index)}
                className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                  index === currentSlide
                    ? 'w-10 bg-white'
                    : 'w-6 bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 w-full lg:w-[40%] h-full flex flex-col justify-center px-2 sm:px-6 lg:px-8 overflow-y-auto">
        <div className="w-full max-w-md mx-auto my-auto rounded-2xl sm:rounded-3xl bg-white/85 backdrop-blur-xl p-6 sm:p-8 md:p-10 shadow-[0_15px_45px_rgba(49,70,30,0.08)] border border-white/90 sm:border-slate-200/50">
          {resetComplete ? (
            <div aria-live="polite">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-color)]/10 text-[var(--brand-color)]">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </div>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.28em] text-[var(--brand-color)]">
                Password updated
              </p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900">
                You’re all set
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--hint-color)]">
                Your Room Track password has been changed successfully. You can now sign in with your new password.
              </p>
              <Button type="button" variant="brand" onClick={onBackToSignIn} className="mt-8 w-full">
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--brand-color)]">
                Set New Password
              </p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900">
                Create a new password
              </h2>
              <p className="mt-1 text-sm text-[var(--hint-color)]">
                Choose a strong password for your Room Track account.
              </p>

              {checkingCode ? (
                <div className="mt-8 flex items-center gap-3 text-sm text-[var(--hint-color)]" aria-live="polite">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--brand-color)] border-t-transparent" />
                  Verifying your reset link...
                </div>
              ) : error && !accountEmail ? (
                <div className="mt-8">
                  <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-medium leading-relaxed text-red-600">
                    <ExclamationIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                  <Button type="button" variant="outline" onClick={onBackToSignIn} className="mt-6 w-full">
                    Back to sign in
                  </Button>
                </div>
              ) : (
                <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                  {accountEmail && (
                    <p className="text-xs text-[var(--hint-color)]">
                      Updating password for <span className="font-semibold text-slate-700">{accountEmail}</span>
                    </p>
                  )}

                  {error && (
                    <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-medium leading-relaxed text-red-600">
                      <ExclamationIcon className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-black">
                      New password <span className="text-red-500">*</span>
                    </span>
                    <TextInput
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={setPassword}
                      placeholder="Enter your new password"
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      aria-describedby="reset-password-requirements"
                      autoComplete="new-password"
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

                  <p id="reset-password-requirements" className="mt-2 text-xs text-[var(--hint-color)]" aria-live="polite">
                    {password ? getPasswordError(password) || 'Password meets all requirements.' : PASSWORD_REQUIREMENTS}
                  </p>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-black">
                      Confirm password <span className="text-red-500">*</span>
                    </span>
                    <TextInput
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      placeholder="Re-enter your new password"
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      autoComplete="new-password"
                      rightElement={
                        <button
                          type="button"
                          aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                          onClick={() => setShowConfirmPassword((current) => !current)}
                          className="flex items-center text-[var(--hint-color)] transition hover:text-black focus:outline-none"
                        >
                          {showConfirmPassword ? (
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

                  <Button type="submit" variant="brand" disabled={loading} className="w-full">
                    {loading ? 'Updating password...' : 'Update password'}
                  </Button>

                  <button
                    type="button"
                    onClick={onBackToSignIn}
                    className="mx-auto flex items-center gap-2 text-sm font-medium text-[var(--brand-color)] transition hover:text-[var(--brand-color-hover)] hover:underline cursor-pointer"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                    Back to sign in
                  </button>
                </form>
              )}
            </>
          )}

          <p className="mt-8 text-center text-xs font-medium text-gray-400">
            &copy; 2026 Room Track &middot; PHINMA Education
          </p>
        </div>
      </section>
    </main>
  )
}

export default ResetPasswordPage
