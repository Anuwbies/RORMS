import { useMemo, useState, useEffect } from 'react';

export type TimeOfDay = 'auto' | 'dawn' | 'day' | 'sunset' | 'night';

export type MoonPhaseKey = 
  | 'auto' 
  | 'new' 
  | 'waxing_crescent' 
  | 'first_quarter' 
  | 'waxing_gibbous' 
  | 'full' 
  | 'waning_gibbous' 
  | 'last_quarter' 
  | 'waning_crescent';

export interface MoonPhaseInfo {
  fraction: number; // 0.0 to 1.0
  phaseKey: MoonPhaseKey;
  phaseName: string;
  emoji: string;
}

export function getAstronomicalMoonPhase(date: Date = new Date()): MoonPhaseInfo {
  // Reference known New Moon: Jan 11, 2024, 11:57 UTC
  const knownNewMoon = new Date('2024-01-11T11:57:00Z').getTime();
  const synodicMonthMs = 29.53058867 * 24 * 60 * 60 * 1000;
  const diff = date.getTime() - knownNewMoon;
  const fraction = (((diff % synodicMonthMs) + synodicMonthMs) % synodicMonthMs) / synodicMonthMs;

  if (fraction < 0.03 || fraction >= 0.97) {
    return { fraction, phaseKey: 'new', phaseName: 'New Moon', emoji: '🌑' };
  } else if (fraction < 0.22) {
    return { fraction, phaseKey: 'waxing_crescent', phaseName: 'Waxing Crescent', emoji: '🌒' };
  } else if (fraction < 0.28) {
    return { fraction, phaseKey: 'first_quarter', phaseName: 'First Quarter', emoji: '🌓' };
  } else if (fraction < 0.47) {
    return { fraction, phaseKey: 'waxing_gibbous', phaseName: 'Waxing Gibbous', emoji: '🌔' };
  } else if (fraction < 0.53) {
    return { fraction, phaseKey: 'full', phaseName: 'Full Moon', emoji: '🌕' };
  } else if (fraction < 0.72) {
    return { fraction, phaseKey: 'waning_gibbous', phaseName: 'Waning Gibbous', emoji: '🌖' };
  } else if (fraction < 0.78) {
    return { fraction, phaseKey: 'last_quarter', phaseName: 'Last Quarter', emoji: '🌗' };
  } else {
    return { fraction, phaseKey: 'waning_crescent', phaseName: 'Waning Crescent', emoji: '🌘' };
  }
}

