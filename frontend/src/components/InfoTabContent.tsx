import React from 'react'

type TabKey = 'home' | 'about' | 'contact'

interface InfoTabContentProps {
  activeTab: TabKey
}

export default function InfoTabContent({ activeTab }: InfoTabContentProps) {
  if (activeTab === 'home') {
    return (
      <div className="flex h-full flex-col overflow-hidden text-black">
        <h2 className="mb-4 text-2xl font-bold text-[var(--brand-color)]">
          Welcome to PHINMA UPang
        </h2>
        <div className="relative mb-6 w-full flex-1 overflow-hidden rounded-xl border border-gray-200 shadow-sm">
          <img 
            src="/upang_campus_placeholder.png" 
            alt="PHINMA University of Pangasinan Campus" 
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
        <p className="text-sm leading-relaxed text-gray-700">
          The <strong>Registrar Office Room Management System (RORMS)</strong> streamlines 
          room reservations, scheduling, and facility management across the campus. Experience 
          a modern approach to educational administration.
        </p>
      </div>
    )
  }

  if (activeTab === 'about') {
    return (
      <div className="flex h-full flex-col text-black">
        <h2 className="mb-6 text-2xl font-bold text-[var(--brand-color)]">
          About RORMS
        </h2>
        <div className="flex-1 space-y-5 overflow-y-auto pr-2 custom-scrollbar">
          <div className="rounded-xl bg-gray-50 p-5 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-lg mb-2">Our Mission</h3>
            <p className="text-sm text-gray-700 leading-relaxed">
              To provide a seamless, efficient, and transparent room allocation process for the 
              faculty and staff of PHINMA University of Pangasinan, fostering an environment 
              conducive to learning and collaboration.
            </p>
          </div>
          
          <div className="rounded-xl bg-gray-50 p-5 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-lg mb-2">Features</h3>
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-2">
              <li>Real-time room availability checking.</li>
              <li>Automated scheduling and conflict resolution.</li>
              <li>Comprehensive dashboard for facility managers.</li>
              <li>Easy request submission and tracking.</li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  if (activeTab === 'contact') {
    return (
      <div className="flex h-full flex-col text-black">
        <h2 className="mb-6 text-2xl font-bold text-[var(--brand-color)]">
          Contact Us
        </h2>
        <p className="mb-6 text-sm text-gray-600">
          Need assistance or have inquiries? Reach out to the PHINMA UPang Registrar Office 
          through any of the channels below.
        </p>
        
        <div className="space-y-4 flex-1">
          <div className="flex items-center gap-4 rounded-xl bg-gray-50 p-4 border border-gray-100">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-color)]/10 text-[var(--brand-color)]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-gray-500">Email Address</p>
              <p className="text-sm font-medium text-black">registrar.upang@phinmaed.com</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 rounded-xl bg-gray-50 p-4 border border-gray-100">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-color)]/10 text-[var(--brand-color)]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-gray-500">Phone</p>
              <p className="text-sm font-medium text-black">+63 (075) 522-5635</p>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-xl bg-gray-50 p-4 border border-gray-100">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-color)]/10 text-[var(--brand-color)]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-gray-500">Location</p>
              <p className="text-sm font-medium text-black">Arellano St, Dagupan City, 2400 Pangasinan</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
