export const MAX_SIGN_IN_ATTEMPTS = 3
export const SIGN_IN_COOLDOWN_MS = 5 * 60 * 1000
export const MAX_SIGN_IN_COOLDOWN_MS = 60 * 60 * 1000
export const SIGN_IN_ATTEMPTS_KEY = 'rorms-sign-in-attempts'

export interface SignInAttempts {
  failures: number
  lockedUntil: number
  lockouts: number
}

export function freshSignInAttempts(): SignInAttempts {
  return { failures: 0, lockedUntil: 0, lockouts: 0 }
}

function expireSignInAttempts(attempts: SignInAttempts, now: number): SignInAttempts {
  return attempts.lockedUntil > 0 && attempts.lockedUntil <= now
    ? { failures: 0, lockedUntil: 0, lockouts: attempts.lockouts } : attempts
}

export function readSignInAttempts(storage: Storage, fallback: SignInAttempts, now = Date.now()): SignInAttempts {
  try {
    const stored = storage.getItem(SIGN_IN_ATTEMPTS_KEY)
    if (!stored) return expireSignInAttempts(fallback, now)
    const parsed: unknown = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object') return freshSignInAttempts()
    const { failures, lockedUntil, lockouts = 0 } = parsed as Record<string, unknown>
    if (typeof failures !== 'number' || !Number.isInteger(failures) || failures < 0 || failures > MAX_SIGN_IN_ATTEMPTS
      || typeof lockedUntil !== 'number' || !Number.isFinite(lockedUntil) || lockedUntil < 0
      || typeof lockouts !== 'number' || !Number.isSafeInteger(lockouts) || lockouts < 0
      || (failures === MAX_SIGN_IN_ATTEMPTS && lockedUntil === 0)) return freshSignInAttempts()
    return expireSignInAttempts({ failures, lockedUntil, lockouts }, now)
  } catch {
    return expireSignInAttempts(fallback, now)
  }
}

export function writeSignInAttempts(storage: Storage, attempts: SignInAttempts): void {
  try {
    storage.setItem(SIGN_IN_ATTEMPTS_KEY, JSON.stringify(attempts))
  } catch {
    // The page still enforces the limit in memory if storage is unavailable.
  }
}

export function failedSignInAttempts(attempts: SignInAttempts, now = Date.now()): SignInAttempts {
  if (attempts.lockedUntil > now) return attempts
  const failures = Math.min(MAX_SIGN_IN_ATTEMPTS, (attempts.lockedUntil > 0 ? 0 : attempts.failures) + 1)
  const lockouts = attempts.lockouts + (failures >= MAX_SIGN_IN_ATTEMPTS ? 1 : 0)
  const cooldown = Math.min(MAX_SIGN_IN_COOLDOWN_MS, SIGN_IN_COOLDOWN_MS * 2 ** Math.min(lockouts - 1, 4))
  return { failures, lockedUntil: failures >= MAX_SIGN_IN_ATTEMPTS ? now + cooldown : 0, lockouts }
}
