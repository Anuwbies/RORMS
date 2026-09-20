import { useEffect, useRef, useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { ChevronDownIcon, SettingsIcon } from '../components/Icons'
import { db } from '../firebase'

interface DepartmentRoom {
  id: string
  code: string
  roomStyle?: number
}

type PersonType = {
  id: string;
  direction: 'right' | 'left';
  duration: number;
  bottom: string;
  spawnTime: number;
  type: 'human' | 'crewmate' | 'imposter';
  colorClass?: string;
  stopPosition?: number;
};

const RoomHallwayForeground = ({ roomId }: { roomId?: number }) => {
  const [people, setPeople] = useState<PersonType[]>([]);
  const prevDirRef = useRef<'right' | 'left' | null>(null);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const spawnPerson = () => {
      const rand = Math.random();
      let direction: 'right' | 'left';
      if (prevDirRef.current === 'right') {
        direction = rand < 0.75 ? 'left' : 'right';
      } else if (prevDirRef.current === 'left') {
        direction = rand < 0.75 ? 'right' : 'left';
      } else {
        direction = rand < 0.5 ? 'right' : 'left';
      }
      prevDirRef.current = direction;

      const randType = Math.random();
      const isImposter = randType < 0.005;
      const isCrewmate = randType >= 0.005 && randType < 0.015;
      const baseDuration = 6 + Math.random() * 11;
      const duration = isImposter ? baseDuration + 7 : baseDuration;
      const bottom = (2 + Math.random() * 5).toFixed(1) + '%';
      const id = Date.now().toString() + Math.random().toString();
      const spawnTime = Date.now();
      const colors = ['text-red-500', 'text-blue-500', 'text-emerald-500', 'text-amber-500', 'text-purple-500', 'text-pink-500', 'text-cyan-400', 'text-orange-500', 'text-slate-800', 'text-slate-100'];
      const colorClass = (isCrewmate || isImposter) ? colors[Math.floor(Math.random() * colors.length)] : undefined;

      setPeople(prev => {
        const activePeople = prev.filter(p => spawnTime - p.spawnTime < (p.duration * 1000 + 500));
        return [...activePeople, { id, direction, duration, bottom, spawnTime, type: isImposter ? 'imposter' : (isCrewmate ? 'crewmate' : 'human'), colorClass, stopPosition: isImposter ? 20 + Math.random() * 60 : undefined }];
      });

      timeoutId = setTimeout(spawnPerson, 1500 + Math.random() * 3500);
    };

    const spawnSpecific = (type: 'crewmate' | 'imposter') => {
      const direction = Math.random() < 0.5 ? 'right' : 'left';
      const baseDuration = 4 + Math.random() * 5;
      const duration = type === 'imposter' ? baseDuration + 7 : baseDuration;
      const bottom = (2 + Math.random() * 5).toFixed(1) + '%';
      const id = Date.now().toString() + Math.random().toString();
      const spawnTime = Date.now();
      const colors = ['text-red-500', 'text-blue-500', 'text-emerald-500', 'text-amber-500', 'text-purple-500', 'text-pink-500', 'text-cyan-400', 'text-orange-500', 'text-slate-800', 'text-slate-100'];
      const colorClass = colors[Math.floor(Math.random() * colors.length)];
      setPeople(prev => {
        const activePeople = prev.filter(p => spawnTime - p.spawnTime < (p.duration * 1000 + 500));
        return [...activePeople, { id, direction, duration, bottom, spawnTime, type, colorClass, stopPosition: type === 'imposter' ? 20 + Math.random() * 60 : undefined }];
      });
    };

    const handleForceCrewmate = (e: any) => {
      if (roomId !== undefined && e.detail?.roomId !== undefined && e.detail.roomId !== roomId) return;
      spawnSpecific('crewmate');
    };
    const handleForceImposter = (e: any) => {
      if (roomId !== undefined && e.detail?.roomId !== undefined && e.detail.roomId !== roomId) return;
      spawnSpecific('imposter');
    };

    timeoutId = setTimeout(spawnPerson, Math.random() * 2000);
    window.addEventListener('spawn-crewmate', handleForceCrewmate as EventListener);
    window.addEventListener('spawn-imposter', handleForceImposter as EventListener);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('spawn-crewmate', handleForceCrewmate as EventListener);
      window.removeEventListener('spawn-imposter', handleForceImposter as EventListener);
    };
  }, []);

  return (
    <>
      {people.map(person => (
        person.type === 'imposter' ? (
          <AmongUsImposter
            key={person.id}
            duration={`${person.duration}s`}
            direction={person.direction}
            bottom={person.bottom}
            color={person.colorClass}
            stopPosition={person.stopPosition}
          />
        ) : person.type === 'crewmate' ? (
          <AmongUsCrewmate
            key={person.id}
            duration={`${person.duration}s`}
            direction={person.direction}
            bottom={person.bottom}
            color={person.colorClass}
          />
        ) : (
          <WalkingPerson
            key={person.id}
            duration={`${person.duration}s`}
            direction={person.direction}
            bottom={person.bottom}
          />
        )
      ))}
    </>
  );
};

