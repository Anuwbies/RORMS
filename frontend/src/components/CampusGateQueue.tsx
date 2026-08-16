import { useState, useMemo, useEffect } from 'react';
import type { Member, Department, MemberRole } from '../types/member';
import { UserIcon } from './Icons';

interface CampusGateQueueProps {
  members: Member[];
  users: Member[];
  invites: Member[];
  departments: Department[];
}

const roleStyles: Record<MemberRole, { body: string; pants: string; accessory: string; label: string; badge: string }> = {
  Admin: {
    body: 'bg-purple-600',
    pants: 'bg-slate-800',
    accessory: '🔑',
    label: 'Admin',
    badge: 'bg-purple-100 text-purple-700 border-purple-200'
  },
  Registrar: {
    body: 'bg-blue-600',
    pants: 'bg-slate-700',
    accessory: '📋',
    label: 'Registrar',
    badge: 'bg-blue-100 text-blue-700 border-blue-200'
  },
  Dean: {
    body: 'bg-amber-600',
    pants: 'bg-stone-800',
    accessory: '📜',
    label: 'Dean',
    badge: 'bg-amber-100 text-amber-700 border-amber-200'
  },
  'Program Head': {
    body: 'bg-rose-600',
    pants: 'bg-slate-800',
    accessory: '💼',
    label: 'Program Head',
    badge: 'bg-rose-100 text-rose-700 border-rose-200'
  },
  Instructor: {
    body: 'bg-emerald-600',
    pants: 'bg-slate-700',
    accessory: '☕',
    label: 'Instructor',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200'
  },
};

