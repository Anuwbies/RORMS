import { useEffect, useRef, useState } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import type { Member } from '../types/member'

interface Department {
  code: string
}

interface WheelTooltip {
  visible: boolean
  x: number
  y: number
  text: string
}

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

export function TotalMembersVisual({ departments, allUsers, onWheelTooltipChange }: { departments: Department[]; allUsers: Member[]; onWheelTooltipChange: (tooltip: WheelTooltip | null) => void }) {
  const [wheelRotation, setWheelRotation] = useState(0)
  const [isSpinning, setIsSpinning] = useState(false)
  const [userCoins, setUserCoins] = useState<number | null>(null)
  const [userLevel, setUserLevel] = useState<number>(1)
  const [userXp, setUserXp] = useState<number>(0)
  const [lastClaimedDaily, setLastClaimedDaily] = useState<string | null>(null)
  const [prizeToast, setPrizeToast] = useState<{ text: string, color: string } | null>(null)
  const [prizeOffset, setPrizeOffset] = useState(0)
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


  return (
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
                                     onWheelTooltipChange({
                                       visible: true,
                                       x: e.clientX,
                                       y: e.clientY,
                                       text: tooltipText
                                     });
                                   };
                                   const handleMouseLeave = () => onWheelTooltipChange(null);

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
  )
}