const WalkingPerson = ({ duration, direction = 'right', bottom = '6%', delay = '0s' }: { duration: string, direction?: 'right' | 'left', bottom?: string, delay?: string }) => {
  const bobDur = (parseFloat(duration) / 16).toFixed(2);

  return (
  <div
    className="absolute h-[45%] aspect-square pointer-events-none drop-shadow-md"
    style={{
      bottom,
      zIndex: Math.floor(100 - (parseFloat(bottom) * 10)),
      animation: `walkAcross_${direction} ${duration} linear forwards ${delay}`,
      left: direction === 'right' ? '-20%' : '120%'
    }}
  >
    <svg
      viewBox="0 0 24 24"
      preserveAspectRatio="xMidYMax meet"
      fill="currentColor"
      className={`w-full h-full text-slate-700/60 ${direction === 'left' ? 'scale-x-[-1]' : ''}`}
      style={{ animation: `walkBob ${bobDur}s ease-in-out infinite ${delay}` }}
    >
      <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
    </svg>
  </div>
)};

const AmongUsCrewmate = ({ duration, direction = 'right', bottom = '6%', delay = '0s', color = 'text-red-500' }: { duration: string, direction?: 'right' | 'left', bottom?: string, delay?: string, color?: string }) => {
  const bobDur = (parseFloat(duration) / 16).toFixed(2);

  return (
  <div
    className={`absolute h-[25%] aspect-[0.7] pointer-events-none drop-shadow-md ${color}`}
    style={{
      bottom: `calc(${bottom} + 2.5%)`,
      zIndex: Math.floor(100 - (parseFloat(bottom) * 10)),
      animation: `walkAcross_${direction} ${duration} linear forwards ${delay}`,
      left: direction === 'right' ? '-20%' : '120%'
    }}
  >
    <svg
      viewBox="18 18 79 74"
      preserveAspectRatio="xMidYMax meet"
      className={`w-full h-full ${direction === 'left' ? 'scale-x-[-1]' : ''}`}
      style={{ animation: `walkBob ${bobDur}s ease-in-out infinite ${delay}` }}
    >
      <path d="M 25 35 Q 20 35 20 40 L 20 70 Q 20 75 25 75 L 30 75 L 30 35 Z" fill="currentColor" stroke="#1e293b" strokeWidth="4"/>
      <path d="M 30 50 L 30 85 Q 30 90 35 90 L 45 90 Q 50 90 50 85 L 50 75 L 65 75 L 65 85 Q 65 90 70 90 L 80 90 Q 85 90 85 85 L 85 45 Q 85 20 57.5 20 Q 30 20 30 45 Z" fill="currentColor" stroke="#1e293b" strokeWidth="4"/>
      <rect x="50" y="28" width="45" height="27" rx="13.5" fill="#90e0ef" stroke="#1e293b" strokeWidth="4"/>
      <rect x="62" y="32" width="22" height="7" rx="3.5" fill="#ffffff" opacity="0.8"/>
    </svg>
  </div>
)};

