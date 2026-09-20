import React from 'react'

export function ArchitecturalBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden select-none">
      <svg
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="canvas-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f7faf4" />
            <stop offset="0.55" stopColor="#edf4e8" />
            <stop offset="1" stopColor="#e4efdc" />
          </linearGradient>

          <radialGradient id="olive-glow" cx="100%" cy="0%" r="85%">
            <stop offset="0" stopColor="#7b9d4f" stopOpacity="0.2" />
            <stop offset="0.45" stopColor="#a3c48b" stopOpacity="0.1" />
            <stop offset="1" stopColor="#a3c48b" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="gold-glow" cx="0%" cy="100%" r="70%">
            <stop offset="0" stopColor="#f59e0b" stopOpacity="0.07" />
            <stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="form-glow" cx="78%" cy="50%" r="42%">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>

          <pattern id="blueprint-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M48 0H0V48" fill="none" stroke="#62853e" strokeWidth="1" opacity="0.08" />
            <path d="M24 0V48M0 24H48" fill="none" stroke="#62853e" strokeWidth="0.6" opacity="0.045" />
          </pattern>

          <pattern id="gold-dots" width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.2" fill="#f59e0b" opacity="0.48" />
          </pattern>
        </defs>

        {/* Calm canvas and ambient color fields */}
        <rect width="1440" height="900" fill="url(#canvas-gradient)" />
        <rect width="1440" height="900" fill="url(#blueprint-grid)" />
        <rect width="1440" height="900" fill="url(#olive-glow)" />
        <rect width="1440" height="900" fill="url(#gold-glow)" />
        <rect width="1440" height="900" fill="url(#form-glow)" />

        {/* Campus-plan linework */}
        <g fill="none" stroke="#41572a" strokeWidth="1" opacity="0.11">
          <path d="M-40 728C170 616 320 646 440 758C538 850 684 876 822 812" />
          <path d="M-28 754C172 650 304 674 426 778C536 874 676 892 806 834" />
          <path d="M1050 116H1232V274H1050ZM1090 156H1192V234H1090Z" />
          <path d="M1090 156L1192 234M1192 156L1090 234" />
          <path d="M88 128H214V254H88ZM120 160H182V222H120Z" />
          <path d="M120 160L182 222M182 160L120 222" />
        </g>

        {/* Framed blueprint module beside the authentication card */}
        <g fill="none" stroke="#41572a" strokeWidth="1.2" opacity="0.14">
          <rect x="1200" y="180" width="180" height="180" rx="6" />
          <rect x="1216" y="196" width="148" height="148" rx="3" stroke="#62853e" strokeDasharray="5 7" opacity="0.72" />
          <path d="M1200 220H1220M1200 320H1220M1360 220H1380M1360 320H1380" strokeLinecap="round" />
          <path d="M1200 180L1240 220M1380 180L1340 220" opacity="0.55" />
        </g>

        {/* Minimal blueprint details and warm corner accent */}
        <rect x="1276" y="758" width="92" height="58" rx="4" fill="url(#gold-dots)" opacity="0.55" />
        <g fill="#f59e0b">
          <circle cx="1260" cy="202" r="8" opacity="0.65" />
        </g>
        <g fill="none" stroke="#ffffff" strokeLinecap="round">
          <path d="M1240 54L1290 104" strokeWidth="2.5" opacity="0.5" />
          <path d="M1320 758L1370 808" strokeWidth="3" opacity="0.42" />
        </g>
      </svg>
    </div>
  )
}
