import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

type LiquidType = 'Water' | 'Coffee' | 'Blood' | 'Mud' | 'Slime'
type SelectedLiquid = LiquidType | 'Random'
type FactoryJar = {
  id: number
  position: number
  fillStatus: 'empty' | 'filling' | 'full' | 'labeled'
  buildingIndex: number
  liquidType?: LiquidType
}

interface TotalCapacityVisualProps {
  buildings: Array<{ code: string; capacity: number }>
  jars: FactoryJar[]
  setJars: Dispatch<SetStateAction<FactoryJar[]>>
  waterKey: number
  setWaterKey: Dispatch<SetStateAction<number>>
  isJarsMoving: boolean
  setIsJarsMoving: Dispatch<SetStateAction<boolean>>
  selectedLiquid: SelectedLiquid
  isAutoMode: boolean
  nextBuildingIndex: number
  setNextBuildingIndex: Dispatch<SetStateAction<number>>
  hoveredJarId: number | null
  setHoveredJarId: Dispatch<SetStateAction<number | null>>
  isHoveringTooltipBlock: boolean
  setIsHoveringTooltipBlock: Dispatch<SetStateAction<boolean>>
  hoverTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
}

const liquidColors: Record<LiquidType, { main: string; light: string }> = {
  Water: { main: 'bg-blue-400', light: 'bg-blue-300' },
  Coffee: { main: 'bg-red-950', light: 'bg-red-900' },
  Blood: { main: 'bg-red-600', light: 'bg-red-500' },
  Mud: { main: 'bg-stone-700', light: 'bg-stone-600' },
  Slime: { main: 'bg-lime-500', light: 'bg-lime-400' },
}