const AmongUsImposter = ({ duration, direction = 'right', bottom = '6%', delay = '0s', color = 'text-red-500', stopPosition = 40 }: { duration: string, direction?: 'right' | 'left', bottom?: string, delay?: string, color?: string, stopPosition?: number }) => {
  const totalDur = parseFloat(duration);
  const bobDur = ((totalDur > 7 ? totalDur - 7 : totalDur) / 16).toFixed(2);
  const walkHalf = ((totalDur - 7) / 2).toFixed(2);
  const waitBefore = 1;
  const mouthOpenDur = 5;
  const mouthCloseDur = 1;
  const hingeOpenDelay = parseFloat(walkHalf) + waitBefore;
  const hingeCloseDelay = hingeOpenDelay + mouthOpenDur;
  const walkOutDelay = hingeCloseDelay + mouthCloseDur;
  const walkInAnim = `walkIn_${direction} ${walkHalf}s linear forwards ${delay}`;
  const walkOutAnim = `walkOut_${direction} ${walkHalf}s linear forwards calc(${delay} + ${walkOutDelay}s)`;

  return (
  <div
    className={`absolute h-[25%] aspect-[0.7] pointer-events-none drop-shadow-md ${color}`}
    style={{
      bottom: `calc(${bottom} + 2.5%)`,
      zIndex: Math.floor(100 - (parseFloat(bottom) * 10)),
      animation: `${walkInAnim}, ${walkOutAnim}`,
      left: direction === 'right' ? '-20%' : '120%',
      '--stop-pos': `${stopPosition}%`
    } as React.CSSProperties}
  >
    <svg
      viewBox="18 18 79 74"
      preserveAspectRatio="xMidYMax meet"
      className={`w-full h-full overflow-visible ${direction === 'left' ? 'scale-x-[-1]' : ''}`}
      style={{ animation: `walkBob ${bobDur}s ease-in-out 8 ${delay}, walkBob ${bobDur}s ease-in-out 8 calc(${delay} + ${walkOutDelay}s)` }}
    >
      <path d="M 25 35 Q 20 35 20 40 L 20 70 Q 20 75 25 75 L 30 75 L 30 35 Z" fill="currentColor" stroke="#1e293b" strokeWidth="4"/>
      <g className="imposter-bottom">
        <path d="M 30 54 L 30 85 Q 30 90 35 90 L 45 90 Q 50 90 50 85 L 50 75 L 65 75 L 65 85 Q 65 90 70 90 L 80 90 Q 85 90 85 85 L 85 54 Z" fill="currentColor" stroke="none"/>
        <path d="M 30 55 L 30 85 Q 30 90 35 90 L 45 90 Q 50 90 50 85 L 50 75 L 65 75 L 65 85 Q 65 90 70 90 L 80 90 Q 85 90 85 85 L 85 55" fill="none" stroke="#1e293b" strokeWidth="4"/>
        <path d="M 50 55 C 65 40, 85 20, 110 35 C 105 45, 75 40, 50 55 Z" fill="#e11d48" stroke="#1e293b" strokeWidth="2.5" opacity="0" style={{ transformOrigin: '50px 55px', animation: `imposterRevealOn 0s forwards calc(${delay} + ${hingeOpenDelay}s), imposterRevealOff 0s forwards calc(${delay} + ${hingeCloseDelay}s), tongueWiggle 0.6s ease-in-out calc(${delay} + ${hingeOpenDelay + 0.3}s) ${Math.floor((mouthOpenDur - 0.3) / 0.6)}` }} />
        <path d="M 31 55 L 35 43 L 39 55" fill="currentColor" stroke="none" opacity="0" style={{ animation: `imposterRevealOn 0s forwards calc(${delay} + ${hingeOpenDelay}s), imposterRevealOff 0s forwards calc(${delay} + ${hingeCloseDelay}s)` }}/>
        <path d="M 46 55 L 50 43 L 54 55 M 60 55 L 64 43 L 68 55 M 74 55 L 78 43 L 82 55" fill="#fff" stroke="#1e293b" strokeWidth="2" opacity="0" style={{ animation: `imposterRevealOn 0s forwards calc(${delay} + ${hingeOpenDelay}s), imposterRevealOff 0s forwards calc(${delay} + ${hingeCloseDelay}s)` }}/>
      </g>
      <g className="imposter-top" style={{ transformOrigin: '30px 55px', animation: `imposterHingeOpen 0.2s ease forwards calc(${delay} + ${hingeOpenDelay}s), imposterHingeClose 0.2s ease forwards calc(${delay} + ${hingeCloseDelay}s)` }}>
        <path d="M 30 56 L 85 56 L 85 45 Q 85 20 57.5 20 Q 30 20 30 45 Z" fill="currentColor" stroke="none"/>
        <path d="M 85 55 L 85 45 Q 85 20 57.5 20 Q 30 20 30 45 L 30 55" fill="none" stroke="#1e293b" strokeWidth="4"/>
        <path d="M 46 55 L 50 67 L 54 55 M 60 55 L 64 67 L 68 55 M 74 55 L 78 67 L 82 55" fill="#fff" stroke="#1e293b" strokeWidth="2" opacity="0" style={{ animation: `imposterRevealOn 0s forwards calc(${delay} + ${hingeOpenDelay}s), imposterRevealOff 0s forwards calc(${delay} + ${hingeCloseDelay}s)` }}/>
        <rect x="50" y="28" width="45" height="27" rx="13.5" fill="#90e0ef" stroke="#1e293b" strokeWidth="4"/>
        <rect x="62" y="32" width="22" height="7" rx="3.5" fill="#ffffff" opacity="0.8"/>
      </g>
    </svg>
  </div>
)};