export function MoonGraphic({ fraction, size = 32 }: { fraction: number; size?: number }) {
  const R = 13;
  const cx = 16;
  const cy = 16;

  const phi = fraction * 2 * Math.PI;
  const cosPhi = Math.cos(phi);
  const rx = Math.max(0.01, Math.abs(cosPhi) * R);
  const isWaxing = fraction <= 0.5;

  let litPath = '';
  if (fraction < 0.025 || fraction > 0.975) {
    litPath = ''; // New moon (unlit)
  } else if (Math.abs(fraction - 0.5) < 0.025) {
    litPath = `M ${cx} ${cy - R} A ${R} ${R} 0 1 0 ${cx} ${cy + R} A ${R} ${R} 0 1 0 ${cx} ${cy - R}`; // Full moon
  } else if (isWaxing) {
    // Waxing: Outer right semi-circle, inner terminator
    const sweep = fraction < 0.25 ? 1 : 0;
    litPath = `M ${cx} ${cy - R} A ${R} ${R} 0 0 1 ${cx} ${cy + R} A ${rx} ${R} 0 0 ${sweep} ${cx} ${cy - R}`;
  } else {
    // Waning: Outer left semi-circle, inner terminator
    const sweep = fraction < 0.75 ? 1 : 0;
    litPath = `M ${cx} ${cy - R} A ${R} ${R} 0 0 0 ${cx} ${cy + R} A ${rx} ${R} 0 0 ${sweep} ${cx} ${cy - R}`;
  }

  const glowIntensity = Math.sin(fraction * Math.PI); // 0 at new, 1 at full

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className="overflow-visible select-none">
      <defs>
        <filter id="moonSoftGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={1.5 + glowIntensity * 2} result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <clipPath id="moonDiscClip">
          <circle cx={cx} cy={cy} r={R} />
        </clipPath>
      </defs>

      {/* Atmospheric Halo (Stronger near full moon) */}
      <circle 
        cx={cx} 
        cy={cy} 
        r={R + 2} 
        fill="rgba(254, 243, 199, 0.15)" 
        className="animate-pulse"
        style={{ opacity: 0.2 + glowIntensity * 0.6 }}
      />

      {/* Dark Lunar Disc with subtle rim border */}
      <circle 
        cx={cx} 
        cy={cy} 
        r={R} 
        fill="#0b1329" 
        stroke="rgba(255, 255, 255, 0.25)" 
        strokeWidth="0.75" 
      />

      {/* Base Craters on dark side */}
      <g clipPath="url(#moonDiscClip)" opacity="0.3">
        <circle cx="11.5" cy="11.5" r="2.2" fill="#1e293b" />
        <circle cx="19.5" cy="20.5" r="3.2" fill="#1e293b" />
        <circle cx="21.5" cy="11" r="1.6" fill="#1e293b" />
        <circle cx="13" cy="22" r="1.4" fill="#1e293b" />
      </g>

      {/* Illuminated Phase Area */}
      {litPath && (
        <path 
          d={litPath} 
          fill="#fef3c7" 
          filter="url(#moonSoftGlow)" 
        />
      )}

      {/* Illuminated Surface Texture / Craters */}
      {litPath && (
        <g clipPath="url(#moonDiscClip)" opacity={0.35 * (0.3 + glowIntensity * 0.7)}>
          <circle cx="11.5" cy="11.5" r="2.2" fill="#d97706" />
          <circle cx="19.5" cy="20.5" r="3.2" fill="#d97706" />
          <circle cx="21.5" cy="11" r="1.6" fill="#d97706" />
          <circle cx="13" cy="22" r="1.4" fill="#d97706" />
          <circle cx="16" cy="16" r="1.2" fill="#d97706" />
        </g>
      )}
    </svg>
  );
}