export function CampusGateQueue({ members, users, invites }: CampusGateQueueProps) {
  const [avatarErrors, setAvatarErrors] = useState<Record<string, boolean>>({});
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = currentTime.getHours();
  const isNight = hours < 5 || hours >= 19;
  const isGolden = hours >= 17 && hours < 19;
  const isMorning = hours >= 5 && hours < 12;

  const timeTheme = useMemo(() => {
    if (isMorning) {
      return {
        sky: 'from-sky-300 via-sky-100 to-emerald-50/40',
        windowClass: 'bg-sky-200 rounded-xs border border-sky-500/80 shadow-inner',
        windowGlow: false,
        showMoon: false,
        showSun: true,
      };
    }
    if (isGolden) {
      return {
        sky: 'from-amber-400/80 via-orange-300/60 to-rose-200/40',
        windowClass: 'bg-amber-100 rounded-xs border border-amber-400/80 shadow-inner',
        windowGlow: false,
        showMoon: false,
        showSun: true,
      };
    }
    if (isNight) {
      return {
        sky: 'from-[#0b132b] via-[#1c2541] to-[#2d3a54]',
        windowClass: 'bg-amber-300 rounded-xs border border-amber-400 shadow-[0_0_6px_rgba(253,224,71,0.7)]',
        windowGlow: true,
        showMoon: true,
        showSun: false,
      };
    }
    // Afternoon
    return {
      sky: 'from-sky-400 via-sky-200 to-emerald-50/40',
      windowClass: 'bg-sky-200 rounded-xs border border-sky-500/80 shadow-inner',
      windowGlow: false,
      showMoon: false,
      showSun: true,
    };
  }, [isNight, isGolden, isMorning]);

  // Ensure there are at least 6 slots so the walkway line is active and evenly spaced
  const displayMembers = useMemo(() => {
    if (members.length === 0) {
      return [
        { id: '1', name: 'Faculty Member', role: 'Instructor' as MemberRole, status: 'Active', department: 'CITE', email: '', joinedDate: '', avatar: '' },
        { id: '2', name: 'Dean Office', role: 'Dean' as MemberRole, status: 'Active', department: 'CITE', email: '', joinedDate: '', avatar: '' },
      ];
    }
    if (members.length < 6) {
      const repeated: Member[] = [];
      while (repeated.length < 8) {
        repeated.push(...members);
      }
      return repeated;
    }
    return members;
  }, [members]);

  const activeCount = users.filter(u => u.status === 'Active').length;
  const loopDuration = Math.max(12, Math.min(24, displayMembers.length * 2.2));

  return (
    <div className="flex-1 w-full h-full relative rounded-xl overflow-hidden select-none border border-slate-200 shadow-inner bg-gradient-to-b from-sky-100 via-sky-50 to-emerald-50/40 flex flex-col justify-between">
      <style>{`
        @keyframes walkAcrossScreen {
          0% { left: -14%; }
          100% { left: 114%; }
        }
        @keyframes legSwingLeft {
          0%, 100% { transform: rotate(-24deg); }
          50% { transform: rotate(24deg); }
        }
        @keyframes legSwingRight {
          0%, 100% { transform: rotate(24deg); }
          50% { transform: rotate(-24deg); }
        }
        @keyframes bodyBobbing {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-2px); }
        }
        @keyframes turnstileSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes scannerBeacon {
          0%, 100% { opacity: 0.3; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.15); filter: drop-shadow(0 0 6px #10b981); }
        }
        @keyframes cloudDrift {
          0% { transform: translateX(0px); }
          100% { transform: translateX(180px); }
        }
        @keyframes idCardTap {
          0%, 100% { transform: translate(-50%, 0) rotate(-5deg); }
          50% { transform: translate(-50%, 0) rotate(5deg); }
        }
      `}</style>

      {/* 1. Rich University Campus Background */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Dynamic Campus Sky Gradient matching Time of Day */}
        <div className={`absolute inset-0 bg-gradient-to-b ${timeTheme.sky} transition-colors duration-1000`} />

        {/* ─── CELESTIAL SKY: DENSE STAR FIELD & DRIFTING CLOUDS ─── */}
        {/* Rich Constellation of Stars */}
        <div className="absolute inset-0 pointer-events-none z-0">
          {/* Sparkle 4-point Stars */}
          <div className="absolute top-[4%] left-[7%] opacity-90 animate-pulse" style={{ animationDuration: '2.4s' }}>
            <svg className="w-3.5 h-3.5 text-amber-200 filter drop-shadow-[0_0_4px_#fef08a]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5Z" />
            </svg>
          </div>
          <div className="absolute top-[6%] left-[24%] opacity-85 animate-pulse" style={{ animationDuration: '3.1s' }}>
            <svg className="w-3 h-3 text-white filter drop-shadow-[0_0_5px_#ffffff]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5Z" />
            </svg>
          </div>
          <div className="absolute top-[3%] left-[45%] opacity-95 animate-pulse" style={{ animationDuration: '2s' }}>
            <svg className="w-4 h-4 text-amber-100 filter drop-shadow-[0_0_6px_#fef08a]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5Z" />
            </svg>
          </div>
          <div className="absolute top-[7%] left-[58%] opacity-90 animate-pulse" style={{ animationDuration: '2.8s' }}>
            <svg className="w-3 h-3 text-white filter drop-shadow-[0_0_4px_#ffffff]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5Z" />
            </svg>
          </div>
          <div className="absolute top-[4%] left-[78%] opacity-90 animate-pulse" style={{ animationDuration: '3.4s' }}>
            <svg className="w-3.5 h-3.5 text-amber-200 filter drop-shadow-[0_0_5px_#fef08a]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5Z" />
            </svg>
          </div>
          <div className="absolute top-[8%] left-[93%] opacity-85 animate-pulse" style={{ animationDuration: '2.2s' }}>
            <svg className="w-3 h-3 text-white filter drop-shadow-[0_0_4px_#ffffff]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5Z" />
            </svg>
          </div>

          {/* Glowing Circular Stars */}
          <div className="absolute top-[3%] left-[3%] w-1.5 h-1.5 bg-white rounded-full animate-pulse opacity-90 shadow-[0_0_4px_#fff]" />
          <div className="absolute top-[9%] left-[13%] w-1 h-1 bg-amber-100 rounded-full animate-ping opacity-70" style={{ animationDuration: '3.5s' }} />
          <div className="absolute top-[14%] left-[8%] w-1.5 h-1.5 bg-white rounded-full animate-pulse opacity-80 shadow-[0_0_4px_#fff]" />
          <div className="absolute top-[5%] left-[18%] w-1 h-1 bg-sky-200 rounded-full opacity-85" />
          <div className="absolute top-[12%] left-[21%] w-1.5 h-1.5 bg-amber-200 rounded-full animate-pulse opacity-90 shadow-[0_0_5px_#fef08a]" />
          
          <div className="absolute top-[3%] left-[32%] w-1.5 h-1.5 bg-white rounded-full animate-pulse opacity-95 shadow-[0_0_5px_#fff]" />
          <div className="absolute top-[8%] left-[36%] w-1 h-1 bg-amber-100 rounded-full opacity-80" />
          <div className="absolute top-[13%] left-[40%] w-1.5 h-1.5 bg-white rounded-full animate-pulse opacity-85 shadow-[0_0_4px_#fff]" />
          <div className="absolute top-[6%] left-[49%] w-2 h-2 bg-amber-200 rounded-full animate-pulse opacity-95 shadow-[0_0_6px_#fef08a]" />
          <div className="absolute top-[11%] left-[53%] w-1 h-1 bg-white rounded-full opacity-85" />
          <div className="absolute top-[4%] left-[63%] w-1.5 h-1.5 bg-sky-100 rounded-full animate-pulse opacity-90 shadow-[0_0_4px_#fff]" />
          <div className="absolute top-[12%] left-[66%] w-1 h-1 bg-amber-200 rounded-full animate-ping opacity-60" style={{ animationDuration: '4s' }} />

          <div className="absolute top-[3%] left-[72%] w-1.5 h-1.5 bg-white rounded-full animate-pulse opacity-90 shadow-[0_0_5px_#fff]" />
          <div className="absolute top-[10%] left-[75%] w-1 h-1 bg-amber-100 rounded-full opacity-80" />
          <div className="absolute top-[5%] left-[84%] w-2 h-2 bg-white rounded-full animate-pulse opacity-95 shadow-[0_0_6px_#fff]" />
          <div className="absolute top-[12%] left-[87%] w-1 h-1 bg-sky-200 rounded-full opacity-85" />
          <div className="absolute top-[4%] left-[96%] w-1.5 h-1.5 bg-amber-200 rounded-full animate-pulse opacity-90 shadow-[0_0_5px_#fef08a]" />
          <div className="absolute top-[14%] left-[97%] w-1 h-1 bg-white rounded-full opacity-80" />
        </div>

        {/* Soft Drifting Fluffy Clouds */}
        <div
          className="absolute top-2 left-4 flex gap-1.5 opacity-80 pointer-events-none z-1"
          style={{ animation: 'cloudDrift 28s linear infinite' }}
        >
          <div className="w-10 h-4 bg-white/85 rounded-full shadow-xs" />
          <div className="w-7 h-5.5 bg-white/90 rounded-full -ml-4 -mt-1.5" />
          <div className="w-6 h-3.5 bg-white/75 rounded-full -ml-2" />
        </div>

        <div
          className="absolute top-4 left-[45%] flex gap-1.5 opacity-65 pointer-events-none z-1"
          style={{ animation: 'cloudDrift 34s linear infinite', animationDelay: '-12s' }}
        >
          <div className="w-9 h-3.5 bg-white/80 rounded-full shadow-xs" />
          <div className="w-6 h-4.5 bg-white/85 rounded-full -ml-3 -mt-1" />
          <div className="w-5 h-3 bg-white/70 rounded-full -ml-2" />
        </div>

        {/* ─── STONE BOUNDARY WALL BEHIND CAMPUS (Matching Pillar Stone) ─── */}
        <div className="absolute bottom-[28%] inset-x-0 h-16 bg-[#dfd9cb] border-t-2 border-[#b3ab96] shadow-sm flex flex-col justify-start z-0 overflow-hidden">
          {/* Stone Wall Coping Cap Molding (Matching Pillar Capital) */}
          <div className="w-full h-2 bg-[#cfc8b7] border-b border-[#b3ab96] shadow-xs" />
          {/* Stone Masonry Block Seams */}
          <div className="w-full flex-1 opacity-25 flex">
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} className="flex-1 border-r border-[#968b75] h-full" />
            ))}
          </div>
        </div>

        {/* ─── VIBRANT GREEN CAMPUS GRASS LAWN (Quad in front of campus) ─── */}
        <div className="absolute bottom-[18%] inset-x-0 h-12 bg-gradient-to-t from-[#6ea34e] via-[#7eb65b] to-[#88be66] border-t-2 border-[#5a8c3c] shadow-inner z-1" />

        {/* ─── UNIVERSITY CAMPUS BUILDINGS (PHINMA UPANG Campus) ─── */}
        {/* Building 1: Main University Administration Hall (Left-Center, ~17%, bottom-[28%]) */}
        <div className="absolute bottom-[28%] left-[17%] flex flex-col items-center z-2">
          {/* Main Classical Academic Hall Structure with Pediment & Columns */}
          <div className="flex flex-col items-center">
            {/* Classical Triangular Pediment Roof */}
            <svg className="w-37 h-8 relative z-10 overflow-visible" viewBox="-4 0 152 32">
              <polygon points="0,32 72,2 144,32" fill="#d6ccb6" stroke="#aba087" strokeWidth="1.5" strokeLinejoin="round" />
              <polygon points="12,30 72,7 132,30" fill="#ede6d6" stroke="#c4baa5" strokeWidth="1" strokeLinejoin="round" />
              <circle cx="72" cy="20" r="7" fill="#62853e" stroke="#f59e0b" strokeWidth="1.5" />
              <text x="72" y="23" textAnchor="middle" fontSize="9" fill="#fef08a">🔥</text>
            </svg>

            <div className="w-36 bg-[#41572a] border-y-2 border-amber-400 py-0.5 flex items-center justify-center shadow-xs relative z-10">
              <span className="text-[0.5rem] font-black tracking-widest text-amber-300 uppercase drop-shadow-xs">
                UPANG
              </span>
            </div>

            <div className="w-36 h-16 bg-[#ede6d6] border-x-2 border-[#b8ab92] shadow-sm flex items-center justify-between px-2 py-1 relative z-10">
              <div className="w-2.5 h-full bg-[#fbf9f4] rounded-xs border-x border-[#b8ab92] shadow-2xs flex flex-col justify-between">
                <div className="w-full h-1 bg-[#d6ccb6] rounded-t-xs border-b border-[#aba087]" />
                <div className="w-full h-1 bg-[#d6ccb6] rounded-b-xs border-t border-[#aba087]" />
              </div>

              <div className="flex flex-col gap-1">
                <div className={`w-4 h-3 ${timeTheme.windowClass}`} />
                <div className={`w-4 h-3 ${timeTheme.windowClass}`} />
                <div className={`w-4 h-3 ${timeTheme.windowClass}`} />
              </div>

              <div className="w-6.5 h-11 bg-[#334322] rounded-t-full border-2 border-[#29361c] shadow-inner mt-4 flex flex-col items-center justify-between py-1">
                <div className={`w-4 h-2 rounded-t-full ${timeTheme.windowClass}`} />
                <div className="flex gap-1">
                  <div className="w-1 h-1 bg-amber-400 rounded-full shadow-2xs" />
                  <div className="w-1 h-1 bg-amber-400 rounded-full shadow-2xs" />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <div className={`w-4 h-3 ${timeTheme.windowClass}`} />
                <div className={`w-4 h-3 ${timeTheme.windowClass}`} />
                <div className={`w-4 h-3 ${timeTheme.windowClass}`} />
              </div>

              <div className="w-2.5 h-full bg-[#fbf9f4] rounded-xs border-x border-[#b8ab92] shadow-2xs flex flex-col justify-between">
                <div className="w-full h-1 bg-[#d6ccb6] rounded-t-xs border-b border-[#aba087]" />
                <div className="w-full h-1 bg-[#d6ccb6] rounded-b-xs border-t border-[#aba087]" />
              </div>
            </div>
          </div>
        </div>

        {/* Building 2: Registrar Wing (Center-Right, ~67%, bottom-[28%]) */}
        <div className="absolute bottom-[28%] left-[67%] flex flex-col items-center opacity-95 z-1">
          <div className="w-26 h-3 bg-[#334322] rounded-t-xs flex justify-around px-2 pt-0.5 border-t border-[#161f0e]">
            <div className="w-3 h-1.5 bg-sky-300 rounded-xs" />
            <div className="w-3 h-1.5 bg-sky-300 rounded-xs" />
            <div className="w-3 h-1.5 bg-sky-300 rounded-xs" />
          </div>
          <div className="w-28 bg-[#526f34] py-0.5 flex items-center justify-center border-x-2 border-[#334322]">
            <span className="text-[0.42rem] font-bold text-emerald-100 tracking-wider">
              REGISTRAR
            </span>
          </div>
          <div className="w-28 h-18 bg-[#f4f0e6] border-x-2 border-[#b8ab92] shadow-md flex flex-col justify-between p-1.5">
            <div className="grid grid-cols-4 gap-1 h-full">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className={`${timeTheme.windowClass} flex items-center justify-center`}>
                  <div className="w-full h-0.2 bg-white/40" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Building 3: CSDL Pavilion (Far Left, ~3%, bottom-[28%]) */}
        <div className="absolute bottom-[28%] left-[3%] flex flex-col items-center opacity-90 z-1">
          <div className="w-20 h-3 bg-[#a8422b] rounded-t-xs border-t border-[#702a15]" />
          <div className="w-20 bg-[#702a15] py-0.5 flex items-center justify-center border-x-2 border-[#521c0e]">
            <span className="text-[0.42rem] font-bold text-amber-100 tracking-wider">
              CSDL
            </span>
          </div>
          <div className="w-20 h-13 bg-[#ede6d6] border-x-2 border-[#b8ab92] shadow-sm flex justify-around p-1.5">
            <div className="flex flex-col gap-1">
              <div className={`w-3.5 h-3.5 ${timeTheme.windowClass}`} />
              <div className={`w-3.5 h-3.5 ${timeTheme.windowClass}`} />
            </div>
            <div className="flex flex-col gap-1">
              <div className={`w-3.5 h-3.5 ${timeTheme.windowClass}`} />
              <div className={`w-3.5 h-3.5 ${timeTheme.windowClass}`} />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Top Status Badges Overlay */}
      <div className="relative z-30 p-2.5 flex items-center justify-between pointer-events-none">
        {/* Entry Counter Display */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/90 backdrop-blur border border-slate-200/80 shadow-xs">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[0.625rem] font-extrabold uppercase tracking-wider text-slate-700">
            {members.length} Total Enrolled
          </span>
        </div>

        {/* Active & Pending Tally */}
        <div className="flex items-center gap-1.5">
          <div className="px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[0.6rem] font-bold text-emerald-700 shadow-2xs">
            {activeCount} Active
          </div>
          {invites.length > 0 && (
            <div className="px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[0.6rem] font-bold text-amber-700 shadow-2xs">
              {invites.length} Pending
            </div>
          )}
        </div>
      </div>

      {/* 3. Perimeter Wrought-Iron Fence */}
      {/* 3a. Top Line Fence (Background, bottom-[18%], z-5, height: h-14) */}
      <div className="absolute bottom-[18%] inset-x-0 h-14 pointer-events-none z-5">
        {/* Top Horizontal Rail (Thin, right below spear points) */}
        <div className="absolute top-3 inset-x-0 h-1 bg-[var(--brand-color)] border-t border-b border-[#41572a] shadow-2xs z-6" />
        {/* Bottom Horizontal Rail (Thicker base rail) */}
        <div className="absolute bottom-1 inset-x-0 h-1.5 bg-[var(--brand-color)] border-t border-b border-[#41572a] shadow-xs z-6" />

        {/* Left Section Vertical Bars (Left edge up close to Left Pillar) */}
        <div className="absolute left-0 right-[45%] inset-y-0 flex justify-between pl-1 pr-0.5 z-5">
          {Array.from({ length: 13 }).map((_, i) => (
            <div key={`left-bar-${i}`} className="flex flex-col items-center h-full">
              <div className="w-1.5 h-2 bg-amber-400 clip-path-polygon shadow-2xs z-7" />
              <div className="w-1 h-full bg-[var(--brand-color)] border-x border-[#41572a]" />
            </div>
          ))}
        </div>

        {/* Right Section Vertical Bars (Right side of Left Pillar with matching gap) */}
        <div className="absolute left-[59%] right-0 inset-y-0 flex justify-between pl-1 pr-1 z-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={`right-bar-${i}`} className="flex flex-col items-center h-full">
              <div className="w-1.5 h-2 bg-amber-400 clip-path-polygon shadow-2xs z-7" />
              <div className="w-1 h-full bg-[var(--brand-color)] border-x border-[#41572a]" />
            </div>
          ))}
        </div>
      </div>

      {/* 3b. Foreground Fence on the BOTTOM LINE of the path (ONLY to the right of the right stone pole, bottom-0, z-30) */}
      <div className="absolute left-[78%] right-0 bottom-0 h-16 pointer-events-none z-30 pl-1">
        {/* Top Horizontal Rail (Thin) */}
        <div className="absolute top-3.5 inset-x-0 h-1.25 bg-[var(--brand-color)] border-t border-b border-[#41572a] shadow-xs z-31" />
        {/* Bottom Horizontal Rail (Thicker base rail) */}
        <div className="absolute bottom-1 inset-x-0 h-1.75 bg-[var(--brand-color)] border-t border-b border-[#41572a] shadow-sm z-31" />
        {/* Vertical Bars */}
        <div className="w-full h-full absolute inset-0 flex justify-between px-1 z-30">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center h-full">
              <div className="w-1.5 h-2.5 bg-amber-400 clip-path-polygon shadow-xs z-32" />
              <div className="w-1 h-full bg-[var(--brand-color)] border-x border-[#41572a]" />
            </div>
          ))}
        </div>
      </div>

      {/* 4. The Paved Sidewalk Ground (Reduced Path Height: 18%) */}
      <div className="absolute bottom-0 inset-x-0 h-[18%] bg-[#ece8dc] border-t-2 border-[#d3ccb8] shadow-inner z-10 flex flex-col justify-between overflow-hidden">
        {/* Flagstone paving joints */}
        <div className="w-full h-full opacity-40 flex">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="flex-1 border-r border-[#b0a894] h-full" />
          ))}
        </div>
        {/* Road Curb Edge */}
        <div className="absolute bottom-0 inset-x-0 h-1 bg-[#c8c0aa] border-t border-[#aba28c]" />
      </div>

      {/* 5. Walking Members Line (Evenly Spaced Across the Entire Walkway) */}
      <div className="absolute inset-0 z-20 pointer-events-auto overflow-hidden">
        {displayMembers.map((member, idx) => {
          const roleInfo = roleStyles[member.role] || roleStyles.Instructor;
          // Calculate precise time delay for perfectly even spacing across the screen
          const delay = -((idx / displayMembers.length) * loopDuration);

          return (
            <div
              key={`${member.id}-${idx}`}
              className="group/walker absolute bottom-[10%] flex flex-col items-center cursor-pointer transition-transform hover:z-50 hover:scale-110"
              style={{
                animation: `walkAcrossScreen ${loopDuration}s linear infinite`,
                animationDelay: `${delay}s`,
              }}
            >
              {/* Floating Tooltip on Hover */}
              <div className="absolute bottom-full mb-2 opacity-0 group-hover/walker:opacity-100 transition-all duration-200 pointer-events-none z-50 transform -translate-x-1/2 left-1/2 min-w-max">
                <div className="bg-slate-900/95 text-white p-2 rounded-xl shadow-xl border border-slate-700 text-left space-y-1">
                  <div className="flex items-center gap-2">
                    {member.avatar && !avatarErrors[member.avatar] ? (
                      <img
                        src={member.avatar}
                        alt=""
                        className="h-6 w-6 rounded-full object-cover ring-1 ring-white"
                        onError={() => setAvatarErrors(p => ({ ...p, [member.avatar]: true }))}
                      />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-slate-700 text-white flex items-center justify-center font-bold text-[0.6rem]">
                        {member.name ? member.name.charAt(0).toUpperCase() : <UserIcon className="h-3.5 w-3.5" />}
                      </div>
                    )}
                    <div>
                      <p className="text-[0.65rem] font-black leading-tight text-white">{member.name || 'Invited User'}</p>
                      <p className="text-[0.55rem] text-slate-400 leading-tight">{member.department || 'University'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 pt-0.5 border-t border-slate-800">
                    <span className={`px-1.5 py-0.2 rounded text-[0.55rem] font-bold ${roleInfo.badge}`}>
                      {roleInfo.label}
                    </span>
                    <span className={`px-1.5 py-0.2 rounded text-[0.55rem] font-bold ${member.status === 'Active' ? 'bg-emerald-950 text-emerald-300' : 'bg-amber-950 text-amber-300'}`}>
                      {member.status}
                    </span>
                  </div>
                </div>
                {/* Tooltip caret */}
                <div className="w-2 h-2 bg-slate-900 transform rotate-45 mx-auto -mt-1 border-r border-b border-slate-700" />
              </div>

              {/* Character Figure with 2D Walk Cycle */}
              <div
                className="flex flex-col items-center group-hover/walker:[animation-play-state:paused]"
                style={{ animation: 'bodyBobbing 0.5s ease-in-out infinite' }}
              >
                {/* Head / Circular Avatar */}
                <div className="relative z-20">
                  {member.avatar && !avatarErrors[member.avatar] ? (
                    <img
                      src={member.avatar}
                      alt=""
                      className="h-6 w-6 rounded-full object-cover ring-2 ring-white shadow-xs"
                      onError={() => setAvatarErrors(p => ({ ...p, [member.avatar]: true }))}
                    />
                  ) : (
                    <div className="h-6 w-6 rounded-full bg-slate-200 text-slate-700 ring-2 ring-white shadow-xs flex items-center justify-center font-black text-[0.6rem] uppercase">
                      {member.name ? member.name.charAt(0) : <UserIcon className="h-3.5 w-3.5" />}
                    </div>
                  )}
                  {/* Hanging Lanyard Strap & ID Card */}
                  <div className="absolute top-5 left-1/2 -translate-x-1/2 w-0.5 h-2.5 bg-[var(--brand-color)] z-30" />
                  <div
                    className="absolute top-6.5 left-1/2 -translate-x-1/2 w-2 h-2.5 bg-white rounded-xs shadow-2xs border border-slate-300 z-30 flex items-center justify-center"
                    style={{ animation: 'idCardTap 2.5s ease-in-out infinite' }}
                  >
                    <div className="w-1 h-0.5 bg-[var(--brand-color)]" />
                  </div>
                </div>

                {/* Torso / Role Outfit */}
                <div className={`relative z-10 w-4.5 h-4.5 rounded-t-sm ${roleInfo.body} shadow-2xs flex items-center justify-center mt-[-1px]`}>
                  {/* Arm / Accessory */}
                  <span className="absolute -right-1.5 top-0.5 text-[0.5rem] select-none">
                    {roleInfo.accessory}
                  </span>
                </div>

                {/* Legs (Animated 2D Walk Cycle) */}
                <div className="flex gap-[3px] -mt-[1px] z-0">
                  {/* Left Leg */}
                  <div
                    className={`w-1.5 h-3.5 rounded-b-xs ${roleInfo.pants} origin-top group-hover/walker:[animation-play-state:paused]`}
                    style={{ animation: 'legSwingLeft 0.5s ease-in-out infinite' }}
                  />
                  {/* Right Leg */}
                  <div
                    className={`w-1.5 h-3.5 rounded-b-xs ${roleInfo.pants} origin-top group-hover/walker:[animation-play-state:paused]`}
                    style={{ animation: 'legSwingRight 0.5s ease-in-out infinite' }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 6. The Two Campus Gate Pillars & Turnstile Security Station (3D Depth Placement) */}
      {/* Left Gate Pillar - On the TOP LINE of the path (Background, z-12) */}
      <div className="absolute left-[56%] bottom-[18%] z-12 pointer-events-none flex flex-col items-center">
        {/* Pillar Finial Sphere Top with Gold Accent */}
        <div className="w-4.5 h-4.5 rounded-full bg-[#dfd9cb] border-2 border-[#beb59f] shadow-md relative flex items-center justify-center -mb-0.5">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        </div>
        {/* Pillar Capital Molding */}
        <div className="w-7 h-2 bg-[#cfc8b7] border-y border-[#b3ab96] shadow-xs" />
        {/* Main Stone Pillar Shaft */}
        <div className="w-5.5 h-18 bg-[#dfd9cb] border-x border-[#beb59f] shadow-md flex flex-col items-center justify-center">
          {/* Recessed PHINMA Emblem Plate */}
          <div className="w-3 h-7 bg-[#cfc8b7] rounded-xs border border-[#b3ab96] shadow-inner flex items-center justify-center">
            <div className="w-2 h-2.5 bg-[var(--brand-color)] rounded-b-xs shadow-2xs flex items-center justify-center text-[0.35rem] text-amber-300 font-black">
              P
            </div>
          </div>
        </div>
        {/* Pillar Base Molding */}
        <div className="w-7 h-2 bg-[#cfc8b7] border-t border-[#b3ab96]" />
      </div>

      {/* Right Gate Pillar - On the BOTTOM LINE of the path (Foreground, z-30) */}
      <div className="absolute left-[73%] bottom-0 z-30 pointer-events-none flex flex-col items-center">
        {/* Pillar Finial Sphere Top */}
        <div className="w-5.5 h-5.5 rounded-full bg-[#dfd9cb] border-2 border-[#beb59f] shadow-lg relative flex items-center justify-center -mb-0.5">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        </div>
        {/* Pillar Capital Molding */}
        <div className="w-8.5 h-2.5 bg-[#cfc8b7] border-y border-[#b3ab96] shadow-sm" />
        {/* Main Stone Pillar Shaft (Foreground scale) */}
        <div className="w-6.5 h-20 bg-[#dfd9cb] border-x border-[#beb59f] shadow-lg flex flex-col items-center justify-center">
          <div className="w-3.5 h-8 bg-[#cfc8b7] rounded-xs border border-[#b3ab96] shadow-inner" />
        </div>
        {/* Pillar Base Molding */}
        <div className="w-8.5 h-3 bg-[#cfc8b7] border-t border-[#b3ab96] shadow-xs" />
      </div>
    </div>
  );
}
