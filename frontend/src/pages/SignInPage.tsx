import { useState } from 'react'

type TabKey = 'home' | 'about' | 'contact'

const tabContent: Record<
  TabKey,
  {
    eyebrow: string
    title: string
    description: string
    blocks: string[]
  }
> = {
  home: {
    eyebrow: 'Home',
    title: 'Landing page placeholder',
    description:
      'This area can hold the welcome banner, key announcements, and a quick overview of the room management system.',
    blocks: ['Hero banner placeholder', 'Highlights placeholder', 'Announcement placeholder'],
  },
  about: {
    eyebrow: 'About',
    title: 'About page placeholder',
    description:
      'This area can introduce the Registrar Office Room Management system, its purpose, and the main user roles it supports.',
    blocks: ['Mission placeholder', 'System overview placeholder', 'Role summary placeholder'],
  },
  contact: {
    eyebrow: 'Contact',
    title: 'Contact page placeholder',
    description:
      'This area can show registrar office contact details, office hours, support channels, and response expectations.',
    blocks: ['Contact details placeholder', 'Office hours placeholder', 'Support form placeholder'],
  },
}

const homeImages = {
  hero:
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80',
  campus:
    'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=900&q=80',
  workspace:
    'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80',
}

function SignInPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('home')

  const currentTab = tabContent[activeTab]

  return (
    <main className="min-h-screen bg-white lg:grid lg:grid-cols-[3fr_2fr]">
      <section className="flex min-h-[36vh] flex-col gap-8 bg-zinc-300 px-6 py-6 text-zinc-700 lg:min-h-screen lg:p-10">
        <nav className="flex w-full flex-wrap items-center justify-between gap-5 rounded-xl border border-white/55 bg-white/30 px-4 py-2 backdrop-blur-sm">
          <div className="flex min-w-0 items-center gap-4">
            <img
              src="/logo.png"
              alt="PHINMA UPang seal"
              className="h-14 w-14 shrink-0 object-contain"
            />
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-semibold uppercase leading-none tracking-[0.3em] text-[#f3a91f] sm:text-sm">
                PHINMA UPANG
              </p>
              <h1 className="text-sm font-semibold leading-none text-zinc-800 sm:text-base">
                Registrar Office Room Management
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-4 text-sm font-medium text-zinc-700">
            {(['home', 'about', 'contact'] as const).map((tab) => {
              const isActive = activeTab === tab
              const label = tab.charAt(0).toUpperCase() + tab.slice(1)

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`relative px-2 py-1.5 transition after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:rounded-full after:bg-[#f3a91f] after:transition-transform after:content-[''] ${
                    isActive
                      ? 'text-[#f3a91f] after:scale-x-100'
                      : 'text-black after:origin-center after:scale-x-0 hover:text-[#f3a91f] hover:after:scale-x-100'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </nav>

        <div className="flex w-full min-h-0 flex-1 items-stretch">
          {activeTab === 'home' ? (
            <div className="h-full w-full rounded-2xl border border-white/50 bg-[linear-gradient(145deg,rgba(255,255,255,0.44),rgba(255,255,255,0.2))] p-6 backdrop-blur-sm lg:p-7">
              <div className="grid h-full gap-5 xl:grid-cols-[1.05fr_0.95fr]">
                <div className="flex flex-col justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.45em] text-zinc-600">
                      Home
                    </p>
                    <h2 className="mt-4 max-w-xl text-4xl font-semibold leading-tight text-zinc-900 xl:text-[2.75rem]">
                      Manage campus room requests with a clearer front door.
                    </h2>
                    <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-700/90 sm:text-base">
                      This is a placeholder home interface for the public side
                      of the system. It can later introduce room scheduling,
                      approval flow, policy reminders, and registrar updates
                      before users sign in.
                    </p>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <span className="rounded-full border border-white/55 bg-white/55 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-zinc-700">
                      Room requests
                    </span>
                    <span className="rounded-full border border-white/55 bg-white/55 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-zinc-700">
                      Schedules
                    </span>
                    <span className="rounded-full border border-white/55 bg-white/55 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-zinc-700">
                      Approvals
                    </span>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/50 bg-white/35 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                        Welcome section
                      </p>
                      <p className="mt-3 text-sm leading-6 text-zinc-700">
                        Placeholder for a short introduction, announcements, or
                        a quick guide before users sign in.
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/50 bg-white/35 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                        Featured note
                      </p>
                      <p className="mt-3 text-sm leading-6 text-zinc-700">
                        Placeholder for reservation reminders, office notices,
                        or highlighted room policies.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="relative overflow-hidden rounded-2xl border border-white/45 bg-white/25">
                    <img
                      src={homeImages.hero}
                      alt="Modern meeting room placeholder"
                      className="h-56 w-full object-cover lg:h-60"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">
                        Featured space
                      </p>
                      <h3 className="mt-2 text-2xl font-semibold">
                        Home tab visual placeholder
                      </h3>
                      <p className="mt-2 max-w-md text-sm text-white/85">
                        Internet-hosted image placeholder for a future hero
                        section.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="overflow-hidden rounded-2xl border border-white/45 bg-white/30">
                      <img
                        src={homeImages.campus}
                        alt="Campus placeholder"
                        className="h-28 w-full object-cover lg:h-32"
                        loading="lazy"
                      />
                      <div className="p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                          Campus
                        </p>
                        <p className="mt-2 text-sm font-medium text-zinc-800">
                          Public overview placeholder for featured buildings and
                          locations.
                        </p>
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-white/45 bg-white/30">
                      <img
                        src={homeImages.workspace}
                        alt="Workspace placeholder"
                        className="h-28 w-full object-cover lg:h-32"
                        loading="lazy"
                      />
                      <div className="p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                          Workspace
                        </p>
                        <p className="mt-2 text-sm font-medium text-zinc-800">
                          Placeholder image for schedules, room cards, or queue
                          previews.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full w-full rounded-2xl border border-white/50 bg-white/20 p-8 backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.45em] text-zinc-600">
                {currentTab.eyebrow}
              </p>
              <h2 className="mt-4 text-3xl font-semibold text-zinc-800 sm:text-4xl">
                {currentTab.title}
              </h2>
              <p className="mt-4 max-w-lg text-sm leading-6 text-zinc-700/85 sm:text-base">
                {currentTab.description}
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {currentTab.blocks.map((block) => (
                  <div
                    key={block}
                    className="rounded-xl border border-white/50 bg-white/30 p-5 text-sm font-medium text-zinc-700"
                  >
                    {block}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-6 py-10 sm:px-10 lg:px-12">
        <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 shadow-[0_24px_60px_rgba(0,0,0,0.08)] sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand-gold)]">
            Sign In
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-[var(--brand-olive-deep)]">
            Welcome back
          </h2>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Access the room reservation system with your account.
          </p>

          <form className="mt-8 space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-700">
                Email <span className="text-red-500">*</span>
              </span>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-zinc-500">
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
                </span>
                <input
                  type="email"
                  placeholder="name@company.com"
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 pr-12 text-sm text-zinc-900 outline-none transition focus:border-[var(--brand-gold)] focus:bg-white"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-700">
                Password <span className="text-red-500">*</span>
              </span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 pr-12 text-sm text-zinc-900 outline-none transition focus:border-[var(--brand-gold)] focus:bg-white"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute inset-y-0 right-0 flex items-center px-4 text-zinc-500 transition hover:text-zinc-700"
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
              </div>
            </label>

            <button
              type="submit"
              className="w-full rounded-lg bg-[var(--brand-olive)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-olive-deep)]"
            >
              Sign in
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-200" />
            <span className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-400">
              Or continue with
            </span>
            <div className="h-px flex-1 bg-zinc-200" />
          </div>

          <button
            type="button"
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
            >
              <path
                d="M21.805 12.23c0-.78-.07-1.53-.2-2.25H12v4.26h5.49a4.7 4.7 0 0 1-2.04 3.08v2.56h3.3c1.93-1.78 3.055-4.4 3.055-7.65Z"
                fill="#4285F4"
              />
              <path
                d="M12 22c2.76 0 5.08-.91 6.77-2.47l-3.3-2.56c-.91.61-2.08.97-3.47.97-2.66 0-4.91-1.8-5.72-4.21H2.87v2.64A10 10 0 0 0 12 22Z"
                fill="#34A853"
              />
              <path
                d="M6.28 13.73A6 6 0 0 1 5.96 12c0-.6.11-1.17.32-1.73V7.63H2.87A10 10 0 0 0 2 12c0 1.61.39 3.13.87 4.37l3.41-2.64Z"
                fill="#FBBC05"
              />
              <path
                d="M12 6.06c1.5 0 2.84.52 3.9 1.55l2.92-2.92C17.07 3.07 14.75 2 12 2A10 10 0 0 0 2.87 7.63l3.41 2.64C7.09 7.86 9.34 6.06 12 6.06Z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </button>
        </div>
      </section>
    </main>
  )
}

export default SignInPage
