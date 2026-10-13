export const MIN_PASSWORD_LENGTH = 12
export const PASSWORD_REQUIREMENTS = 'Use at least 12 characters, including an uppercase letter, a lowercase letter, a number, and a symbol.'

export function getPasswordError(password: string): string | null {
  const missing: string[] = []
  if (password.length < MIN_PASSWORD_LENGTH) missing.push(`at least ${MIN_PASSWORD_LENGTH} characters`)
  if (!/[A-Z]/.test(password)) missing.push('an uppercase letter')
  if (!/[a-z]/.test(password)) missing.push('a lowercase letter')
  if (!/[0-9]/.test(password)) missing.push('a number')
  if (!/[!-/:-@\[-`{-~]/.test(password)) missing.push('a symbol')
  return missing.length ? `Password needs ${missing.join(', ')}.` : null
}
