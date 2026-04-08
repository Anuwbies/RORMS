import { useState } from 'react'
import SignInPage from './pages/SignInPage'
import SignupPage from './pages/SignupPage'
import LeftSidebarController from './pages/LeftSidebarController'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isSignupMode, setIsSignupMode] = useState(false)

  const handleSignIn = () => {
    setIsAuthenticated(true)
  }

  const handleSignOut = () => {
    setIsAuthenticated(false)
  }

  const handleSignup = () => {
    setIsSignupMode(false)
    setIsAuthenticated(true)
  }

  if (isAuthenticated) {
    return <LeftSidebarController onSignOut={handleSignOut} />
  }

  if (isSignupMode) {
    return <SignupPage onSignup={handleSignup} />
  }

  return (
    <SignInPage 
      onSignIn={handleSignIn} 
      onSignUpClick={() => setIsSignupMode(true)} 
    />
  )
}

export default App
