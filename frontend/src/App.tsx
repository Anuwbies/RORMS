import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './firebase'
import SignInPage from './pages/SignInPage'
import SignupPage from './pages/SignupPage'
import LeftSidebarController from './pages/LeftSidebarController'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
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

  const handleSignOut = async () => {
    try {
      await auth.signOut()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

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
