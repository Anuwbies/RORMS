import { useState, useEffect } from 'react'
import type { SyntheticEvent } from 'react'
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from 'firebase/auth'
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, collection, writeBatch, query, where, getDocs } from 'firebase/firestore'
import { auth, db } from '../firebase'
import InfoTabContent from '../components/InfoTabContent'
import { Button } from '../components/Button'
import { TextInput } from '../components/TextInput'


type TabKey = 'home' | 'about' | 'contact'

interface SignUpPageProps {
  onSignup: () => void
  onBackToSignIn?: () => void
}

function SignUpPage({ onSignup, onBackToSignIn }: SignUpPageProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('home')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<string | null>(null)
  const [department, setDepartment] = useState('')
  const [inviteId, setInviteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isValidating, setIsValidating] = useState(true)
  const [isReactivation, setIsReactivation] = useState(false)

  useEffect(() => {
    const validateInvitation = async () => {
      const params = new URLSearchParams(window.location.search)
      const token = params.get('token')

      if (!token) {
        // In preview/testing mode without a token, populate sample values so the UI can be tested
        setEmail('test.instructor@phinmaed.com')
        setRole('Instructor')
        setDepartment('CITE')
        setIsValidating(false)
        return
      }

      setInviteId(token)
      try {
        const inviteDoc = await getDoc(doc(db, 'invitations', token))
        
        if (!inviteDoc.exists()) {
          setError('This invitation link is invalid.')
          setIsValidating(false)
          return
        }

        const data = inviteDoc.data()
        
        if (data.status !== 'pending') {
          setError('This invitation has already been used.')
          setIsValidating(false)
          return
        }

        if (data.expiresAt.toDate() < new Date()) {
          setError('This invitation link has expired.')
          setIsValidating(false)
          return
        }

        setEmail(data.email)
        setRole(data.role)
        setDepartment(data.department || '')
        if (data.isReactivation) {
          setIsReactivation(true)
        }
      } catch (err) {
        console.error('Error validating invitation:', err)
        setError('Failed to validate invitation. Please try again later.')
      } finally {
        setIsValidating(false)
      }
    }

    validateInvitation()
  }, [])

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!inviteId) {
      setError('You are in test/preview mode. Use a valid invitation link to register a live account.')
      return
    }
    if (!email || !role) {
      setError('Invalid registration state.')
      return
    }

    setLoading(true)
    setError(null)
    
    if (isReactivation) {
      try {
        const userQuery = query(collection(db, 'users'), where('email', '==', email))
        const userSnap = await getDocs(userQuery)
        
        if (userSnap.empty) {
          setError('Could not find your original account.')
          setLoading(false)
          return
        }
        
        const userId = userSnap.docs[0].id
        
        const batch = writeBatch(db)
        batch.update(doc(db, 'users', userId), { 
          isActive: true, 
          updatedAt: serverTimestamp() 
        })
        
        const membershipRef = doc(collection(db, 'memberships'))
        batch.set(membershipRef, { 
          userId, 
          role, 
          departmentCode: department, 
          joinedAt: serverTimestamp() 
        })
        
        batch.update(doc(db, 'invitations', inviteId), { 
          status: 'accepted' 
        })
        
        await batch.commit()
        
        // Let the user sign in manually now that they are reactivated
        window.location.href = '/'
      } catch (err) {
        console.error('Reactivation error:', err)
        setError('Failed to reactivate account. Please try again.')
      } finally {
        setLoading(false)
      }
      return
    }
    
    try {
      sessionStorage.setItem('rorms_verification_cooldown', Date.now().toString())
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const user = userCredential.user
      const fullName = `${firstName} ${lastName}`
      
      // Send verification email
      await sendEmailVerification(user)
      sessionStorage.setItem('rorms_verification_cooldown', Date.now().toString())

      // Update profile with names
      await updateProfile(user, {
        displayName: fullName
      })

      // Use a batch to create both documents atomically and update invitation
      const batch = writeBatch(db)
      const userRef = doc(db, 'users', user.uid)
      const membershipRef = doc(collection(db, 'memberships'))

      batch.set(userRef, {
        email: email,
        fullName: fullName,
        isVerify: user.emailVerified,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        profilePicture: '',
        isActive: true
      })

      batch.set(membershipRef, {
        userId: user.uid,
        departmentCode: department,
        role: role,
        joinedAt: serverTimestamp()
      })

      // Mark invitation as accepted
      batch.update(doc(db, 'invitations', inviteId), {
        status: 'accepted'
      })

      await batch.commit()
      window.history.replaceState({}, '', '/')
      onSignup()
    } catch (err: any) {
      sessionStorage.removeItem('rorms_verification_cooldown')
      console.error('Sign up error:', err)
      switch (err.code) {
        case 'auth/email-already-in-use':
          setError('Email is already in use.')
          break
        case 'auth/invalid-email':
          setError('Invalid email address.')
          break
        case 'auth/weak-password':
          setError('Password should be at least 6 characters.')
          break
        default:
          setError('Failed to create account. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (isValidating) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--brand-surface)]">
        <div className="text-center">
          <div className="h-12 w-12 border-4 border-[var(--brand-color)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--hint-color)]">Validating invitation...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[var(--brand-surface)] lg:grid lg:grid-cols-[3fr_2fr]">
      <section className="flex min-h-[36vh] flex-col gap-8 bg-[var(--brand-color)] px-6 py-6 text-[var(--brand-color)] lg:min-h-screen lg:p-10">
        <nav className="flex w-full flex-wrap items-center justify-between gap-5 rounded-2xl border border-gray-200/20 bg-[var(--card-surface)] px-4 py-2 shadow-[0_16px_40px_rgba(0,0,0,0.12)]">
          <div className="flex min-w-0 items-center gap-4">
            <img
              src="/logo2.png"
              alt="PHINMA UPang seal"
              className="h-14 w-14 shrink-0 object-contain"
            />
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-semibold uppercase leading-none tracking-[0.3em] text-[var(--brand-color)] sm:text-sm">
                PHINMA UPANG
              </p>
              <h1 className="text-sm font-semibold leading-none text-black sm:text-base">
                Registrar Office Room Management System
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-4 text-sm font-medium text-black">
            {(['home', 'about', 'contact'] as const).map((tab) => {
              const isActive = activeTab === tab
              const label = tab.charAt(0).toUpperCase() + tab.slice(1)

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`relative px-2 py-1.5 transition after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:rounded-full after:bg-[var(--brand-color)] after:transition-transform after:content-[''] ${
                    isActive
                      ? 'text-[var(--brand-color)] after:scale-x-100'
                      : 'text-black after:origin-center after:scale-x-0 hover:text-[var(--brand-color)] hover:after:scale-x-100'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </nav>

        <div className="flex w-full min-h-0 flex-1 items-stretch">
          <div className="h-full w-full rounded-3xl border border-gray-200/20 bg-[var(--brand-surface)] p-8 shadow-[0_24px_50px_rgba(0,0,0,0.12)]">
            <InfoTabContent activeTab={activeTab} />
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-6 py-10 sm:px-10 lg:px-12">
        <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-[var(--card-surface)] p-8 shadow-[0_32px_64px_rgba(0,0,0,0.14)] sm:p-10">
          <p className="text-center text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand-color)]">
            {isReactivation ? 'Reactivate' : 'Sign Up'}
          </p>
          <h2 className="mt-3 text-center text-3xl font-semibold text-black">
            {isReactivation ? 'Welcome Back' : 'Create Account'}
          </h2>
          {role && (
            <p className="mt-1 text-center text-sm font-bold text-[var(--brand-color)]">
              Joining as {role}
            </p>
          )}
          <p className="mt-1 text-center text-sm leading-6 text-[var(--hint-color)]">
            {isReactivation 
              ? 'Your account has been invited back.' 
              : 'Join the team and start managing rooms.'}
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit} autoComplete="off">
            {error && (
              <div className="rounded-xl bg-red-50 p-3 text-xs text-red-600 border border-red-100">
                {error}
              </div>
            )}
            
            {!error && isReactivation && (
              <div className="space-y-6">
                <div className="rounded-2xl bg-gray-50 p-4 border border-gray-200">
                  <p className="text-sm text-gray-700 text-center">
                    You are restoring your account for: <br />
                    <span className="font-bold text-gray-900 mt-1 block">{email}</span>
                  </p>
                </div>
                
                <Button
                  type="submit"
                  variant="brand"
                  disabled={loading}
                  className="w-full shadow-md"
                >
                  {loading ? 'Reactivating...' : 'Accept & Reactivate Account'}
                </Button>
              </div>
            )}
            
            {!error && !isReactivation && (
              <>
                <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-normal text-black">
                      First Name <span className="text-red-500">*</span>
                    </span>
                    <TextInput
                      type="text"
                      value={firstName}
                      onChange={setFirstName}
                      placeholder="John"
                      autoComplete="given-name"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-normal text-black">
                      Last Name <span className="text-red-500">*</span>
                    </span>
                    <TextInput
                      type="text"
                      value={lastName}
                      onChange={setLastName}
                      placeholder="Doe"
                      autoComplete="family-name"
                      required
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-normal text-black">
                    Email <span className="text-red-500">*</span>
                  </span>
                  <TextInput
                    type="email"
                    value={email}
                    onChange={setEmail}
                    readOnly
                    placeholder="example.up@phinmaed.com"
                    autoComplete="off"
                    inputClassName="bg-gray-50 cursor-not-allowed"
                    required
                    rightIcon={
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 6.75h16A1.25 1.25 0 0 1 21.25 8v8A1.25 1.25 0 0 1 20 17.25H4A1.25 1.25 0 0 1 2.75 16V8A1.25 1.25 0 0 1 4 6.75Z" />
                        <path d="m3.5 8 8.01 6.01a.83.83 0 0 0 .98 0L20.5 8" />
                      </svg>
                    }
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-normal text-black">
                    Password <span className="text-red-500">*</span>
                  </span>
                  <TextInput
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={setPassword}
                    placeholder="Create a password"
                    autoComplete="new-password"
                    required
                    rightElement={
                      <button
                        type="button"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPassword((current) => !current)}
                        className="flex items-center text-[var(--hint-color)] transition hover:text-black focus:outline-none"
                      >
                        {showPassword ? (
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 3l18 18" />
                            <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
                            <path d="M9.88 5.09A10.94 10.94 0 0 1 12 4.91c5.05 0 9.27 3.11 10.5 7.09a11.8 11.8 0 0 1-2.41 3.97" />
                            <path d="M6.61 6.61A11.84 11.84 0 0 0 1.5 12c1.23 3.98 5.45 7.09 10.5 7.09 1.8 0 3.51-.39 5.04-1.09" />
                          </svg>
                        ) : (
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M1.5 12S5.5 4.91 12 4.91 22.5 12 22.5 12 18.5 19.09 12 19.09 1.5 12 1.5 12Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    }
                  />
                </label>

                <Button
                  type="submit"
                  variant="brand"
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? 'Creating account...' : 'Create Account'}
                </Button>
              </>
            )}
          </form>

          {onBackToSignIn && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={onBackToSignIn}
                className="text-xs font-semibold text-gray-500 hover:text-[var(--brand-color)] transition-colors cursor-pointer"
              >
                ← Back to Sign In
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

export default SignUpPage
