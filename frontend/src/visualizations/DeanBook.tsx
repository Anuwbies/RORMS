import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import type { Member } from '../types/member'

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
export const ANOMALY_NAMES = [
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

interface DeanBookPageProps {
  data?: any;
  isLeft?: boolean;
  pageNumber?: number | string;
}

export const DeanBookPage = ({ data, isLeft, pageNumber }: DeanBookPageProps) => {
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

export const DeanBook = ({ departments, allUsers, isEasterEggsEnabled, selectedAnomalies }: DeanBookProps) => {
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

    const validSelected = selectedAnomalies.filter(e => typeof e === 'number' && e >= 1 && e <= ANOMALY_NAMES.length);
    const availableEggs = Array.from({ length: ANOMALY_NAMES.length }, (_, i) => i + 1).filter(e => !validSelected.includes(e));
    
    // Shuffle selected anomalies so they get distributed randomly across departments
    const forcedEggs = [...validSelected];
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