export function TotalCapacityVisual({
  buildings,
  jars,
  setJars,
  waterKey,
  setWaterKey,
  isJarsMoving,
  setIsJarsMoving,
  selectedLiquid,
  isAutoMode,
  nextBuildingIndex,
  setNextBuildingIndex,
  hoveredJarId,
  setHoveredJarId,
  isHoveringTooltipBlock,
  setIsHoveringTooltipBlock,
  hoverTimeoutRef,
}: TotalCapacityVisualProps) {
  return (
            <div className="flex-1 w-full relative aspect-[16/9]">
              <div className="absolute inset-0 rounded-xl border-[4px] border-slate-600 bg-slate-700 overflow-hidden">
                <div className="absolute inset-0 overflow-hidden shadow-[inset_0_0_50px_rgba(0,0,0,0.5)]">
                  {/* Factory Environment Background */}
                  <div className="absolute inset-0 pointer-events-none z-0">
                    {/* Subtle Grid / Tile Pattern */}
                    <div className="absolute inset-0 opacity-[0.15]" style={{ backgroundImage: 'linear-gradient(#000000 1px, transparent 1px), linear-gradient(90deg, #000000 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

                    {/* Support Beams (Vertical) */}
                    <div className="absolute top-0 bottom-0 left-[12%] w-16 bg-gradient-to-r from-slate-800 via-slate-600 to-slate-800 border-x border-slate-900 shadow-2xl flex justify-center">
                      <div className="w-1/2 h-full bg-[repeating-linear-gradient(0deg,transparent,transparent_40px,rgba(0,0,0,0.3)_40px,rgba(0,0,0,0.3)_44px)]"></div>
                    </div>
                    <div className="absolute top-0 bottom-0 right-[18%] w-20 bg-gradient-to-r from-slate-800 via-slate-600 to-slate-800 border-x border-slate-900 shadow-2xl flex justify-center">
                      <div className="w-1/2 h-full bg-[repeating-linear-gradient(0deg,transparent,transparent_40px,rgba(0,0,0,0.3)_40px,rgba(0,0,0,0.3)_44px)]"></div>
                    </div>

                    {/* Ceiling Structural Beam */}
                    <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-slate-800 to-slate-700 border-b-[3px] border-slate-900 shadow-xl flex items-center justify-between px-8 z-10">
                      {/* Vents */}
                      <div className="flex gap-4">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="w-12 h-6 bg-slate-900 rounded-sm border border-slate-700 shadow-inner flex flex-col justify-around p-1">
                            <div className="w-full h-[1.5px] bg-black/60 rounded"></div>
                            <div className="w-full h-[1.5px] bg-black/60 rounded"></div>
                            <div className="w-full h-[1.5px] bg-black/60 rounded"></div>
                          </div>
                        ))}
                      </div>

                      {/* Industrial Indicator Lights */}
                      <div className="flex gap-4 p-2 bg-slate-900 rounded-lg border border-slate-800 shadow-[inset_0_0_8px_rgba(0,0,0,0.8)]">
                        <div className={`w-3 h-3 rounded-full border border-black ${jars.find(j => j.position === 0)?.fillStatus !== 'filling' && !isJarsMoving ? 'bg-red-500 shadow-[0_0_12px_#ef4444]' : 'bg-red-950 opacity-40'}`} title="Idle / Stopped"></div>
                        <div className={`w-3 h-3 rounded-full border border-black ${jars.find(j => j.position === 0)?.fillStatus === 'filling' ? 'bg-amber-400 shadow-[0_0_12px_#fbbf24]' : 'bg-amber-950 opacity-40'}`} title="Filling"></div>
                        <div className={`w-3 h-3 rounded-full border border-black ${isJarsMoving ? 'bg-emerald-400 shadow-[0_0_12px_#34d399]' : 'bg-emerald-950 opacity-40'}`} title="Moving"></div>
                      </div>
                    </div>

                    {/* Hazard Tape along bottom */}
                    <div className="absolute bottom-0 left-0 right-0 h-2.5 bg-[repeating-linear-gradient(45deg,#fbbf24,#fbbf24_15px,#000_15px,#000_30px)] opacity-70 z-10"></div>
                  </div>

                  <style>{`
                  @keyframes conveyorMoveMain {
                    0% { background-position: 0 0; }
                    100% { background-position: -3rem 0; }
                  }
                  @keyframes conveyorMoveBg {
                    0% { background-position: 0 0; }
                    100% { background-position: -2rem 0; }
                  }
                  @keyframes waterStreamFlow {
                    0% { background-position: 0 0; }
                    100% { background-position: 0 20px; }
                  }
                  @keyframes jarFill {
                    0% { height: 0%; }
                    8% { height: 0%; }
                    90% { height: 90%; }
                    100% { height: 90%; }
                  }
                  @keyframes pipeStreamClip {
                    0% { clip-path: inset(0 0 100% 0); opacity: 1; }
                    8% { clip-path: inset(0 0 0 0); opacity: 1; }
                    82% { clip-path: inset(0 0 0 0); opacity: 1; }
                    90% { clip-path: inset(100% 0 0 0); opacity: 1; }
                    91% { clip-path: inset(100% 0 0 0); opacity: 0; }
                    100% { clip-path: inset(100% 0 0 0); opacity: 0; }
                  }


                  @keyframes labelWipe {
                    0% { clip-path: inset(0 100% 0 0); }
                    100% { clip-path: inset(0 0 0 0); }
                  }
                `}</style>
                  <div className="absolute top-3 left-3 z-20 bg-white/90 backdrop-blur px-2 py-1 rounded-md shadow-sm border border-slate-100 flex flex-col items-center pointer-events-none">
                    <span className="text-sm font-black text-slate-800 leading-none">
                      {buildings.reduce((acc, b) => acc + (b.capacity || 0), 0)}
                    </span>
                    <span className="text-[0.5rem] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">Total</span>
                  </div>
                  {/* Background Conveyor Belt System */}
                  <div className="absolute bottom-19.5 -left-4 -right-4 h-2.5 border-b-[3px] border-black/80 shadow-xl overflow-hidden bg-black flex z-0 opacity-80">
                    <div
                      className="w-full h-full"
                      style={{
                        background: 'repeating-linear-gradient(90deg, #94a3b8 0rem, #94a3b8 0.3rem, #262626 0.3rem, #262626 2rem)',
                        backgroundSize: '2rem 100%',
                        animation: 'conveyorMoveBg 1.524s linear infinite reverse',
                        animationPlayState: isJarsMoving ? 'running' : 'paused'
                      }}
                    />
                  </div>

                  {/* Background Infinite Jars */}
                  {jars.map(jar => {
                    if (jar.position > 19 || jar.position < 0) return null;
                    const leftVal = `calc(50% + ${(9 - jar.position) * 3.5}rem)`;

                    const building = buildings.length > 0 ? buildings[jar.buildingIndex % buildings.length] : null;
                    const displayCode = building ? building.code : 'JAR';
                    const displayCap = building ? building.capacity || 0 : 0;

                    return (
                      <div
                        key={`bg-${jar.id}`}
                        className="group/bgjar absolute bottom-[5.2rem] w-12 h-16 z-0 opacity-60 scale-90"
                        style={{
                          left: leftVal,
                          transition: 'left 2.667s linear',
                        }}
                        onMouseEnter={() => {
                          if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                          setHoveredJarId(-jar.id);
                          setIsHoveringTooltipBlock(true);
                        }}
                        onMouseLeave={() => {
                          if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                          setHoveredJarId(null);
                          hoverTimeoutRef.current = setTimeout(() => {
                            setIsHoveringTooltipBlock(false);
                          }, 1500);
                        }}
                      >
                        <div className="relative w-full h-full">
                          {/* Jar Lid/Rim */}
                          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-8 h-1.5 bg-white/60 border border-white/80 rounded-t-sm" />
                          {/* Jar Neck */}
                          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-6 h-1 bg-white/50 border-l border-r border-white/70" />
                          {/* Jar Body */}
                          <div className="absolute top-3.5 inset-x-0 bottom-0 bg-white/10 border-2 border-white/70 rounded-b-lg rounded-t-md overflow-hidden shadow-[inset_0_0_12px_rgba(255,255,255,0.9)] backdrop-blur-[1px]">
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Main Conveyor Belt System */}
                  <div className="absolute bottom-6 -left-2 -right-2 h-4 border-b-[4px] border-black shadow-[0_10px_20px_rgba(0,0,0,0.8)] overflow-hidden bg-black flex">
                    <div
                      className="w-full h-full"
                      style={{
                        background: 'repeating-linear-gradient(90deg, #cbd5e1 0rem, #cbd5e1 0.5rem, #171717 0.5rem, #171717 3rem)',
                        backgroundSize: '3rem 100%',
                        animation: 'conveyorMoveMain 1.6s linear infinite',
                        animationPlayState: isJarsMoving ? 'running' : 'paused'
                      }}
                    />
                  </div>

                  {/* Water Pipe */}
                  <div
                    className={`absolute top-0 bottom-[30px] left-1/2 -ml-4 w-8 z-0 pointer-events-none`}
                  >
                    {/* Visual Pipe (Fixed Height) */}
                    <div
                      className={`absolute top-0 left-1 right-1 h-10 bg-slate-400 border-x-2 border-b-2 border-slate-600 rounded-b-sm bg-gradient-to-r from-slate-400 via-slate-300 to-slate-500 shadow-md z-10 pointer-events-auto transition-transform origin-top ${jars.some(j => j.position === 0 && j.fillStatus === 'empty') && !isJarsMoving
                        ? 'cursor-pointer hover:scale-110 active:scale-95'
                        : ''
                        }`}
                      onClick={() => {
                        if (isJarsMoving) return;
                        const centerJar = jars.find(j => j.position === 0);
                        if (!centerJar || centerJar.fillStatus !== 'empty') return;

                        const actualLiquid: LiquidType = selectedLiquid === 'Random'
                          ? ['Water', 'Coffee', 'Blood', 'Mud', 'Slime'][Math.floor(Math.random() * 5)] as LiquidType
                          : selectedLiquid as LiquidType;

                        setJars(prev => prev.map(j => j.id === centerJar.id ? { ...j, fillStatus: 'filling', liquidType: actualLiquid } : j));
                        setWaterKey(prev => prev + 1);

                        setTimeout(() => {
                          setJars(prev => prev.map(j => j.id === centerJar.id ? { ...j, fillStatus: 'full' } : j));
                        }, 13500);
                      }}
                    >
                      {/* Pipe Rim */}
                      <div className="absolute -bottom-1 -left-1 -right-1 h-2 bg-slate-500 border-2 border-slate-700 rounded-sm"></div>
                    </div>

                    {/* Continuous water stream (Stretches from pipe to jar) */}
                    <div
                      key={`stream-${waterKey}`}
                      className={`absolute top-8 bottom-0 left-3 right-3 blur-[0.5px] z-0 ${waterKey === 0
                        ? 'hidden'
                        : liquidColors[(jars.find(j => j.position === 0)?.liquidType as LiquidType) || 'Water'].main
                        }`}
                      style={{
                        backgroundImage: 'repeating-linear-gradient(to bottom, transparent, transparent 10px, rgba(255,255,255,0.4) 10px, rgba(255,255,255,0.4) 20px)',
                        backgroundSize: '100% 20px',
                        animation: waterKey > 0 ? 'waterStreamFlow 0.3s linear infinite, pipeStreamClip 15s linear forwards' : 'none',
                      }}
                    ></div>
                  </div>

                  {jars.map(jar => {
                    if (jar.position > 7 || jar.position < -7) return null;
                    const leftVal = `calc(50% + ${jar.position * 5 - 2}rem)`;

                    const isCenter = jar.position === 0;
                    const isFull = jar.fillStatus === 'full';

                    const building = buildings.length > 0 ? buildings[jar.buildingIndex % buildings.length] : null;
                    const displayCode = building ? building.code : 'JAR';
                    const displayCap = building ? building.capacity || 0 : 0;

                    const isWaitingForAction = isCenter && !isJarsMoving && (isAutoMode || jar.fillStatus === 'empty' || jar.fillStatus === 'full');

                    return (
                      <div
                        key={jar.id}
                        className={`group/jar absolute bottom-9 w-16 h-20 z-10 ${(isCenter && isFull) ? 'cursor-pointer transition-transform hover:scale-105 active:scale-95' : ''
                          }`}
                        style={{
                          left: leftVal,
                          transition: 'left 2.667s linear',
                        }}
                        onMouseEnter={() => {
                          if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                          setHoveredJarId(jar.id);
                          setIsHoveringTooltipBlock(true);
                        }}
                        onMouseLeave={() => {
                          if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                          setHoveredJarId(null);
                          hoverTimeoutRef.current = setTimeout(() => {
                            setIsHoveringTooltipBlock(false);
                          }, 1500);
                        }}
                        onClick={() => {
                          if (isAutoMode) return;
                          if (isCenter && isFull && !isJarsMoving) {
                            setJars(prev => prev.map(j => j.id === jar.id ? { ...j, fillStatus: 'labeled' } : j));

                            setTimeout(() => {
                              setIsJarsMoving(true);
                              setTimeout(() => setIsJarsMoving(false), 2667);

                              const newId = Date.now() + Math.random();
                              setJars(prev => {
                                const nextJars = prev.map(j => ({ ...j, position: j.position - 1 }));

                                nextJars.push({
                                  id: newId,
                                  position: 19,
                                  fillStatus: 'empty',
                                  buildingIndex: nextBuildingIndex
                                });

                                setNextBuildingIndex(prev => prev + 1);

                                return nextJars.filter(j => j.position >= -7);
                              });
                            }, 1000);
                          }
                        }}
                      >
                        <div
                          className="relative w-full h-full"
                        >
                          {/* Jar Lid/Rim */}
                          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-10 h-2 bg-white/60 border border-white/80 rounded-t-sm z-10" />
                          {/* Jar Neck */}
                          <div className="absolute top-3.5 left-1/2 -translate-x-1/2 w-8 h-1.5 bg-white/50 border-l border-r border-white/70 z-10" />
                          {/* Jar Body */}
                          <div className="absolute top-[14px] inset-x-0 bottom-0 bg-white/10 border-2 border-white/70 rounded-b-xl rounded-t-lg overflow-hidden shadow-[inset_0_0_16px_rgba(255,255,255,0.9)] backdrop-blur-[1px]">
                            {/* Liquid Fill */}
                            <div
                              className={`absolute bottom-0 left-0 right-0 ${jar.liquidType ? liquidColors[jar.liquidType].main : 'bg-transparent'}`}
                              style={{
                                animation: jar.fillStatus === 'filling' ? 'jarFill 15s linear forwards' : 'none',
                                height: (jar.fillStatus === 'full' || jar.fillStatus === 'labeled') ? '90%' : (jar.fillStatus === 'empty' ? '0%' : undefined)
                              }}
                            >
                              <div className={`absolute top-0 left-0 right-0 h-1 ${jar.liquidType ? liquidColors[jar.liquidType].light : 'bg-transparent'}`}></div>
                            </div>

                            {/* Bottle Label */}
                            {jar.fillStatus === 'labeled' && (
                              <div
                                className="absolute top-[45%] inset-x-0 -translate-y-1/2 h-7 rounded-[1px] border-y-[1.5px] border-[#62853e]/70 shadow-[inset_0_1px_2px_rgba(255,255,255,0.9),inset_0_-1px_2px_rgba(0,0,0,0.2),0_2px_5px_rgba(0,0,0,0.3)] flex items-center justify-between px-1 overflow-hidden transition-all duration-300 z-10 select-none"
                                style={{
                                  background: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.025) 0px, rgba(0,0,0,0.025) 1px, transparent 1px, transparent 3px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.025) 0px, rgba(0,0,0,0.025) 1px, transparent 1px, transparent 3px), linear-gradient(to bottom, #fefcf8 0%, #f4eee2 50%, #e7decb 100%)',
                                  ...(jar.position === 0 ? { animation: 'labelWipe 1s ease-out forwards' } : { clipPath: 'inset(0 0 0 0)' })
                                }}
                              >
                                {/* Cylindrical Curve Reflection & Highlight Overlay */}
                                <div
                                  className="absolute inset-0 pointer-events-none z-10"
                                  style={{
                                    background: 'linear-gradient(90deg, rgba(0,0,0,0.22) 0%, rgba(255,255,255,0.45) 15%, transparent 40%, transparent 60%, rgba(255,255,255,0.45) 85%, rgba(0,0,0,0.22) 100%)'
                                  }}
                                />

                                {/* Micro Barcode Texture (Left) */}
                                <div className="flex items-center gap-[1px] h-3.5 opacity-50 shrink-0 pointer-events-none">
                                  <div className="w-[1.5px] h-full bg-slate-900" />
                                  <div className="w-[0.75px] h-full bg-slate-900" />
                                  <div className="w-[2px] h-full bg-slate-900" />
                                  <div className="w-[0.75px] h-full bg-slate-900" />
                                  <div className="w-[1px] h-full bg-slate-900" />
                                </div>

                                {/* Micro Building Code Batch Stamp Texture (Center & Right) */}
                                <div className="flex-1 ml-0.5 h-5 my-auto flex items-center justify-center border border-amber-800/60 rounded-[2px] px-0.5 bg-amber-700/10 shadow-[0_0_2px_rgba(146,64,14,0.2)] pointer-events-none z-10 opacity-90 overflow-hidden">
                                  <span className="text-[0.7rem] font-black text-amber-950 tracking-tighter truncate w-full text-center leading-none uppercase drop-shadow-[0_0.5px_0_rgba(255,255,255,0.7)] flex items-center justify-center h-full">
                                    {displayCode}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div> {/* End Factory Inner Container */}
              </div> {/* End overflow-hidden factory visual */}

              {/* Global Tooltips Layer (Outside overflow-hidden) */}
              <div className="absolute inset-0 pointer-events-none z-[100]">
                {jars.map(jar => {
                  const building = buildings.length > 0 ? buildings[jar.buildingIndex % buildings.length] : null;
                  const displayCode = building ? building.code : 'JAR';
                  const displayCap = building ? building.capacity || 0 : 0;

                  // Background Jar Tooltip
                  if (jar.position >= 0 && jar.position <= 19) {
                    const bgLeftVal = `calc(50% + ${(9 - jar.position) * 3.5}rem)`;
                    return (
                      <div
                        key={`bg-tooltip-${jar.id}`}
                        className={`absolute bottom-[5.2rem] w-12 h-16 scale-90 transition-all duration-300 pointer-events-none ${hoveredJarId === -jar.id ? 'opacity-100' : 'opacity-0'
                          }`}
                        style={{ left: bgLeftVal, transition: 'left 2.667s linear' }}
                      >
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white/95 text-slate-800 text-[0.55rem] font-bold px-1.5 py-0.5 rounded shadow-md">
                          {displayCode}: {displayCap}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-[4px] border-transparent border-t-white/95"></div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })}

                {jars.map(jar => {
                  if (jar.position > 7 || jar.position < -7) return null;

                  const building = buildings.length > 0 ? buildings[jar.buildingIndex % buildings.length] : null;
                  const displayCode = building ? building.code : 'JAR';
                  const displayCap = building ? building.capacity || 0 : 0;

                  const isCenter = jar.position === 0;
                  const fgLeftVal = `calc(50% + ${jar.position * 5 - 2}rem)`;
                  const isWaitingForAction = isCenter && !isJarsMoving && (isAutoMode || jar.fillStatus === 'empty' || jar.fillStatus === 'full');

                  return (
                    <div
                      key={`fg-tooltip-${jar.id}`}
                      className={`absolute bottom-9 w-16 h-20 transition-all duration-200 pointer-events-none ${hoveredJarId === jar.id ? 'opacity-100' :
                        (isHoveringTooltipBlock ? 'opacity-0' :
                          (isWaitingForAction ? 'opacity-100' : 'opacity-0'))
                        }`}
                      style={{ left: fgLeftVal, transition: 'left 2.667s linear' }}
                    >
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white text-slate-800 text-xs font-bold px-2 py-1 rounded shadow-lg">
                        {displayCode}: {displayCap} Capacity
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-white"></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
  )
}

