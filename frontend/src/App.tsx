import { useState } from 'react'
import SignInPage from './pages/SignInPage'
import DashboardPage from './pages/DashboardPage'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const handleSignIn = () => {
    setIsAuthenticated(true)
  }

  if (isAuthenticated) {
    return <DashboardPage />
  }

  return <SignInPage onSignIn={handleSignIn} />
}

export default App