export function WeatherOverlay({ 
  weatherCode, 
  layer = 'all', 
  supermanKey = 0,
  timeOfDay = 'auto',
  moonPhaseOverride = 'auto'
}: { 
  weatherCode?: number;
  layer?: 'front' | 'back' | 'all';
  supermanKey?: number;
  timeOfDay?: TimeOfDay;
  moonPhaseOverride?: MoonPhaseKey;
}) {
  const isBack = layer === 'back' || layer === 'all';
  const isFront = layer === 'front' || layer === 'all';

  const [supermanFlight, setSupermanFlight] = useState<{ id: number; top: string; direction: number; duration: number; behavior: 'normal' | 'stop' | 'laser', stopPos: string }>({
    id: 0,
    top: '40%',
    direction: 1, // 1 for LTR, -1 for RTL
    duration: 5,
    behavior: 'normal',
    stopPos: '50%'
  });

  // Calculate actual time period if auto
  const effectiveTimeOfDay: 'dawn' | 'day' | 'sunset' | 'night' = useMemo(() => {
    if (timeOfDay && timeOfDay !== 'auto') return timeOfDay;
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 7) return 'dawn';
    if (hour >= 7 && hour < 17) return 'day';
    if (hour >= 17 && hour < 19) return 'sunset';
    return 'night';
  }, [timeOfDay]);

  // Calculate real astronomical moon phase or use override
  const effectiveMoonFraction = useMemo(() => {
    if (moonPhaseOverride === 'new') return 0.0;
    if (moonPhaseOverride === 'waxing_crescent') return 0.125;
    if (moonPhaseOverride === 'first_quarter') return 0.25;
    if (moonPhaseOverride === 'waxing_gibbous') return 0.375;
    if (moonPhaseOverride === 'full') return 0.5;
    if (moonPhaseOverride === 'waning_gibbous') return 0.625;
    if (moonPhaseOverride === 'last_quarter') return 0.75;
    if (moonPhaseOverride === 'waning_crescent') return 0.875;
    return getAstronomicalMoonPhase().fraction;
  }, [moonPhaseOverride]);

  useEffect(() => {
    if (supermanKey > 0) {
      const rand = Math.random();
      let behavior: 'normal' | 'stop' | 'laser' = 'normal';
      let duration = 0.5 + Math.random();
      if (rand > 0.7) {
        behavior = 'laser';
        duration = 5.0;
      } else if (rand > 0.4) {
        behavior = 'stop';
        duration = 3.5;
      }

      setSupermanFlight({
        id: Date.now(),
        top: `${Math.random() * 60 + 20}%`, // random height between 20% and 80%
        direction: Math.random() > 0.5 ? 1 : -1,
        duration,
        behavior,
        stopPos: `${Math.random() * 60 + 20}%` // stop anywhere between 20% and 80% width
      });
    }
  }, [supermanKey]);

  useEffect(() => {
    if (!isFront) return;
    let timeout: ReturnType<typeof setTimeout>;
    const scheduleNextFlight = () => {
      const nextDelay = 30000 + Math.random() * 20000;
      timeout = setTimeout(() => {
        const rand = Math.random();
        let behavior: 'normal' | 'stop' | 'laser' = 'normal';
        let duration = 0.5 + Math.random();
        if (rand > 0.7) {
          behavior = 'laser';
          duration = 5.0;
        } else if (rand > 0.4) {
          behavior = 'stop';
          duration = 3.5;
        }
        setSupermanFlight({
          id: Date.now(),
          top: `${Math.random() * 60 + 20}%`,
          direction: Math.random() > 0.5 ? 1 : -1,
          duration,
          behavior,
          stopPos: `${Math.random() * 60 + 20}%`
        });
        scheduleNextFlight();
      }, nextDelay);
    };
    
    scheduleNextFlight();
    return () => clearTimeout(timeout);
  }, [isFront]);

  const rainDrops = useMemo(() => Array.from({ length: 100 }).map((_, i) => ({
    left: `${(i / 100) * 100}%`,
    animationDuration: `${0.6 + Math.random() * 1.0}s`,
    animationDelay: `-${Math.random() * 4}s`
  })), []);

  const clouds = useMemo(() => Array.from({ length: 12 }).map(() => ({
    top: `${Math.random() * 50}%`,
    animationDuration: `${30 + Math.random() * 40}s`,
    animationDelay: `-${Math.random() * 70}s`,
    scale: 0.5 + Math.random() * 0.8
  })), []);

  const stars = useMemo(() => Array.from({ length: 30 }).map(() => ({
    top: `${Math.random() * 65}%`,
    left: `${Math.random() * 98}%`,
    size: Math.random() > 0.8 ? 2 : 1,
    animationDuration: `${2 + Math.random() * 3}s`,
    animationDelay: `-${Math.random() * 4}s`
  })), []);

  // Early return AFTER all hooks to satisfy Rules of Hooks
  if (weatherCode === undefined) return null;

  const isSunny = weatherCode === 0;
  const isCloudy = weatherCode >= 1 && weatherCode <= 3;
  const isRainy = (weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82);
  const isThunderstorm = weatherCode >= 95;

  const getCloudColor = () => {
    if (isThunderstorm) return 'bg-slate-700';
    if (isRainy) return 'bg-slate-500';
    if (effectiveTimeOfDay === 'night') return 'bg-slate-700/60';
    if (effectiveTimeOfDay === 'sunset') return 'bg-orange-200/50';
    if (effectiveTimeOfDay === 'dawn') return 'bg-amber-100/60';
    if (isCloudy) return 'bg-slate-200';
    return 'bg-slate-100';
  };
  const cloudColor = getCloudColor();

  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden rounded-xl ${isFront ? 'z-30 opacity-100' : 'z-0 opacity-60'}`}>
      <style>{`
        @keyframes weatherFall {
          0% { transform: translateY(-20px); opacity: 0; }
          10% { opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateY(300px); opacity: 0; }
        }
        @keyframes weatherFloat {
          0% { transform: translateX(-200px); }
          100% { transform: translateX(1000px); }
        }
        @keyframes weatherLightning {
          0%, 95%, 98% { opacity: 0; }
          96%, 99% { opacity: 0.6; }
          100% { opacity: 0; }
        }
        @keyframes weatherSun {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.2); opacity: 1; }
        }
        @keyframes starTwinkle {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes moonFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
        @keyframes supermanFlyLTR {
          0% { left: -50px; }
          100% { left: 110%; }
        }
        @keyframes supermanFlyRTL {
          0% { left: 110%; }
          100% { left: -50px; }
        }
        @keyframes supermanStopLTR {
          0% { left: -50px; transform: rotate(0deg); }
          35% { left: var(--stop-pos); transform: rotate(0deg); }
          40% { left: var(--stop-pos); transform: rotate(-90deg); }
          75% { left: var(--stop-pos); transform: rotate(-90deg); }
          80% { left: var(--stop-pos); transform: rotate(0deg); }
          100% { left: 110%; transform: rotate(0deg); }
        }
        @keyframes supermanStopRTL {
          0% { left: 110%; transform: rotate(0deg); }
          35% { left: var(--stop-pos); transform: rotate(0deg); }
          40% { left: var(--stop-pos); transform: rotate(90deg); }
          75% { left: var(--stop-pos); transform: rotate(90deg); }
          80% { left: var(--stop-pos); transform: rotate(0deg); }
          100% { left: -50px; transform: rotate(0deg); }
        }
        @keyframes supermanLaserLTR {
          0% { left: -50px; transform: rotate(0deg); }
          25% { left: var(--stop-pos); transform: rotate(0deg); }
          30% { left: var(--stop-pos); transform: rotate(-90deg); }
          50% { left: var(--stop-pos); transform: rotate(-90deg); }
          54% { left: var(--stop-pos); transform: rotate(-105deg); }
          58% { left: var(--stop-pos); transform: rotate(-85deg); }
          82% { left: var(--stop-pos); transform: rotate(-85deg); }
          87% { left: var(--stop-pos); transform: rotate(0deg); }
          100% { left: 110%; transform: rotate(0deg); }
        }
        @keyframes supermanLaserRTL {
          0% { left: 110%; transform: rotate(0deg); }
          25% { left: var(--stop-pos); transform: rotate(0deg); }
          30% { left: var(--stop-pos); transform: rotate(90deg); }
          50% { left: var(--stop-pos); transform: rotate(90deg); }
          54% { left: var(--stop-pos); transform: rotate(105deg); }
          58% { left: var(--stop-pos); transform: rotate(85deg); }
          82% { left: var(--stop-pos); transform: rotate(85deg); }
          87% { left: var(--stop-pos); transform: rotate(0deg); }
          100% { left: -50px; transform: rotate(0deg); }
        }
        @keyframes headRotate {
          0% { transform: rotate(0deg); }
          25% { transform: rotate(0deg); }
          30% { transform: rotate(90deg); }
          50% { transform: rotate(90deg); }
          54% { transform: rotate(105deg); }
          58% { transform: rotate(85deg); }
          82% { transform: rotate(85deg); }
          87% { transform: rotate(0deg); }
          100% { transform: rotate(0deg); }
        }
        @keyframes laserShoot {
          0% { width: 0px; opacity: 0; }
          6% { width: 800px; opacity: 1; }
          90% { width: 800px; opacity: 1; }
          100% { width: 800px; opacity: 0; }
        }
      `}</style>
      
      {/* 1. Time-of-Day Base Sky Tint (only in back layer) */}
      {isBack && (
        <>
          {effectiveTimeOfDay === 'dawn' && (
            <div className="absolute inset-0 bg-gradient-to-b from-amber-500/25 via-rose-400/15 to-orange-100/10" />
          )}
          {effectiveTimeOfDay === 'day' && isSunny && (
            <div className="absolute inset-0 bg-gradient-to-b from-amber-500/15 to-transparent" />
          )}
          {effectiveTimeOfDay === 'sunset' && (
            <div className="absolute inset-0 bg-gradient-to-b from-purple-900/35 via-orange-600/25 to-amber-500/15" />
          )}
          {effectiveTimeOfDay === 'night' && (
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-indigo-950/60 to-slate-900/40" />
          )}
        </>
      )}

      {/* 2. Weather Overcast Tints (only in back layer) */}
      {isBack && isCloudy && <div className="absolute inset-0 bg-gradient-to-b from-slate-500/30 to-slate-400/10" />}
      {isBack && isRainy && <div className="absolute inset-0 bg-gradient-to-b from-slate-800/50 to-slate-700/10" />}
      {isBack && isThunderstorm && <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 to-slate-800/40" />}

      {/* 3. Twinkling Stars (Night only, in back layer) */}
      {isBack && effectiveTimeOfDay === 'night' && !isThunderstorm && (
        <div className="absolute inset-0 pointer-events-none">
          {stars.map((s, idx) => (
            <div
              key={idx}
              className="absolute rounded-full bg-amber-100"
              style={{
                top: s.top,
                left: s.left,
                width: `${s.size}px`,
                height: `${s.size}px`,
                animation: `starTwinkle ${s.animationDuration} ease-in-out infinite`,
                animationDelay: s.animationDelay
              }}
            />
          ))}
        </div>
      )}

      {/* 4. Celestial Bodies (Sun / Moon) in back layer */}
      {isBack && (
        <>
          {/* Day / Sun */}
          {effectiveTimeOfDay === 'day' && isSunny && (
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-amber-300 rounded-full blur-xl" style={{ animation: 'weatherSun 4s ease-in-out infinite' }} />
          )}

          {/* Dawn Sun */}
          {effectiveTimeOfDay === 'dawn' && !isThunderstorm && (
            <div className="absolute -bottom-4 right-8 w-20 h-20 bg-amber-400/70 rounded-full blur-lg" style={{ animation: 'weatherSun 5s ease-in-out infinite' }} />
          )}

          {/* Sunset Sun */}
          {effectiveTimeOfDay === 'sunset' && !isThunderstorm && (
            <div className="absolute top-6 right-8 w-16 h-16 bg-orange-500/70 rounded-full blur-md" style={{ animation: 'weatherSun 4s ease-in-out infinite' }} />
          )}

          {/* Night Astronomical Moon Phase */}
          {effectiveTimeOfDay === 'night' && (
            <div 
              className="absolute top-2.5 right-4.5 w-8 h-8 flex items-center justify-center pointer-events-none drop-shadow-[0_0_12px_rgba(254,243,199,0.7)]" 
              style={{ animation: 'moonFloat 6s ease-in-out infinite' }}
            >
              <MoonGraphic fraction={effectiveMoonFraction} size={30} />
            </div>
          )}
        </>
      )}

      {/* 5. Moving Clouds */}
      {(isSunny || isCloudy || isRainy || isThunderstorm) && clouds.slice(0, (isCloudy || isThunderstorm) ? 12 : isRainy ? 8 : 4).map((c, i) => (
        <div 
          key={i} 
          className={`absolute w-16 h-5 ${cloudColor} rounded-full blur-[1px]`}
          style={{ 
            top: c.top, 
            left: 0,
            transform: `scale(${isFront ? c.scale * 1.5 : c.scale})`, // front clouds are bigger!
            animation: `weatherFloat ${isFront ? c.animationDuration : `calc(${c.animationDuration} * 1.5)`} linear infinite`, // back clouds move slower!
            animationDelay: c.animationDelay
          }} 
        >
          {/* Cloud fluff */}
          <div className={`absolute -top-2 left-2 w-8 h-8 ${cloudColor} rounded-full`} />
          <div className={`absolute -top-3 left-6 w-10 h-10 ${cloudColor} rounded-full`} />
        </div>
      ))}

      {/* 6. Raindrops */}
      {(isRainy || isThunderstorm) && rainDrops.filter((_, i) => isThunderstorm || i % 2 === 0).map((r, i) => (
        <div
          key={i}
          className={`absolute top-0 rounded-full ${isFront ? 'w-[2px] h-6 bg-blue-400/80' : 'w-[1px] h-3 bg-blue-400/40'}`}
          style={{
            left: r.left,
            animation: `weatherFall ${isFront ? r.animationDuration : `calc(${r.animationDuration} * 1.5)`} linear infinite`,
            animationDelay: r.animationDelay
          }}
        />
      ))}

      {/* 7. Lightning Flash (Back only) */}
      {isBack && isThunderstorm && (
        <div className="absolute inset-0 bg-amber-100/60" style={{ animation: 'weatherLightning 6s infinite' }} />
      )}

      {/* 8. Lightning Bolts (Front only) */}
      {isFront && isThunderstorm && (
        <div className="absolute inset-0 pointer-events-none" style={{ animation: 'weatherLightning 6s infinite' }}>
          <svg className="absolute top-2 right-12 w-24 h-24 text-amber-300 drop-shadow-[0_0_15px_rgba(252,211,77,0.9)] transform -rotate-12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          <svg className="absolute top-6 left-12 w-12 h-12 text-amber-200 drop-shadow-[0_0_10px_rgba(252,211,77,0.9)] transform rotate-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
      )}

      {/* 9. Superman Easter Egg (Front only) */}
      {isFront && supermanFlight.id > 0 && (
        <div 
          key={supermanFlight.id}
          className="absolute z-[100] drop-shadow-md"
          style={{
            top: supermanFlight.top,
            '--stop-pos': supermanFlight.stopPos,
            animation: supermanFlight.behavior === 'laser'
              ? (supermanFlight.direction === 1 ? `supermanLaserLTR ${supermanFlight.duration}s linear forwards` : `supermanLaserRTL ${supermanFlight.duration}s linear forwards`)
              : supermanFlight.behavior === 'stop' 
                ? (supermanFlight.direction === 1 ? `supermanStopLTR ${supermanFlight.duration}s linear forwards` : `supermanStopRTL ${supermanFlight.duration}s linear forwards`)
                : (supermanFlight.direction === 1 ? `supermanFlyLTR ${supermanFlight.duration}s linear forwards` : `supermanFlyRTL ${supermanFlight.duration}s linear forwards`),
          } as React.CSSProperties}
        >
          <div className="relative flex items-end" style={{ transform: supermanFlight.direction === -1 ? 'scaleX(-1)' : 'none' }}>
            {/* Base Level: Body & Head */}
            <div className="w-3.5 h-0.5 bg-blue-500 rounded-l-sm" />
            <div 
              className="relative w-1 h-1 bg-yellow-400 rounded-r-sm"
              style={supermanFlight.behavior === 'laser' ? { animation: `headRotate ${supermanFlight.duration}s linear forwards` } : {}}
            >
              {supermanFlight.behavior === 'laser' && (
                <div 
                  className="absolute top-1/2 -translate-y-1/2 left-full h-[2px] bg-red-500 shadow-[0_0_8px_3px_rgba(239,68,68,1)] origin-left z-20 opacity-0 rotate-[10deg]"
                  style={{
                    animation: `laserShoot ${supermanFlight.duration * 0.22}s linear forwards`,
                    animationDelay: `${supermanFlight.duration * 0.58}s`
                  }}
                />
              )}
            </div>
            
            {/* Top Level: Cape (Layered on top of the back of the body, near the neck) */}
            <div className="absolute -top-[0px] -left-1 w-4.5 h-0.5 bg-red-500 rounded-sm z-10" />
          </div>
        </div>
      )}
    </div>
  );
}
