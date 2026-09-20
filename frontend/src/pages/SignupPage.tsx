import { useState, useEffect } from 'react'
import type { SyntheticEvent } from 'react'
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from 'firebase/auth'
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, collection, writeBatch, query, where, getDocs } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { Button } from '../components/Button'
import { TextInput } from '../components/TextInput'
import { ExclamationIcon } from '../components/Icons'
import { ArchitecturalBackground } from '../components/ArchitecturalBackground'

const heroSlides = [
  {
    image: '/upang_main_building.jpg',
    headline: 'University of Pangasinan\nRoom Management System',
    subtitle: 'Streamlined classroom and laboratory scheduling for PHINMA UPang faculty and students.',
  },
  {
    image: '/upang_campus_stairs.jpg',
    headline: 'Modern Campus Facilities,\nConnected Academic Spaces',
    subtitle: 'Empowering academic heads and instructors with real-time room reservations and scheduling clarity.',
  },
  {
    image: '/upang_classroom_halls.jpg',
    headline: 'Smart Room Allocation,\nEfficient Hallway Management',
    subtitle: 'Transparent workflows for administrators, deans, program heads, and instructors across campus.',
  },
]

interface SignUpPageProps {
  onSignup: () => void
  onBackToSignIn?: () => void
}

function SignUpPage({ onSignup, onBackToSignIn }: SignUpPageProps) {
  const [showPassword, setShowPassword] = useState(false)
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
  const [currentSlide, setCurrentSlide] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length)
    }, 4500)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const validateInvitation = async () => {
      const params = new URLSearchParams(window.location.search)
      const token = params.get('token')

      if (!token) {
        setError('This invitation link is invalid or missing.')
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
        if (data.isReactivation) {
          setIsReactivation(true)
        }

        let assignedRole = data.role || 'Instructor'
        let assignedDepartment = data.department || ''

        if (data.membershipId) {
          const memDoc = await getDoc(doc(db, 'memberships', data.membershipId))
          if (memDoc.exists()) {
            const memData = memDoc.data()
            assignedRole = memData.role || assignedRole
            assignedDepartment = memData.department || assignedDepartment
          }
        } else {
          const memQ = query(collection(db, 'memberships'), where('email', '==', data.email))
          const memSnap = await getDocs(memQ)
          if (!memSnap.empty) {
            const memData = memSnap.docs[0].data()
            assignedRole = memData.role || assignedRole
            assignedDepartment = memData.department || assignedDepartment
          }
        }

        setRole(assignedRole)
        setDepartment(assignedDepartment)
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
    if (!inviteId || !email || !role) {
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
        
        const userDocData = userSnap.docs[0].data()
        
        const batch = writeBatch(db)
        batch.update(doc(db, 'users', userId), { 
          isActive: true, 
          updatedAt: serverTimestamp() 
        })
        
        const assignedDept = role === 'Admin'
          ? 'Administrative Office'
          : role === 'Registrar'
            ? "Registrar's Office"
            : (department || '')

        const inviteDocSnap = await getDoc(doc(db, 'invitations', inviteId))
        const inviteData = inviteDocSnap.exists() ? inviteDocSnap.data() : null
        const targetMembershipId = inviteData?.membershipId

        let existingStatus: string | undefined = undefined
        let existingJoinedAt: any = undefined

        if (targetMembershipId) {
          const existingMemDoc = await getDoc(doc(db, 'memberships', targetMembershipId))
          if (existingMemDoc.exists()) {
            const data = existingMemDoc.data()
            existingStatus = data.status
            existingJoinedAt = data.joinedAt
          }
        }

        const finalStatus = existingStatus !== undefined ? existingStatus : (assignedDept ? 'accepted' : '')
        const finalJoinedAt = existingJoinedAt !== undefined ? existingJoinedAt : (assignedDept ? serverTimestamp() : '')

        if (targetMembershipId) {
          batch.set(doc(db, 'memberships', targetMembershipId), { 
            userId, 
            fullName: userDocData.fullName || '',
            email: userDocData.email || email,
            role, 
            department: assignedDept, 
            status: finalStatus,
            joinedAt: finalJoinedAt 
          }, { merge: true })
        } else {
          const membershipRef = doc(collection(db, 'memberships'))
          batch.set(membershipRef, { 
            userId, 
            fullName: userDocData.fullName || '',
            email: userDocData.email || email,
            role, 
            department: assignedDept, 
            status: finalStatus,
            joinedAt: finalJoinedAt 
          })
        }
        
        batch.update(doc(db, 'invitations', inviteId), { 
          status: 'accepted' 
        })

        // Clean up any associated mail documents for this email
        const mailQuery = query(collection(db, 'mail'), where('to', '==', email))
        const mailSnapshot = await getDocs(mailQuery)
        mailSnapshot.forEach((mDoc) => {
          batch.delete(doc(db, 'mail', mDoc.id))
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

      const assignedDept = role === 'Admin'
        ? 'Administrative Office'
        : role === 'Registrar'
          ? "Registrar's Office"
          : (department || '')

      batch.set(userRef, {
        email: email,
        fullName: fullName,
        isVerify: user.emailVerified,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        profilePicture: '',
        isActive: true
      })

      const inviteDocSnap = await getDoc(doc(db, 'invitations', inviteId))
      const inviteData = inviteDocSnap.exists() ? inviteDocSnap.data() : null
      const targetMembershipId = inviteData?.membershipId

      const finalStatus = assignedDept ? 'accepted' : ''
      const finalJoinedAt = assignedDept ? serverTimestamp() : ''

      if (targetMembershipId) {
        batch.set(doc(db, 'memberships', targetMembershipId), {
          userId: user.uid,
          fullName: fullName,
          email: email,
          department: assignedDept,
          role: role,
          status: finalStatus,
          joinedAt: finalJoinedAt
        }, { merge: true })
      } else {
        const membershipRef = doc(collection(db, 'memberships'))
        batch.set(membershipRef, {
          userId: user.uid,
          fullName: fullName,
          email: email,
          department: assignedDept,
          role: role,
          status: finalStatus,
          joinedAt: finalJoinedAt
        })
      }

      // Mark invitation as accepted
      batch.update(doc(db, 'invitations', inviteId), {
        status: 'accepted'
      })

      // Clean up any associated mail documents for this email
      const mailQuery = query(collection(db, 'mail'), where('to', '==', email))
      const mailSnapshot = await getDocs(mailQuery)
      mailSnapshot.forEach((mDoc) => {
        batch.delete(doc(db, 'mail', mDoc.id))
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
    <main className="relative h-screen w-screen max-h-screen overflow-hidden flex p-3 sm:p-4 lg:p-5 gap-6 lg:gap-8">
      {/* Architectural Blueprint & Topographic Campus Matrix Background */}
      <ArchitecturalBackground />

      {/* Left Hero Banner (60% Width) with Animated Carousel */}
      <section className="relative z-10 hidden lg:flex lg:w-[60%] h-full flex-col justify-between overflow-hidden rounded-2xl sm:rounded-3xl p-6 sm:p-8 lg:p-12 text-white shadow-2xl shrink-0 select-none border border-slate-200/40">
        {/* Background Image Carousel with Cross-fade */}
        {heroSlides.map((slide, idx) => (
          <div
            key={slide.image}
            className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out ${
              idx === currentSlide ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            style={{ backgroundImage: `url('${slide.image}')` }}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/50" />

        {/* Top Branding */}
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <img
              src="/logo2.png"
              alt="PHINMA UPang seal"
              className="h-12 w-12 shrink-0 rounded-full bg-white p-0.5 object-contain drop-shadow"
            />
            <div className="space-y-0.5">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/90">
                PHINMA UPANG
              </p>
              <h1 className="text-sm font-semibold leading-tight text-white drop-shadow">
                Registrar Office Room Management System
              </h1>
            </div>
          </div>

          {onBackToSignIn ? (
            <button
              type="button"
              onClick={onBackToSignIn}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur-md hover:bg-white/20 transition cursor-pointer"
            >
              ← Back to Sign In
            </button>
          ) : (
            <div className="hidden sm:inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur-md">
              PHINMA Education
            </div>
          )}
        </div>

        {/* Bottom Headline & Interactive Carousel Indicators */}
        <div className="relative z-10 space-y-4">
          <div className="min-h-[100px] flex flex-col justify-end">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white drop-shadow-md whitespace-pre-line transition-all duration-500">
              {heroSlides[currentSlide].headline}
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-white/80 font-normal drop-shadow transition-all duration-500">
              {heroSlides[currentSlide].subtitle}
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            {heroSlides.map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Go to slide ${idx + 1}`}
                onClick={() => setCurrentSlide(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                  idx === currentSlide
                    ? 'w-10 bg-white'
                    : 'w-6 bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Right Form Area (40% Width) */}
      <section className="relative z-10 w-full lg:w-[40%] h-full flex flex-col justify-center px-2 sm:px-6 lg:px-8 overflow-y-auto">
        <div className="w-full max-w-md mx-auto my-auto rounded-2xl sm:rounded-3xl bg-white/85 backdrop-blur-xl p-6 sm:p-8 md:p-10 shadow-[0_15px_45px_rgba(49,70,30,0.08)] border border-white/90 sm:border-slate-200/50">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--brand-color)]">
            {isReactivation ? 'Reactivate' : 'Sign Up'}
          </p>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900">
            {isReactivation ? 'Welcome Back' : 'Create Account'}
          </h2>
          {role && (
            <div className="mt-3 flex justify-center">
              <span className="rounded-full border border-[var(--brand-color)]/20 bg-[var(--brand-color)]/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[var(--brand-color)]">
                Joining as {role}
              </span>
            </div>
          )}
          <p className="mt-1 text-center text-sm leading-6 text-[var(--hint-color)]">
            {isReactivation 
              ? 'Your account has been invited back.' 
              : 'Join the team and start managing rooms.'}
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit} autoComplete="off">
            {error && (
              <div className="flex items-start gap-2.5 animate-in rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-medium leading-relaxed text-red-600">
                <ExclamationIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            
            {!error && isReactivation && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-[var(--brand-color)]/20 bg-[var(--brand-color)]/5 p-4">
                  <p className="text-sm text-gray-700 text-center">
                    You are restoring your account for: <br />
                    <span className="mt-1 block text-lg font-bold text-[var(--brand-color)]">{email}</span>
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
                   <p className="mt-2 text-xs text-[var(--hint-color)]">
                     Must be at least 6 characters.
                   </p>
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
                className="text-xs font-semibold text-gray-500 transition-colors hover:text-[var(--brand-color)] cursor-pointer"
              >
                ← Back to Sign In
              </button>
            </div>
          )}

          <p className="mt-8 text-center text-xs font-medium text-gray-400">
            &copy; 2026 RORMS &middot; PHINMA Education
          </p>
        </div>
      </section>
  </main>
  )
}

export default SignUpPage
