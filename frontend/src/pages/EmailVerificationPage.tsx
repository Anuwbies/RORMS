import { useState, useEffect } from 'react'
import { auth, db } from '../firebase'
import { sendEmailVerification, signOut, onAuthStateChanged } from 'firebase/auth'
import { doc, updateDoc } from 'firebase/firestore'
import { LogOutIcon, CheckIcon, BellIcon } from '../components/Icons'

interface EmailVerificationPageProps {
  onSignOut: () => void
}

export default function EmailVerificationPage({ onSignOut }: EmailVerificationPageProps) {
  const [isResending, setIsResending] = useState(false)
  const [resendStatus, setResendStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [hasSentEmail, setHasSentEmail] = useState(false)
  const [lastSentWasResend, setLastSentWasResend] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [userEmail, setUserEmail] = useState<string | null>(null)

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
      setLastSentWasResend(hasSentEmail)
      await sendEmailVerification(auth.currentUser)
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
      await signOut(auth)
      onSignOut()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--brand-surface)] p-4">
      <div className="w-full max-w-md overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-8 text-white text-center relative">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 shadow-inner">
            <BellIcon className="h-8 w-8 text-white animate-bounce" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight">Verify Your Email</h2>
          <p className="mt-2 text-white/85">Protecting your account and resources.</p>
        </div>

        <div className="p-8 space-y-6">
          <div className="text-center space-y-4">
            {hasSentEmail ? (
              <>
                <p className="text-gray-600 font-medium leading-relaxed">
                  We've sent a verification link to:
                  <br />
                  <span className="font-bold text-gray-900 block mt-1 text-lg">{userEmail || 'your email'}</span>
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
                  <span className="font-bold text-gray-900 block mt-1 text-lg">{userEmail || 'your email'}</span>
                </p>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Your account is almost ready! Please click the button below to receive a verification link. Once verified, you'll gain full access to the RORMS platform.
                </p>
              </>
            )}
          </div>

          <div className="space-y-3">
            <button
              onClick={handleCheckStatus}
              className="group flex w-full items-center justify-center gap-2 rounded-md bg-[var(--brand-color)] py-3.5 text-sm font-bold text-white shadow-md transition-all hover:bg-[#526f34] hover:shadow-lg active:scale-[0.98]"
            >
              <CheckIcon className="h-5 w-5 transition-transform group-hover:scale-110" />
              I've Verified My Email
            </button>

            <button
              disabled={isResending || countdown > 0}
              onClick={handleResendEmail}
              className={`flex w-full items-center justify-center gap-2 rounded-md border border-gray-200 bg-white py-3.5 text-sm font-bold text-gray-600 transition-all hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed ${!(isResending || countdown > 0) ? 'active:scale-[0.98]' : ''}`}
            >
              {isResending ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                  Sending...
                </>
              ) : countdown > 0 ? (
                `Resend in ${countdown}s`
              ) : (
                hasSentEmail ? 'Resend Verification Link' : 'Send Verification Link'
              )}
            </button>
          </div>

          {resendStatus === 'success' && (
            <div className="rounded-md bg-emerald-50 p-4 border border-emerald-100 animate-in fade-in slide-in-from-top-2 duration-300">
              <p className="text-center text-sm font-bold text-emerald-700">
                Success! {lastSentWasResend ? 'A new' : 'A'} verification link has been sent.
              </p>
            </div>
          )}

          {resendStatus === 'error' && (
            <div className="rounded-md bg-rose-50 p-4 border border-rose-100 animate-in fade-in slide-in-from-top-2 duration-300">
              <p className="text-center text-sm font-bold text-rose-700">
                Failed to send. Please try again later.
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-gray-100">
            <button
              onClick={handleSignOut}
              className="flex w-full items-center justify-center gap-2 text-sm font-bold text-rose-500 transition-colors hover:text-rose-700"
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
