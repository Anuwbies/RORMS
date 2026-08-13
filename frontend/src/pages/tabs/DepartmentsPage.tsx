import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react'
import { DepartmentIcon, PlusIcon, EditIcon, TrashIcon, UsersIcon, CloseIcon, UploadIcon, ChevronDownIcon, CheckIcon, UserIcon, SettingsIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { SearchFilters } from '../../components/SearchFilters'
import { SectionHeader } from '../../components/SectionHeader'
import { Button } from '../../components/Button'
import { IconOnlyButton } from '../../components/IconOnlyButton'
import { FilterDropdown } from '../../components/FilterDropdown'
import { TextInput } from '../../components/TextInput'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'
import { db, storage, auth } from '../../firebase'
import { collection, serverTimestamp, onSnapshot, query, orderBy, doc, writeBatch, where, limit, updateDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { CropModal } from '../../components/CropModal'
import { DataTable, type ColumnDef } from '../../components/DataTable'
import { SummaryCard } from '../../components/SummaryCard'
import type { Member } from '../../types/member'



interface Department {
  id: string
  code: string
  name: string
  deanUID: string
  deanName: string
  memberCount?: number
  createdDate: string
  logo: string
  roomStyle?: number
}

const roleClasses: Record<string, string> = {
  Admin: 'bg-purple-100 text-purple-700',
  Registrar: 'bg-blue-100 text-blue-700',
  Dean: 'bg-amber-100 text-amber-700',
  'Program Head': 'bg-rose-100 text-rose-700',
  Instructor: 'bg-emerald-100 text-emerald-700',
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
      const isImposter = randType < 0.005; // 0.5% chance (1 in 200)
      const isCrewmate = randType >= 0.005 && randType < 0.015; // 1% chance (1 in 100)
      const baseDuration = 6 + Math.random() * 11;
      const duration = isImposter ? baseDuration + 7 : baseDuration;
      const bottom = (2 + Math.random() * 5).toFixed(1) + '%';
      const id = Date.now().toString() + Math.random().toString();
      const spawnTime = Date.now();
      const colors = ['text-red-500', 'text-blue-500', 'text-emerald-500', 'text-amber-500', 'text-purple-500', 'text-pink-500', 'text-cyan-400', 'text-orange-500', 'text-slate-800', 'text-slate-100'];
      const colorClass = (isCrewmate || isImposter) ? colors[Math.floor(Math.random() * colors.length)] : undefined;

      setPeople(prev => {
        // Clean up people whose animation finished
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
      {/* Backpack */}
      <path d="M 25 35 Q 20 35 20 40 L 20 70 Q 20 75 25 75 L 30 75 L 30 35 Z" fill="currentColor" stroke="#1e293b" strokeWidth="4"/>
      {/* Body */}
      <path d="M 30 50 L 30 85 Q 30 90 35 90 L 45 90 Q 50 90 50 85 L 50 75 L 65 75 L 65 85 Q 65 90 70 90 L 80 90 Q 85 90 85 85 L 85 45 Q 85 20 57.5 20 Q 30 20 30 45 Z" fill="currentColor" stroke="#1e293b" strokeWidth="4"/>
      {/* Visor */}
      <rect x="50" y="28" width="45" height="27" rx="13.5" fill="#90e0ef" stroke="#1e293b" strokeWidth="4"/>
      {/* Visor Shine */}
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

const PRIZES_BY_TIER = {
  Good: [
    { id: 'p1', tier: 'Good', type: 'iphone', value: 0, text: 'iPhone 17 Pro Max', color: '#f59e0b' },
    { id: 'p2', tier: 'Good', type: 'coin', value: 5, text: 'Earn 5 🪙', color: '#10b981' },
    { id: 'p3', tier: 'Good', type: 'coin', value: 3, text: 'Earn 3 🪙', color: '#3b82f6' },
  ],
  Neutral: [
    { id: 'p5', tier: 'Neutral', type: 'xp', value: 50, text: '50 XP', color: '#8b5cf6' },
    { id: 'p6', tier: 'Neutral', type: 'xp', value: 25, text: '25 XP', color: '#ec4899' },
    { id: 'p4', tier: 'Neutral', type: 'refund', value: 1, text: 'Spin Again!', color: '#6366f1' },
  ],
  Bad: [
    { id: 'p8', tier: 'Bad', type: 'imposter', text: 'Spawn Imposter', color: '#ef4444' },
    { id: 'p7', tier: 'Bad', type: 'crewmate', text: 'Spawn Crew', color: '#f43f5e' },
    { id: 'p9', tier: 'Bad', type: 'nothing', text: 'Nothing 😢', color: '#64748b' },
  ]
};

const ANOMALY_NAMES = [
  "CLASSIFIED Document", "Hacker Terminal", "Wild West Bounty", "Missing Pet Poster",
  "Fortune Cookie Slip", "Blue Screen of Death", "Tarot Card", "Intergalactic Dating Profile",
  "Ransom Note", "Retro Game Screen", "Horror Warning", "Matrix Digital Rain",
  "UFO Abduction", "Containment Breach", "Treasure Map", "Eye Chart",
  "Magic 8 Ball", "The Void Stare", "Broken Mirror", "Grocery Receipt",
  "Blueprint", "Alien Language", "Captcha", "VHS Glitch",
  "Losing Lottery Ticket", "Summoning Circle", "Sticky Note", "Cassette Tape",
  "Error 404", "Illuminati Eye", "Radar Sweep", "Polaroid Photo",
  "Crossword Puzzle", "Morse Code", "Quarantine Notice", "Zodiac Cypher",
  "Floppy Disk", "Periodic Table", "Ouija Board", "Fake Ad",
  "Dial-up Modem", "Milk Carton", "Pac-Man", "Barcode",
  "Ticket Stub", "System Update", "Rorschach Test", "EKG Heart Monitor",
  "Redacted Poem", "You Died", "Death Note Rules", "Death Note Names"
];

const LegendAutoScroll = ({ legendData }: { legendData: any[] }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(false);
  const targetScrollRef = useRef<number | null>(null);

  useEffect(() => {
    let animationFrameId: number;
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    let currentScroll = scrollContainer.scrollTop;
    let autoSpeed = 0.4;

    // Smooth manual wheel scrolling
    const handleWheel = (e: WheelEvent) => {
      if (legendData.length === 0) return;
      const singleHeight = scrollContainer.scrollHeight / 4;
      if (singleHeight <= scrollContainer.clientHeight * 0.5) return;
      
      e.preventDefault(); // Stop instant snapping native scroll
      if (targetScrollRef.current === null) {
        targetScrollRef.current = currentScroll + e.deltaY;
      } else {
        targetScrollRef.current += e.deltaY;
      }
    };

    scrollContainer.addEventListener('wheel', handleWheel, { passive: false });

    const scrollStep = () => {
      if (legendData.length > 0) {
        const singleHeight = scrollContainer.scrollHeight / 4;
        
        if (singleHeight > scrollContainer.clientHeight * 0.5) {
          // Smoothly decelerate when hovering, accelerate when unhovering
          const targetAutoSpeed = hoverRef.current ? 0 : 0.4;
          autoSpeed += (targetAutoSpeed - autoSpeed) * 0.08;

          if (targetScrollRef.current !== null) {
            // Smoothly lerp towards manual wheel target
            const diff = targetScrollRef.current - currentScroll;
            if (Math.abs(diff) < 0.5) {
              currentScroll = targetScrollRef.current;
              targetScrollRef.current = null;
            } else {
              currentScroll += diff * 0.15; // Smoothness factor
            }
            scrollContainer.scrollTop = currentScroll;
          } else {
            if (autoSpeed > 0.005) {
              currentScroll += autoSpeed;
              scrollContainer.scrollTop = currentScroll;
            } else {
              // Sync with native scrolling (like touch drag) when stopped
              currentScroll = scrollContainer.scrollTop;
            }
          }

          // Handle the infinite seamless looping
          const actualScroll = scrollContainer.scrollTop;
          if (actualScroll >= singleHeight * 2) {
             scrollContainer.scrollTop = actualScroll - singleHeight;
             currentScroll = scrollContainer.scrollTop;
             if (targetScrollRef.current !== null) targetScrollRef.current -= singleHeight;
          } else if (actualScroll <= 0) {
             scrollContainer.scrollTop = actualScroll + singleHeight;
             currentScroll = scrollContainer.scrollTop;
             if (targetScrollRef.current !== null) targetScrollRef.current += singleHeight;
          }
        }
      }
      animationFrameId = requestAnimationFrame(scrollStep);
    };

    animationFrameId = requestAnimationFrame(scrollStep);
    return () => {
      cancelAnimationFrame(animationFrameId);
      scrollContainer.removeEventListener('wheel', handleWheel);
    };
  }, [legendData.length]);

  const repeatedData = [...legendData, ...legendData, ...legendData, ...legendData];

  return (
    <div 
      className="flex-1 overflow-y-auto flex flex-col no-scrollbar"
      ref={scrollRef}
      onMouseEnter={() => hoverRef.current = true}
      onMouseLeave={() => hoverRef.current = false}
      onTouchStart={() => hoverRef.current = true}
      onTouchEnd={() => hoverRef.current = false}
    >
      {repeatedData.map((data, idx) => {
        const isGood = data.tier === 'Good';
        const isBad = data.tier === 'Bad';
        
        return (
          <div 
            key={`${data.code}-${idx}`}
            className="flex items-center gap-[2cqw] px-[2.5cqw] py-[2cqw] border-b border-black/10 shrink-0"
            style={{ backgroundColor: data.color }}
          >
            {/* Member Count on the left */}
            <span className="w-[4cqw] aspect-square inline-flex items-center justify-center text-[2.2cqw] font-black text-white/95 shrink-0 drop-shadow-sm bg-black/25 border border-white/10 rounded-full leading-none">
              {data.count}
            </span>
            
            {/* Department Name */}
            <span className="text-[2.8cqw] font-bold text-white truncate drop-shadow-sm leading-none mt-[0.2cqw]">{data.code}</span>
            
            {/* Prize Tier on the right */}
            <span className={`ml-auto text-[1.8cqw] font-black uppercase shrink-0 drop-shadow inline-flex items-center justify-center border px-[1cqw] py-[0.5cqw] rounded-full leading-none ${
              isGood ? 'bg-amber-500/20 text-amber-200 border-amber-300/30' :
              isBad ? 'bg-rose-500/20 text-rose-200 border-rose-300/30' :
              'bg-indigo-500/20 text-indigo-200 border-indigo-300/30'
            }`}>
              {data.prize.text}
            </span>
          </div>
        );
      })}
      {legendData.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-[3cqw] italic">
          No departments found
        </div>
      )}
    </div>
  );
};

interface DeanBookPageProps {
  data?: any;
  isLeft?: boolean;
  pageNumber?: number | string;
}

const DeanBookPage = ({ data, isLeft, pageNumber }: DeanBookPageProps) => {
  return (
    <div className={`w-full h-full bg-[#fdf8f0] ${isLeft ? 'rounded-l-sm' : 'rounded-r-sm'} flex flex-col items-center justify-center ${data?.isEasterEgg ? 'p-0' : 'p-[3cqw]'} relative overflow-hidden`}
         style={{ boxShadow: isLeft 
           ? 'inset -4px 0 8px rgba(0,0,0,0.06), inset -2px 0 4px rgba(0,0,0,0.03)' 
           : 'inset 4px 0 8px rgba(0,0,0,0.06), inset 2px 0 4px rgba(0,0,0,0.03)' 
         }}>
       {/* Curved page lighting simulation */}
       {/* Layer 1: Deep shadow near the spine (page dips into the binding) */}
       <div className="absolute inset-0 pointer-events-none" style={{
         background: isLeft 
           ? 'linear-gradient(to left, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.02) 4%, transparent 10%)'
           : 'linear-gradient(to right, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.02) 4%, transparent 10%)'
       }} />
       {/* Layer 2: Soft highlight on the raised middle area of the page */}
       <div className="absolute inset-0 pointer-events-none" style={{
         background: isLeft
           ? 'linear-gradient(to left, transparent 15%, rgba(255,255,255,0.12) 40%, rgba(255,255,255,0.06) 70%, transparent 90%)'
           : 'linear-gradient(to right, transparent 15%, rgba(255,255,255,0.12) 40%, rgba(255,255,255,0.06) 70%, transparent 90%)'
       }} />
       {/* Layer 3: Subtle outer edge shadow (page curves back down at far edge) */}
       <div className="absolute inset-0 pointer-events-none" style={{
         background: isLeft
           ? 'linear-gradient(to right, rgba(0,0,0,0.03) 0%, transparent 8%)'
           : 'linear-gradient(to left, rgba(0,0,0,0.03) 0%, transparent 8%)'
       }} />
       {/* Background pattern */}
       <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '8px 8px' }} />
       
       {data ? (
          data.isBlank ? (
            <div className="relative z-10 text-amber-900/20 font-serif italic text-[3cqw]">
              Blank Page
            </div>
          ) : (
             <div className="relative z-10 flex flex-col items-center text-center w-full h-full">
            {data.bio.easterEggType ? (
              <div className="w-full h-full flex items-center justify-center overflow-hidden">
                {data.bio.easterEggType === 1 && (
                  <div className="relative w-full h-full bg-[#f4ebd8] p-[1cqw] font-mono flex flex-col justify-center transform -rotate-2">
                     <div className="absolute top-2 right-2 text-red-600 border-4 border-red-600 rounded-md p-1 transform rotate-12 text-[2cqw] font-bold tracking-tighter opacity-80 mix-blend-multiply">CLASSIFIED</div>
                     <div className="text-black text-[1.4cqw] leading-relaxed">
                       Subject: <span className="bg-black text-black">█████████</span><br/>
                       Threat Lvl: <span className="bg-black text-black">████</span><br/>
                       Status: <span className="text-red-700 font-bold">AT LARGE</span><br/>
                       Notes: <span className="bg-black text-black">███████</span> was last seen <span className="bg-black text-black">█████</span> near Sector <span className="bg-black text-black">██</span>. Do not approach without <span className="bg-black text-black">██████████</span>.
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 2 && (
                  <div className="w-full h-full bg-black border border-green-500/30 p-[1cqw] font-mono text-green-500 flex flex-col overflow-hidden relative">
                     <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] pointer-events-none z-10" />
                     <span className="text-[1.2cqw] opacity-70 animate-pulse">Initializing hack...</span>
                     <span className="text-[1.2cqw] opacity-70">&gt; decrypting node {data.deptCode}</span>
                     <span className="text-[1.4cqw] mt-2 font-bold text-green-400">ACCESS DENIED</span>
                     <span className="text-[1cqw] mt-auto opacity-50 break-words">0xFA492B 0x00FF 0x1A2B3C</span>
                  </div>
                )}
                {data.bio.easterEggType === 3 && (
                  <div className="w-full h-full bg-[#e6d5b8] border-4 border-[#8b5a2b] p-[1cqw] flex flex-col items-center justify-center font-serif relative" style={{ backgroundImage: 'radial-gradient(rgba(139,90,43,0.2) 1px, transparent 1px)', backgroundSize: '4px 4px' }}>
                     <h2 className="text-[3cqw] font-black text-[#5c3a21] tracking-tighter uppercase mb-1">Wanted</h2>
                     <span className="text-[1.8cqw] font-bold text-[#8b5a2b] mb-2 uppercase">Dead or Alive</span>
                     <div className="w-[8cqw] h-[8cqw] bg-[#d2b48c] border-2 border-[#5c3a21] rounded-sm mb-2 opacity-50 flex items-center justify-center">?</div>
                     <span className="text-[2.5cqw] font-bold text-[#5c3a21]">₿ 50,000,000</span>
                  </div>
                )}
                {data.bio.easterEggType === 4 && (
                  <div className="w-full h-full bg-white border border-gray-300 shadow-sm p-[1cqw] flex flex-col items-center relative font-sans">
                     <div className="absolute top-[-5px] w-6 h-6 bg-red-500 rounded-full shadow-md z-10 opacity-80" />
                     <h2 className="text-[2.2cqw] font-black uppercase text-black mb-1">Missing Pet</h2>
                     <div className="w-[6cqw] h-[6cqw] border-2 border-black border-dashed mb-2 flex items-center justify-center text-[3cqw]">🐕</div>
                     <p className="text-[1.2cqw] text-center text-black font-medium leading-tight">Answers to "{data.deptCode}". Bites. Do not make eye contact.</p>
                     <div className="absolute bottom-0 w-full flex justify-around border-t border-gray-400 border-dashed pt-1">
                       <span className="text-[0.8cqw] transform -rotate-90 origin-bottom-left border-l border-gray-400 border-dashed pl-1">555-0199</span>
                       <span className="text-[0.8cqw] transform -rotate-90 origin-bottom-left border-l border-gray-400 border-dashed pl-1">555-0199</span>
                       <span className="text-[0.8cqw] transform -rotate-90 origin-bottom-left border-l border-gray-400 border-dashed pl-1">555-0199</span>
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 5 && (
                  <div className="w-full h-full flex items-center justify-center relative p-[3cqw]">
                     <div className="bg-[#fff9e6] border border-[#ffeb99] rounded-sm shadow-sm px-[1.5cqw] py-[1cqw] flex flex-col items-center transform -rotate-3 text-center">
                       <span className="text-[1.4cqw] font-serif text-red-800 italic mb-2">"You will soon encounter a strange entity in a hallway."</span>
                       <span className="text-[1cqw] font-mono text-red-600 font-bold">Lucky Numbers: 4, 8, 15, 16, 23, 42</span>
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 6 && (
                  <div className="w-full h-full bg-[#0000aa] text-white p-[1cqw] font-mono flex flex-col justify-center">
                     <div className="bg-white text-[#0000aa] font-bold px-2 self-start mb-2 text-[1.2cqw]">Windows</div>
                     <p className="text-[1.2cqw] leading-tight mb-2">A fatal exception 0E has occurred at {data.deptCode}:00000000 in VXD.</p>
                     <p className="text-[1cqw] opacity-80">* Press CTRL+ALT+DEL to restart your computer.<br/>* You will lose any unsaved information.</p>
                     <p className="text-[1cqw] mt-auto self-center animate-pulse">Press any key to continue _</p>
                  </div>
                )}
                {data.bio.easterEggType === 7 && (
                  <div className="w-full h-full border-[3px] border-[#c0a060] bg-[#1a1a2e] p-[1cqw] flex flex-col items-center justify-between relative overflow-hidden">
                     <div className="absolute top-[0.5cqw] text-[1.2cqw] font-serif text-[#c0a060]">XIII</div>
                     <div className="w-[8cqw] h-[8cqw] border border-[#c0a060] rounded-full mt-4 flex items-center justify-center">
                       <span className="text-[4cqw]">💀</span>
                     </div>
                     <div className="text-[1.8cqw] font-serif text-[#c0a060] uppercase tracking-widest mt-auto">The End</div>
                  </div>
                )}
                {data.bio.easterEggType === 8 && (
                  <div className="w-full h-full bg-white overflow-hidden flex flex-col">
                     <div className="h-[40%] bg-gradient-to-br from-pink-400 to-orange-400 relative">
                       <div className="absolute -bottom-[3cqw] left-4 w-[6cqw] h-[6cqw] bg-white rounded-full p-1 shadow-sm">
                         <div className="w-full h-full bg-gray-200 rounded-full flex items-center justify-center text-[2.5cqw]">👤</div>
                       </div>
                     </div>
                     <div className="pt-[3.5cqw] px-[1cqw] pb-[1cqw] flex-1 flex flex-col">
                       <span className="text-[1.8cqw] font-bold text-gray-800 leading-none">{data.deptCode} <span className="font-normal text-gray-500">24</span></span>
                       <span className="text-[1.2cqw] text-gray-500 mb-1 flex items-center gap-1"><span className="text-pink-500">📍</span> 4 lightyears away</span>
                       <span className="text-[1.2cqw] text-gray-700 italic mt-auto">"Looking for someone to help grade papers."</span>
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 9 && (
                  <div className="w-full h-full bg-[#f0e6d2] p-[1.5cqw] flex flex-wrap content-center justify-center gap-[1.5cqw]">
                     <div className="flex gap-1 items-center">
                       <span className="bg-black text-white font-serif text-[2.5cqw] px-1 transform rotate-2">W</span>
                       <span className="bg-red-600 text-white font-sans font-black text-[2cqw] px-1 transform -rotate-3">e</span>
                       <span className="sr-only"> </span>
                     </div>
                     <div className="flex gap-1 items-center">
                       <span className="bg-white text-black border border-black font-mono text-[2.2cqw] px-1 transform -rotate-1">h</span>
                       <span className="bg-blue-800 text-white font-serif text-[2.8cqw] px-1 transform rotate-6">a</span>
                       <span className="bg-yellow-400 text-black font-sans font-bold text-[2cqw] px-1 transform rotate-1">v</span>
                       <span className="bg-black text-white font-mono text-[2.2cqw] px-1 transform -rotate-4">e</span>
                       <span className="sr-only"> </span>
                     </div>
                     <div className="flex gap-1">
                       <span className="bg-green-700 text-white font-serif text-[2.5cqw] px-1 transform rotate-2">h</span>
                       <span className="bg-white text-red-600 font-black text-[3cqw] px-1 transform -rotate-6">i</span>
                       <span className="bg-black text-white font-sans text-[2cqw] px-1 transform rotate-4">m</span>
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 10 && (
                  <div className="w-full h-full bg-[#8b9bb4] border-[4px] border-[#5a6988] p-[1cqw] flex flex-col items-center justify-center relative shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]">
                     <div className="absolute inset-0 bg-[#9ca89a] opacity-80 mix-blend-multiply pointer-events-none" />
                     <div className="text-[3cqw] font-mono font-bold text-[#203815] tracking-widest uppercase filter drop-shadow-[2px_2px_0_rgba(156,168,154,0.5)]">R O R M S</div>
                     <div className="mt-[2cqw] text-[1.2cqw] font-mono text-[#203815] animate-pulse">PRESS START</div>
                  </div>
                )}
                {data.bio.easterEggType === 11 && (
                  <div className="w-full h-full bg-[#111] p-[1.5cqw] flex flex-col items-center justify-center relative overflow-hidden">
                     {/* Blood Splatter Background */}
                     <div className="absolute -top-4 -right-4 w-[12cqw] h-[12cqw] bg-red-900/40 rounded-full blur-xl mix-blend-multiply" />
                     <div className="absolute bottom-0 left-0 w-[8cqw] h-[10cqw] bg-red-900/30 rounded-t-full blur-lg mix-blend-multiply" />
                     
                     {/* Creepy Text */}
                     <h2 className="text-[3cqw] font-black text-red-700 tracking-tighter uppercase mb-2 filter drop-shadow-[0_0_5px_rgba(185,28,28,0.8)] mix-blend-screen" style={{ textShadow: '2px 2px 0 #000' }}>
                       LEAVE NOW
                     </h2>
                     <p className="text-[1.4cqw] text-red-500/80 font-mono text-center italic">
                       They are already<br/>in the walls.
                     </p>
                     
                     {/* Blood drips */}
                     <div className="absolute top-0 left-[20%] w-[2px] h-[3cqw] bg-red-800 rounded-b-full opacity-70" />
                     <div className="absolute top-0 right-[30%] w-[3px] h-[5cqw] bg-red-800 rounded-b-full opacity-80" />
                     <div className="absolute top-0 right-[45%] w-[1px] h-[2cqw] bg-red-900 rounded-b-full opacity-60" />
                  </div>
                )}
                {data.bio.easterEggType === 12 && (
                  <div className="w-full h-full bg-black flex flex-col overflow-hidden relative p-[1cqw]">
                     <div className="absolute inset-0 opacity-40 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiMwMDAiLz48cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjMGYwIi8+PC9zdmc+')] bg-repeat opacity-30 animate-[slide_10s_linear_infinite]" style={{backgroundSize: '2cqw 2cqw'}} />
                     <div className="z-10 flex flex-col gap-[0.5cqw] h-full justify-center opacity-80">
                       <span className="text-green-500 font-mono text-[1.5cqw] animate-pulse">01001101 01100001 01110100 01110010 01101001 01111000</span>
                       <span className="text-green-400 font-mono text-[1.5cqw] animate-pulse delay-100">WAKE UP.</span>
                       <span className="text-green-300 font-mono text-[1.5cqw] animate-pulse delay-200">THE SIMULATION IS BREAKING.</span>
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 13 && (
                  <div className="w-full h-full bg-[#0a192f] p-[1cqw] flex flex-col items-center justify-center relative overflow-hidden">
                     <div className="absolute top-[10%] w-[10cqw] h-[3cqw] bg-slate-300 rounded-full shadow-[0_0_20px_#fff] flex justify-center z-20">
                       <div className="absolute -bottom-[2px] w-[6cqw] h-[1cqw] bg-cyan-400 rounded-full blur-[2px]" />
                     </div>
                     <div className="absolute top-[12%] w-[8cqw] h-[50cqw] bg-gradient-to-b from-cyan-400/80 to-transparent z-10 blur-sm mix-blend-screen" />
                     <div className="absolute top-[40%] text-[4cqw] z-20 animate-bounce">🐄</div>
                     <div className="absolute bottom-[1cqw] text-[1.5cqw] text-cyan-200 font-mono opacity-60">ABDUCTION IN PROGRESS</div>
                  </div>
                )}
                {data.bio.easterEggType === 14 && (
                  <div className="w-full h-full bg-red-950 border-8 border-red-600 p-[2cqw] flex flex-col items-center justify-center relative overflow-hidden">
                     <div className="absolute inset-0 bg-red-500/20 animate-pulse mix-blend-overlay" />
                     <div className="text-yellow-400 text-[8cqw]">☣️</div>
                     <h1 className="text-red-500 font-black text-[3cqw] tracking-widest mt-2 uppercase text-center animate-pulse shadow-red-500 drop-shadow-lg">CONTAINMENT BREACH</h1>
                     <p className="text-red-400 font-mono text-[1.2cqw] mt-4 text-center">ALL PERSONNEL EVACUATE IMMEDIATELY. SECTOR LOCKDOWN INITIATED.</p>
                  </div>
                )}
                {data.bio.easterEggType === 15 && (
                  <div className="w-full h-full bg-[#e6d0a3] p-[2cqw] flex flex-col items-center justify-center relative shadow-[inset_0_0_40px_rgba(139,69,19,0.4)]">
                     <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M10,90 Q30,10 50,50 T90,10" stroke="#8b4513" strokeWidth="2" fill="none" strokeDasharray="5,5"/></svg>
                     <div className="text-red-700 text-[6cqw] font-black font-serif z-10 transform -rotate-12 drop-shadow-md">X</div>
                     <div className="absolute bottom-[2cqw] right-[2cqw] text-[#8b4513] font-serif text-[1.2cqw] italic opacity-80 border-t border-[#8b4513] pt-1">Dig exactly 6 paces North.</div>
                  </div>
                )}
                {data.bio.easterEggType === 16 && (
                  <div className="w-full h-full bg-white p-[3cqw] flex flex-col items-center relative border border-gray-200">
                     <h2 className="text-black font-serif text-[1cqw] mb-4 opacity-50">EYE EXAM</h2>
                     <div className="text-black font-sans font-black text-[5cqw] leading-none">I</div>
                     <div className="text-black font-sans font-bold text-[4cqw] leading-none mt-2 tracking-[0.5cqw]">S E</div>
                     <div className="text-black font-sans font-bold text-[3cqw] leading-none mt-2 tracking-[0.8cqw]">E Y O</div>
                     <div className="text-black font-sans font-semibold text-[2cqw] leading-none mt-2 tracking-[1cqw]">U R I G H</div>
                     <div className="text-black font-sans font-medium text-[1.5cqw] leading-none mt-2 tracking-[1cqw]">T N O W R U N</div>
                     <div className="absolute bottom-2 w-full border-t-2 border-red-500" />
                     <div className="absolute bottom-1 w-full border-t border-green-500" />
                  </div>
                )}
                {data.bio.easterEggType === 17 && (
                  <div className="w-full h-full bg-slate-900 p-[1cqw] flex flex-col items-center justify-center relative">
                     <div className="w-[18cqw] h-[18cqw] bg-black rounded-full shadow-[inset_-10px_-10px_20px_rgba(255,255,255,0.1),_0_0_30px_rgba(0,0,0,0.8)] flex items-center justify-center relative">
                        <div className="absolute top-[2cqw] right-[3cqw] w-[5cqw] h-[2cqw] bg-white/10 rounded-full blur-sm transform rotate-45" />
                        <div className="w-[9cqw] h-[9cqw] bg-slate-900 rounded-full flex items-center justify-center border-4 border-slate-800 shadow-[inset_0_0_10px_#000]">
                           <div className="w-0 h-0 border-l-[3.5cqw] border-l-transparent border-t-[6cqw] border-t-blue-800 border-r-[3.5cqw] border-r-transparent relative flex justify-center transform hover:rotate-180 transition-transform duration-1000">
                              <span className="absolute -top-[5cqw] text-blue-100 font-sans text-[0.8cqw] text-center leading-tight drop-shadow-md w-[4cqw]">OUTLOOK<br/>NOT SO<br/>GOOD</span>
                           </div>
                        </div>
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 18 && (
                  <div className="w-full h-full bg-black p-[1cqw] flex flex-col items-center justify-center relative">
                     <div className="flex gap-[4cqw]">
                       <div className="w-[1.5cqw] h-[2.5cqw] bg-white rounded-full shadow-[0_0_10px_#fff,0_0_20px_#fff] flex items-center justify-center blur-[1px]">
                         <div className="w-[0.3cqw] h-[1cqw] bg-black rounded-full" />
                       </div>
                       <div className="w-[1.5cqw] h-[2.5cqw] bg-white rounded-full shadow-[0_0_10px_#fff,0_0_20px_#fff] flex items-center justify-center blur-[1px]">
                         <div className="w-[0.3cqw] h-[1cqw] bg-black rounded-full" />
                       </div>
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 19 && (
                  <div className="w-full h-full bg-slate-200 relative overflow-hidden">
                     <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent z-10 pointer-events-none" />
                     <div className="absolute top-0 left-0 w-[150%] h-[150%] origin-top-left transform rotate-12 -translate-y-[20%] translate-x-[10%] border-l-[3px] border-b-[2px] border-slate-400/50 bg-white/20 shadow-[-5px_5px_10px_rgba(0,0,0,0.1)] mix-blend-luminosity" />
                     <div className="absolute top-0 right-0 w-[120%] h-[120%] origin-top-right transform -rotate-45 translate-y-[30%] -translate-x-[20%] border-r-[2px] border-t-[4px] border-slate-300/60 bg-white/30 shadow-[5px_-5px_15px_rgba(0,0,0,0.15)] mix-blend-overlay" />
                     <div className="absolute bottom-0 left-[20%] w-[80%] h-[80%] origin-bottom-left transform rotate-[-30deg] border-l-[1px] border-t-[3px] border-slate-400/40 bg-white/10 shadow-[-2px_-2px_5px_rgba(0,0,0,0.05)]" />
                     <div className="absolute top-1/2 left-1/2 w-4 h-4 bg-slate-800 rounded-full transform -translate-x-1/2 -translate-y-1/2 shadow-[0_0_10px_rgba(0,0,0,0.5)] blur-[1px]" />
                  </div>
                )}
                {data.bio.easterEggType === 20 && (
                  <div className="w-full h-full bg-[#f4f4f4] p-[2cqw] font-mono text-[1cqw] text-slate-800 flex flex-col shadow-[inset_0_0_20px_rgba(0,0,0,0.05)] border-l border-r border-dashed border-gray-300">
                     <div className="text-center font-bold text-[1.4cqw] mb-4 uppercase tracking-widest border-b-2 border-slate-800 pb-2">R O R M S - M A R T</div>
                     <div className="flex justify-between mb-1"><span>1x Human Soul</span><span>$0.99</span></div>
                     <div className="flex justify-between mb-1"><span>2x Duct Tape</span><span>$14.50</span></div>
                     <div className="flex justify-between mb-1"><span>1x Alibi</span><span>$999.00</span></div>
                     <div className="flex justify-between mb-1"><span>3x Regret</span><span>-$5.00</span></div>
                     <div className="border-t border-dashed border-slate-400 my-2" />
                     <div className="flex justify-between font-bold"><span>TOTAL</span><span>$1009.49</span></div>
                     <div className="mt-auto text-center text-[0.8cqw] opacity-60">THANK YOU FOR YOUR SACRIFICE.</div>
                  </div>
                )}
                {data.bio.easterEggType === 21 && (
                  <div className="w-full h-full bg-[#1c3f60] p-[2cqw] relative border-[0.5cqw] border-[#2a547e] overflow-hidden">
                     <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[length:2cqw_2cqw] pointer-events-none" />
                     <div className="w-full h-[60%] border-2 border-white/40 mt-4 flex relative">
                        <div className="w-1/3 h-full border-r-2 border-white/40" />
                        <div className="w-2/3 h-full flex flex-col">
                           <div className="h-1/2 border-b-2 border-white/40 relative">
                             <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[8cqw] h-[8cqw] rounded-full border-[0.4cqw] border-red-500 animate-ping opacity-50" />
                             <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-red-500 font-sans font-black text-[1.2cqw] whitespace-nowrap bg-[#1c3f60] px-1 -rotate-12">DO NOT OPEN</div>
                           </div>
                           <div className="h-1/2" />
                        </div>
                     </div>
                     <div className="absolute bottom-[2cqw] right-[2cqw] border border-white/60 p-2 bg-[#1c3f60]">
                       <div className="text-white font-mono text-[1cqw] opacity-80">PROJ: RORMS-7</div>
                       <div className="text-white font-mono text-[1cqw] opacity-80">LEVEL: SUB-B</div>
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 22 && (
                  <div className="w-full h-full bg-slate-100 p-[3cqw] flex flex-wrap content-start gap-[1cqw] overflow-hidden">
                     <span className="font-serif text-[4cqw] text-slate-800">⍼</span>
                     <span className="font-serif text-[4cqw] text-slate-800">⎈</span>
                     <span className="font-serif text-[4cqw] text-slate-800">⏣</span>
                     <span className="font-serif text-[4cqw] text-slate-800">⍙</span>
                     <span className="font-serif text-[4cqw] text-slate-800">Ω</span>
                     <div className="w-full h-0" />
                     <span className="font-serif text-[4cqw] text-slate-800">≈</span>
                     <span className="font-serif text-[4cqw] text-slate-800">ç</span>
                     <span className="font-serif text-[4cqw] text-red-600 font-bold drop-shadow-md animate-pulse">√</span>
                     <span className="font-serif text-[4cqw] text-slate-800">∫</span>
                     <div className="w-full h-0" />
                     <span className="font-serif text-[4cqw] text-slate-800">µ</span>
                     <span className="font-serif text-[4cqw] text-slate-800">∂</span>
                     <span className="font-serif text-[4cqw] text-slate-800">∆</span>
                     <span className="font-serif text-[4cqw] text-slate-800">∏</span>
                     <div className="absolute bottom-[2cqw] left-0 w-full text-center text-slate-400 font-mono text-[1cqw]">TRANSLATING...</div>
                  </div>
                )}
                {data.bio.easterEggType === 23 && (
                  <div className="w-full h-full bg-white p-[2cqw] flex flex-col font-sans border border-gray-300">
                     <div className="bg-blue-600 text-white p-2">
                       <span className="text-[1cqw] block">Select all images with a</span>
                       <span className="text-[2cqw] font-bold block">GHOST</span>
                     </div>
                     <div className="grid grid-cols-3 gap-1 mt-1 flex-1">
                       {[...Array(9)].map((_, i) => (
                         <div key={i} className="bg-gray-200 border border-white hover:border-blue-500 cursor-pointer flex items-center justify-center relative overflow-hidden">
                           {i === 4 && <div className="absolute inset-0 bg-white/50 blur-[2px] rounded-full animate-pulse" />}
                         </div>
                       ))}
                     </div>
                     <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-300">
                       <div className="text-[2cqw] text-gray-400">↻ 🎧 ℹ️</div>
                       <div className="bg-blue-600 text-white px-4 py-1 text-[1.2cqw] font-bold">VERIFY</div>
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 24 && (
                  <div className="w-full h-full bg-black p-[2cqw] flex flex-col font-mono text-white relative overflow-hidden">
                     <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjwvc3ZnPg==')] animate-[slide_0.2s_linear_infinite]" />
                     <div className="absolute top-[20%] left-0 w-full h-[5px] bg-white/20 animate-[slideDown_3s_linear_infinite]" />
                     <div className="text-[3cqw] font-bold animate-pulse">▶ PLAY</div>
                     <div className="mt-auto flex justify-between text-[1.5cqw]">
                       <span>SP</span>
                       <span>0:00:00</span>
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 25 && (
                  <div className="w-full h-full bg-[#ffeb99] border-[1cqw] border-pink-500 p-[1cqw] flex flex-col font-sans relative overflow-hidden shadow-inner">
                     <div className="text-center text-pink-600 font-black text-[3cqw] italic uppercase tracking-tighter border-b-4 border-pink-500 pb-1 mb-2">MEGA MILLIONS</div>
                     <div className="flex-1 grid grid-cols-2 gap-2">
                       <div className="bg-slate-300 rounded-lg flex items-center justify-center font-bold text-slate-500 text-[1.5cqw]">NOPE</div>
                       <div className="bg-slate-300 rounded-lg flex items-center justify-center font-bold text-slate-500 text-[1.5cqw]">NADA</div>
                       <div className="bg-slate-300 rounded-lg flex items-center justify-center font-bold text-slate-500 text-[1.5cqw]">SORRY</div>
                       <div className="bg-slate-300 rounded-lg flex items-center justify-center font-bold text-slate-500 text-[1.5cqw]">$0</div>
                     </div>
                     <div className="mt-2 text-center text-[0.8cqw] text-pink-700 font-bold">SCRATCH TO WIN! (Odds of winning: 1 in never)</div>
                  </div>
                )}
                {data.bio.easterEggType === 26 && (
                  <div className="w-full h-full bg-slate-900 p-[2cqw] flex items-center justify-center relative overflow-hidden">
                     <div className="absolute w-[18cqw] h-[18cqw] border-4 border-red-500 rounded-full flex items-center justify-center shadow-[0_0_20px_#ef4444,inset_0_0_20px_#ef4444] animate-[spin_20s_linear_infinite]">
                        <div className="w-[14cqw] h-[14cqw] border-2 border-red-500 rounded-full flex items-center justify-center absolute">
                           <svg className="absolute w-full h-full" viewBox="0 0 100 100">
                              <polygon points="50,5 76.5,86.4 7.2,36.1 92.8,36.1 23.5,86.4" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-500" />
                           </svg>
                        </div>
                     </div>
                     <div className="text-red-500 font-serif text-[2cqw] animate-pulse z-10 filter drop-shadow-[0_0_5px_#ef4444]">⍼ ⎈ ⏣</div>
                  </div>
                )}
                {data.bio.easterEggType === 27 && (
                  <div className="w-full h-full flex items-center justify-center relative p-[4cqw]">
                     <div className="w-full h-full bg-yellow-200 p-[1.5cqw] shadow-md transform rotate-2 flex flex-col font-['Comic_Sans_MS',cursive] text-slate-800">
                       <span className="text-[1.5cqw] leading-relaxed">Don't trust the Dean of <strong>{data.deptCode}</strong>.</span>
                       <span className="text-[1.5cqw] leading-relaxed mt-2">I saw what they keep in the basement.</span>
                       <span className="text-[1.2cqw] leading-relaxed mt-auto text-right">- D.</span>
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 28 && (
                  <div className="w-full h-full bg-slate-100 p-[2cqw] flex flex-col items-center justify-center relative">
                     <div className="w-[20cqw] h-[12cqw] bg-gray-300 rounded-xl shadow-lg border-2 border-gray-400 p-[1cqw] flex flex-col justify-between relative overflow-hidden">
                        <div className="w-full h-[3cqw] bg-white border border-gray-400 flex items-center justify-center">
                           <span className="font-['Comic_Sans_MS',cursive] text-blue-700 text-[1.2cqw] transform -rotate-2">Mixtape Vol. 1</span>
                        </div>
                        <div className="flex justify-between px-2">
                           <div className="w-[3cqw] h-[3cqw] rounded-full bg-gray-200 border border-gray-400 flex items-center justify-center animate-spin"><div className="w-[1cqw] h-[1cqw] bg-black rounded-full" /></div>
                           <div className="w-[3cqw] h-[3cqw] rounded-full bg-gray-200 border border-gray-400 flex items-center justify-center animate-spin"><div className="w-[1cqw] h-[1cqw] bg-black rounded-full" /></div>
                        </div>
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 29 && (
                  <div className="w-full h-full bg-white p-[2cqw] flex flex-col items-center justify-center font-sans text-slate-800 border-t-[1cqw] border-blue-600 shadow-inner">
                     <h1 className="text-[6cqw] font-black mb-1">404</h1>
                     <h2 className="text-[2cqw] font-bold mb-4">Reality Not Found</h2>
                     <p className="text-[1.2cqw] text-center text-slate-600 max-w-[80%]">The dimension you are looking for might have been removed, had its timeline altered, or is temporarily inaccessible.</p>
                     <div className="mt-6 border border-slate-300 bg-slate-100 px-4 py-2 text-[1cqw] rounded-md shadow-sm">Go Back</div>
                  </div>
                )}
                {data.bio.easterEggType === 30 && (
                  <div className="w-full h-full bg-slate-900 p-[2cqw] flex flex-col items-center justify-center relative overflow-hidden">
                     <div className="w-0 h-0 border-l-[8cqw] border-l-transparent border-b-[14cqw] border-b-green-800 border-r-[8cqw] border-r-transparent relative flex justify-center items-center">
                        <div className="absolute top-[6cqw] w-[5cqw] h-[2.5cqw] bg-white rounded-[50%] flex justify-center items-center shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]">
                           <div className="w-[2cqw] h-[2cqw] bg-green-900 rounded-full flex justify-center items-center">
                             <div className="w-[0.5cqw] h-[0.5cqw] bg-black rounded-full" />
                           </div>
                        </div>
                     </div>
                     <div className="mt-4 text-green-700 font-serif text-[1.5cqw] tracking-widest uppercase">Novus Ordo Seclorum</div>
                  </div>
                )}
                {data.bio.easterEggType === 31 && (
                  <div className="w-full h-full bg-green-950 p-[2cqw] flex items-center justify-center relative overflow-hidden">
                     <div className="w-[18cqw] h-[18cqw] rounded-full border-4 border-green-500 relative flex justify-center items-center bg-[radial-gradient(circle,rgba(34,197,94,0.1)_0%,transparent_70%)] shadow-[0_0_30px_rgba(34,197,94,0.3),inset_0_0_30px_rgba(34,197,94,0.3)]">
                        <div className="absolute w-full h-[2px] bg-green-500/50" />
                        <div className="absolute h-full w-[2px] bg-green-500/50" />
                        <div className="absolute w-[12cqw] h-[12cqw] rounded-full border-2 border-green-500/50" />
                        <div className="absolute w-[6cqw] h-[6cqw] rounded-full border-2 border-green-500/50" />
                        
                        <div className="absolute top-1/2 left-1/2 w-[50%] h-[2px] bg-gradient-to-r from-green-500 to-transparent origin-left transform -translate-y-1/2 animate-[spin_4s_linear_infinite]" />
                        
                        <div className="absolute top-[30%] left-[60%] w-[1cqw] h-[1cqw] bg-green-400 rounded-full shadow-[0_0_10px_#4ade80] animate-[ping_4s_linear_infinite]" />
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 32 && (
                  <div className="w-full h-full bg-[#e8e4db] p-[2cqw] flex flex-col items-center justify-center relative shadow-inner">
                     <div className="w-[20cqw] bg-white p-[1cqw] pb-[4cqw] shadow-xl transform rotate-3 flex flex-col">
                        <div className="w-full h-[18cqw] bg-slate-800 relative overflow-hidden flex items-center justify-center">
                           <div className="absolute inset-0 bg-gradient-to-tr from-black via-transparent to-black opacity-80" />
                           <div className="w-[10cqw] h-[15cqw] bg-slate-900 rounded-t-full filter blur-[1cqw] opacity-70 transform -translate-x-2 translate-y-2" />
                           <div className="absolute top-[30%] right-[30%] w-[1cqw] h-[1cqw] bg-red-500 rounded-full blur-[2px] opacity-60" />
                           <div className="absolute top-[30%] right-[20%] w-[1cqw] h-[1cqw] bg-red-500 rounded-full blur-[2px] opacity-60" />
                        </div>
                        <div className="mt-2 text-center font-['Comic_Sans_MS',cursive] text-slate-700 text-[1.2cqw] transform -rotate-1">Spotted near the old library...</div>
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 33 && (
                  <div className="w-full h-full bg-white p-[2cqw] flex flex-col font-sans relative border-2 border-black">
                     <h2 className="text-[2cqw] font-bold border-b-2 border-black pb-1 mb-2">DAILY CROSSWORD</h2>
                     <div className="flex-1 grid grid-cols-5 grid-rows-5 gap-[1px] bg-black border-2 border-black">
                        {[...Array(25)].map((_, i) => (
                          <div key={i} className={`bg-white flex items-center justify-center font-black text-[2cqw] relative ${(i===0||i===1||i===2||i===6||i===11||i===16)?'':'bg-black'}`}>
                             {(i===0||i===1||i===2||i===6||i===11||i===16) && <span className="absolute top-[2px] left-[2px] text-[0.6cqw] font-normal leading-none">{i+1}</span>}
                             {i===0&&"R"} {i===1&&"U"} {i===2&&"N"}
                             {i===6&&"I"} {i===11&&"D"} {i===16&&"E"}
                          </div>
                        ))}
                     </div>
                     <div className="mt-2 flex gap-4 text-[1cqw]">
                       <div className="w-1/2"><strong>ACROSS</strong><br/>1. What you should do</div>
                       <div className="w-1/2"><strong>DOWN</strong><br/>1. Where you should be</div>
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 34 && (
                  <div className="w-full h-full bg-slate-950 p-[2cqw] flex flex-col items-center justify-center relative font-mono text-green-500">
                     <div className="text-[4cqw] tracking-[1cqw] animate-pulse">... --- ...</div>
                     <div className="mt-4 text-[1cqw] opacity-50 uppercase tracking-widest text-center">Transmission received.<br/>Origin: Unknown.</div>
                  </div>
                )}
                {data.bio.easterEggType === 35 && (
                  <div className="w-full h-full bg-yellow-400 p-[2cqw] flex flex-col items-center justify-center relative border-8 border-black overflow-hidden">
                     <div className="absolute top-[10%] left-[-20%] w-[140%] h-[3cqw] bg-black transform rotate-45 flex items-center justify-around overflow-hidden">
                        {[...Array(10)].map((_,i) => <span key={i} className="text-yellow-400 font-black text-[1.5cqw]">DO NOT CROSS</span>)}
                     </div>
                     <div className="absolute bottom-[10%] right-[-20%] w-[140%] h-[3cqw] bg-black transform rotate-45 flex items-center justify-around overflow-hidden">
                        {[...Array(10)].map((_,i) => <span key={i} className="text-yellow-400 font-black text-[1.5cqw]">DO NOT CROSS</span>)}
                     </div>
                     <div className="z-10 bg-black text-yellow-400 p-4 rounded-md text-center shadow-2xl transform -rotate-2">
                        <div className="text-[4cqw] mb-2">☣️</div>
                        <h1 className="text-[2.5cqw] font-black uppercase">QUARANTINE ZONE</h1>
                        <p className="text-[1cqw] font-mono mt-2">AUTHORIZATION LEVEL 4 REQUIRED</p>
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 36 && (
                  <div className="w-full h-full bg-[#fdfaf6] p-[2cqw] flex flex-col relative font-serif text-slate-800">
                     <div className="text-center font-bold text-[1.5cqw] mb-4 border-b border-slate-400 pb-2">THE ZODIAC CIPHER</div>
                     <div className="flex-1 grid grid-cols-10 grid-rows-8 gap-1 text-[1.2cqw] opacity-80 text-center font-['Courier_New',monospace]">
                        {[...Array(80)].map((_, i) => (
                           <div key={i}>{"⌖♈︎♉︎♊︎♋︎♌︎♍︎♎︎♏︎♐︎♑︎♒︎♓︎"[Math.floor(Math.random()*13)]}</div>
                        ))}
                     </div>
                     <div className="absolute bottom-[2cqw] right-[2cqw] text-[3cqw] text-red-600 opacity-60 transform rotate-12">⌖</div>
                  </div>
                )}
                {data.bio.easterEggType === 37 && (
                  <div className="w-full h-full bg-blue-700 p-[2cqw] flex flex-col items-center justify-center relative font-sans shadow-[inset_0_0_50px_rgba(0,0,0,0.5)]">
                     <div className="w-[18cqw] h-[18cqw] bg-gray-200 rounded-sm relative shadow-2xl flex flex-col border border-gray-400">
                        <div className="w-[12cqw] h-[6cqw] bg-gray-300 self-center border-b border-l border-r border-gray-400 flex items-end justify-end p-1">
                           <div className="w-[2cqw] h-[4cqw] bg-gray-400 border border-gray-500" />
                        </div>
                        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-[14cqw] h-[8cqw] bg-white border border-gray-400 p-1">
                           <div className="w-full border-b border-blue-500 font-['Comic_Sans_MS',cursive] text-[1cqw] text-red-600 font-bold mb-1">DO NOT FORMAT.</div>
                           <div className="w-full border-b border-gray-300 h-[1cqw] mb-1" />
                           <div className="w-full border-b border-gray-300 h-[1cqw] mb-1" />
                           <div className="w-full border-b border-gray-300 h-[1cqw]" />
                        </div>
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 38 && (
                  <div className="w-full h-full bg-white p-[2cqw] flex flex-col items-center justify-center relative font-sans">
                     <div className="w-[15cqw] h-[20cqw] border-4 border-black p-2 flex flex-col relative shadow-lg">
                        <div className="text-[1.5cqw] font-bold">115</div>
                        <div className="flex-1 flex items-center justify-center">
                           <span className="text-[6cqw] font-black">Ub</span>
                        </div>
                        <div className="text-center font-semibold text-[1.5cqw]">Unobtanium</div>
                        <div className="text-center text-[1cqw]">[288]</div>
                        <div className="absolute top-2 right-2 text-red-600 font-bold text-[1cqw] border border-red-600 px-1 rounded-sm transform rotate-12">UNSTABLE</div>
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 39 && (
                  <div className="w-full h-full bg-[#d2b48c] p-[2cqw] flex flex-col items-center relative font-serif shadow-[inset_0_0_50px_rgba(139,69,19,0.5)] overflow-hidden">
                     <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/wood-pattern.png')] opacity-20 mix-blend-multiply" />
                     <h1 className="text-[4cqw] font-black text-[#5c3a21] mb-2 drop-shadow-md">OUIJA</h1>
                     <div className="flex justify-between w-full px-[2cqw] text-[2cqw] font-bold text-[#5c3a21]">
                       <span>YES</span><span>NO</span>
                     </div>
                     <div className="mt-8 text-[3cqw] tracking-[0.5cqw] text-[#5c3a21]">A B C D E F G</div>
                     
                     <div className="absolute top-[30%] right-[20%] w-[6cqw] h-[8cqw] border-4 border-[#3e2723] rounded-t-full rounded-b-lg flex items-center justify-center bg-[#a0522d]/80 shadow-[0_10px_20px_rgba(0,0,0,0.5)] transform -rotate-45 animate-pulse">
                        <div className="w-[3cqw] h-[3cqw] rounded-full border-2 border-[#3e2723] bg-white/20" />
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 40 && (
                  <div className="w-full h-full bg-yellow-300 p-[2cqw] flex flex-col items-center justify-center relative font-sans border-[1cqw] border-red-600 shadow-inner text-center">
                     <div className="text-red-600 font-black text-[5cqw] uppercase tracking-tighter leading-none mb-4 animate-bounce">BUY ONE<br/>GET ONE<br/>FREE!</div>
                     <div className="bg-black text-white px-4 py-2 text-[2cqw] font-bold transform -rotate-3 shadow-lg">MEMORY WIPES</div>
                     <div className="mt-6 text-[1.2cqw] font-semibold text-slate-800 italic">Forget your exams today! Side effects may include loss of self, mild vaporizing, and phantom limb syndrome.</div>
                     <div className="absolute bottom-[1cqw] text-[0.8cqw] text-red-600 font-bold">*RORMS is not responsible for total identity loss.</div>
                  </div>
                )}
                {data.bio.easterEggType === 41 && (
                  <div className="w-full h-full bg-black p-[2cqw] flex flex-col font-mono text-green-500 overflow-hidden relative">
                     <span className="text-[1.2cqw] mb-2">DIALING... 555-0199</span>
                     <span className="text-[1cqw] opacity-80 break-words mb-2">*KKKSSSHHHHHH EEEEE-UUUUU BING BONG BING BONG KSSSSSSSH*</span>
                     <span className="text-[1.2cqw] animate-pulse mb-2">HANDSHAKE PROTOCOL INITIATED...</span>
                     <span className="text-[1cqw] text-red-500 opacity-0 animate-[fadeIn_0s_ease-in_2s_forwards]">ERROR: CARRIER LOST.</span>
                     <span className="text-[1cqw] text-red-500 opacity-0 animate-[fadeIn_0s_ease-in_2.5s_forwards]">THEY CUT THE HARDLINE.</span>
                  </div>
                )}
                {data.bio.easterEggType === 42 && (
                  <div className="w-full h-full bg-white p-[2cqw] flex flex-col items-center relative font-sans shadow-inner">
                     <div className="w-[80%] border-4 border-black p-[1cqw] flex flex-col items-center">
                        <div className="text-[3cqw] font-black uppercase tracking-widest text-black mb-2">MISSING</div>
                        <div className="w-[12cqw] h-[12cqw] bg-gray-200 border-2 border-black flex items-center justify-center overflow-hidden">
                           <div className="w-[8cqw] h-[8cqw] bg-black rounded-full transform translate-y-[4cqw]" />
                           <div className="absolute w-[6cqw] h-[6cqw] bg-black rounded-full transform -translate-y-[2cqw]" />
                        </div>
                        <div className="text-[1.5cqw] font-bold mt-2 uppercase">Have you seen this entity?</div>
                        <div className="text-[1cqw] text-center mt-1">Last seen clipping through the wall in the Dean's Office.</div>
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 43 && (
                  <div className="w-full h-full bg-black p-[2cqw] relative overflow-hidden flex items-center">
                     <div className="absolute left-[-20%] flex gap-4 items-center animate-[slideRight_6s_linear_infinite]">
                        <div className="w-[4cqw] h-[4cqw] rounded-full" style={{ background: 'conic-gradient(from 135deg, #facc15 270deg, transparent 0)' }} />
                        <div className="w-[4cqw] h-[4cqw] bg-red-500 rounded-t-full rounded-b-md relative">
                           <div className="absolute top-[1cqw] left-[0.5cqw] w-[1cqw] h-[1cqw] bg-white rounded-full"><div className="absolute top-[0.2cqw] right-[0.2cqw] w-[0.5cqw] h-[0.5cqw] bg-blue-600 rounded-full" /></div>
                           <div className="absolute top-[1cqw] right-[0.5cqw] w-[1cqw] h-[1cqw] bg-white rounded-full"><div className="absolute top-[0.2cqw] right-[0.2cqw] w-[0.5cqw] h-[0.5cqw] bg-blue-600 rounded-full" /></div>
                        </div>
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 44 && (
                  <div className="w-full h-full bg-white p-[2cqw] flex flex-col justify-center relative font-mono overflow-hidden">
                     <div className="flex w-full h-[60%] items-end justify-between px-[2cqw]">
                        {[...Array(30)].map((_, i) => (
                           <div key={i} className={`bg-black h-full ${Math.random() > 0.5 ? 'w-[0.5cqw]' : Math.random() > 0.5 ? 'w-[1cqw]' : 'w-[0.2cqw]'}`} />
                        ))}
                     </div>
                     <div className="text-center font-bold text-[1.5cqw] mt-2 tracking-widest">PROPERTY OF RORMS</div>
                     <div className="text-center text-[1cqw] opacity-50">DO NOT REMOVE OR ALTER</div>
                  </div>
                )}
                {data.bio.easterEggType === 45 && (
                  <div className="w-full h-full bg-[#333] p-[2cqw] flex items-center justify-center relative shadow-inner">
                     <div className="w-[20cqw] h-[10cqw] bg-yellow-500 rounded-lg flex relative shadow-2xl transform rotate-[-5deg]">
                        <div className="absolute top-1/2 left-[-1cqw] transform -translate-y-1/2 w-[2cqw] h-[2cqw] bg-[#333] rounded-full" />
                        <div className="absolute top-1/2 right-[-1cqw] transform -translate-y-1/2 w-[2cqw] h-[2cqw] bg-[#333] rounded-full" />
                        <div className="w-[70%] border-r-2 border-dashed border-black/40 p-[1cqw] flex flex-col justify-center">
                           <div className="font-bold text-[1cqw] uppercase opacity-80">ADMIT ONE</div>
                           <div className="font-black text-[1.5cqw] uppercase leading-tight">The End of the World</div>
                           <div className="text-[0.8cqw] font-mono mt-1 opacity-60">ROW: NaN SEAT: NaN</div>
                        </div>
                        <div className="w-[30%] flex items-center justify-center">
                           <div className="transform -rotate-90 font-black text-[1.5cqw] opacity-40">ADMIT ONE</div>
                        </div>
                     </div>
                  </div>
                )}
                {data.bio.easterEggType === 46 && (
                  <div className="w-full h-full bg-blue-800 p-[2cqw] flex flex-col items-center justify-center relative font-sans text-white cursor-wait">
                     <div className="w-[8cqw] h-[8cqw] border-4 border-white/20 rounded-full border-t-white animate-spin mb-4" />
                     <h2 className="text-[2cqw] font-normal">Working on updates...</h2>
                     <h3 className="text-[2.5cqw] font-normal mt-1">99% complete</h3>
                     <p className="text-[1.2cqw] font-normal mt-4 opacity-80">Do not turn off your reality.</p>
                  </div>
                )}
                {data.bio.easterEggType === 47 && (
                  <div className="w-full h-full bg-[#f4ebd8] p-[2cqw] flex items-center justify-center relative overflow-hidden shadow-[inset_0_0_50px_rgba(0,0,0,0.1)]">
                     <div className="absolute text-slate-800/10 font-serif text-[1cqw] top-4 left-4">Fig 1. Rorschach</div>
                     <div className="w-[18cqw] h-[18cqw] bg-black rounded-[40%_60%_70%_30%/40%_50%_60%_50%] transform rotate-12 scale-x-[-1] filter blur-[1px] opacity-80 mix-blend-multiply flex justify-center items-center shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]" />
                     <div className="absolute w-[18cqw] h-[18cqw] bg-black rounded-[40%_60%_70%_30%/40%_50%_60%_50%] transform rotate-[-12deg] filter blur-[1px] opacity-80 mix-blend-multiply flex justify-center items-center shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]" />
                     <div className="absolute bottom-[2cqw] font-['Comic_Sans_MS',cursive] text-[1.2cqw] text-slate-600 opacity-60">"It looks like... a monster."</div>
                  </div>
                )}
                {data.bio.easterEggType === 48 && (
                  <div className="w-full h-full bg-[#0a1910] p-[2cqw] flex items-center relative overflow-hidden">
                     <div className="absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.1)_1px,transparent_1px)] bg-[length:2cqw_2cqw] pointer-events-none opacity-30" />
                     <svg className="flex-shrink-0 w-[150%] h-[10cqw] transform -translate-x-[20%]" viewBox="0 0 100 20" preserveAspectRatio="none">
                        <polyline points="0,10 20,10 22,5 25,18 28,2 30,12 32,10 100,10" fill="none" stroke="#22c55e" strokeWidth="0.5" strokeLinejoin="round" className="filter drop-shadow-[0_0_2px_#22c55e]" />
                     </svg>
                     <div className="absolute top-[2cqw] right-[2cqw] text-green-500 font-mono text-[2cqw] animate-pulse">BPM: 00</div>
                  </div>
                )}
                {data.bio.easterEggType === 49 && (
                  <div className="w-full h-full bg-[#fdfaf6] p-[3cqw] flex flex-col justify-center relative font-serif text-[1.4cqw] leading-relaxed text-slate-800">
                     <p>The sun is <span className="line-through decoration-red-600 decoration-[4px]">shining</span>.</p>
                     <p>The birds are <span className="line-through decoration-red-600 decoration-[4px]">singing</span>.</p>
                     <p>Everything is <span className="line-through decoration-red-600 decoration-[4px]">fine</span>.</p>
                     <p className="mt-4">You are <span className="line-through decoration-red-600 decoration-[4px]">safe</span> here.</p>
                     <p>Do not <span className="line-through decoration-red-600 decoration-[4px]">run</span>.</p>
                     <div className="absolute bottom-[2cqw] right-[2cqw] text-red-600 font-['Comic_Sans_MS',cursive] transform rotate-[-10deg] text-[1.5cqw]">WAKE UP</div>
                  </div>
                )}
                {data.bio.easterEggType === 50 && (
                  <div className="w-full h-full bg-black flex items-center justify-center relative overflow-hidden">
                     <div className="absolute inset-0 bg-red-900/20 mix-blend-multiply opacity-50" />
                     <h1 className="text-[4cqw] font-serif font-black text-red-700 tracking-[1cqw] filter drop-shadow-[0_0_10px_rgba(220,38,38,0.5)] transform scale-110 opacity-0 animate-[fadeIn_2s_ease-in_forwards]">YOU DIED</h1>
                  </div>
                )}
                {data.bio.easterEggType === 51 && (
                  <div className="w-full h-full bg-black p-[2cqw] flex flex-col font-serif relative overflow-hidden border-4 border-double border-white/70">
                     <div className="text-center text-white text-[2.5cqw] mb-[2cqw] border-b border-white/50 pb-2 uppercase tracking-[0.2cqw]">DEATH NOTE<br/><span className="text-[1.2cqw] tracking-[0.5cqw]">HOW TO USE IT</span><br/><span className="text-[1.5cqw]">I</span></div>
                     <ul className="text-white text-[1.2cqw] list-none space-y-[1cqw] italic opacity-90">
                       <li className="flex gap-2"><span>•</span><span>The human whose name is written in this note shall die.</span></li>
                       <li className="flex gap-2"><span>•</span><span>This note will not take effect unless the writer has the person's face in their mind when writing his/her name. Therefore, people sharing the same name will not be affected.</span></li>
                       <li className="flex gap-2"><span>•</span><span>If the cause of death is written within 40 seconds of writing the person's name, it will happen.</span></li>
                       <li className="flex gap-2"><span>•</span><span>If the cause of death is not specified, the person will simply die of a heart attack.</span></li>
                       <li className="flex gap-2"><span>•</span><span>After writing the cause of death, details of the death should be written in the next 6 minutes and 40 seconds.</span></li>
                     </ul>
                  </div>
                )}
                {data.bio.easterEggType === 52 && (
                  <div className="w-full h-full bg-[#f4ebd8] p-[2cqw] flex flex-col font-['Comic_Sans_MS',cursive] relative overflow-hidden">
                     <div className="absolute inset-0 bg-[linear-gradient(transparent_95%,rgba(0,0,0,0.1)_95%)] bg-[length:100%_2.5cqw] pointer-events-none" />
                     <div className="absolute top-0 bottom-0 left-[4cqw] w-0 border-l-2 border-red-400/50 pointer-events-none" />
                     <div className="ml-[3.5cqw] flex flex-col gap-[1cqw] text-[1.5cqw] mt-[2cqw]">
                        <div className="text-black transform -rotate-1">Lind L. Tailor - Heart Attack</div>
                        <div className="text-black transform rotate-1 ml-[1cqw]">Kiichiro Osoreda - Traffic Accident</div>
                        <div className="text-black transform -rotate-2 ml-[0.5cqw]">Naomi Misora - Suicide</div>
                        <div className="text-black transform rotate-2">Raye Penber - Heart Attack</div>
                        <div className="text-red-700 font-bold transform -rotate-3 text-[1.8cqw] mt-[2cqw] opacity-80">JUSTICE!</div>
                     </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                 {/* Top Header: Logo + Code on Left, Dean Name on Right */}
                 <div className="w-full flex justify-between items-center mb-[2cqw] border-b border-[#62853e]/10 pb-[1cqw]">
                   <div className="flex items-center gap-[0.8cqw]">
                     {data.deptLogo ? (
                       <img src={data.deptLogo} alt="Logo" className="w-[3.5cqw] h-[3.5cqw] rounded-full shadow-sm border border-[#62853e]/30 object-cover bg-white" />
                     ) : (
                       <div className="w-[3.5cqw] h-[3.5cqw] rounded-full shadow-sm border border-[#62853e]/30 bg-white/60 flex items-center justify-center text-[#62853e]/70">
                         <svg className="w-[2cqw] h-[2cqw]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                         </svg>
                       </div>
                     )}
                   </div>
                   
                   {data.deanName !== 'No Dean Assigned' ? (
                     <div className="text-right flex flex-col justify-center">
                       <span className="text-[2.4cqw] font-bold text-slate-700 leading-none">{data.deanName}</span>
                     </div>
                   ) : (
                     <span className="text-[1.4cqw] font-medium text-slate-400 italic">Vacant</span>
                   )}
                 </div>
                 
                 {data.deanName === 'No Dean Assigned' ? (
                   <>
                     <h4 className="text-[2.5cqw] font-bold text-slate-400 leading-tight mb-[2cqw] line-clamp-2 px-[1cqw]">{data.deptName}</h4>
                     
                     <div className="flex-1 w-[90%] border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center opacity-60">
                        <svg className="w-[8cqw] h-[8cqw] text-slate-400 mb-[1cqw]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <p className="text-[1.8cqw] font-medium text-slate-400">Waiting for Appointment</p>
                     </div>
                   </>
                 ) : (
                   <>
                     <h4 className="text-[2.5cqw] font-bold text-[#62853e]/90 leading-tight mb-[2cqw] line-clamp-2 px-[1cqw]">{data.deptName}</h4>
                                 
                     <div className="flex-1 w-[90%] bg-white/40 border border-[#62853e]/20 rounded-lg p-[1.5cqw] text-left flex flex-col shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] relative">
                        <div className="absolute -top-[1px] -left-[1px] w-[1cqw] h-[1cqw] border-t-2 border-l-2 border-[#62853e]/40 rounded-tl-lg" />
                        <div className="absolute -bottom-[1px] -right-[1px] w-[1cqw] h-[1cqw] border-b-2 border-r-2 border-[#62853e]/40 rounded-br-lg" />
                        
                        <div className="flex flex-col pb-[1cqw] mb-[1cqw]">
                          <span className="text-[1.8cqw] font-bold text-[#62853e]/60 uppercase tracking-widest px-[1cqw] mb-[1cqw]">Known Information</span>
                          
                          <div className="grid grid-cols-[auto_1fr] gap-y-[1cqw] gap-x-[1.5cqw] text-[1.8cqw] px-[1cqw]">
                            <div className="text-[#62853e]/80 font-semibold text-left">Planet:</div>
                            <div className="text-slate-800 font-medium truncate text-left">{data.bio.planet}</div>
                            
                            <div className="text-[#62853e]/80 font-semibold text-left">Species:</div>
                            <div className="text-slate-800 font-medium truncate text-left">{data.bio.species}</div>
                            
                            <div className="text-[#62853e]/80 font-semibold text-left">Language:</div>
                            <div className="text-slate-800 font-medium truncate text-left">{data.bio.language}</div>
                          </div>
                        </div>
                        
                        <div className="mt-auto text-[1.4cqw] italic text-amber-900/80 text-center leading-snug px-[1cqw] pt-[1.2cqw] border-t border-[#62853e]/10">
                          "{data.bio.info}"
                        </div>
                     </div>
                   </>
                 )}
              </>
            )}
          </div>
        )
       ) : (
         <div className="relative z-10 text-amber-900/20 font-serif italic text-[3cqw]">
           Blank Page
         </div>
       )}
       
       {pageNumber !== undefined && (
         <div className={`absolute bottom-[1cqw] ${isLeft ? 'left-[1.5cqw]' : 'right-[1.5cqw]'} text-[1.6cqw] font-medium text-[#62853e]/60 font-serif`}>
           {pageNumber}
         </div>
       )}
    </div>
  )
}

interface DeanBookProps {
  departments: Department[];
  allUsers: Member[];
  isEasterEggsEnabled: boolean;
  selectedAnomalies: number[];
}

const DeanBook = ({ departments, allUsers, isEasterEggsEnabled, selectedAnomalies }: DeanBookProps) => {
  const randomStatsRef = useRef<Record<string, { planet: string, language: string, species: string, info: string }>>({});
  const shuffledListsRef = useRef<{ planets: string[], languages: string[], species: string[], infos: string[] } | null>(null);
  const usedIndicesRef = useRef({ planet: 0, language: 0, species: 0, info: 0 });

  const deansData = useMemo(() => {
    const planets = [
      'Tatooine', 'Krypton', 'Arrakis', 'Gallifrey', 'Vulcan', 'Cybertron', 'Asgard', 'Coruscant', 'Naboo', 'Pandora',
      'Hoth', 'Endor', 'Dagobah', 'Bespin', 'Kashyyyk', 'Mustafar', 'Kamino', 'Geonosis', 'Alderaan', 'Yavin 4',
      'Oa', 'Apokolips', 'Namek', 'Vegeta', 'Reach', 'Sanghelios', 'Sera', 'Earth-616', 'Zebes', 'SR388',
      'Tallon IV', 'Aether', 'Phaaze', 'Corneria', 'Venom', 'Macross', 'Risa', 'Qo\'noS', 'Romulus', 'Cardassia',
      'Bajor', 'Trill', 'Caprica', 'Kobol', 'Picon', 'Tauron', 'Giedi Prime', 'Caladan', 'Salusa Secundus', 'Solaris'
    ];
    const languages = [
      'Galactic Basic', 'Klingon', 'Elvish', 'Dothraki', 'Valyrian', 'Groot', 'Huttese', 'Mando\'a', 'Sindarin', 'Na\'vi',
      'Quenya', 'Khuzdul', 'Black Speech', 'Dovahzul', 'Simlish', 'Hylian', 'Al Bhed', 'Sangheili', 'Forerunner', 'Kryptonese',
      'Romulan', 'Ferengi', 'Cardassian', 'Bajoran', 'Borg', 'Dalek', 'Gallifreyan', 'Shyriiwook', 'Ewokese', 'Jawaese',
      'Geonosian', 'Rodian', 'Twi\'leki', 'Zabrak', 'Sith', 'Jedi', 'Ancient', 'Goa\'uld', 'Jaffa', 'Wraith',
      'Lantean', 'Nox', 'Furling', 'Ori', 'Minbari', 'Narn', 'Centauri', 'Vorlon', 'Shadow', 'Draenei'
    ];
    const species = [
      'Human', 'Martian', 'Time Lord', 'Vulcan', 'Asgardian', 'Wookiee', 'Ewok', 'Jawa', 'Gungan', 'Twi\'lek',
      'Kryptonian', 'Saiyan', 'Namekian', 'Sangheili', 'Unggoy', 'Jiralhanae', 'Xenomorph', 'Yautja', 'Na\'vi', 'Krogan',
      'Turian', 'Asari', 'Salarian', 'Quarian', 'Drell', 'Volus', 'Hanar', 'Elcor', 'Batarian', 'Vorcha',
      'Geth', 'Prothean', 'Borg', 'Klingon', 'Romulan', 'Cardassian', 'Ferengi', 'Bajoran', 'Trill', 'Ocampa',
      'Talaxian', 'Vorta', 'Jem\'Hadar', 'Changeling', 'Dalek', 'Cyberman', 'Sontaran', 'Weeping Angel', 'Zygon', 'Silurian'
    ];
    const infos = [
      'Believed to be a time traveler.', 'Has a suspicious amount of cats.', 'Once defeated a dragon with a spoon.', 'Can communicate with plants.',
      'Actually a stack of 3 raccoons.', 'Invented a new color.', 'Banned from multiple parallel universes.', 'Can smell the color 9.',
      'Speaks entirely in movie quotes.', 'Secretly controls the world\'s cheese supply.', 'Wanted in 12 star systems for jaywalking.', 'Once stared down a black hole and won.',
      'Is 40% titanium.', 'Refuses to believe the moon is real.', 'Can taste radio waves.', 'Always knows where the missing sock is.',
      'Communicates primarily through interpretive dance.', 'Has a black belt in origami.', 'Once successfully argued with a brick wall.', 'Can hear Wi-Fi signals.',
      'Only eats foods that are blue.', 'Sleeps hanging upside down.', 'Collects vintage toenail clippers.', 'Can bend spoons with their mind (sometimes).',
      'Is afraid of marshmallows.', 'Once won a staring contest with a statue.', 'Has a pet rock named "Rocky".', 'Can recite the dictionary backwards.',
      'Is allergic to Mondays.', 'Invented the left-handed screwdriver.', 'Can predict the past with 100% accuracy.', 'Has a collection of invisible art.',
      'Only speaks in haikus on Tuesdays.', 'Once arm-wrestled a bear and won.', 'Can un-toast bread.', 'Has a phobia of doorknobs.',
      'Can breathe underwater (but only in bathtubs).', 'Once convinced a mirror it was wrong.', 'Is a professional cloud watcher.', 'Can speak fluent dolphin.',
      'Has a degree in underwater basket weaving.', 'Once outsmarted a supercomputer using a potato.', 'Can balance a pencil on their nose indefinitely.', 'Is the reigning champion of imaginary hide-and-seek.',
      'Can tell time by looking at a tree.', 'Once found the edge of the internet.', 'Can make a plant grow by yelling at it.', 'Is immune to brain freeze.',
      'Once successfully downloaded a car.', 'Can smell fear, but it smells like strawberries.'
    ];

    if (!shuffledListsRef.current) {
      const shuffle = (arr: string[]) => arr.slice().sort(() => Math.random() - 0.5);
      shuffledListsRef.current = {
        planets: shuffle(planets),
        languages: shuffle(languages),
        species: shuffle(species),
        infos: shuffle(infos)
      };
    }

    return [...departments]
      .sort((a, b) => {
        if (a.deanUID && !b.deanUID) return -1;
        if (!a.deanUID && b.deanUID) return 1;
        return a.name.localeCompare(b.name);
      })
      .map(d => {
         const deanUser = d.deanUID ? allUsers.find(u => u.id === d.deanUID) : null;
         
         if (!randomStatsRef.current[d.id]) {
           const lists = shuffledListsRef.current!;
           const u = usedIndicesRef.current;
           randomStatsRef.current[d.id] = {
             planet: lists.planets[u.planet++ % lists.planets.length],
             language: lists.languages[u.language++ % lists.languages.length],
             species: lists.species[u.species++ % lists.species.length],
             info: lists.infos[u.info++ % lists.infos.length]
           };
         }
         
         return {
           deptName: d.name,
           deptCode: d.code,
           deptLogo: d.logo,
           deanName: d.deanName || 'No Dean Assigned',
           deanAvatar: deanUser?.avatar || '',
           bio: randomStatsRef.current[d.id]
         }
      });
  }, [departments, allUsers]);

  const [loopCounter, setLoopCounter] = useState(0);

  const [patternTick, setPatternTick] = useState(0);
  const patternChunksRef = useRef<{ isEasterEgg: boolean, eggType: number, alienNum: string, index: number }[][]>([]);
  const currentChunkIndexRef = useRef(0);
  const prevDeansDataLengthRef = useRef(-1);
  const trailingEggRef = useRef<any>(null);
  const prevSeqLengthRef = useRef(-1);

  const generateChunkPattern = useCallback((deansCount: number) => {
    const newPattern: { isEasterEgg: boolean, eggType: number, alienNum: string, index: number, isBlank?: boolean }[] = [];
    const ALIEN_CHARS = "⍼⎈⏣⍙Ω≈ç√∫µ∂∆∏∑ΩXÆA-12░▒▓█";
    const getRandomAlienText = () => {
      let text = '';
      const len = Math.floor(Math.random() * 3) + 2;
      for (let i = 0; i < len; i++) {
        text += ALIEN_CHARS[Math.floor(Math.random() * ALIEN_CHARS.length)];
      }
      return text;
    };

    const availableEggs = Array.from({ length: 52 }, (_, i) => i + 1).filter(e => !selectedAnomalies.includes(e));
    
    // Shuffle selected anomalies so they get distributed randomly across departments
    const forcedEggs = [...selectedAnomalies];
    for (let i = forcedEggs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [forcedEggs[i], forcedEggs[j]] = [forcedEggs[j], forcedEggs[i]];
    }

    // Assign forced eggs to random department slots
    const forcedSlots = new Set<number>();
    const slotIndices = Array.from({ length: deansCount }, (_, i) => i);
    // Shuffle slot indices to randomly distribute forced eggs
    for (let i = slotIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slotIndices[i], slotIndices[j]] = [slotIndices[j], slotIndices[i]];
    }
    const forcedSlotMap = new Map<number, number>(); // deptIndex -> eggType
    for (let f = 0; f < forcedEggs.length && f < deansCount; f++) {
      forcedSlotMap.set(slotIndices[f], forcedEggs[f]);
      forcedSlots.add(slotIndices[f]);
    }

    for (let i = 0; i < deansCount; i++) {
      const deptItem = { isEasterEgg: false, eggType: 0, alienNum: '', index: i };

      if (isEasterEggsEnabled && forcedSlots.has(i)) {
        // This slot has a forced (selected) anomaly — 100% spawn
        const chosenEgg = forcedSlotMap.get(i)!;
        const eggItem = { isEasterEgg: true, eggType: chosenEgg, alienNum: getRandomAlienText(), index: i };
        if (Math.random() > 0.5) {
          newPattern.push(eggItem, deptItem);
        } else {
          newPattern.push(deptItem, eggItem);
        }
      } else if (isEasterEggsEnabled && availableEggs.length > 0) {
        // Non-forced slot — 50% random chance
        let shouldRoll = true;
        
        // SMART ENDING: If this is the last department and placing it alone would perfectly 
        // finish the spread (meaning the current length is odd), skip the anomaly roll so we 
        // don't unnecessarily push the book onto a new padded spread.
        if (i === deansCount - 1 && newPattern.length % 2 !== 0) {
          shouldRoll = false;
        }

        if (shouldRoll && Math.random() > 0.5) {
          const eggIndex = Math.floor(Math.random() * availableEggs.length);
          const chosenEgg = availableEggs.splice(eggIndex, 1)[0];
          const eggItem = { isEasterEgg: true, eggType: chosenEgg, alienNum: getRandomAlienText(), index: i };
          if (Math.random() > 0.5) {
            newPattern.push(eggItem, deptItem);
          } else {
            newPattern.push(deptItem, eggItem);
          }
        } else {
          newPattern.push(deptItem);
        }
      } else {
        newPattern.push(deptItem);
      }
    }
    
    if (newPattern.length % 2 !== 0) {
      if (isEasterEggsEnabled && Math.random() > 0.5 && availableEggs.length > 0) {
        const eggIndex = Math.floor(Math.random() * availableEggs.length);
        const chosenEgg = availableEggs.splice(eggIndex, 1)[0];
        newPattern.push({ isEasterEgg: true, eggType: chosenEgg, alienNum: getRandomAlienText(), index: -1 });
      } else {
        newPattern.push({ isEasterEgg: false, isBlank: true, eggType: 0, alienNum: '', index: -1 });
      }
    }

    // Ensure no page spread (pair of adjacent items) is devoid of departments.
    // This prevents [Anomaly, Anomaly] and [Anomaly, Blank] spreads.
    for (let p = 0; p + 1 < newPattern.length; p += 2) {
      const p1IsDept = !newPattern[p].isEasterEgg && !newPattern[p].isBlank;
      const p2IsDept = !newPattern[p + 1].isEasterEgg && !newPattern[p + 1].isBlank;

      if (!p1IsDept && !p2IsDept) {
        // Find the nearest department to swap with
        let swapped = false;
        // Look forward first
        for (let s = p + 2; s < newPattern.length; s++) {
          const sIsDept = !newPattern[s].isEasterEgg && !newPattern[s].isBlank;
          if (sIsDept) {
            [newPattern[p + 1], newPattern[s]] = [newPattern[s], newPattern[p + 1]];
            swapped = true;
            break;
          }
        }
        // If no forward swap found, look backward
        if (!swapped) {
          for (let s = p - 1; s >= 0; s--) {
            const sIsDept = !newPattern[s].isEasterEgg && !newPattern[s].isBlank;
            if (sIsDept) {
              [newPattern[p], newPattern[s]] = [newPattern[s], newPattern[p]];
              break;
            }
          }
        }
      }
    }

    return newPattern;
  }, [isEasterEggsEnabled, selectedAnomalies]);

  useEffect(() => {
    patternChunksRef.current = [];
    setPatternTick(t => t + 1);
  }, [isEasterEggsEnabled, selectedAnomalies]);

  const bookSequence = useMemo(() => {
    if (patternChunksRef.current.length === 0 || prevDeansDataLengthRef.current !== deansData.length) {
      patternChunksRef.current = [];
      for (let loop = 0; loop < 3; loop++) {
        patternChunksRef.current.push(generateChunkPattern(deansData.length));
      }
      prevDeansDataLengthRef.current = deansData.length;
    }

    const sequence: any[] = [];
    patternChunksRef.current.forEach((chunkPattern, chunkIndex) => {
      let realPageNum = 1;
      chunkPattern.forEach(item => {
        if (item.index === -1) {
          // This is a padding page
          if (item.isEasterEgg) {
            sequence.push({
              isEasterEgg: true,
              realPageNum: item.alienNum,
              chunkIndex,
              deptName: 'Unknown',
              deptCode: '???',
              bio: { easterEggType: item.eggType }
            });
          } else {
            sequence.push({
              isBlank: true,
              chunkIndex
            });
          }
          return;
        }

        const dept = deansData[item.index];
        if (!dept) return;
        if (item.isEasterEgg) {
          sequence.push({
            isEasterEgg: true,
            realPageNum: item.alienNum,
            chunkIndex,
            ...dept,
            bio: { ...dept.bio, easterEggType: item.eggType }
          });
        } else {
          sequence.push({
            ...dept,
            realPageNum: realPageNum++,
            chunkIndex,
            isEasterEgg: false
          });
        }
      });
    });

    return sequence;
  }, [deansData, patternTick]);

  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    if (bookSequence.length === 0) return;
    const currentPageItem = bookSequence[pageIndex];
    if (!currentPageItem) return;

    const newChunk = currentPageItem.chunkIndex;
    const oldChunk = currentChunkIndexRef.current;

    if (newChunk !== oldChunk) {
       let chunkToRegenerate = -1;
       let shiftAmount = 0;

       if (oldChunk === 0 && newChunk === 1) chunkToRegenerate = 0;
       else if (oldChunk === 1 && newChunk === 2) chunkToRegenerate = 1;
       else if (oldChunk === 2 && newChunk === 0) chunkToRegenerate = 2; // Wrap forward
       else if (oldChunk === 1 && newChunk === 0) chunkToRegenerate = 1; // Backward
       else if (oldChunk === 2 && newChunk === 1) chunkToRegenerate = 2;
       else if (oldChunk === 0 && newChunk === 2) chunkToRegenerate = 0; // Wrap backward

       if (chunkToRegenerate !== -1) {
         const oldLength = patternChunksRef.current[chunkToRegenerate].length;
         
         const newPattern = generateChunkPattern(deansData.length);

         patternChunksRef.current[chunkToRegenerate] = newPattern;
         const newLength = newPattern.length;
         const lengthDiff = newLength - oldLength;

         if (chunkToRegenerate < newChunk) {
            shiftAmount += lengthDiff;
         }

         // Only shift pageIndex if we actually changed length
         if (shiftAmount !== 0) {
           setPageIndex(p => p + shiftAmount);
         }
         
         setPatternTick(t => t + 1);
       }
       currentChunkIndexRef.current = newChunk;
    }
  }, [pageIndex, bookSequence, deansData]);
  const [flipState, setFlipState] = useState<{ dir: 'next' | 'prev' | null, phase: 'idle' | 'start' | 'flipping' }>({
    dir: null,
    phase: 'idle'
  });
  const [isHovered, setIsHovered] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const tooltipRef = useRef<{ x: number; y: number; text: string }>({ x: 0, y: 0, text: '' });
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number; text: string }>({ x: 0, y: 0, text: '' });

  const showTooltip = (x: number, y: number, text: string) => {
    tooltipRef.current = { x, y, text };
    setTooltipPos({ x, y, text });
    setTooltipVisible(true);
  };
  const hideTooltip = () => setTooltipVisible(false);

  const isFlipping = flipState.phase !== 'idle';

  const handleNext = () => {
    if (isFlipping) return;
    setFlipState({ dir: 'next', phase: 'start' });
  };

  const handlePrev = () => {
    if (isFlipping) return;
    setFlipState({ dir: 'prev', phase: 'start' });
  };

  useEffect(() => {
    if (flipState.phase === 'start') {
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setFlipState(prev => ({ ...prev, phase: 'flipping' }));
        });
      });
      // Fallback timeout in case RAF is weird
      const to = setTimeout(() => {
        setFlipState(prev => prev.phase === 'start' ? { ...prev, phase: 'flipping' } : prev);
      }, 50);
      return () => { cancelAnimationFrame(raf); clearTimeout(to); };
    }
  }, [flipState.phase]);

  useEffect(() => {
    if (flipState.phase === 'flipping') {
      const timer = setTimeout(() => {
        setPageIndex(p => {
          const maxPages = Math.max(1, Math.ceil(bookSequence.length / 2)) * 2;
          if (flipState.dir === 'next') {
            let nextP = p + 2;
            if (nextP >= bookSequence.length) {
              nextP = 0;
            }
            return nextP;
          }
          if (flipState.dir === 'prev') {
            let prevP = p - 2;
            if (prevP < 0) {
              prevP = Math.floor((bookSequence.length - 1) / 2) * 2;
            }
            return prevP;
          }
          return p;
        });
        setFlipState({ dir: null, phase: 'idle' });
      }, 2000); // match CSS transition duration
      return () => clearTimeout(timer);
    }
  }, [flipState.phase, flipState.dir, bookSequence.length]);

  const totalSpreads = Math.max(1, Math.ceil(bookSequence.length / 2));
  const maxPages = totalSpreads * 2;
  const canFlip = maxPages > 2;

  // Auto-flip effect
  useEffect(() => {
    if (!isHovered && flipState.phase === 'idle' && canFlip) {
      const timer = setTimeout(() => {
        setFlipState({ dir: 'next', phase: 'start' });
      }, 3500); // Wait 3.5s on the page before turning automatically
      return () => clearTimeout(timer);
    }
  }, [isHovered, flipState.phase, canFlip]);

  let targetIndexNext = pageIndex + 2;
  if (targetIndexNext >= bookSequence.length) {
    targetIndexNext = 0;
  }

  let targetIndexPrev = pageIndex - 2;
  if (targetIndexPrev < 0) {
    targetIndexPrev = Math.floor((bookSequence.length - 1) / 2) * 2;
  }

  const dir = flipState.dir;
  const targetIndex = dir === 'next' ? targetIndexNext : targetIndexPrev;

  const staticLeftIndex = dir === 'prev' ? targetIndex : pageIndex;
  const staticRightIndex = dir === 'next' ? targetIndex + 1 : pageIndex + 1;
  
  const flipperFrontIndex = dir === 'next' ? pageIndex + 1 : targetIndex + 1;
  const flipperBackIndex = dir === 'next' ? targetIndex : pageIndex;

  const getTransform = () => {
    if (dir === 'next') {
      return flipState.phase === 'flipping' ? 'rotateY(-180deg)' : 'rotateY(0deg)';
    } else if (dir === 'prev') {
      return flipState.phase === 'flipping' ? 'rotateY(0deg)' : 'rotateY(-180deg)';
    }
    return 'rotateY(0deg)';
  };

  return (
    <div 
      className="w-full h-full flex flex-col items-center justify-center relative @container group bg-[#4a2e1b] rounded-xl border border-[#3a2214] shadow-[inset_0_4px_20px_rgba(0,0,0,0.4)]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='wood'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.01 0.4' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23wood)' opacity='0.15'/%3E%3C/svg%3E"), radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.4) 150%)`
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
       {/* The Perspective Container */}
       <div className="relative w-[82%] h-[82%] -translate-y-[3%]" style={{ perspective: '800px' }}>
          <div 
            className="w-full h-full relative"
            style={{ transformStyle: 'preserve-3d', transform: 'rotateX(12deg)' }}
          >

            {/* === BACK COVER (deepest layer for thickness) === */}
            {Array.from({ length: 5 }).map((_, i) => (
              <div 
                key={`cover-${i}`}
                className="absolute inset-[-5%] rounded-md pointer-events-none"
                style={{ 
                  transform: `translateZ(-${15 + i * 1.5}px)`,
                  background: i === 4 ? '#2a3a1a' : 'linear-gradient(135deg, #526f34, #7b9d4f)',
                  borderBottom: i > 0 ? '1px solid rgba(0,0,0,0.4)' : 'none',
                  borderRadius: '4px'
                }} 
              />
            ))}

            {/* === COVER SPINE EDGE (visible between cover and pages) === */}
            <div 
              className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
              style={{ 
                transform: 'translateZ(-14px)',
                top: '-5%', bottom: '-5%', width: '8%',
                background: 'linear-gradient(to right, #41572a, #62853e, #41572a)',
                borderRadius: '2px'
              }} 
            />

            {/* === GAP FILLER === */}
            {/* Prevents the dark cover from showing through a fractional pixel gap between the left and right pages */}
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2%] bg-[#fdf8f0] pointer-events-none" style={{ transform: 'translateZ(-1.5px)' }} />

            {/* === PAGE STACK EDGES (visible peeking out from under the top pages) === */}
            {/* Each layer is slightly larger than the front page so edges are visible */}
            {Array.from({ length: 8 }).map((_, i) => {
              const baseColor = i % 3 === 0 ? '#f5ead6' : i % 3 === 1 ? '#efe3cc' : '#f0e5d0';
              return (
                <div 
                  key={`page-stack-${i}`}
                  className="absolute pointer-events-none"
                  style={{
                    transform: `translateZ(-${2 + i * 1.5}px)`,
                    top: `${-0.4 * (i + 1)}%`,
                    bottom: `${-0.4 * (i + 1)}%`,
                    left: `${-0.4 * (i + 1)}%`,
                    right: `${-0.4 * (i + 1)}%`,
                    background: `linear-gradient(to right, transparent 49.3%, rgba(100,50,20,0.15) 49.7%, rgba(60,30,10,0.7) 50%, rgba(100,50,20,0.15) 50.3%, transparent 50.7%), ${baseColor}`,
                    borderBottom: '1px solid rgba(139, 90, 43, 0.12)',
                    borderLeft: '1px solid rgba(139, 90, 43, 0.08)',
                    borderRight: '1px solid rgba(139, 90, 43, 0.08)',
                    borderRadius: '2px'
                  }}
                />
              )
            })}

            {/* === OPEN PAGES (top layer, with visual curve) === */}
            {/* Static Left Page */}
            <div 
              className="absolute top-0 bottom-0 left-0 w-1/2 z-10"
              style={{ transformStyle: 'preserve-3d', transform: 'translateZ(-1px)' }}
            >
               <DeanBookPage data={bookSequence[staticLeftIndex]} isLeft={true} pageNumber={bookSequence[staticLeftIndex]?.realPageNum} />
            </div>

            {/* Static Right Page */}
            <div 
              className="absolute top-0 bottom-0 right-0 w-1/2 z-10"
              style={{ transformStyle: 'preserve-3d', transform: 'translateZ(-1px)' }}
            >
               <DeanBookPage data={bookSequence[staticRightIndex]} isLeft={false} pageNumber={bookSequence[staticRightIndex]?.realPageNum} />
            </div>

            {/* Flipper Page */}
            {dir && (
              <div 
                className="absolute top-0 bottom-0 right-0 w-1/2 z-20 origin-left"
                style={{
                  transformStyle: 'preserve-3d',
                  transition: flipState.phase === 'flipping' ? 'transform 2000ms cubic-bezier(0.4, 0.0, 0.2, 1)' : 'none',
                  transform: getTransform()
                }}
              >
                 {/* Front Face */}
                 <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
                    <DeanBookPage data={bookSequence[flipperFrontIndex]} isLeft={false} pageNumber={bookSequence[flipperFrontIndex]?.realPageNum} />
                 </div>
                 {/* Back Face */}
                 <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                    <DeanBookPage data={bookSequence[flipperBackIndex]} isLeft={true} pageNumber={bookSequence[flipperBackIndex]?.realPageNum} />
                 </div>
              </div>
            )}

            {/* === CENTER SPINE CREASE === */}
            <div 
              className="absolute inset-0 pointer-events-none z-30"
              style={{ 
                background: 'linear-gradient(to right, transparent 49.3%, rgba(100,50,20,0.15) 49.7%, rgba(60,30,10,0.7) 50%, rgba(100,50,20,0.15) 50.3%, transparent 50.7%)',
                transform: 'translateZ(2px)'
              }}
            />



          </div>
       </div>

       {/* Click targets OUTSIDE the 3D context so they reliably catch clicks */}
       {canFlip && !isFlipping && (
         <>
           <div 
             className="absolute top-0 bottom-0 left-0 w-1/2 z-40 cursor-pointer" 
             onClick={() => { hideTooltip(); handlePrev(); }}
             onMouseMove={(e) => {
               const leftData = bookSequence[staticLeftIndex];
               if (leftData && !leftData.isEasterEgg) {
                 const rect = e.currentTarget.closest('.group')!.getBoundingClientRect();
                 showTooltip(
                   e.clientX - rect.left,
                   e.clientY - rect.top,
                   `${leftData.deptCode}: ${leftData.deanName === 'No Dean Assigned' ? 'Vacant' : leftData.deanName}`
                 );
               }
             }}
             onMouseLeave={hideTooltip}
           />
           <div 
             className="absolute top-0 bottom-0 right-0 w-1/2 z-40 cursor-pointer" 
             onClick={() => { hideTooltip(); handleNext(); }}
             onMouseMove={(e) => {
               const rightData = bookSequence[staticRightIndex];
               if (rightData && !rightData.isEasterEgg) {
                 const rect = e.currentTarget.closest('.group')!.getBoundingClientRect();
                 showTooltip(
                   e.clientX - rect.left,
                   e.clientY - rect.top,
                   `${rightData.deptCode}: ${rightData.deanName === 'No Dean Assigned' ? 'Vacant' : rightData.deanName}`
                 );
               }
             }}
             onMouseLeave={hideTooltip}
           />
         </>
       )}

       {/* Custom Tooltip */}
       <div 
         className="absolute z-50 pointer-events-none px-[3cqw] py-[1.5cqw] rounded-xl bg-slate-900/90 text-white text-[3.5cqw] font-semibold whitespace-nowrap shadow-lg backdrop-blur-sm border border-white/10"
         style={{
           left: tooltipPos.x,
           top: tooltipPos.y - 56,
           transform: 'translateX(-50%)',
           opacity: tooltipVisible ? 1 : 0,
           transition: 'opacity 0.2s ease-in-out',
         }}
       >
         {tooltipPos.text}
         <div className="absolute left-1/2 -translate-x-1/2 -bottom-[5px] w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-slate-900/90" />
       </div>

    </div>
  )
}


function DepartmentsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [deanStatusFilters, setDeanStatusFilters] = useState<string[]>([])
  const [deptSizeFilters, setDeptSizeFilters] = useState<string[]>([])
  const [selectedDept, setSelectedDept] = useState<Department | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingDept, setEditingDept] = useState<Department | null>(null)
  const [showEasterEggControls, setShowEasterEggControls] = useState(false)
  const [isEasterEggsEnabled, setIsEasterEggsEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem('rorms_easter_eggs_enabled');
      return stored ? stored === 'true' : true;
    } catch {
      return true;
    }
  })
  const [selectedAnomalies, setSelectedAnomalies] = useState<number[]>(() => {
    try {
      const stored = localStorage.getItem('rorms_selected_anomalies');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  })
  const [isGalleryModalOpen, setIsGalleryModalOpen] = useState(false)
  const [currentRoomPage, setCurrentRoomPage] = useState(() => {
    try {
      const stored = localStorage.getItem('rorms_current_room_page');
      return stored ? parseInt(stored) : 0;
    } catch {
      return 0;
    }
  })

  useEffect(() => {
    localStorage.setItem('rorms_current_room_page', currentRoomPage.toString());
  }, [currentRoomPage])

  useEffect(() => {
    localStorage.setItem('rorms_easter_eggs_enabled', isEasterEggsEnabled.toString());
  }, [isEasterEggsEnabled])

  useEffect(() => {
    localStorage.setItem('rorms_selected_anomalies', JSON.stringify(selectedAnomalies));
  }, [selectedAnomalies])

  const [showAmongUsButton, setShowAmongUsButton] = useState(false)
  const [wheelRotation, setWheelRotation] = useState(0)
  const [isSpinning, setIsSpinning] = useState(false)
  const [userCoins, setUserCoins] = useState<number | null>(null)
  const [userLevel, setUserLevel] = useState<number>(1)
  const [userXp, setUserXp] = useState<number>(0)
  const [lastClaimedDaily, setLastClaimedDaily] = useState<string | null>(null)
  const [wheelTooltip, setWheelTooltip] = useState<{ visible: boolean, x: number, y: number, text: string } | null>(null)
  const [prizeToast, setPrizeToast] = useState<{ text: string, color: string } | null>(null)
  const [prizeOffset, setPrizeOffset] = useState(0)
  const [openDoors, setOpenDoors] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('rorms_open_doors');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  })

  const handleToggleDoor = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenDoors(prev => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem('rorms_open_doors', JSON.stringify(next));
      return next;
    });
  }

  useEffect(() => {
    setPrizeOffset(Math.floor(Math.random() * 100))
  }, [])

  useEffect(() => {
    if (!auth.currentUser) return;
    const unsub = onSnapshot(doc(db, 'users', auth.currentUser.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserCoins(data.coins ?? 0);
        setUserLevel(data.level ?? 1);
        setUserXp(data.xp ?? 0);
        setLastClaimedDaily(data.lastClaimedDaily ?? null);
      }
    });
    return () => unsub();
  }, []);

  const prevFilters = useRef({ searchTerm, deanStatusFilters, deptSizeFilters });
  useEffect(() => {
    const prev = prevFilters.current;
    if (prev.searchTerm !== searchTerm || prev.deanStatusFilters !== deanStatusFilters || prev.deptSizeFilters !== deptSizeFilters) {
      setCurrentRoomPage(0);
      prevFilters.current = { searchTerm, deanStatusFilters, deptSizeFilters };
    }
  }, [searchTerm, deanStatusFilters, deptSizeFilters])

  const [departments, setDepartments] = useState<Department[]>([])
  const [allUsers, setAllUsers] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [deptToDelete, setDeptToDelete] = useState<Department | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cropModalData, setCropModalData] = useState<{ isOpen: boolean, imageSrc: string }>({
    isOpen: false,
    imageSrc: ''
  })
  const [pendingLogoBlob, setPendingLogoBlob] = useState<Blob | null>(null)
  const [newDeptName, setNewDeptName] = useState('')
  const [newDeptCode, setNewDeptCode] = useState('')
  const [newDeptDeanName, setNewDeptDeanName] = useState('None')
  const [isDeanDropdownOpen, setIsDeanDropdownOpen] = useState(false)
  const [newDeptLogo, setNewDeptLogo] = useState('')
  const [logoErrors, setLogoErrors] = useState<Record<string, boolean>>({})
  const [avatarErrors, setAvatarErrors] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<{
    name: 'required' | 'exists' | null;
    code: 'required' | 'exists' | null;
  }>({ name: null, code: null })

  // Fetch All Users joined with Memberships
  useEffect(() => {
    let unsubscribeUsers: (() => void) | null = null
    let unsubscribeMemberships: (() => void) | null = null

    unsubscribeUsers = onSnapshot(collection(db, 'users'), (usersSnap) => {
      const usersMap = new Map()
      usersSnap.forEach(uDoc => usersMap.set(uDoc.id, uDoc.data()))

      unsubscribeMemberships = onSnapshot(collection(db, 'memberships'), (mSnap) => {
        const joinedData = mSnap.docs.map((mDoc) => {
          const mData = mDoc.data()
          const userData = usersMap.get(mData.userId) || {}
          return {
            id: mData.userId,
            membershipId: mDoc.id,
            name: userData.fullName || '',
            email: userData.email || '',
            role: (mData.role as any) || 'Instructor',
            status: (userData.isActive !== false) ? 'Active' : 'Inactive',
            department: mData.departmentCode || '',
            joinedDate: userData.createdAt ? userData.createdAt.toDate().toLocaleDateString('en-US', {
              month: 'short', day: '2-digit', year: 'numeric'
            }) : '—',
            avatar: userData.profilePicture || '',
          }
        }) as Member[]
        setAllUsers(joinedData)
      })
    })

    return () => {
      if (unsubscribeUsers) unsubscribeUsers()
      if (unsubscribeMemberships) unsubscribeMemberships()
    }
  }, [])

  const availableDeans = allUsers.filter(u => u.role === 'Dean')

  // Fetch Departments
  useEffect(() => {
    const q = query(collection(db, 'departments'), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const depts = snapshot.docs.map(doc => {
        const data = doc.data()
        let createdDate = 'N/A'
        if (data.createdAt) {
          const date = data.createdAt.toDate()
          createdDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        }

        // Map dean UID to Name for display
        const deanUID = data.dean || ''
        const deanUser = availableDeans.find(d => d.id === deanUID)
        const deanName = deanUser ? deanUser.name : (deanUID ? 'Unknown' : 'None')

        return {
          id: doc.id,
          ...data,
          deanUID,
          deanName,
          createdDate
        } as Department
      })
      setDepartments(depts)
      setIsLoading(false)
    })

    return () => unsubscribe()
  }, [availableDeans])

  const filteredDepartments = useMemo(() => {
    return departments
      .map((dept) => ({
        ...dept,
        memberCount: allUsers.filter((u) => u.department === dept.code).length,
      }))
      .filter((dept) => {
        // 1. Search Filter
        const matchesSearch = [dept.name, dept.code, dept.deanName].some((val) =>
          val.toLowerCase().includes(searchTerm.toLowerCase())
        )
        if (!matchesSearch) return false

        // 2. Dean Status Filter
        if (deanStatusFilters.length > 0) {
          const status = (dept.deanUID && dept.deanUID !== '') ? 'Assigned' : 'Unassigned'
          if (!deanStatusFilters.includes(status)) return false
        }

        // 3. Department Size Filter
        if (deptSizeFilters.length > 0) {
          let size = 'Empty'
          if (dept.memberCount && dept.memberCount > 50) size = 'Large'
          else if (dept.memberCount && dept.memberCount >= 11) size = 'Medium'
          else if (dept.memberCount && dept.memberCount >= 1) size = 'Small'
          
          if (!deptSizeFilters.includes(size)) return false
        }

        return true
      })
      .sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0))
  }, [departments, allUsers, searchTerm, deanStatusFilters, deptSizeFilters])

  const summaryStats = useMemo(() => {
    const totalDepartments = departments.length;
    const totalFacultyCount = allUsers.filter(u => u.department).length;
    const assignedDeansCount = departments.filter(d => d.deanUID).length;
    const avgDeptSize = totalDepartments ? Math.round(totalFacultyCount / totalDepartments) : 0;
    const deansPercentage = totalDepartments > 0 ? Math.round((assignedDeansCount / totalDepartments) * 100) : 0;

    return {
      totalDepartments,
      totalFacultyCount,
      assignedDeansCount,
      avgDeptSize,
      deansPercentage
    };
  }, [departments, allUsers]);

  const deptMembers = selectedDept 
    ? allUsers
        .filter(m => m.department === selectedDept.code)
        .sort((a, b) => {
          const roleOrder: Record<string, number> = {
            'Dean': 1,
            'Program Head': 2,
            'Instructor': 3,
            'Registrar': 4,
            'Admin': 5
          }
          const orderA = roleOrder[a.role] || 99
          const orderB = roleOrder[b.role] || 99
          if (orderA !== orderB) return orderA - orderB
          return a.name.localeCompare(b.name)
        })
    : []

  const handleOpenEdit = (dept: Department) => {
    setEditingDept(dept)
    setNewDeptName(dept.name)
    setNewDeptCode(dept.code)
    const deanUser = availableDeans.find(d => d.id === dept.deanUID)
    setNewDeptDeanName(deanUser ? deanUser.name : 'None')
    setNewDeptLogo(dept.logo)
    setErrors({ name: null, code: null })
  }

  const handleCloseFormModal = () => {
    setIsCreateModalOpen(false)
    setEditingDept(null)
    setNewDeptName('')
    setNewDeptCode('')
    setNewDeptDeanName('None')
    setNewDeptLogo('')
    setPendingLogoBlob(null)
    setErrors({ name: null, code: null })
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setCropModalData({ isOpen: true, imageSrc: reader.result })
        }
      }
      reader.readAsDataURL(file)
      e.target.value = ''
    }
  }

  const handleCropComplete = async (croppedImage: Blob) => {
    setPendingLogoBlob(croppedImage)
    const blobUrl = URL.createObjectURL(croppedImage)
    setNewDeptLogo(blobUrl)
    setLogoErrors(prev => ({ ...prev, [blobUrl]: false }))
    setCropModalData({ isOpen: false, imageSrc: '' })
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const trimmedName = newDeptName.trim()
    const trimmedCode = newDeptCode.trim().toUpperCase()

    const selectedDeanUser = availableDeans.find(d => d.name === newDeptDeanName)
    const newDeptDean = selectedDeanUser ? selectedDeanUser.id : ''

    const nameRequired = !trimmedName
    const codeRequired = !trimmedCode

    if (nameRequired || codeRequired) {
      setErrors({
        name: nameRequired ? 'required' : null,
        code: codeRequired ? 'required' : null
      })
      return
    }

    const nameExists = departments.some(dept => {
      if (editingDept && dept.id === editingDept.id) return false
      return dept.name.toLowerCase() === trimmedName.toLowerCase()
    })

    const codeExists = departments.some(dept => {
      if (editingDept && dept.id === editingDept.id) return false
      return dept.code.toLowerCase() === trimmedCode.toLowerCase()
    })

    if (nameExists || codeExists) {
      setErrors({
        name: nameExists ? 'exists' : null,
        code: codeExists ? 'exists' : null
      })
      return
    }

    setIsSubmitting(true)
    const finalCode = trimmedCode

    try {
      const batch = writeBatch(db)

      if (editingDept) {
        const oldDeanUID = editingDept.deanUID
        const newDeanUID = newDeptDean
        const oldCode = editingDept.code
        let finalLogo = newDeptLogo || ''

        if (pendingLogoBlob) {
          const newFileName = `logo_${Date.now()}.png`
          const storageRef = ref(storage, `departments/${editingDept.id}/${newFileName}`)
          await uploadBytes(storageRef, pendingLogoBlob)
          finalLogo = await getDownloadURL(storageRef)

          const oldLogoUrlToDelete = editingDept.logo
          if (oldLogoUrlToDelete && oldLogoUrlToDelete.includes('firebasestorage.googleapis.com')) {
            try {
              const oldStorageRef = ref(storage, oldLogoUrlToDelete)
              await deleteObject(oldStorageRef)
            } catch (error: any) {
              if (error.code !== 'storage/object-not-found') {
                console.error('Error deleting old logo:', error)
              }
            }
          }
        }

        const deptRef = doc(db, 'departments', editingDept.id)
        batch.update(deptRef, {
          name: trimmedName,
          code: finalCode,
          dean: newDeanUID,
          logo: finalLogo,
          updatedAt: serverTimestamp()
        })

        if (oldDeanUID && oldDeanUID !== newDeanUID) {
          const oldDeanMember = allUsers.find(u => u.id === oldDeanUID)
          if (oldDeanMember?.membershipId) {
            batch.update(doc(db, 'memberships', oldDeanMember.membershipId), {
              departmentCode: '',
              joinedAt: serverTimestamp()
            })
          }
        }

        if (newDeanUID) {
          const newDeanMember = allUsers.find(u => u.id === newDeanUID)
          if (newDeanMember?.membershipId) {
            batch.update(doc(db, 'memberships', newDeanMember.membershipId), {
              departmentCode: finalCode,
              joinedAt: serverTimestamp()
            })
          }
        } else if (oldDeanUID && oldCode !== finalCode) {
           const currentDeanMember = allUsers.find(u => u.id === oldDeanUID)
           if (currentDeanMember?.membershipId) {
             batch.update(doc(db, 'memberships', currentDeanMember.membershipId), {
              departmentCode: finalCode,
              joinedAt: serverTimestamp()
            })
           }
        }
      } else {
        const newDeptRef = doc(collection(db, 'departments'))
        let creationLogo = newDeptLogo || ''

        if (pendingLogoBlob) {
          const newFileName = `logo_${Date.now()}.png`
          const storageRef = ref(storage, `departments/${newDeptRef.id}/${newFileName}`)
          await uploadBytes(storageRef, pendingLogoBlob)
          creationLogo = await getDownloadURL(storageRef)
        }

        batch.set(newDeptRef, {
          name: trimmedName,
          code: finalCode,
          dean: newDeptDean,
          programHead: '',
          logo: creationLogo,
          roomStyle: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })

        if (newDeptDean) {
          const newDeanMember = allUsers.find(u => u.id === newDeptDean)
          if (newDeanMember?.membershipId) {
            batch.update(doc(db, 'memberships', newDeanMember.membershipId), {
              departmentCode: finalCode,
              joinedAt: serverTimestamp()
            })
          }
        }
      }

      await batch.commit()
      handleCloseFormModal()
    } catch (error) {
      console.error('Error saving department:', error)
      alert('Failed to save department.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenDelete = (dept: Department) => {
    setDeptToDelete(dept)
    setIsDeleteModalOpen(true)
    setDeleteConfirmName('')
  }

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false)
    setDeptToDelete(null)
    setDeleteConfirmName('')
  }

  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!deptToDelete || deleteConfirmName !== deptToDelete.name) return

    setIsDeleting(true)
    try {
      const batch = writeBatch(db)
      batch.delete(doc(db, 'departments', deptToDelete.id))

      // Clear departmentCode for all members of this department
      const membersToUpdate = allUsers.filter(u => u.department === deptToDelete.code)
      membersToUpdate.forEach(member => {
        if (member.membershipId) {
          batch.update(doc(db, 'memberships', member.membershipId), {
            departmentCode: '',
            joinedAt: serverTimestamp()
          })
        }
      })

      await batch.commit()
      handleCloseDeleteModal()
    } catch (error) {
      console.error('Error deleting department:', error)
      alert('Failed to delete department.')
    } finally {
      setIsDeleting(false)
    }
  }

  const deanOptions = [
    'None',
    ...availableDeans
      .filter(dean => {
        const assignedDept = departments.find(d => d.deanUID === dean.id)
        return !(assignedDept && assignedDept.id !== editingDept?.id)
      })
      .map(dean => dean.name)
      .sort((a, b) => a.localeCompare(b))
  ]

  const deptMemberColumns: ColumnDef<Member>[] = [
    {
      header: 'Member Info',
      width: '48%',
      render: (member) => (
        <div className="flex items-center gap-4">
          {member.avatar && !avatarErrors[member.avatar] ? (
            <img
              src={member.avatar}
              alt={member.name}
              className="h-10 w-10 rounded-full object-cover shadow-sm ring-2 ring-transparent group-hover:ring-[var(--brand-color)]/20 transition-all duration-300"
              onError={() => setAvatarErrors(prev => ({ ...prev, [member.avatar]: true }))}
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 shadow-sm ring-2 ring-transparent group-hover:ring-[var(--brand-color)]/20 transition-all duration-300">
              <UserIcon className="h-5 w-5" />
            </div>
          )}
          <div className="flex flex-col">
            {member.name ? (
              <>
                <span className="text-sm font-bold text-slate-900 group-hover:text-[var(--brand-color)] transition-colors">{member.name}</span>
                <span className="text-xs font-medium text-slate-500">{member.email}</span>
              </>
            ) : (
              <span className="text-sm font-bold text-slate-900 group-hover:text-[var(--brand-color)] transition-colors">{member.email}</span>
            )}
          </div>
        </div>
      )
    },
    {
      header: 'Assigned Role',
      width: '27%',
      render: (member) => (
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${roleClasses[member.role]?.split(' ')[0] || 'bg-gray-200'}`} />
          <span className={`text-[0.7rem] font-bold uppercase tracking-widest ${roleClasses[member.role]?.split(' ')[1] || 'text-gray-500'}`}>
            {member.role}
          </span>
        </div>
      )
    },
    {
      header: 'Status',
      width: '23%',
      render: (member) => (
        <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-widest ${
          member.status === 'Active' ? 'bg-emerald-100 text-emerald-700' :
          member.status === 'Inactive' ? 'bg-gray-100 text-gray-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {member.status}
        </span>
      )
    },
    {
      header: 'Joined Date',
      width: '2%',
      align: 'right',
      render: (member) => <span className="text-sm font-medium text-gray-500 whitespace-nowrap">{member.joinedDate}</span>
    }
  ];

  const deptColumns: ColumnDef<Department>[] = [
    {
      header: 'Department',
      width: '35%',
      render: (dept) => (
        <div className="flex items-center gap-4">
          {dept.logo && !logoErrors[dept.logo] ? (
            <img
              src={dept.logo}
              alt={dept.name}
              className="h-10 w-10 rounded-full border border-gray-300 object-cover"
              onError={() => setLogoErrors(prev => ({ ...prev, [dept.logo]: true }))}
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-gray-50 text-gray-400">
              <DepartmentIcon className="h-6 w-6" />
            </div>
          )}
          <span className="text-sm font-bold text-gray-900 group-hover:text-[var(--brand-color)] transition-colors">
            {dept.name}
          </span>
        </div>
      )
    },
    {
      header: 'Code',
      width: '16%',
      render: (dept) => <span className="text-sm font-medium text-gray-500">{dept.code}</span>
    },
    {
      header: 'Dean',
      width: '16%',
      render: (dept) => <span className="text-sm font-semibold text-gray-600">{dept.deanName}</span>
    },
    {
      header: 'Members',
      width: '16%',
      render: (dept) => (
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-600">
          <UsersIcon className="h-4 w-4 text-gray-400" />
          {dept.memberCount}
        </div>
      )
    },
    {
      header: 'Created Date',
      width: '16%',
      render: (dept) => <span className="text-sm font-medium text-gray-500">{dept.createdDate}</span>
    },
    {
      header: 'Actions',
      width: '2%',
      align: 'right',
      render: (dept) => (
        <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <IconButton
            label="Edit department"
            className="h-8 w-8 rounded-md bg-white text-gray-400 shadow-sm hover:bg-gray-50 hover:text-gray-600 transition-all border border-gray-100"
            onClick={() => handleOpenEdit(dept)}
          >
            <EditIcon className="h-4.5 w-4.5" />
          </IconButton>
          <IconButton
            label="Remove department"
            className="h-8 w-8 rounded-md bg-white text-rose-400 shadow-sm hover:bg-rose-50 hover:text-rose-600 transition-all border border-gray-100"
            onClick={() => handleOpenDelete(dept)}
          >
            <TrashIcon className="h-4.5 w-4.5" />
          </IconButton>
        </div>
      )
    }
  ];

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <style>{`
        @keyframes walkAcross_right {
          0% { left: -20%; }
          100% { left: 120%; }
        }
        @keyframes walkAcross_left {
          0% { left: 120%; }
          100% { left: -20%; }
        }
        @keyframes walkBob {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-2px) rotate(3deg); }
          50% { transform: translateY(0) rotate(0deg); }
          75% { transform: translateY(-2px) rotate(-3deg); }
        }
        @keyframes walkIn_right {
          from { left: -20%; }
          to { left: var(--stop-pos, 40%); }
        }
        @keyframes walkOut_right {
          from { left: var(--stop-pos, 40%); }
          to { left: 120%; }
        }
        @keyframes walkIn_left {
          from { left: 120%; }
          to { left: var(--stop-pos, 40%); }
        }
        @keyframes walkOut_left {
          from { left: var(--stop-pos, 40%); }
          to { left: -20%; }
        }
        @keyframes imposterHingeOpen {
          from { transform: rotate(0deg); }
          to { transform: rotate(-55deg); }
        }
        @keyframes imposterHingeClose {
          from { transform: rotate(-55deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes imposterRevealOn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes imposterRevealOff {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes tongueWiggle {
          0%, 100% { transform: rotate(0deg); }
          20% { transform: rotate(12deg); }
          40% { transform: rotate(-8deg); }
          60% { transform: rotate(10deg); }
          80% { transform: rotate(-6deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideRight {
          from { left: -20%; }
          to { left: 120%; }
        }
      `}</style>
      {/* Create/Edit Department Modal */}
      {(isCreateModalOpen || editingDept) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-md rounded-2xl border border-gray-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white">
              <h3 className="text-xl font-bold">{editingDept ? 'Edit Department' : 'Create Department'}</h3>
              <p className="mt-1 text-sm text-white/80">
                {editingDept ? 'Update the details of this university department.' : 'Add a new university department to the system.'}
              </p>
            </div>
            
            <form onSubmit={handleFormSubmit} className="p-6 space-y-5">
              <div>
                <label htmlFor="dept-name" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                  Department Name <span className="text-rose-500">*</span>
                  {errors.name === 'exists' && (
                    <span className="ml-2 text-[0.625rem] font-bold lowercase text-rose-500 animate-in fade-in slide-in-from-left-1">
                      Name already exists
                    </span>
                  )}
                </label>
                <TextInput
                  id="dept-name"
                  value={newDeptName}
                  onChange={(val) => {
                    setNewDeptName(val)
                    if (errors.name) setErrors(prev => ({ ...prev, name: null }))
                  }}
                  placeholder="e.g. College of Information Technology"
                  error={!!errors.name}
                  autoFocus
                />
              </div>

              <div className="flex gap-6 items-start">
                <div className="shrink-0">
                  <label className="block text-center text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Logo
                  </label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleLogoUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`h-32 w-32 rounded-full border-2 bg-gray-50 flex items-center justify-center overflow-hidden transition-all duration-200 hover:border-[var(--brand-color)] hover:bg-gray-50 group relative shadow-md ${
                      newDeptLogo && !logoErrors[newDeptLogo] ? 'border-solid border-gray-300' : 'border-dashed border-gray-400'
                    }`}
                  >
                    {newDeptLogo && !logoErrors[newDeptLogo] ? (
                      <img 
                        src={newDeptLogo} 
                        alt="Logo preview"
                        className="h-full w-full object-cover"
                        onError={() => setLogoErrors(prev => ({ ...prev, [newDeptLogo]: true }))}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-400">
                        <DepartmentIcon className="h-12 w-12" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity">
                      <UploadIcon className="h-8 w-8 text-white" strokeWidth={3.5} />
                    </div>
                  </button>
                </div>

                <div className="flex-1 space-y-4">
                  <div>
                    <label htmlFor="dept-code" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                      Code <span className="text-rose-500">*</span>
                      {errors.code === 'exists' && (
                        <span className="ml-2 text-[0.625rem] font-bold lowercase text-rose-500 animate-in fade-in slide-in-from-left-1">
                          Code already exists
                        </span>
                      )}
                    </label>
                    <TextInput
                      id="dept-code"
                      value={newDeptCode}
                      onChange={(val) => {
                        setNewDeptCode(val)
                        if (errors.code) setErrors(prev => ({ ...prev, code: null }))
                      }}
                      placeholder="e.g. CITE"
                      error={!!errors.code}
                    />
                  </div>

                  <div>
                    <label htmlFor="dept-dean" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                      Assigned Dean
                    </label>
                    <SingleSelectDropdown
                      options={deanOptions}
                      value={newDeptDeanName}
                      onChange={setNewDeptDeanName}
                      onToggle={setIsDeanDropdownOpen}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseFormModal}
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="brand"
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  {isSubmitting 
                    ? (editingDept ? 'Saving Changes...' : 'Creating Department...') 
                    : (editingDept ? 'Save Changes' : 'Create Department')}
                </Button>
              </div>
            </form>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={() => {
              if (!isDeanDropdownOpen && !isSubmitting) {
                handleCloseFormModal()
              }
            }} 
          />
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && deptToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-md rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 p-6 text-white rounded-t-md">
              <h3 className="text-xl font-bold">Delete Department</h3>
              <p className="mt-1 text-sm text-white/80">Are you sure you want to delete this department from the system?</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 rounded-md border border-gray-100 bg-gray-50 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 overflow-hidden shrink-0">
                  {deptToDelete.logo && !logoErrors[deptToDelete.logo] ? (
                    <img 
                      src={deptToDelete.logo} 
                      alt="" 
                      className="h-full w-full object-cover"
                      onError={() => setLogoErrors(prev => ({ ...prev, [deptToDelete.logo]: true }))}
                    />
                  ) : (
                    <DepartmentIcon className="h-7 w-7 text-gray-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{deptToDelete.name}</p>
                  <p className="text-xs font-medium text-gray-500">{deptToDelete.code}</p>
                </div>
              </div>

              <div className="rounded-md bg-rose-50 p-4 border border-rose-100">
                <p className="text-xs leading-relaxed text-rose-700">
                  <span className="font-bold uppercase tracking-wider">Warning:</span> This action will permanently delete this department and unassign all its members. This action cannot be undone.
                </p>
              </div>

              <form onSubmit={handleDeleteSubmit} className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-gray-500">
                      To confirm, please type:
                    </label>
                    <p className="mt-0.5 text-sm font-bold text-rose-600">
                      "{deptToDelete.name}"
                    </p>
                  </div>
                  <input
                    type="text"
                    value={deleteConfirmName}
                    onChange={(e) => setDeleteConfirmName(e.target.value)}
                    placeholder="Enter department name..."
                    className="w-full rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-rose-300 focus:ring-4 focus:ring-rose-50 shadow-sm"
                    autoFocus
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCloseDeleteModal}
                    disabled={isDeleting}
                    className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isDeleting || deleteConfirmName !== deptToDelete.name}
                    className="flex-1 rounded-md bg-rose-600 py-3 text-sm font-bold text-white shadow-md transition enabled:hover:bg-rose-700 enabled:hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                </div>
              </form>
            </div>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={() => {
              if (!isDeleting) {
                handleCloseDeleteModal()
              }
            }} 
          />
        </div>
      )}

      {/* Department Members Modal */}
      {selectedDept && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-4xl rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white flex justify-between items-start shrink-0">
              <div className="flex items-center gap-4">
                {selectedDept.logo && !logoErrors[selectedDept.logo] ? (
                  <img
                    src={selectedDept.logo}
                    alt={selectedDept.name}
                    className="h-14 w-14 rounded-full border-2 border-white/20 object-cover bg-white/10"
                    onError={() => setLogoErrors(prev => ({ ...prev, [selectedDept.logo]: true }))}
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/20 bg-white/10 text-white/80">
                    <DepartmentIcon className="h-8 w-8" />
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold leading-tight">{selectedDept.name}</h3>
                  <p className="mt-1 text-sm text-white/80">{selectedDept.code} • {selectedDept.memberCount} Members</p>
                </div>
              </div>
              <IconButton 
                label="Close modal" 
                onClick={() => setSelectedDept(null)}
                className="text-white/80 hover:text-white hover:bg-white/10"
              >
                <CloseIcon className="h-6 w-6" />
              </IconButton>
            </div>
            
            <div className="overflow-y-auto custom-scrollbar bg-slate-50">
              <DataTable
                data={deptMembers}
                columns={deptMemberColumns}
                emptyTitle="No members found"
                emptyDescription="No members assigned to this department yet."
                emptyIcon={<UsersIcon className="h-12 w-12" />}
              />
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={() => setSelectedDept(null)} />
        </div>
      )}

      {/* Crop Modal */}
      {cropModalData.isOpen && (
        <CropModal
          imageSrc={cropModalData.imageSrc}
          onCropComplete={handleCropComplete}
          onClose={() => setCropModalData({ isOpen: false, imageSrc: '' })}
          isUploading={false}
          title="Adjust Department Logo"
          hideOverlay={true}
        />
      )}

      <div className="space-y-6">
        <SectionHeader 
          title="Academic Departments" 
          description="Manage university departments, assign deans, and oversee faculty members." 
        />

        {/* ══ Department Overview ══ */}
        {(() => {
          const { totalDepartments, totalFacultyCount, avgDeptSize, assignedDeansCount, deansPercentage } = summaryStats
          const unassigned = totalDepartments - assignedDeansCount

          const R = 28
          const C = 2 * Math.PI * R
          const filled = C * (deansPercentage / 100)

          const facultyInDepts = allUsers.filter(u => u.department)
          const roleCounts = {
            Instructor: facultyInDepts.filter(u => u.role === 'Instructor').length,
            Dean: facultyInDepts.filter(u => u.role === 'Dean').length,
            'Program Head': facultyInDepts.filter(u => u.role === 'Program Head').length,
            Registrar: facultyInDepts.filter(u => u.role === 'Registrar').length,
            Admin: facultyInDepts.filter(u => u.role === 'Admin').length,
          }

          const roleRows = [
            { role: 'Instructor', count: roleCounts.Instructor, bg: 'bg-emerald-500', text: 'text-emerald-600', light: 'bg-emerald-50' },
            { role: 'Dean', count: roleCounts.Dean, bg: 'bg-amber-500', text: 'text-amber-600', light: 'bg-amber-50' },
            { role: 'Program Head', count: roleCounts['Program Head'], bg: 'bg-rose-500', text: 'text-rose-600', light: 'bg-rose-50' },
            { role: 'Registrar', count: roleCounts.Registrar, bg: 'bg-blue-500', text: 'text-blue-600', light: 'bg-blue-50' },
          ]

          return (
            <div className="mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">


                {/* Card 0: Academic Departments */}
                <SummaryCard
                  title="Total Departments"
                  subtitle={`${totalDepartments} Currently registered`}
                  icon={
                    <div 
                      onClick={() => setShowAmongUsButton(prev => !prev)} 
                      className="cursor-default hover:opacity-80 transition-opacity" 
                    >
                      <DepartmentIcon className="h-4.5 w-4.5 text-[var(--brand-color)]" />
                    </div>
                  }
                  gradientClasses="from-[var(--brand-color)]/20 to-[var(--brand-color)]/10"
                  outlineClasses="bg-[var(--brand-color)]"
                  blobClasses="bg-[var(--brand-color)]/5"
                >
                  <div className="absolute inset-0 group/pager">
                    <div className="absolute inset-0 bg-slate-300 rounded-xl overflow-hidden grid grid-cols-2 grid-rows-2 gap-[2px] shadow-inner border-[3px] border-slate-200">
                    {departments.slice(currentRoomPage * 4, (currentRoomPage + 1) * 4).map((dept, idx) => {
                      const styleIdx = dept.roomStyle ?? 0;
                      const styles = [
                        { wall: 'bg-slate-50', frame: 'bg-slate-200 border-slate-300', door: 'from-[#d4a373] to-[#c8925a]', handle: 'bg-slate-300', floor: 'bg-[#b69a81]' }, // Wood/Beige Floor
                        { wall: 'bg-sky-50/50', frame: 'bg-sky-200 border-sky-300', door: 'from-slate-100 to-slate-200', handle: 'bg-slate-400', floor: 'bg-slate-200' }, // White/Grey Tile
                        { wall: 'bg-stone-50', frame: 'bg-stone-200 border-stone-300', door: 'from-[#475569] to-[#334155]', handle: 'bg-slate-300', floor: 'bg-stone-300' }, // Metal/Concrete
                        { wall: 'bg-emerald-50/50', frame: 'bg-emerald-200 border-emerald-300', door: 'from-emerald-700 to-emerald-800', handle: 'bg-amber-300', floor: 'bg-emerald-900/40' }, // Green/Dark Carpet
                        { wall: 'bg-[#f3f7ee]', frame: 'bg-[#c6dbb6] border-[#a3c48b]', door: 'from-[#62853e] to-[#41572a]', handle: 'bg-amber-400', floor: 'bg-[#e3edda]' }, // PHINMA Brand
                        { wall: 'bg-blue-50/50', frame: 'bg-blue-200 border-blue-300', door: 'from-blue-700 to-blue-900', handle: 'bg-slate-300', floor: 'bg-blue-900/30' }, // Royal Blue
                        { wall: 'bg-orange-50/50', frame: 'bg-orange-200 border-orange-300', door: 'from-[#9c3e21] to-[#702a15]', handle: 'bg-amber-200', floor: 'bg-[#e3b896]' }, // Warm Autumn Wood
                        { wall: 'bg-slate-100', frame: 'bg-slate-300 border-slate-400', door: 'from-slate-800 to-slate-950', handle: 'bg-slate-200', floor: 'bg-slate-400' } // Modern Charcoal
                      ][styleIdx % 8];

                      return (
                      <div key={dept.id} className={`relative w-full h-full group/room flex flex-col ${styles.wall} overflow-hidden @container`}>
                        {/* Settings Button */}
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
                        
                          {/* Wall Space (contains Plaque and Door) */}
                          <div className="relative flex-1 w-full flex items-end justify-start pl-[8%] pr-[8%] gap-4">
                                              {/* Door Frame */}
                            <div className={`relative w-[28%] h-[70%] flex-shrink-0 ${styles.frame} rounded-t-sm border-x-4 border-t-4 flex justify-center shadow-inner z-10`}>
                              {/* Bright Interior (Visible when door opens) */}
                              <div className="absolute bottom-0 w-[96%] h-[98%] bg-amber-50 shadow-[inset_0_5px_15px_rgba(0,0,0,0.05)] rounded-t-[1px] overflow-hidden flex flex-col justify-end">
                                {/* Back Wall Poster/Window */}
                                <div className="absolute top-[20%] left-[20%] w-[30%] h-[20%] bg-blue-100 border border-blue-200/50" />
                                
                                {/* Front Desk */}
                                <div className="absolute bottom-0 w-full h-[25%] bg-[#d4b483] border-t-2 border-[#e6cca3] shadow-[0_-3px_5px_rgba(0,0,0,0.05)] z-10 flex items-end justify-center pb-[2px]">
                                  {/* Back of Computer Monitor */}
                                  <div className="w-[55%] h-[140%] -translate-y-[85%] -translate-x-[20%] flex flex-col items-center justify-end">
                                    {/* Monitor Screen (Back) */}
                                    <div className="w-[85%] h-[100%] bg-slate-800 border border-slate-700 rounded-[2px] flex items-center justify-center shadow-sm z-10">
                                      <div className="w-[55%] h-[60%] rounded-[1px] bg-slate-600/80" />
                                    </div>
                                    {/* Monitor Stand */}
                                    <div className="w-[80%] h-[20%] bg-slate-700 rounded-t-[1px]" />
                                  </div>
                                </div>
                              </div>
                              
                              {/* The Door itself */}
                              <div 
                                onClick={(e) => handleToggleDoor(dept.id, e)}
                                className={`absolute bottom-0 w-[96%] h-[98%] bg-gradient-to-b ${styles.door} rounded-t-[1px] border border-black/10 flex items-center pl-[12%] transition-all duration-500 ease-in-out origin-right cursor-pointer z-10 ${openDoors[dept.id] ? '[transform:perspective(800px)_rotateY(-75deg)] shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]' : 'hover:brightness-110'}`}
                              >
                                {/* Door Handle */}
                                <div className={`w-1 h-3.5 rounded-full flex-shrink-0 ${styles.handle} border border-black/20 shadow-sm transition-transform duration-500 ${openDoors[dept.id] ? 'scale-x-50' : ''}`} />
                              </div>
                            </div>

                            {/* Detailed Corkboard (Bulletin Board) */}
                            <div className="flex-1 h-[55%] mb-[12%] z-10 transition-transform duration-300 group-hover/room:scale-[1.02]">
                              <div className="w-full h-full bg-[#e3c39d] border-[3px] border-[#8b5a2b] shadow-[0_2px_4px_rgba(0,0,0,0.15)] relative overflow-hidden group/board">
                                {/* Cork texture (subtle dots) */}
                                <div className="absolute inset-0 opacity-[0.15] bg-[radial-gradient(#3e2723_1px,transparent_1px)] [background-size:4px_4px]" />
                                
                                {/* Single Paper - Code & Count */}
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] h-[75%] bg-white shadow-[1px_1px_2px_rgba(0,0,0,0.15)] flex flex-col items-center justify-center -rotate-1 border border-slate-100 z-10 transition-transform group-hover/board:scale-105">
                                  {/* Red Pin */}
                                  <div className="absolute top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-red-500 shadow-[0_1px_1px_rgba(0,0,0,0.4)] border-[0.5px] border-red-700" />
                                  <span 
                                    className="text-slate-800 text-center w-full leading-none truncate px-1"
                                    style={{ fontFamily: "'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', cursive", fontSize: '10cqi' }}
                                  >
                                    {dept.code}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            {/* Baseboard */}
                            <div className="absolute bottom-0 left-0 w-full h-1.5 bg-black/5 border-t border-black/10 z-0" />
                          </div>

                          {/* Floor */}
                          <div className={`w-full h-[12%] ${styles.floor} border-t border-black/20 shadow-[inset_0_3px_5px_rgba(0,0,0,0.05)] z-0`} />
                        </div>
                      )})}
                      
                      {/* Unassigned Spaces */}
                      {departments.slice(currentRoomPage * 4, (currentRoomPage + 1) * 4).length < 4 && Array.from({ length: 4 - departments.slice(currentRoomPage * 4, (currentRoomPage + 1) * 4).length }).map((_, i) => (
                        <div key={`empty-${i}`} className="relative w-full h-full group/room flex flex-col bg-slate-100 overflow-hidden @container">
                           <div className="relative flex-1 w-full flex items-end justify-start pl-[8%] pr-[8%] gap-4">
                             
                             {/* Generic Closed Door */}
                             <div className="relative w-[28%] h-[70%] flex-shrink-0 bg-slate-300 rounded-t-sm border-x-4 border-t-4 border-slate-400 flex justify-center shadow-inner z-10">
                               {/* Bright Interior (Visible when door opens) */}
                               <div className="absolute bottom-0 w-[96%] h-[98%] bg-slate-200 shadow-[inset_0_5px_15px_rgba(0,0,0,0.05)] rounded-t-[1px] overflow-hidden">
                                 {/* Front Desk (Empty/Abandoned) */}
                                 <div className="absolute bottom-0 w-full h-[25%] bg-[#d4b483] border-t-2 border-[#e6cca3] shadow-[0_-3px_5px_rgba(0,0,0,0.05)] z-10 flex items-end justify-center pb-[2px]">
                                  {/* Back of Computer Monitor */}
                                  <div className="w-[55%] h-[140%] -translate-y-[85%] -translate-x-[20%] flex flex-col items-center justify-end">
                                    {/* Monitor Screen (Back) */}
                                    <div className="w-[85%] h-[100%] bg-slate-800 border border-slate-700 rounded-[2px] flex items-center justify-center shadow-sm z-10">
                                      <div className="w-[55%] h-[60%] rounded-[1px] bg-slate-600/80" />
                                    </div>
                                    {/* Monitor Stand */}
                                    <div className="w-[80%] h-[20%] bg-slate-700 rounded-t-[1px]" />
                                  </div>
                                 </div>
                               </div>
                               
                               {/* The Door itself */}
                               <div 
                                 onClick={(e) => handleToggleDoor(`empty-${i}`, e)}
                                 className={`absolute bottom-0 w-[96%] h-[98%] bg-gradient-to-b from-slate-300 to-slate-400 rounded-t-[1px] border border-black/10 flex items-center pl-[12%] transition-all duration-500 ease-in-out origin-right cursor-pointer z-10 ${openDoors[`empty-${i}`] ? '[transform:perspective(800px)_rotateY(-75deg)] shadow-[inset_0_0_30px_rgba(0,0,0,0.3)]' : 'hover:brightness-110'}`}
                               >
                                 <div className={`w-1 h-3.5 rounded-full flex-shrink-0 bg-slate-500 border border-black/10 shadow-[inset_0_1px_1px_rgba(0,0,0,0.1)] transition-transform duration-500 ${openDoors[`empty-${i}`] ? 'scale-x-50' : ''}`} />
                               </div>
                             </div>

                             {/* Empty Room Corkboard */}
                             <div className="flex-1 h-[55%] mb-[12%] z-10 opacity-75">
                               <div className="w-full h-full bg-[#e3c39d] border-[3px] border-[#8b5a2b] shadow-[0_2px_4px_rgba(0,0,0,0.15)] relative overflow-hidden grayscale-[0.4]">
                                 {/* Cork texture */}
                                 <div className="absolute inset-0 opacity-[0.15] bg-[radial-gradient(#3e2723_1px,transparent_1px)] [background-size:4px_4px]" />
                                 
                                 {/* Vacant Sign */}
                                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] h-[60%] bg-slate-100 shadow-[1px_2px_3px_rgba(0,0,0,0.2)] flex flex-col items-center justify-center rotate-2 border border-slate-200 z-10">
                                   {/* Top left pin */}
                                   <div className="absolute top-0.5 left-1 w-1 h-1 rounded-full bg-slate-400 shadow-[0_1px_1px_rgba(0,0,0,0.3)] border-[0.5px] border-slate-500" />
                                   {/* Top right pin */}
                                   <div className="absolute top-0.5 right-1 w-1 h-1 rounded-full bg-slate-400 shadow-[0_1px_1px_rgba(0,0,0,0.3)] border-[0.5px] border-slate-500" />
                                   <span className="font-black text-rose-800/50 uppercase tracking-widest text-center w-full leading-none" style={{ fontSize: '8cqi' }}>
                                     VACANT
                                   </span>
                                 </div>
                               </div>
                             </div>
                             
                             {/* Baseboard */}
                             <div className="absolute bottom-0 left-0 w-full h-1.5 bg-black/5 border-t border-black/10 z-0" />
                           </div>
                           {/* Floor */}
                           <div className="w-full h-[12%] bg-slate-200 border-t border-slate-300/50 shadow-[inset_0_3px_5px_rgba(0,0,0,0.02)] z-0" />
                        </div>
                      ))}
                    </div>
                    
                    {/* Permanent Walkers Overlay (Decoupled from page state) */}
                    <div className="absolute inset-0 rounded-xl overflow-hidden grid grid-cols-2 grid-rows-2 gap-[2px] pointer-events-none z-[50]">
                      <div className="relative w-full h-full overflow-hidden"><RoomHallwayForeground roomId={0} /></div>
                      <div className="relative w-full h-full overflow-hidden"><RoomHallwayForeground roomId={1} /></div>
                      <div className="relative w-full h-full overflow-hidden"><RoomHallwayForeground roomId={2} /></div>
                      <div className="relative w-full h-full overflow-hidden"><RoomHallwayForeground roomId={3} /></div>
                    </div>
                  
                    {/* Pagination Controls */}
                    {departments.length > 4 && (
                      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover/pager:opacity-100 transition-opacity duration-300 z-[60]">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setCurrentRoomPage(p => p === 0 ? Math.ceil(departments.length / 4) - 1 : p - 1) }}
                          className="pointer-events-auto absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md border border-slate-200 text-slate-700 hover:bg-white hover:text-[var(--brand-color)] transition-all"
                        >
                          <ChevronDownIcon className="w-4 h-4 rotate-90" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setCurrentRoomPage(p => p >= Math.ceil(departments.length / 4) - 1 ? 0 : p + 1) }}
                          className="pointer-events-auto absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md border border-slate-200 text-slate-700 hover:bg-white hover:text-[var(--brand-color)] transition-all"
                        >
                          <ChevronDownIcon className="w-4 h-4 -rotate-90" />
                        </button>
                        
                        {/* Dots Indicator */}
                        <div className="pointer-events-auto absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1 bg-black/20 backdrop-blur-sm px-1.5 py-0.5 rounded-full">
                          {Array.from({ length: Math.ceil(departments.length / 4) }).map((_, i) => (
                             <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === currentRoomPage ? 'bg-white' : 'bg-white/40'}`} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </SummaryCard>

                {/* Card 1: Total Faculty */}
                <SummaryCard
                  title="Total Members"
                  subtitle={`${totalFacultyCount} Enrolled faculty members`}
                  icon={<UsersIcon className="h-4.5 w-4.5 text-emerald-600" />}
                  gradientClasses="from-emerald-700/20 to-emerald-800/30"
                  outlineClasses="bg-emerald-600"
                  blobClasses="bg-emerald-600/10"
                >
                  <div className="w-full h-full relative bg-[#094d32] rounded-xl border border-emerald-600/40 shadow-inner overflow-hidden group/members @container">
                    {/* Classic Medium Casino Felt Gradient & Pattern */}
                    <div 
                      className="absolute inset-0 pointer-events-none opacity-95"
                      style={{
                        background: 'radial-gradient(circle at 35% 50%, #15803d 0%, #065f46 65%, #044e38 100%)'
                      }}
                    />
                    <div 
                      className="absolute inset-0 pointer-events-none opacity-[0.06]"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 10 L37 25 L30 40 L23 25 Z M10 30 L25 37 L40 30 L25 23 Z' fill='%23ffffff'/%3E%3C/svg%3E")`,
                        backgroundSize: '36px 36px'
                      }}
                    />
                    {/* Golden Edge Border */}
                    <div className="absolute inset-0 border border-amber-400/30 rounded-xl pointer-events-none z-10" />
                    {(() => {
                      // Build a ranked list sorted by count descending (ties broken alphabetically for stability)
                      const deptWithCounts = departments.map(dept => ({
                        code: dept.code,
                        count: allUsers.filter(u => u.department === dept.code).length,
                      }));
                      deptWithCounts.sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
                      
                      // Assign tiers using each department's positional rank in the sorted list
                      // Remainders go to Bad first, then Neutral, ensuring Bad ≥ Neutral ≥ Good
                      const numDepts = deptWithCounts.length;
                      const base = Math.floor(numDepts / 3);
                      const remainder = numDepts % 3;
                      const badCount = base + (remainder >= 1 ? 1 : 0);
                      const neutralCount = base + (remainder >= 2 ? 1 : 0);

                      const deptTiers = deptWithCounts.map((dept, rank) => {
                        let tier: 'Good' | 'Neutral' | 'Bad';
                        if (rank < badCount) {
                          tier = 'Bad';
                        } else if (rank < badCount + neutralCount) {
                          tier = 'Neutral';
                        } else {
                          tier = 'Good';
                        }
                        return { code: dept.code, count: dept.count, tier };
                      });

                      // Group by tier
                      const deptsByTier: Record<string, typeof deptTiers> = { Good: [], Neutral: [], Bad: [] };
                      deptTiers.forEach(dt => deptsByTier[dt.tier].push(dt));

                      // Sort departments within each tier by count (ascending) so the smallest gets the best prize (index 0)
                      deptsByTier.Good.sort((a, b) => a.count - b.count);
                      deptsByTier.Neutral.sort((a, b) => a.count - b.count);
                      deptsByTier.Bad.sort((a, b) => a.count - b.count);

                      // Assign prizes strictly based on their ascending rank within the tier
                      const prizeByDept: Record<string, any> = {};
                      (['Good', 'Neutral', 'Bad'] as const).forEach(tier => {
                        const tierPrizes = PRIZES_BY_TIER[tier];
                        const N = tierPrizes.length;
                        const numDepts = deptsByTier[tier].length;
                        
                        // Calculate bucket sizes: base size + leftovers distributed from worst to best
                        const baseSize = Math.floor(numDepts / N);
                        const remainder = numDepts % N;
                        const bucketSizes = Array(N).fill(baseSize);
                        for (let i = 0; i < remainder; i++) {
                          bucketSizes[N - 1 - i]++;
                        }

                        deptsByTier[tier].forEach((dt, idx) => {
                          let prizeIndex = 0;
                          if (numDepts <= N) {
                            // If there are fewer or equal departments than prizes, guarantee they get the best ones (Rank 1, Rank 2...)
                            prizeIndex = idx;
                          } else {
                            // Otherwise, use the exclusive pyramid bucket system
                            let accumulated = 0;
                            for (let i = 0; i < N; i++) {
                              accumulated += bucketSizes[i];
                              if (idx < accumulated) {
                                prizeIndex = i;
                                break;
                              }
                            }
                          }
                          prizeByDept[dt.code] = tierPrizes[prizeIndex];
                        });
                      });

                      const basePieData = deptTiers.map(dt => {
                        return { code: dt.code, count: dt.count, weight: dt.count + 2, tier: dt.tier, prize: prizeByDept[dt.code] };
                      });
                      
                      basePieData.sort((a, b) => b.weight - a.weight);
                      const half = Math.ceil(basePieData.length / 2);
                      const topHalf = basePieData.slice(0, half);
                      const bottomHalf = basePieData.slice(half).reverse();
                      
                      const colors = ['#f59e0b', '#10b981', '#0ea5e9', '#6366f1', '#ec4899', '#f43f5e', '#8b5cf6', '#14b8a6', '#84cc16', '#eab308'];

                      const pieData: (typeof basePieData[0] & { color: string })[] = [];
                      for (let i = 0; i < topHalf.length; i++) {
                        pieData.push({ ...topHalf[i], color: colors[pieData.length % colors.length] });
                        if (bottomHalf[i]) pieData.push({ ...bottomHalf[i], color: colors[pieData.length % colors.length] });
                      }
                      
                      const legendData = [...pieData].sort((a, b) => b.count - a.count);

                      return (
                        <div className="absolute inset-0 flex flex-row p-[4%] gap-[4%]">
                    
                    {/* Left Column (Wheel & Button) */}
                    <div className="h-full flex flex-col justify-between items-center gap-[4%] z-40">
                      {/* Wheel Container */}
                      <div className="relative h-[75%] aspect-square flex items-center justify-center">
                        {/* Static Gold Casing & Outer Shadow */}
                        <div className="w-full h-full rounded-full border-[5px] border-amber-400 bg-amber-500 shadow-[0_8px_24px_rgba(0,0,0,0.35),0_0_15px_rgba(245,158,11,0.3)] overflow-hidden relative z-10">
                        <div 
                          className={`w-full h-full rounded-full overflow-hidden ${isSpinning ? 'cursor-wait' : 'cursor-default'} transition-transform duration-[4000ms]`}
                          style={{ 
                            transform: `rotate(${wheelRotation}deg)`, 
                            transitionTimingFunction: 'cubic-bezier(0.25, 1, 0.5, 1)' 
                          }}
                        >
                          {(() => {
                             if (pieData.length === 0) return null;
                             const totalWeight = pieData.reduce((acc, curr) => acc + curr.weight, 0);
                             let currentPercent = 0;
                             
                             const getCoordinatesForPercent = (percent: number) => {
                               const x = Math.cos(2 * Math.PI * percent);
                               const y = Math.sin(2 * Math.PI * percent);
                               return [x, y];
                             };

                             return (
                               <svg viewBox="-1 -1 2 2" className="w-full h-full -rotate-90">
                                 {pieData.map((data, index) => {
                                   const tooltipText = `${data.code}: ${data.count} member${data.count !== 1 ? 's' : ''}`;
                                   const handleMouseMove = (e: React.MouseEvent) => {
                                     setWheelTooltip({
                                       visible: true,
                                       x: e.clientX,
                                       y: e.clientY,
                                       text: tooltipText
                                     });
                                   };
                                   const handleMouseLeave = () => setWheelTooltip(null);

                                   if (pieData.length === 1) {
                                     return (
                                       <circle 
                                         key={data.code} 
                                         cx="0" cy="0" r="1" 
                                         fill={data.color}
                                         onMouseMove={handleMouseMove}
                                         onMouseLeave={handleMouseLeave}
                                         className="cursor-crosshair transition-opacity duration-200 hover:opacity-90"
                                       />
                                     )
                                   }
                                   
                                   const percent = data.weight / totalWeight;
                                   const [startX, startY] = getCoordinatesForPercent(currentPercent);
                                   currentPercent += percent;
                                   const [endX, endY] = getCoordinatesForPercent(currentPercent);
                                   const largeArcFlag = percent > 0.5 ? 1 : 0;
                                   const pathData = [
                                     `M ${startX} ${startY}`,
                                     `A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`,
                                     `L 0 0`,
                                     `Z`
                                   ].join(' ');

                                   return (
                                     <path 
                                       key={data.code} 
                                       d={pathData} 
                                       fill={data.color} 
                                       stroke="rgba(0,0,0,0.15)" 
                                       strokeWidth="0.015"
                                       onMouseMove={handleMouseMove}
                                       onMouseLeave={handleMouseLeave}
                                       className="cursor-crosshair transition-opacity duration-200 hover:opacity-90"
                                     />
                                   );
                                 })}

                                 {/* Perfectly Vector-Round Center Pin with Gold Rim */}
                                 <circle cx="0" cy="0" r="0.08" fill="#ffffff" stroke="#d97706" strokeWidth="0.035" />
                               </svg>
                             );
                          })()}
                        </div>

                        {/* Static Inner Shadow Overlay layer (Does not rotate with wheel) */}
                        <div className="absolute inset-0 rounded-full shadow-[inset_0_0_8px_rgba(0,0,0,0.5)] pointer-events-none z-15" />
                        </div>

                        {/* Static Marquee Lights (Dots) in the exact center of the gold border */}
                        <div className="absolute inset-0 rounded-full z-15 pointer-events-none">
                          <svg className="w-full h-full opacity-90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] overflow-visible">
                             <circle 
                               cx="50%" 
                               cy="50%" 
                               r="calc(50% - 2.5px)" 
                               fill="none" 
                               stroke="#fef3c7" 
                               strokeWidth="2.5" 
                               strokeDasharray="0 1" 
                               pathLength="24"
                               strokeLinecap="round" 
                             />
                          </svg>
                        </div>

                        {/* The Gold Arrow pointing down from the TOP (Curved perfectly to match outer rim) */}
                        <div className="absolute -top-[1.25%] left-1/2 -translate-x-1/2 z-20 pointer-events-none w-[20%] aspect-[20/18] filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]">
                           <svg viewBox="-2 -2 20 18" className="w-full h-full fill-amber-400 stroke-amber-700 stroke-[1.5] overflow-visible">
                             <path d="M 0 0.644 A 50 50 0 0 1 16 0.644 L 8 14 Z" strokeLinejoin="round" />
                           </svg>
                        </div>
                          {/* Prize Won Toast */}
                          <div 
                            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] px-[3cqw] py-[1.5cqw] rounded-2xl border-[3px] border-white/20 shadow-[0_10px_40px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(255,255,255,0.4)] transition-all duration-300 flex items-center justify-center pointer-events-none ${prizeToast ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}
                            style={{ backgroundColor: prizeToast?.color || 'transparent' }}
                          >
                            <span className="inline-flex items-center justify-center leading-none text-[4cqw] font-black text-white whitespace-nowrap drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] tracking-wide mt-[0.2cqw]">
                              {prizeToast?.text}
                            </span>
                          </div>
                      </div>

                      {/* Spin / Daily Reward Button */}
                      <div className="w-full flex items-center justify-center relative">
                        {(() => {
                          const today = new Date().toLocaleDateString();
                          const canClaimDaily = lastClaimedDaily !== today;
                          
                          if (canClaimDaily) {
                            return (
                              <button 
                                className="w-[92%] h-[8.5cqw] bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 active:from-amber-600 active:to-amber-700 border-[2px] border-amber-200 text-white drop-shadow-md font-black uppercase tracking-widest rounded-full transition-all shadow-[0_4px_14px_rgba(245,158,11,0.4)] hover:shadow-[0_6px_20px_rgba(245,158,11,0.6)] active:scale-95 flex items-center justify-center"
                                style={{ fontSize: '3.5cqw' }}
                                onClick={async () => {
                                  if (!auth.currentUser) return;
                                  const updates: any = { 
                                    coins: (userCoins || 0) + 10, 
                                    lastClaimedDaily: today 
                                  };
                                  if (userCoins === null) {
                                    updates.level = 1;
                                    updates.xp = 0;
                                  }
                                  await updateDoc(doc(db, 'users', auth.currentUser.uid), updates);
                                }}
                              >
                                <span className="flex items-center justify-center gap-0">
                                  <span>DAILY</span>
                                  <span className="text-[4cqw] drop-shadow-sm" style={{ WebkitTextStroke: '0px' }}>🪙</span>
                                  <span>10</span>
                                </span>
                              </button>
                            );
                          }

                          return (
                            <button 
                              className={`w-[92%] h-[8.5cqw] bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 border-[2px] border-amber-200 text-white drop-shadow-md font-black uppercase tracking-wider rounded-full transition-all disabled:opacity-50 disabled:cursor-default flex items-center justify-center shadow-[0_4px_14px_rgba(245,158,11,0.4)] ${isSpinning ? 'animate-pulse' : ''} ${(!isSpinning && (userCoins || 0) >= 1) ? 'hover:from-amber-300 hover:to-amber-500 active:from-amber-600 active:to-amber-700 hover:shadow-[0_6px_20px_rgba(245,158,11,0.6)] active:scale-95' : ''}`}
                              style={{ fontSize: '3.5cqw' }}
                              onClick={() => {
                                if (isSpinning || (userCoins || 0) < 1 || !auth.currentUser) return;
                                setIsSpinning(true);
                                
                                // Start wheel rotation immediately
                                const randomSpins = Math.floor(Math.random() * 5) + 5;
                                const randomDegree = Math.floor(Math.random() * 360);
                                const nextRotation = wheelRotation + (randomSpins * 360) + randomDegree;
                                setWheelRotation(nextRotation);

                                // Deduct coin asynchronously
                                updateDoc(doc(db, 'users', auth.currentUser.uid), { coins: (userCoins || 0) - 1 }).catch(console.error);
                                setTimeout(async () => {
                                  setIsSpinning(false);
                                  if (!auth.currentUser || pieData.length === 0) return;
                                  
                                  const pointerDegree = 360 - (nextRotation % 360);
                                  const pointerPercent = pointerDegree === 360 ? 0 : pointerDegree / 360;

                                  const totalWeight = pieData.reduce((acc, curr) => acc + curr.weight, 0);
                                  let currentPercent = 0;
                                  let hitDept = pieData[0];

                                  for (let i = 0; i < pieData.length; i++) {
                                    const percent = pieData[i].weight / totalWeight;
                                    if (pointerPercent >= currentPercent && pointerPercent < currentPercent + percent) {
                                      hitDept = pieData[i];
                                      break;
                                    }
                                    currentPercent += percent;
                                  }

                                  const prize = hitDept.prize;
                                  
                                  setPrizeToast({ text: prize.text, color: prize.color });
                                  setTimeout(() => setPrizeToast(null), 3500);

                                  const updates: any = {};
                                  if (prize.type === 'coin') {
                                    updates.coins = (userCoins || 0) - 1 + prize.value;
                                  } else if (prize.type === 'refund') {
                                    updates.coins = (userCoins || 0); // Refunds the 1 coin spent
                                  } else if (prize.type === 'xp') {
                                    let newXp = userXp + (prize.value || 0);
                                    let newLevel = userLevel;
                                    while (newXp >= newLevel * 100) {
                                      newXp -= newLevel * 100;
                                      newLevel++;
                                    }
                                    updates.xp = newXp;
                                    updates.level = newLevel;
                                  } else if (prize.type === 'crewmate') {
                                    window.dispatchEvent(new CustomEvent('spawn-crewmate', { detail: { roomId: Math.floor(Math.random() * 4) } }));
                                  } else if (prize.type === 'imposter') {
                                    window.dispatchEvent(new CustomEvent('spawn-imposter', { detail: { roomId: Math.floor(Math.random() * 4) } }));
                                  } else if (prize.type === 'iphone') {
                                    window.dispatchEvent(new CustomEvent('spawn-imposter'));
                                  }

                                  if (Object.keys(updates).length > 0) {
                                    await updateDoc(doc(db, 'users', auth.currentUser.uid), updates);
                                  }
                                }, 4050);
                              }}
                              disabled={isSpinning || (userCoins || 0) < 1}
                            >
                              {isSpinning ? (
                                <span>SPINNING</span>
                              ) : (
                                <span className="flex items-center justify-center gap-0">
                                  <span>SPIN!</span>
                                  <span className="text-[4cqw] drop-shadow-sm" style={{ WebkitTextStroke: '0px' }}>🪙</span>
                                  <span>1</span>
                                </span>
                              )}
                            </button>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Right Column (Level, Coin & Legend) */}
                    <div className="flex-1 h-full flex flex-col justify-start items-end gap-[6%] z-30">
                      
                      {/* Top Bar: Level & Coin */}
                      <div className="w-full flex flex-row justify-end items-stretch gap-[4%] h-fit max-h-[15%] shrink-0">
                        {/* Level Display */}
                        <div className="flex-1 relative flex flex-col justify-center bg-slate-900/85 backdrop-blur-md border border-indigo-400/50 px-[3cqw] py-[1.5cqw] rounded-full shadow-md overflow-hidden">
                          {/* Progress Bar Background */}
                          <div 
                            className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-indigo-600 to-purple-600 opacity-90 transition-all duration-500"
                            style={{ width: `${(userXp / (userLevel * 100)) * 100}%` }}
                          />
                          <div className="flex flex-row items-center justify-between relative z-10 w-full">
                            <span className="text-[3cqw] font-black text-white leading-none drop-shadow">Lv.{userLevel}</span>
                            <span className="text-[2.2cqw] font-bold text-indigo-200 leading-none">{userXp}/{userLevel * 100}</span>
                          </div>
                        </div>

                        {/* Coin Display */}
                        {userCoins !== null && (
                          <div className="w-[40%] flex items-center justify-center gap-[6%] bg-slate-900/85 backdrop-blur-md border border-amber-400/60 px-[3cqw] py-[1.5cqw] rounded-full shadow-md">
                            <span className="text-[3.5cqw] drop-shadow">🪙</span>
                            <span className="text-[3.2cqw] font-black text-amber-300 leading-none drop-shadow">{userCoins}</span>
                          </div>
                        )}
                      </div>

                      {/* Legend */}
                      <div className="w-full flex-1 bg-slate-900/85 backdrop-blur-md border border-amber-400/50 rounded-xl shadow-md flex flex-col min-h-0 overflow-hidden">
                        <LegendAutoScroll legendData={legendData} />
                      </div>

                    </div>
                    </div>
                    );
                    })()}
                  </div>
                </SummaryCard>

                {/* Card 2: Dean Coverage */}
                <SummaryCard
                  title="Dean Coverage"
                  subtitle={`${departments.filter(d => d.deanUID).length}/${departments.length} Assigned deans`}
                  icon={<UserIcon className="h-4.5 w-4.5 text-amber-600" />}
                  onIconClick={() => setShowEasterEggControls(p => !p)}
                  gradientClasses="from-amber-200 to-amber-100"
                  outlineClasses="bg-amber-500"
                  blobClasses="bg-amber-500/5"
                >
                  <DeanBook departments={departments} allUsers={allUsers} isEasterEggsEnabled={isEasterEggsEnabled} selectedAnomalies={selectedAnomalies} />
                </SummaryCard>



              </div>
            </div>
          )
        })()}

        <DataTable
          data={filteredDepartments}
          columns={deptColumns}
          searchPlaceholder="Search departments..."
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          filters={
            <FilterDropdown
              label="Filters"
              className="w-full sm:w-auto"
              buttonClassName="w-full sm:w-auto"
              onClearAll={() => {
                setDeanStatusFilters([])
                setDeptSizeFilters([])
              }}
              groups={[
                {
                  id: 'deanStatus',
                  title: 'Dean Status',
                  options: [
                    { value: 'Assigned', label: 'Assigned' },
                    { value: 'Unassigned', label: 'Unassigned' }
                  ],
                  selectedValues: deanStatusFilters,
                  onChange: setDeanStatusFilters
                },
                {
                  id: 'size',
                  title: 'Department Size',
                  options: [
                    { value: 'Empty', label: 'Empty (0)' },
                    { value: 'Small', label: 'Small (1-10)' },
                    { value: 'Medium', label: 'Medium (11-50)' },
                    { value: 'Large', label: 'Large (51+)' }
                  ],
                  selectedValues: deptSizeFilters,
                  onChange: setDeptSizeFilters
                }
              ]}
            />
          }
          primaryAction={
            <div className="flex gap-2 w-full lg:w-auto">
              {showAmongUsButton && (
                <>
                  <IconOnlyButton
                    variant="outline"
                    className="shrink-0 border-gray-400 hover:border-gray-500 animate-in fade-in zoom-in cursor-default"
                    onClick={() => window.dispatchEvent(new Event('spawn-crewmate'))}
                    icon={<span className="text-xl leading-none -mt-0.5">ඞ</span>}
                    label="Spawn Crewmate"
                    title="Spawn Crewmate"
                  />
                  <IconOnlyButton
                    variant="outline"
                    className="shrink-0 border-red-400 hover:border-red-500 hover:bg-red-50 animate-in fade-in zoom-in cursor-default"
                    onClick={() => window.dispatchEvent(new Event('spawn-imposter'))}
                    icon={<span className="text-xl text-red-500 leading-none -mt-0.5">ඞ</span>}
                    label="Spawn Imposter"
                    title="Spawn Imposter"
                  />
                </>
              )}
              {showEasterEggControls && (
                <>
                  <IconOnlyButton
                    variant="outline"
                    className="shrink-0 border-gray-400 hover:border-brand-color animate-in fade-in zoom-in"
                    onClick={() => setIsGalleryModalOpen(true)}
                    icon={<span className="text-xl leading-none">🖼️</span>}
                    label="Easter Egg Gallery"
                    title="Easter Egg Gallery"
                  />
                  <IconOnlyButton
                    variant="outline"
                    className="shrink-0 border-gray-400 hover:border-brand-color animate-in fade-in zoom-in"
                    onClick={() => setIsEasterEggsEnabled(p => !p)}
                    icon={<span className="text-xl leading-none">{isEasterEggsEnabled ? '👻' : '🚫'}</span>}
                    label={isEasterEggsEnabled ? "Disable Easter Eggs" : "Enable Easter Eggs"}
                    title={isEasterEggsEnabled ? "Disable Easter Eggs" : "Enable Easter Eggs"}
                  />
                </>
              )}
              <Button
                variant="brand"
                className="shrink-0 flex-1 lg:flex-none"
                onClick={() => setIsCreateModalOpen(true)}
                icon={<PlusIcon className="h-5 w-5" />}
              >
                Add Department
              </Button>
            </div>
          }
          emptyTitle="No departments found"
          emptyDescription="Try adjusting your filters or search terms."
          emptyIcon={<DepartmentIcon className="h-12 w-12" />}
          onRowClick={(dept) => setSelectedDept(dept)}
        />
      </div>

      {/* Easter Egg Gallery Modal */}
      {isGalleryModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-7xl h-[90vh] rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white flex justify-between items-start shrink-0">
              <div>
                <h3 className="text-2xl font-bold leading-tight flex items-center gap-2"><span className="text-3xl">👻</span> Easter Egg Gallery</h3>
                <p className="mt-1 text-sm text-white/80">Selected: <strong className="text-white">{selectedAnomalies.length} / {departments.length}</strong> (Forced Spawns)</p>
              </div>
              <IconOnlyButton 
                label="Close gallery" 
                onClick={() => setIsGalleryModalOpen(false)} 
                icon={<CloseIcon className="h-6 w-6 text-white" />} 
                variant="ghost"
                className="hover:bg-white/20 text-white"
              />
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-transparent">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {Array.from({ length: 52 }, (_, i) => i + 1).map(eggNum => {
                  const isSelected = selectedAnomalies.includes(eggNum);
                  return (
                    <div 
                      key={eggNum} 
                      className="flex flex-col gap-2 cursor-pointer transition-transform hover:scale-105 active:scale-95"
                      onClick={() => {
                        setSelectedAnomalies(prev => {
                          if (prev.includes(eggNum)) {
                            return prev.filter(n => n !== eggNum);
                          } else if (prev.length < departments.length) {
                            return [...prev, eggNum];
                          }
                          return prev;
                        });
                      }}
                    >
                      <div className={`w-full aspect-[8/11] @container relative rounded-lg overflow-hidden border-4 shadow-lg bg-transparent shrink-0 group transition-all duration-200 ${isSelected ? 'border-green-500 shadow-green-500/50 scale-[1.02]' : 'border-gray-200'}`}>
                        <DeanBookPage data={{ isBlank: false, bio: { easterEggType: eggNum } }} isLeft={false} />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none" />
                        {isSelected && (
                          <div className="absolute top-2 right-2 bg-green-500 text-white p-1 rounded-full shadow-lg z-10 animate-in zoom-in-50 duration-200">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          </div>
                        )}
                      </div>
                      <div className="text-center">
                        <span className="inline-block px-2 py-1 rounded bg-white/50 backdrop-blur-sm text-xs font-bold text-gray-700 mb-1 border border-gray-200 shadow-sm uppercase">{ANOMALY_NAMES[eggNum - 1]}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={() => setIsGalleryModalOpen(false)} 
          />
        </div>
      )}

      {/* Custom Global Tooltip for the Wheel */}
      {wheelTooltip && wheelTooltip.visible && (
        <div 
          className="fixed z-50 pointer-events-none px-4 py-2 bg-slate-900/95 backdrop-blur-md border-[2px] border-amber-400/80 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5),0_0_15px_rgba(245,158,11,0.2)] text-amber-50 text-sm font-bold tracking-wide transform -translate-x-1/2 -translate-y-full flex items-center justify-center whitespace-nowrap transition-all duration-75"
          style={{ left: wheelTooltip.x, top: wheelTooltip.y - 14 }}
        >
          {wheelTooltip.text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-[8px] border-x-transparent border-t-[8px] border-t-amber-400/80"></div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-slate-900 -mt-[3px]"></div>
        </div>
      )}
    </section>
  )
}

export default DepartmentsPage
