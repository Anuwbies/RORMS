import { useState, useEffect, useCallback } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './firebase'
import SignInPage from './pages/SignInPage'
import SignUpPage from './pages/SignupPage'
import LeftSidebarController from './pages/LeftSidebarController'
import EmailVerificationPage from './pages/EmailVerificationPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import { clearAuthSessionMode, hasExpiredAuthSession } from './utils/authSession'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isEmailVerified, setIsEmailVerified] = useState(false)
  const [isSignupMode, setIsSignupMode] = useState(false)
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false)
  const [isResetPasswordMode, setIsResetPasswordMode] = useState(false)
  const [isVerificationPreview, setIsVerificationPreview] = useState(false)
  const [justSignedUp, setJustSignedUp] = useState(false)
  const [currentAuthSlide, setCurrentAuthSlide] = useState(0)
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentAuthSlide((previous) => (previous + 1) % 3)
    }, 4500)

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const syncAuthPageWithUrl = () => {
      const params = new URLSearchParams(window.location.search)
      const isResetPath = window.location.pathname === '/reset-password'
      const isSignupPath = !isResetPath && (params.has('token') || window.location.pathname === '/signup')

      setIsSignupMode(isSignupPath)
      setIsResetPasswordMode(isResetPath)
      setIsForgotPasswordMode(
        !isSignupPath && !isResetPath && window.location.pathname === '/forgot-password'
      )
    }

    syncAuthPageWithUrl()
    window.addEventListener('popstate', syncAuthPageWithUrl)

    return () => window.removeEventListener('popstate', syncAuthPageWithUrl)
  }, [])

  useEffect(() => {
    let disposed = false
    let authGeneration = 0
    let unsubscribeProfile: (() => void) | undefined

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const generation = ++authGeneration
      unsubscribeProfile?.()
      unsubscribeProfile = undefined
      setIsAuthenticated(false)
      setIsEmailVerified(false)

      if (user) {
        setLoading(true)
        setSessionError(null)
        if (hasExpiredAuthSession()) {
          clearAuthSessionMode()
          try {
            await auth.signOut()
          } catch (error) {
            console.error('Error ending expired browser session:', error)
            setSessionError('Unable to end your expired session. Please sign in again.')
            setLoading(false)
          }
          return
        }
        let blocked = false
        let profileReady = false
        const isCurrentSession = () => !disposed && generation === authGeneration && auth.currentUser?.uid === user.uid
        const blockSession = (message: string) => {
          if (!isCurrentSession() || blocked) return
          blocked = true
          setIsAuthenticated(false)
          setIsEmailVerified(false)
          setSessionError(message)
          setLoading(false)
          setIsSignupMode(false)
          setIsForgotPasswordMode(false)
          setIsResetPasswordMode(false)
          setJustSignedUp(false)
          sessionStorage.removeItem('rorms_verification_cooldown')
          window.history.replaceState({}, '', '/')
          unsubscribeProfile?.()
          unsubscribeProfile = undefined
          void auth.signOut().then(clearAuthSessionMode).catch(error => console.error('Error ending blocked session:', error))
        }

        const userDocRef = doc(db, 'users', user.uid)
        unsubscribeProfile = onSnapshot(userDocRef, { includeMetadataChanges: true }, snapshot => {
          if (!isCurrentSession() || blocked || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return
          if (snapshot.data()?.isActive === false) {
            blockSession('This account has been deactivated.')
          } else if (profileReady && !snapshot.exists()) {
            blockSession('Your account is unavailable. Please contact your administrator.')
          }
        }, error => {
          console.error('Error monitoring account status:', error)
          blockSession('Unable to verify your account status. Please sign in again.')
        })

        try {
          const params = new URLSearchParams(window.location.search)
          if (params.has('token') || window.location.pathname === '/signup' || sessionStorage.getItem('rorms_verification_cooldown')) {
            setJustSignedUp(true)
          }

          // Check if email is verified
          setIsEmailVerified(user.emailVerified)

          // A transaction checks the current server profile and prevents defaults
          // from overwriting a concurrent account deactivation.
          await runTransaction(db, async transaction => {
            const userDocSnap = await transaction.get(userDocRef)
            const userData = userDocSnap.data() || {}
            if (userData.isActive === false) throw new Error('account-inactive')
            const updates: Record<string, unknown> = {
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

            transaction.set(userDocRef, updates, { merge: true })
          })
          if (!isCurrentSession() || blocked) return
          profileReady = true
          setIsAuthenticated(true)
          setLoading(false)
        } catch (error) {
          console.error('Error in Firestore user profile logic:', error)
          blockSession(error instanceof Error && error.message === 'account-inactive'
            ? 'This account has been deactivated.'
            : 'Unable to verify your account status. Please sign in again.')
        }
      } else {
        setLoading(false)
      }
    })

    return () => {
      disposed = true
      ++authGeneration
      unsubscribeProfile?.()
      unsubscribe()
    }
  }, [])

  const handleSignIn = () => {
    // onAuthStateChanged will handle the state update
  }

  const handleSignOut = useCallback(async () => {
    try {
      sessionStorage.removeItem('rorms_verification_cooldown')
      window.history.replaceState({}, '', '/')
      setIsSignupMode(false)
      setIsForgotPasswordMode(false)
      setIsResetPasswordMode(false)
      setJustSignedUp(false)
      await auth.signOut()
      clearAuthSessionMode()
      setIsAuthenticated(false)
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }, [])

  const handleSignup = () => {
    window.history.replaceState({}, '', '/')
    setIsSignupMode(false)
    setJustSignedUp(true)
    // onAuthStateChanged will handle the state update
  }

  const handleForgotPassword = () => {
    window.history.pushState({}, '', '/forgot-password')
    setIsResetPasswordMode(false)
    setIsForgotPasswordMode(true)
  }

  const handleBackToSignIn = () => {
    window.history.pushState({}, '', '/')
    setIsForgotPasswordMode(false)
    setIsResetPasswordMode(false)
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--brand-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--brand-color)] border-t-transparent"></div>
      </div>
    )
  }

  if (isResetPasswordMode) {
    return (
      <ResetPasswordPage
        onBackToSignIn={handleBackToSignIn}
        currentSlide={currentAuthSlide}
        onSlideChange={setCurrentAuthSlide}
      />
    )
  }

  if (isAuthenticated) {
    if (!isEmailVerified) {
      return <EmailVerificationPage onSignOut={handleSignOut} isNewSignup={justSignedUp} />
    }
    return <LeftSidebarController onSignOut={handleSignOut} />
  }

  if (isSignupMode) {
    return (
      <SignUpPage 
        onSignup={handleSignup} 
        onBackToSignIn={() => setIsSignupMode(false)}
      />
    )
  }

  if (isForgotPasswordMode) {
    return (
      <ForgotPasswordPage
        onBackToSignIn={handleBackToSignIn}
        currentSlide={currentAuthSlide}
        onSlideChange={setCurrentAuthSlide}
      />
    )
  }

  return (
    <SignInPage 
      sessionError={sessionError}
      onSignIn={handleSignIn}
      onForgotPassword={handleForgotPassword}
      currentSlide={currentAuthSlide}
      onSlideChange={setCurrentAuthSlide}
    />
  )
}

export default App
