import { useMemo, useState, useEffect } from 'react';

export function WeatherOverlay({ weatherCode, layer = 'all', supermanKey = 0 }: { weatherCode?: number, layer?: 'front' | 'back' | 'all', supermanKey?: number }) {
  if (weatherCode === undefined) return null;

  const isSunny = weatherCode === 0;
  const isCloudy = weatherCode >= 1 && weatherCode <= 3;
  const isRainy = (weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82);
  const isThunderstorm = weatherCode >= 95;

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
    animationDuration: `${0.3 + Math.random() * 0.5}s`,
    animationDelay: `-${Math.random() * 2}s`
  })), []);

  const clouds = useMemo(() => Array.from({ length: 12 }).map(() => ({
    top: `${Math.random() * 50}%`,
    animationDuration: `${15 + Math.random() * 20}s`,
    animationDelay: `-${Math.random() * 20}s`,
    scale: 0.5 + Math.random() * 0.8
  })), []);

  const getCloudColor = () => {
    if (isThunderstorm) return 'bg-slate-700';
    if (isRainy) return 'bg-slate-500';
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
          100% { transform: translateY(150px); opacity: 0; }
        }
        @keyframes weatherFloat {
          0% { transform: translateX(-100px); }
          100% { transform: translateX(500px); }
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
          80% { left: var(--stop-pos); transform: rotate(-85deg); }
          85% { left: var(--stop-pos); transform: rotate(0deg); }
          100% { left: 110%; transform: rotate(0deg); }
        }
        @keyframes supermanLaserRTL {
          0% { left: 110%; transform: rotate(0deg); }
          25% { left: var(--stop-pos); transform: rotate(0deg); }
          30% { left: var(--stop-pos); transform: rotate(90deg); }
          50% { left: var(--stop-pos); transform: rotate(90deg); }
          54% { left: var(--stop-pos); transform: rotate(105deg); }
          58% { left: var(--stop-pos); transform: rotate(85deg); }
          80% { left: var(--stop-pos); transform: rotate(85deg); }
          85% { left: var(--stop-pos); transform: rotate(0deg); }
          100% { left: -50px; transform: rotate(0deg); }
        }
        @keyframes headRotate {
          0% { transform: rotate(0deg); }
          25% { transform: rotate(0deg); }
          30% { transform: rotate(90deg); }
          50% { transform: rotate(90deg); }
          54% { transform: rotate(105deg); }
          58% { transform: rotate(85deg); }
          80% { transform: rotate(85deg); }
          85% { transform: rotate(0deg); }
          100% { transform: rotate(0deg); }
        }
        @keyframes laserShoot {
          0% { width: 0px; opacity: 0; }
          10% { width: 800px; opacity: 1; }
          90% { width: 800px; opacity: 1; }
          100% { width: 800px; opacity: 0; }
        }
      `}</style>
      
      {/* Background tint based on weather (only in back) */}
      {isBack && isCloudy && <div className="absolute inset-0 bg-gradient-to-b from-slate-500/40 to-slate-400/10" />}
      {isBack && isRainy && <div className="absolute inset-0 bg-gradient-to-b from-slate-800/60 to-slate-700/10" />}
      {isBack && isThunderstorm && <div className="absolute inset-0 bg-gradient-to-b from-slate-950/90 to-slate-800/40" />}
      {isBack && isSunny && <div className="absolute inset-0 bg-gradient-to-b from-amber-500/15 to-transparent" />}

      {/* Sun (only in back) */}
      {isBack && isSunny && (
        <div className="absolute -top-4 -right-4 w-24 h-24 bg-amber-300 rounded-full blur-xl" style={{ animation: 'weatherSun 4s ease-in-out infinite' }} />
      )}

      {/* Clouds */}
      {(isCloudy || isRainy || isThunderstorm) && clouds.slice(0, isThunderstorm ? 12 : isCloudy ? 8 : 6).map((c, i) => (
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

      {/* Rain */}
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

      {/* Lightning Flash (Back only) */}
      {isBack && isThunderstorm && (
        <div className="absolute inset-0 bg-amber-100/60" style={{ animation: 'weatherLightning 6s infinite' }} />
      )}

      {/* Lightning Bolts (Front only) */}
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

      {/* Superman Easter Egg (Front only) */}
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
