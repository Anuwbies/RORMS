import { useState, useEffect, useCallback } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './firebase'
import SignInPage from './pages/SignInPage'
import SignupPage from './pages/SignupPage'
import LeftSidebarController from './pages/LeftSidebarController'
import EmailVerificationPage from './pages/EmailVerificationPage'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isEmailVerified, setIsEmailVerified] = useState(false)
  const [isSignupMode, setIsSignupMode] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if we should be in signup mode based on URL
    const params = new URLSearchParams(window.location.search)
    const hasToken = params.has('token')
    const isSignupPath = window.location.pathname === '/signup'
    
    if (hasToken || isSignupPath) {
      setIsSignupMode(true)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Check if email is verified
          setIsEmailVerified(user.emailVerified)

          const userDocRef = doc(db, 'users', user.uid)
          const userDocSnap = await getDoc(userDocRef)
          const userData = userDocSnap.data() || {}
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

          console.log(userDocSnap.exists() ? 'Updating existing user profile' : 'Creating new user profile')
          await setDoc(userDocRef, updates, { merge: true })
          setIsAuthenticated(true)
        } catch (error) {
          console.error('Error in Firestore user profile logic:', error)
          setIsAuthenticated(true)
        }
      } else {
        setIsAuthenticated(false)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const handleSignIn = () => {
    // onAuthStateChanged will handle the state update
  }

  const handleSignOut = useCallback(async () => {
    try {
      await auth.signOut()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }, [])

  const handleSignup = () => {
    setIsSignupMode(false)
    // onAuthStateChanged will handle the state update
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--brand-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--brand-color)] border-t-transparent"></div>
      </div>
    )
  }

  if (isAuthenticated) {
    if (!isEmailVerified) {
      return <EmailVerificationPage onSignOut={() => setIsAuthenticated(false)} />
    }
    return <LeftSidebarController onSignOut={handleSignOut} />
  }

  if (isSignupMode) {
    return (
      <SignupPage 
        onSignup={handleSignup} 
      />
    )
  }

  return (
    <SignInPage 
      onSignIn={handleSignIn} 
    />
  )
}

export default App
