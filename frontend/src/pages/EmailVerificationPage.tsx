import { useState, useEffect } from 'react'
import { auth, db } from '../firebase'
import { sendEmailVerification, signOut, onAuthStateChanged } from 'firebase/auth'
import { LogOutIcon, CheckIcon, BellIcon, CheckCircleIcon, AlertCircleIcon } from '../components/Icons'
import { Button } from '../components/Button'

interface EmailVerificationPageProps {
  onSignOut: () => void
  isNewSignup?: boolean
}

export default function EmailVerificationPage({ onSignOut, isNewSignup = false }: EmailVerificationPageProps) {
  const [isResending, setIsResending] = useState(false)
  const [resendStatus, setResendStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const getRemainingCooldown = () => {
    const lastSent = sessionStorage.getItem('rorms_verification_cooldown')
    if (lastSent) {
      const elapsed = Math.floor((Date.now() - parseInt(lastSent, 10)) / 1000)
      const remaining = 60 - elapsed
      if (remaining > 0) return remaining
    }
    return isNewSignup ? 60 : 0
  }

  const getHasSent = () => {
    if (isNewSignup) return true
    const lastSent = sessionStorage.getItem('rorms_verification_cooldown')
    if (lastSent) {
      const elapsed = Math.floor((Date.now() - parseInt(lastSent, 10)) / 1000)
      return elapsed < 60
    }
    return false
  }

  const [hasSentEmail, setHasSentEmail] = useState(getHasSent)
  const [lastSentWasResend, setLastSentWasResend] = useState(false)
  const [countdown, setCountdown] = useState(getRemainingCooldown)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    if (isNewSignup) {
      setHasSentEmail(true)
      setCountdown((prev) => (prev > 0 ? prev : 60))
    }
  }, [isNewSignup])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserEmail(user.email)
      }
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    let timer: any
    if (countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1)
      }, 1000)
    }
    return () => clearInterval(timer)
  }, [countdown])

  const handleResendEmail = async () => {
    if (!auth.currentUser || countdown > 0) return

    setIsResending(true)
    setResendStatus('idle')
    try {
      setLastSentWasResend(true) // If manually clicking, it's always a resend now
      await sendEmailVerification(auth.currentUser)
      sessionStorage.setItem('rorms_verification_cooldown', Date.now().toString())
      setResendStatus('success')
      setHasSentEmail(true)
      setCountdown(60) // 60 seconds cooldown
    } catch (error) {
      console.error('Error resending verification email:', error)
      setResendStatus('error')
    } finally {
      setIsResending(false)
    }
  }

  const handleCheckStatus = async () => {
    if (!auth.currentUser) return
    
    try {
      await auth.currentUser.reload()
      if (auth.currentUser.emailVerified) {
        window.location.reload() // This will trigger App.tsx logic
      }
    } catch (error) {
      console.error('Error checking verification status:', error)
    }
  }

  const handleSignOut = async () => {
    try {
      sessionStorage.removeItem('rorms_verification_cooldown')
      window.history.replaceState({}, '', '/')
      await signOut(auth)
      onSignOut()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--brand-surface)] p-4">
      <div className="w-full max-w-md animate-in overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl">
        <div className="relative overflow-hidden bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-8 text-white text-center">
          <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-white/10"></div>
          <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-white/10"></div>
          <div aria-hidden className="pointer-events-none absolute top-6 left-8 h-2 w-2 rounded-full bg-white/40"></div>
          <div aria-hidden className="pointer-events-none absolute bottom-12 right-12 h-1.5 w-1.5 rounded-full bg-white/40"></div>
          <div aria-hidden className="pointer-events-none absolute top-14 right-16 h-3 w-3 rounded-full bg-white/30"></div>

          <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center">
            <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-white/25"></span>
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/20 shadow-inner">
              <BellIcon className="h-8 w-8 text-white" />
            </span>
          </div>
          <h2 className="relative text-3xl font-bold tracking-tight">Verify Your Email</h2>
          <p className="relative mt-2 text-white/85">Protecting your account and resources.</p>
        </div>

        <div className="p-8 space-y-6">
          <div className="text-center space-y-4">
            {hasSentEmail ? (
              <>
                <p className="text-gray-600 font-medium leading-relaxed">
                  We've sent a verification link to:
                  <br />
                  <span className="mt-3 inline-block max-w-full truncate rounded-xl border border-[var(--brand-color)]/20 bg-[var(--brand-color)]/5 px-4 py-2 text-lg font-bold text-[var(--brand-color)]">
                    {userEmail || 'your email'}
                  </span>
                </p>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Please check your inbox (and spam folder) and click the link to activate your account. Once verified, you'll gain full access to the RORMS platform.
                </p>
              </>
            ) : (
              <>
                <p className="text-gray-600 font-medium leading-relaxed">
                  Verify your email address to secure your account:
                  <br />
                  <span className="mt-3 inline-block max-w-full truncate rounded-xl border border-[var(--brand-color)]/20 bg-[var(--brand-color)]/5 px-4 py-2 text-lg font-bold text-[var(--brand-color)]">
                    {userEmail || 'your email'}
                  </span>
                </p>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Your account is almost ready! Please click the button below to receive a verification link. Once verified, you'll gain full access to the RORMS platform.
                </p>
              </>
            )}
          </div>

          <div className="space-y-3">
            <Button
              onClick={handleCheckStatus}
              variant="brand"
              icon={<CheckIcon className="h-5 w-5" />}
              className="w-full"
            >
              I've Verified My Email
            </Button>

            <Button
              disabled={isResending || countdown > 0}
              onClick={handleResendEmail}
              variant="outline"
              icon={
                isResending ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                ) : undefined
              }
              className="w-full"
            >
              {isResending
                ? 'Sending...'
                : countdown > 0
                ? `Resend in ${countdown}s`
                : hasSentEmail
                ? 'Resend Verification Link'
                : 'Send Verification Link'}
            </Button>
          </div>

          {resendStatus === 'success' && (
            <div className="flex items-start gap-3 animate-in rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <p className="text-sm font-bold leading-relaxed text-emerald-700">
                Success! {lastSentWasResend ? 'A new' : 'A'} verification link has been sent.
              </p>
            </div>
          )}

          {resendStatus === 'error' && (
            <div className="flex items-start gap-3 animate-in rounded-xl border border-rose-100 bg-rose-50 p-4">
              <AlertCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
              <p className="text-sm font-bold leading-relaxed text-rose-700">
                Failed to send. Please try again later.
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center justify-center gap-2 text-sm font-bold text-rose-500 transition-colors hover:text-rose-700 cursor-pointer"
            >
              <LogOutIcon className="h-4 w-4" />
              Sign Out and Use Different Account
            </button>
          </div>
        </div>
      </div>

      <div className="fixed bottom-6 text-center w-full">
        <p className="text-xs font-medium text-gray-400">
          &copy; 2026 RORMS - Phinma Ed. All rights reserved.
        </p>
      </div>
    </div>
  )
}
