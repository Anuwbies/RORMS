const AUTH_SESSION_MODE_KEY = 'rorms_auth_session_mode'
const BROWSER_SESSION_COOKIE = 'rorms_browser_session'

function hasBrowserSessionCookie(): boolean {
  return document.cookie.split(';').some(cookie => cookie.trim() === `${BROWSER_SESSION_COOKIE}=1`)
}

function setBrowserSessionCookie(enabled: boolean): void {
  const attributes = `Path=/; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`
  document.cookie = `${BROWSER_SESSION_COOKIE}=${enabled ? '1' : ''}; ${enabled ? '' : 'Max-Age=0; '}${attributes}`
}

export function saveAuthSessionMode(rememberMe: boolean): void {
  if (!rememberMe) {
    setBrowserSessionCookie(true)
    if (!hasBrowserSessionCookie()) throw new Error('Browser session cookies are unavailable.')
  } else {
    setBrowserSessionCookie(false)
  }
  window.localStorage.setItem(AUTH_SESSION_MODE_KEY, rememberMe ? 'remembered' : 'session')
}

export function hasExpiredAuthSession(): boolean {
  return window.localStorage.getItem(AUTH_SESSION_MODE_KEY) === 'session' && !hasBrowserSessionCookie()
}

export function clearAuthSessionMode(): void {
  window.localStorage.removeItem(AUTH_SESSION_MODE_KEY)
  setBrowserSessionCookie(false)
}
