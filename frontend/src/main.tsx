import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './firebase'

import { SnackbarProvider } from './components/Snackbar'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SnackbarProvider defaultPosition="top-center">
      <App />
    </SnackbarProvider>
  </StrictMode>,
)
