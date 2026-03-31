import { useState } from 'react'
import SignInPage from './pages/SignInPage'
import LeftSidebarController from './pages/LeftSidebarController'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const handleSignIn = () => {
    setIsAuthenticated(true)
  }

  const handleSignOut = () => {
    setIsAuthenticated(false)
  }

  if (isAuthenticated) {
    return <LeftSidebarController onSignOut={handleSignOut} />
  }

  return <SignInPage onSignIn={handleSignIn} />
}

export default App