export function DepartmentHallway({ departments, roomPageFilters }: { departments: DepartmentRoom[]; roomPageFilters: { searchTerm: string; deanStatusFilters: unknown; deptSizeFilters: unknown } }) {
  const [currentRoomPage, setCurrentRoomPage] = useState(() => {
    try {
      const stored = localStorage.getItem('rorms_current_room_page');
      return stored ? parseInt(stored) : 0;
    } catch {
      return 0;
    }
  })
  const [openDoors, setOpenDoors] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('rorms_open_doors');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  })

  useEffect(() => {
    localStorage.setItem('rorms_current_room_page', currentRoomPage.toString());
  }, [currentRoomPage])

  const prevFilters = useRef(roomPageFilters);
  useEffect(() => {
    const prev = prevFilters.current;
    if (prev.searchTerm !== roomPageFilters.searchTerm || prev.deanStatusFilters !== roomPageFilters.deanStatusFilters || prev.deptSizeFilters !== roomPageFilters.deptSizeFilters) {
      setCurrentRoomPage(0);
      prevFilters.current = roomPageFilters;
    }
  }, [roomPageFilters])

  const handleToggleDoor = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenDoors(prev => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem('rorms_open_doors', JSON.stringify(next));
      return next;
    });
  }

  return (
    <div className="absolute inset-0 group/pager">
      <div className="absolute inset-0 bg-slate-300 rounded-xl overflow-hidden grid grid-cols-2 grid-rows-2 gap-[2px] shadow-inner border-[3px] border-slate-200">
        {departments.slice(currentRoomPage * 4, (currentRoomPage + 1) * 4).map((dept, idx) => {
          const styleIdx = dept.roomStyle ?? 0;
          const styles = [
            { wall: 'bg-slate-50', frame: 'bg-slate-200 border-slate-300', door: 'from-[#d4a373] to-[#c8925a]', handle: 'bg-slate-300', floor: 'bg-[#b69a81]' },
            { wall: 'bg-sky-50/50', frame: 'bg-sky-200 border-sky-300', door: 'from-slate-100 to-slate-200', handle: 'bg-slate-400', floor: 'bg-slate-200' },
            { wall: 'bg-stone-50', frame: 'bg-stone-200 border-stone-300', door: 'from-[#475569] to-[#334155]', handle: 'bg-slate-300', floor: 'bg-stone-300' },
            { wall: 'bg-emerald-50/50', frame: 'bg-emerald-200 border-emerald-300', door: 'from-emerald-700 to-emerald-800', handle: 'bg-amber-300', floor: 'bg-emerald-900/40' },
            { wall: 'bg-[#f3f7ee]', frame: 'bg-[#c6dbb6] border-[#a3c48b]', door: 'from-[#62853e] to-[#41572a]', handle: 'bg-amber-400', floor: 'bg-[#e3edda]' },
            { wall: 'bg-blue-50/50', frame: 'bg-blue-200 border-blue-300', door: 'from-blue-700 to-blue-900', handle: 'bg-slate-300', floor: 'bg-blue-900/30' },
            { wall: 'bg-orange-50/50', frame: 'bg-orange-200 border-orange-300', door: 'from-[#9c3e21] to-[#702a15]', handle: 'bg-amber-200', floor: 'bg-[#e3b896]' },
            { wall: 'bg-slate-100', frame: 'bg-slate-300 border-slate-400', door: 'from-slate-800 to-slate-950', handle: 'bg-slate-200', floor: 'bg-slate-400' }
          ][styleIdx % 8];

          return (
            <div key={dept.id} className={`relative w-full h-full group/room flex flex-col ${styles.wall} overflow-hidden @container`}>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const nextStyle = ((dept.roomStyle ?? 0) + 1) % 8;
                  try {
                    await updateDoc(doc(db, 'departments', dept.id), { roomStyle: nextStyle });
                  } catch(err) {
                    console.error("Error updating room style", err);
                  }
                }}
                className="absolute top-2 left-2 z-[60] w-6 h-6 bg-white/80 hover:bg-white backdrop-blur-sm rounded flex items-center justify-center opacity-0 group-hover/room:opacity-100 transition-opacity shadow-[0_1px_3px_rgba(0,0,0,0.1)] border border-black/10 text-slate-500 hover:text-[var(--brand-color)] cursor-pointer"
                title="Change Room Style"
              >
                <SettingsIcon className="w-4 h-4" />
              </button>
              <div className="relative flex-1 w-full flex items-end justify-start pl-[8%] pr-[8%] gap-4">
                <div className={`relative w-[28%] h-[70%] flex-shrink-0 ${styles.frame} rounded-t-sm border-x-4 border-t-4 flex justify-center shadow-inner z-10`}>
                  <div className="absolute bottom-0 w-[96%] h-[98%] bg-amber-50 shadow-[inset_0_5px_15px_rgba(0,0,0,0.05)] rounded-t-[1px] overflow-hidden flex flex-col justify-end">
                    <div className="absolute top-[20%] left-[20%] w-[30%] h-[20%] bg-blue-100 border border-blue-200/50" />
                    <div className="absolute bottom-0 w-full h-[25%] bg-[#d4b483] border-t-2 border-[#e6cca3] shadow-[0_-3px_5px_rgba(0,0,0,0.05)] z-10 flex items-end justify-center pb-[2px]">
                      <div className="w-[55%] h-[140%] -translate-y-[85%] -translate-x-[20%] flex flex-col items-center justify-end">
                        <div className="w-[85%] h-[100%] bg-slate-800 border border-slate-700 rounded-[2px] flex items-center justify-center shadow-sm z-10"><div className="w-[55%] h-[60%] rounded-[1px] bg-slate-600/80" /></div>
                        <div className="w-[80%] h-[20%] bg-slate-700 rounded-t-[1px]" />
                      </div>
                    </div>
                  </div>
                  <div onClick={(e) => handleToggleDoor(dept.id, e)} className={`absolute bottom-0 w-[96%] h-[98%] bg-gradient-to-b ${styles.door} rounded-t-[1px] border border-black/10 flex items-center pl-[12%] transition-all duration-500 ease-in-out origin-right cursor-pointer z-10 ${openDoors[dept.id] ? '[transform:perspective(800px)_rotateY(-75deg)] shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]' : 'hover:brightness-110'}`}>
                    <div className={`w-1 h-3.5 rounded-full flex-shrink-0 ${styles.handle} border border-black/20 shadow-sm transition-transform duration-500 ${openDoors[dept.id] ? 'scale-x-50' : ''}`} />
                  </div>
                </div>
                <div className="flex-1 h-[55%] mb-[12%] z-10 transition-transform duration-300 group-hover/room:scale-[1.02]">
                  <div className="w-full h-full bg-[#e3c39d] border-[3px] border-[#8b5a2b] shadow-[0_2px_4px_rgba(0,0,0,0.15)] relative overflow-hidden group/board">
                    <div className="absolute inset-0 opacity-[0.15] bg-[radial-gradient(#3e2723_1px,transparent_1px)] [background-size:4px_4px]" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] h-[75%] bg-white shadow-[1px_1px_2px_rgba(0,0,0,0.15)] flex flex-col items-center justify-center -rotate-1 border border-slate-100 z-10 transition-transform group-hover/board:scale-105">
                      <div className="absolute top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-red-500 shadow-[0_1px_1px_rgba(0,0,0,0.4)] border-[0.5px] border-red-700" />
                      <span className="text-slate-800 text-center w-full leading-none truncate px-1" style={{ fontFamily: "'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', cursive", fontSize: '10cqi' }}>{dept.code}</span>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 w-full h-1.5 bg-black/5 border-t border-black/10 z-0" />
              </div>
              <div className={`w-full h-[12%] ${styles.floor} border-t border-black/20 shadow-[inset_0_3px_5px_rgba(0,0,0,0.05)] z-0`} />
            </div>
          )
        })}
        {departments.slice(currentRoomPage * 4, (currentRoomPage + 1) * 4).length < 4 && Array.from({ length: 4 - departments.slice(currentRoomPage * 4, (currentRoomPage + 1) * 4).length }).map((_, i) => (
          <div key={`empty-${i}`} className="relative w-full h-full group/room flex flex-col bg-slate-100 overflow-hidden @container">
            <div className="relative flex-1 w-full flex items-end justify-start pl-[8%] pr-[8%] gap-4">
              <div className="relative w-[28%] h-[70%] flex-shrink-0 bg-slate-300 rounded-t-sm border-x-4 border-t-4 border-slate-400 flex justify-center shadow-inner z-10">
                <div className="absolute bottom-0 w-[96%] h-[98%] bg-slate-200 shadow-[inset_0_5px_15px_rgba(0,0,0,0.05)] rounded-t-[1px] overflow-hidden"><div className="absolute bottom-0 w-full h-[25%] bg-[#d4b483] border-t-2 border-[#e6cca3] shadow-[0_-3px_5px_rgba(0,0,0,0.05)] z-10 flex items-end justify-center pb-[2px]"><div className="w-[55%] h-[140%] -translate-y-[85%] -translate-x-[20%] flex flex-col items-center justify-end"><div className="w-[85%] h-[100%] bg-slate-800 border border-slate-700 rounded-[2px] flex items-center justify-center shadow-sm z-10"><div className="w-[55%] h-[60%] rounded-[1px] bg-slate-600/80" /></div><div className="w-[80%] h-[20%] bg-slate-700 rounded-t-[1px]" /></div></div></div>
                <div onClick={(e) => handleToggleDoor(`empty-${i}`, e)} className={`absolute bottom-0 w-[96%] h-[98%] bg-gradient-to-b from-slate-300 to-slate-400 rounded-t-[1px] border border-black/10 flex items-center pl-[12%] transition-all duration-500 ease-in-out origin-right cursor-pointer z-10 ${openDoors[`empty-${i}`] ? '[transform:perspective(800px)_rotateY(-75deg)] shadow-[inset_0_0_30px_rgba(0,0,0,0.3)]' : 'hover:brightness-110'}`}><div className={`w-1 h-3.5 rounded-full flex-shrink-0 bg-slate-500 border border-black/10 shadow-[inset_0_1px_1px_rgba(0,0,0,0.1)] transition-transform duration-500 ${openDoors[`empty-${i}`] ? 'scale-x-50' : ''}`} /></div>
              </div>
              <div className="flex-1 h-[55%] mb-[12%] z-10 opacity-75"><div className="w-full h-full bg-[#e3c39d] border-[3px] border-[#8b5a2b] shadow-[0_2px_4px_rgba(0,0,0,0.15)] relative overflow-hidden grayscale-[0.4]"><div className="absolute inset-0 opacity-[0.15] bg-[radial-gradient(#3e2723_1px,transparent_1px)] [background-size:4px_4px]" /><div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] h-[60%] bg-slate-100 shadow-[1px_2px_3px_rgba(0,0,0,0.2)] flex flex-col items-center justify-center rotate-2 border border-slate-200 z-10"><div className="absolute top-0.5 left-1 w-1 h-1 rounded-full bg-slate-400 shadow-[0_1px_1px_rgba(0,0,0,0.3)] border-[0.5px] border-slate-500" /><div className="absolute top-0.5 right-1 w-1 h-1 rounded-full bg-slate-400 shadow-[0_1px_1px_rgba(0,0,0,0.3)] border-[0.5px] border-slate-500" /><span className="font-black text-rose-800/50 uppercase tracking-widest text-center w-full leading-none" style={{ fontSize: '8cqi' }}>VACANT</span></div></div></div>
              <div className="absolute bottom-0 left-0 w-full h-1.5 bg-black/5 border-t border-black/10 z-0" />
            </div>
            <div className="w-full h-[12%] bg-slate-200 border-t border-slate-300/50 shadow-[inset_0_3px_5px_rgba(0,0,0,0.02)] z-0" />
          </div>
        ))}
      </div>
      <div className="absolute inset-0 rounded-xl overflow-hidden grid grid-cols-2 grid-rows-2 gap-[2px] pointer-events-none z-[50]">
        <div className="relative w-full h-full overflow-hidden"><RoomHallwayForeground roomId={0} /></div>
        <div className="relative w-full h-full overflow-hidden"><RoomHallwayForeground roomId={1} /></div>
        <div className="relative w-full h-full overflow-hidden"><RoomHallwayForeground roomId={2} /></div>
        <div className="relative w-full h-full overflow-hidden"><RoomHallwayForeground roomId={3} /></div>
      </div>
      {departments.length > 4 && (
        <div className="absolute inset-0 pointer-events-none opacity-0 group-hover/pager:opacity-100 transition-opacity duration-300 z-[60]">
          <button onClick={(e) => { e.stopPropagation(); setCurrentRoomPage(p => p === 0 ? Math.ceil(departments.length / 4) - 1 : p - 1) }} className="pointer-events-auto absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md border border-slate-200 text-slate-700 hover:bg-white hover:text-[var(--brand-color)] transition-all"><ChevronDownIcon className="w-4 h-4 rotate-90" /></button>
          <button onClick={(e) => { e.stopPropagation(); setCurrentRoomPage(p => p >= Math.ceil(departments.length / 4) - 1 ? 0 : p + 1) }} className="pointer-events-auto absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md border border-slate-200 text-slate-700 hover:bg-white hover:text-[var(--brand-color)] transition-all"><ChevronDownIcon className="w-4 h-4 -rotate-90" /></button>
          <div className="pointer-events-auto absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1 bg-black/20 backdrop-blur-sm px-1.5 py-0.5 rounded-full">
            {Array.from({ length: Math.ceil(departments.length / 4) }).map((_, i) => <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === currentRoomPage ? 'bg-white' : 'bg-white/40'}`} />)}
          </div>
        </div>
      )}
    </div>
  )
}
