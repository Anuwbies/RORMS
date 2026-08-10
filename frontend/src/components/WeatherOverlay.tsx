import { useMemo } from 'react';

export function WeatherOverlay({ weatherCode, layer = 'all' }: { weatherCode?: number, layer?: 'front' | 'back' | 'all' }) {
  if (weatherCode === undefined) return null;

  const isSunny = weatherCode === 0;
  const isCloudy = weatherCode >= 1 && weatherCode <= 3;
  const isRainy = (weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82);
  const isThunderstorm = weatherCode >= 95;

  const isBack = layer === 'back' || layer === 'all';
  const isFront = layer === 'front' || layer === 'all';

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
    if (isThunderstorm) return 'bg-slate-800';
    if (isRainy) return 'bg-slate-500';
    return 'bg-slate-300';
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
    </div>
  );
}
