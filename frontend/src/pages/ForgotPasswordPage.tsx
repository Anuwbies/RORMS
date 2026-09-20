import { useState } from 'react'
import type { SyntheticEvent } from 'react'
import { FirebaseError } from 'firebase/app'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import { Button } from '../components/Button'
import { TextInput } from '../components/TextInput'
import { ExclamationIcon } from '../components/Icons'
import { ArchitecturalBackground } from '../components/ArchitecturalBackground'

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

interface ForgotPasswordPageProps {
  onBackToSignIn: () => void
  currentSlide: number
  onSlideChange: (slide: number) => void
}

function ForgotPasswordPage({ onBackToSignIn, currentSlide, onSlideChange }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const requestPasswordReset = httpsCallable<{ email: string; origin: string }, { success: boolean }>(
        functions,
        'requestPasswordReset',
      )
      await requestPasswordReset({
        email: email.trim(),
        origin: window.location.origin,
      })
      setEmailSent(true)
    } catch (caughtError: unknown) {
      console.error('Password reset error:', caughtError)

      if (caughtError instanceof FirebaseError) {
        switch (caughtError.code) {
          case 'functions/invalid-argument':
            setError('Enter a valid email address.')
            break
          case 'functions/resource-exhausted':
            setError('Too many requests. Please wait a while before trying again.')
            break
          case 'functions/unavailable':
            setError('Unable to connect. Check your internet connection and try again.')
            break
          default:
            setError('Unable to send the reset email. Please try again.')
        }
      } else {
        setError('Unable to send the reset email. Please try again.')
      }
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
                PHINMA UPANG
              </p>
              <h1 className="text-sm font-semibold leading-tight text-white drop-shadow">
                Registrar Office Room Management System
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
          {emailSent ? (
            <div aria-live="polite">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-color)]/10 text-[var(--brand-color)]">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </div>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.28em] text-[var(--brand-color)]">
                Request received
              </p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900">
                Check your inbox
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--hint-color)]">
                If an account exists for <span className="font-semibold text-slate-700">{email.trim()}</span>, a password reset link has been sent. If you do not receive it, check your spam folder.
              </p>

              <Button
                type="button"
                variant="brand"
                onClick={onBackToSignIn}
                className="mt-8 w-full"
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--brand-color)]">
                Forgot Password
              </p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900">
                Reset your password
              </h2>
              <p className="mt-1 text-sm text-[var(--hint-color)]">
                Enter your account email and we’ll send you a reset link.
              </p>

              <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 animate-in rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-medium leading-relaxed text-red-600"
                  >
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
                    autoFocus
                    autoComplete="email"
                    error={Boolean(error)}
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

                <Button
                  type="submit"
                  variant="brand"
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? 'Sending reset link...' : 'Send reset link'}
                </Button>

                <button
                  type="button"
                  onClick={onBackToSignIn}
                  className="mx-auto flex items-center gap-2 text-sm font-medium text-[var(--brand-color)] transition hover:text-[var(--brand-color-hover)] hover:underline cursor-pointer"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                  Back to sign in
                </button>
              </form>
            </>
          )}

          <p className="mt-8 text-center text-xs font-medium text-gray-400">
            &copy; 2026 RORMS &middot; PHINMA Education
          </p>
        </div>
      </section>
    </main>
  )
}

export default ForgotPasswordPage
