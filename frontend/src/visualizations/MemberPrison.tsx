import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Member } from '../types/member'

export function getPrisonResidents(members: Member[]) {
  // Memberships can repeat a person; pending reactivation takes precedence.
  const people = new Map<string, Member>()
  for (const member of members) {
    const key = member.email.trim().toLowerCase() || member.id
    if (!people.has(key) || member.status === 'Pending') people.set(key, member)
  }
  return {
    prisoners: [...people.values()].filter(member => member.status === 'Deactivated'),
    guards: [...people.values()].filter(member => member.status === 'Pending'),
  }
}

function ColoredPerson({ member, color, scale }: { member: Member; color: string; scale: number }) {
  return (
    <g>
      <title>{`${member.name || member.email} — ${member.status}`}</title>
      <g transform={`translate(0 44) scale(${scale}) translate(0 -44)`}>
        {/* Interior color sits behind the original SVG, preserving its black outline. */}
        <circle cy="-6" r="6" fill={color} />
        <path d="M-6 6H6a6 6 0 0 1 6 6v11H7v17a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4V23h-5V12a6 6 0 0 1 6-6Z" fill={color} />
        <image href="/member-prison/person.svg" x="-32" y="-16" width="64" height="64" />
      </g>
    </g>
  )
}

function Person({ member }: { member: Member }) {
  return <ColoredPerson member={member} color="#f97316" scale={1.35} />
}

function PoliceOfficer({ member }: { member: Member }) {
  return <ColoredPerson member={member} color="#2563eb" scale={1.6} />
}

function getPatrolTransform(x: number, y: number) {
  // Shared scene depth: feet at 206 are farthest away; feet at 305 are closest.
  // Adjust these multipliers to strengthen or soften the perspective effect.
  const feetY = y + 44
  const depth = Math.max(0, Math.min(1, (feetY - 206) / (305 - 206)))
  const perspectiveScale = 0.9 + depth * 0.25
  // Scale around the feet so changing height never lifts the person off the floor.
  return `translate(${x} ${feetY}) scale(${perspectiveScale}) translate(0 -44)`
}

function formatCameraTimestamp(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function Patrol({ startX, startY, minX, maxX, minY, maxY, speed, children }: {
  startX: number
  startY: number
  minX: number
  maxX: number
  minY: number
  maxY: number
  speed: number
  children: ReactNode
}) {
  const groupRef = useRef<SVGGElement>(null)
  const walkingRef = useRef<SVGGElement>(null)

  useEffect(() => {
    let frame = 0
    let previousTime: number | undefined
    let x = startX
    let y = startY
    let stepPhase = 0
    let destination: { x: number; y: number } | null = null
    const chooseWait = () => 1000 + Math.random() * 4000
    let waitRemaining = chooseWait()
    const walk = (time: number) => {
      // Resume smoothly after a background tab instead of jumping across the floor.
      const elapsed = previousTime === undefined ? 0 : Math.min(time - previousTime, 50)
      previousTime = time
      let moving = false
      if (destination === null) {
        waitRemaining -= elapsed
        // Choose a fresh X/Y destination only after the arrival cooldown finishes.
        if (waitRemaining <= 0) {
          destination = {
            x: minX + Math.random() * (maxX - minX),
            y: minY + Math.random() * (maxY - minY),
          }
        }
      } else {
        const dx = destination.x - x
        const dy = destination.y - y
        const distance = Math.hypot(dx, dy)
        const step = speed * elapsed / 1000
        if (distance <= step) {
          x = destination.x
          y = destination.y
          destination = null
          waitRemaining = chooseWait()
        } else {
          x += dx / distance * step
          y += dy / distance * step
          moving = step > 0
        }
      }
      // Only the figure rocks and bobs; its sibling shadow stays on the floor.
      // Tilt is in degrees and bob height is in scene units before perspective scaling.
      if (moving) stepPhase += elapsed / 1000 * Math.PI * 3
      else stepPhase = 0
      const tilt = moving ? Math.sin(stepPhase) * 3.5 : 0
      const bob = moving ? -Math.abs(Math.sin(stepPhase)) * 1.6 : 0
      walkingRef.current?.setAttribute('transform', `translate(0 ${44 + bob}) rotate(${tilt}) translate(0 -44)`)
      if (groupRef.current) {
        groupRef.current.setAttribute('transform', getPatrolTransform(x, y))
        groupRef.current.dataset.patrolDepth = y.toString()
      }
      frame = requestAnimationFrame(walk)
    }
    frame = requestAnimationFrame(walk)
    return () => cancelAnimationFrame(frame)
  }, [startX, startY, minX, maxX, minY, maxY, speed])

  return (
    <g ref={groupRef} data-patrol-depth={startY} transform={getPatrolTransform(startX, startY)}>
      {/* Separate from the person asset and walking transform; follows position and perspective only. */}
      <ellipse aria-hidden="true" className="pointer-events-none" cx="0" cy="44" rx="18" ry="3" fill="#020617" opacity="0.25" />
      <g ref={walkingRef}>{children}</g>
    </g>
  )
}

function DepthSortedLayer({ children }: { children: ReactNode }) {
  const layerRef = useRef<SVGGElement>(null)

  useEffect(() => {
    let frame = 0

    const sortByDepth = () => {
      const layer = layerRef.current
      if (layer && layer.children.length > 1) {
        const currentOrder = Array.from(layer.children) as SVGGElement[]
        const depthOrder = [...currentOrder].sort((first, second) => (
          Number(first.dataset.patrolDepth) - Number(second.dataset.patrolDepth)
        ))

        if (depthOrder.some((actor, index) => actor !== currentOrder[index])) {
          // SVG paints later siblings on top, so the largest Y (closest actor) is appended last.
          depthOrder.forEach(actor => layer.appendChild(actor))
        }
      }

      frame = requestAnimationFrame(sortByDepth)
    }

    frame = requestAnimationFrame(sortByDepth)
    return () => cancelAnimationFrame(frame)
  }, [])

  return <g ref={layerRef}>{children}</g>
}

export function MemberPrison({ members }: { members: Member[] }) {
  const cameraId = useId().replace(/:/g, '')
  const { prisoners, guards } = getPrisonResidents(members)
  const [page, setPage] = useState(0)
  const [cameraTime, setCameraTime] = useState(() => new Date())
  const [cameraGlitch, setCameraGlitch] = useState<{
    firstY: number
    secondY: number
    shift: number
    seed: number
    level: 'soft' | 'medium' | 'hard'
  } | null>(null)
  const pages = Math.max(1, Math.ceil(prisoners.length / 6), Math.ceil(guards.length / 4))
  const currentPage = Math.min(page, pages - 1)
  const visiblePrisoners = prisoners.slice(currentPage * 6, currentPage * 6 + 6)
  const visibleGuards = guards.slice(currentPage * 4, currentPage * 4 + 4)

  useEffect(() => {
    const clock = window.setInterval(() => setCameraTime(new Date()), 1000)
    return () => window.clearInterval(clock)
  }, [])

  useEffect(() => {
    let nextGlitch: number | undefined
    let clearGlitch: number | undefined

    const scheduleGlitch = () => {
      nextGlitch = window.setTimeout(() => {
        const levelRoll = Math.random()
        const level = levelRoll < 0.5 ? 'soft' : levelRoll < 0.82 ? 'medium' : 'hard'

        setCameraGlitch({
          firstY: 42 + Math.random() * 220,
          secondY: 70 + Math.random() * 210,
          shift: 5 + Math.random() * 12,
          seed: Math.floor(Math.random() * 1000),
          level,
        })

        clearGlitch = window.setTimeout(() => {
          setCameraGlitch(null)
          scheduleGlitch()
        }, level === 'soft'
          ? 140 + Math.random() * 160
          : level === 'medium'
            ? 280 + Math.random() * 320
            : 520 + Math.random() * 480)
      }, 5000 + Math.random() * 9000)
    }

    scheduleGlitch()

    return () => {
      if (nextGlitch !== undefined) window.clearTimeout(nextGlitch)
      if (clearGlitch !== undefined) window.clearTimeout(clearGlitch)
    }
  }, [])

  const glitchSettings = cameraGlitch
    ? cameraGlitch.level === 'soft'
      ? {
          filter: 'contrast(1.08) saturate(0.85)',
          darkness: 0.08,
          noise: 0.16,
          primaryBand: 0.34,
          secondaryBand: 0,
          chromatic: 0.32,
        }
      : cameraGlitch.level === 'medium'
        ? {
            filter: 'contrast(1.3) saturate(0.52)',
            darkness: 0.38,
            noise: 0.44,
            primaryBand: 0.72,
            secondaryBand: 0.58,
            chromatic: 0.64,
          }
        : {
            filter: 'contrast(1.65) saturate(0.18)',
            darkness: 0.82,
            noise: 0.72,
            primaryBand: 0.96,
            secondaryBand: 0.9,
            chromatic: 0.95,
          }
    : null

  return (
    <div className="absolute inset-0 overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
      <svg
        viewBox="0 0 600 340"
        className="h-full w-full"
        role="img"
        aria-label={`Inside one shared prison cell: ${prisoners.length} deactivated members behind bars and ${guards.length} pending members patrolling the indoor corridor.`}
        style={glitchSettings ? { filter: glitchSettings.filter } : undefined}
      >
        <defs>
          <pattern id={`${cameraId}-scanlines`} width="4" height="4" patternUnits="userSpaceOnUse">
            <rect y="3" width="4" height="1" fill="#dbeafe" opacity="0.08" />
          </pattern>
          <radialGradient id={`${cameraId}-vignette`} cx="50%" cy="48%" r="72%">
            <stop offset="58%" stopColor="#020617" stopOpacity="0" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0.7" />
          </radialGradient>
          <filter id={`${cameraId}-static`} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.72 1.08"
              numOctaves="1"
              seed={cameraGlitch?.seed ?? 1}
              stitchTiles="stitch"
            >
              <animate attributeName="baseFrequency" values="0.72 1.08;0.94 1.3;0.8 1.18;0.72 1.08" dur="0.12s" repeatCount="indefinite" />
            </feTurbulence>
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncR type="discrete" tableValues="0 0 0.08 0.22 0.48 0.76 1" />
              <feFuncG type="discrete" tableValues="0 0 0.08 0.22 0.48 0.76 1" />
              <feFuncB type="discrete" tableValues="0 0 0.08 0.22 0.48 0.76 1" />
            </feComponentTransfer>
          </filter>
        </defs>
        <rect width="600" height="340" fill="#0f172a" />
        {/* Enclosed room: ceiling, side walls, and a recessed concrete cell wall. */}
        <path d="M0 0h600l-26 58H26Z" fill="#1e293b" />
        <path d="M0 0l26 58v180L0 310Z" fill="#334155" />
        <path d="M600 0l-26 58v180l26 72Z" fill="#334155" />
        <path d="M26 58h548v180H26Z" fill="#64748b" />
        {[84, 117, 150, 183, 216].map((y, row) => (
          <g key={y} stroke="#475569" strokeWidth="1.5">
            <path d={`M26 ${y}h548`} />
            {[0, 1, 2, 3, 4, 5, 6].map(column => {
              const x = 42 + column * 80 + (row % 2) * 32
              return <path key={column} d={`M${x} ${y - 26}v26`} />
            })}
          </g>
        ))}
        <path d="M26 58h548M26 238h548" stroke="#0f172a" strokeWidth="7" />
        <path d="M130 0l32 58M470 0l-32 58M0 21h600" stroke="#475569" strokeWidth="3" />
        {/* Exposed conduit and fluorescent fixtures cast light into the corridor. */}
        <path d="M34 72h532v19" fill="none" stroke="#94a3b8" strokeWidth="3" />
        {[115, 485].map(x => {
          const perspectiveShift = x < 300 ? 7 : -7
          return (
            <g key={x}>
              <path d={`M${x - 29 + perspectiveShift} 42l-47 190h152l-47-190Z`} fill="#fef3c7" opacity="0.045" />
              <path d={`M${x - 38} 27H${x + 38}L${x + 38 + perspectiveShift} 43H${x - 38 + perspectiveShift}Z`} fill="#020617" stroke="#020617" strokeWidth="3" strokeLinejoin="round" />
              <path d={`M${x - 31} 32H${x + 31}L${x + 31 + perspectiveShift} 38H${x - 31 + perspectiveShift}Z`} fill="#fef9c3" stroke="#fef9c3" strokeWidth="2" strokeLinejoin="round" />
            </g>
          )
        })}
        <rect x="221" y="65" width="158" height="25" rx="2" fill="#1e293b" stroke="#94a3b8" />
        <text x="300" y="82" textAnchor="middle" fill="#e2e8f0" fontSize="12" fontWeight="800" letterSpacing="3">SHARED CELL</text>
        {/* One open room, with a shared bench and no internal partitions. */}
        <rect x="44" y="101" width="506" height="125" rx="3" fill="#0f172a" />
        <path d="M58 111h478v94H58Z" fill="#1e293b" />
        <path d="M44 226l14-21h478l14 21" fill="#334155" />
        <path d="M58 111l-14-10M536 111l14-10" stroke="#475569" strokeWidth="2" />
        <rect x="66" y="169" width="462" height="8" rx="2" fill="#526f34" />
        <path d="M66 179h462M76 179v23M297 179v23M518 179v23" stroke="#64748b" strokeWidth="4" />
        <DepthSortedLayer>
          {visiblePrisoners.map((member, index) => {
            const startX = 297 + (index - (visiblePrisoners.length - 1) / 2) * 78
            const startY = 166 + (index % 2) * 3
            return (
              // Feet are 44 units below the anchor: keep them within the cell floor (206–222).
              <Patrol key={member.id} startX={startX} startY={startY} minX={78} maxX={516} minY={162} maxY={178} speed={16}>
                <Person member={member} />
              </Patrol>
            )
          })}
        </DepthSortedLayer>
        {prisoners.length === 0 && <text x="297" y="151" textAnchor="middle" fontSize="11" letterSpacing="2" fill="#94a3b8">CELL EMPTY</text>}
        {/* A continuous barred front and a single locked gate enclose everyone. */}
        {Array.from({ length: 24 }, (_, index) => 56 + index * 21).map(x => (
          <path key={x} d={`M${x} 103v121`} stroke="#94a3b8" strokeWidth="4" />
        ))}
        <path d="M44 126h506M44 211h506" stroke="#64748b" strokeWidth="4" />
        <rect x="44" y="101" width="506" height="125" rx="3" fill="none" stroke="#94a3b8" strokeWidth="3" />
        <rect x="455" y="103" width="84" height="121" fill="none" stroke="#cbd5e1" strokeWidth="3" />
        <rect x="460" y="158" width="12" height="18" rx="2" fill="#d97706" />
        <circle cx="466" cy="165" r="2" fill="#451a03" />
        {/* Perspective floor tiles establish the indoor patrol corridor. */}
        <path d="M26 241h548l26 69H0Z" fill="#475569" />
        <path d="M0 310h600v30H0Z" fill="#0f172a" />
        {[258, 280, 309].map(y => <path key={y} d={`M0 ${y}h600`} stroke="#334155" strokeWidth="1.5" />)}
        {[26, 112, 198, 284, 370, 456, 542, 574].map(x => <path key={x} d={`M${x} 242L${300 + (x - 300) * 1.35} 310`} stroke="#334155" strokeWidth="1.5" />)}
        <path d="M28 244h544" stroke="#94a3b8" strokeWidth="2" />
        <DepthSortedLayer>
          {visibleGuards.map((member, index) => {
            const startX = 48 + index * 126
            const startY = 253 + (index % 2) * 6
            return (
              // These bounds keep the feet on the corridor floor (249–305), inside its sloped sides.
              <Patrol key={member.id} startX={startX} startY={startY} minX={48} maxX={552} minY={205} maxY={261} speed={28}>
                <PoliceOfficer member={member} />
              </Patrol>
            )
          })}
        </DepthSortedLayer>
        {guards.length === 0 && <text x="300" y="280" textAnchor="middle" fill="#94a3b8" fontSize="12" letterSpacing="2">NO PENDING MEMBERS • PATROL OFF DUTY</text>}
        <circle cx="23" cy="326" r="4" fill="#fb923c" />
        <text x="34" y="330" fill="#cbd5e1" fontSize="10">Deactivated · {prisoners.length}</text>
        <circle cx="174" cy="326" r="4" fill="#60a5fa" />
        <text x="185" y="330" fill="#cbd5e1" fontSize="10">Pending · {guards.length}</text>
        {pages === 1 && <text x="575" y="330" textAnchor="end" fill="#94a3b8" fontSize="9" letterSpacing="2">SHARED CELL</text>}
        {/* CCTV lens treatment and recording HUD. */}
        <g aria-hidden="true" className="pointer-events-none">
          <rect width="600" height="340" fill="#38bdf8" opacity="0.025" />
          <rect width="600" height="340" fill={`url(#${cameraId}-scanlines)`} />
          <rect width="600" height="340" fill={`url(#${cameraId}-vignette)`} />
          <path d="M14 38V14h24M562 14h24v24M14 302v24h24M562 326h24v-24" fill="none" stroke="#e2e8f0" strokeWidth="1.5" opacity="0.65" />
          <circle cx="50" cy="17" r="3.5" fill="#ef4444" />
          <text x="59" y="20" fill="#f8fafc" fontSize="9" fontWeight="700" letterSpacing="2" fontFamily="monospace">REC</text>
          <text x="576" y="18" textAnchor="end" fill="#f8fafc" fontSize="8" fontWeight="700" letterSpacing="1.5" fontFamily="monospace">CAM 03</text>
          <text x="576" y="31" textAnchor="end" fill="#e2e8f0" fontSize="8" letterSpacing="0.6" fontFamily="monospace">{formatCameraTimestamp(cameraTime)}</text>
          {cameraGlitch && (
            <g>
              {/* Severity controls how much of the CCTV feed is lost to analog interference. */}
              <rect width="600" height="340" fill="#020204" opacity={glitchSettings?.darkness} />
              <rect width="600" height="340" fill="#ffffff" filter={`url(#${cameraId}-static)`} opacity={glitchSettings?.noise} />
              <rect
                x={cameraGlitch.shift}
                y={cameraGlitch.firstY}
                width="600"
                height={cameraGlitch.level === 'soft' ? 4 : cameraGlitch.level === 'medium' ? 7 : 10}
                fill="#ffffff"
                filter={`url(#${cameraId}-static)`}
                opacity={glitchSettings?.primaryBand}
              />
              <rect x={-cameraGlitch.shift} y={cameraGlitch.firstY + 2} width="600" height="2" fill="#22d3ee" opacity={glitchSettings?.chromatic} />
              <rect x={cameraGlitch.shift} y={cameraGlitch.firstY + 7} width="600" height="2" fill="#f472b6" opacity={glitchSettings?.chromatic} />
              {cameraGlitch.level !== 'soft' && (
                <>
                  <rect x={-cameraGlitch.shift * 0.7} y={cameraGlitch.secondY} width="600" height={cameraGlitch.level === 'hard' ? 15 : 9} fill="#ffffff" filter={`url(#${cameraId}-static)`} opacity={glitchSettings?.secondaryBand} />
                  <rect x={cameraGlitch.shift} y={cameraGlitch.secondY + 3} width="600" height="2" fill="#34d399" opacity={glitchSettings?.chromatic} />
                  <rect x={-cameraGlitch.shift} y={cameraGlitch.secondY + 10} width="600" height="2" fill="#f472b6" opacity={glitchSettings?.chromatic} />
                </>
              )}
              <g opacity={glitchSettings?.chromatic}>
                <rect x={28 + cameraGlitch.shift} y={cameraGlitch.firstY - 30} width="88" height="4" fill="#22d3ee" />
                <rect x="31" y={cameraGlitch.firstY - 29} width="88" height="3" fill="#ffffff" />
                <rect x={34 - cameraGlitch.shift} y={cameraGlitch.firstY - 28} width="88" height="2" fill="#f472b6" />
                {cameraGlitch.level !== 'soft' && (
                  <>
                    <rect x={212 - cameraGlitch.shift} y={cameraGlitch.secondY - 42} width="72" height="3" fill="#34d399" />
                    <rect x="216" y={cameraGlitch.secondY - 41} width="72" height="3" fill="#ffffff" />
                    <rect x={220 + cameraGlitch.shift} y={cameraGlitch.secondY - 40} width="72" height="2" fill="#f472b6" />
                  </>
                )}
                {cameraGlitch.level === 'hard' && (
                  <>
                    <rect x={438 + cameraGlitch.shift} y={cameraGlitch.firstY + 46} width="105" height="3" fill="#22d3ee" />
                    <rect x="442" y={cameraGlitch.firstY + 47} width="105" height="3" fill="#ffffff" />
                    <rect x={446 - cameraGlitch.shift} y={cameraGlitch.firstY + 48} width="105" height="2" fill="#f472b6" />
                  </>
                )}
              </g>
              <path
                d={cameraGlitch.level === 'soft'
                  ? `M0 ${cameraGlitch.firstY - 5}h600`
                  : `M0 ${cameraGlitch.firstY - 5}h600M0 ${cameraGlitch.secondY + 20}h600`}
                stroke="#f8fafc"
                strokeWidth="1.5"
                strokeDasharray="19 5 2 8"
                opacity={glitchSettings?.primaryBand}
              />
            </g>
          )}
        </g>
      </svg>
      {pages > 1 && (
        <div className="absolute right-1 bottom-1 flex items-center gap-1 rounded-lg bg-slate-900 text-xs text-white">
          <button type="button" aria-label="Previous members" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="cursor-pointer rounded p-1 focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-30">←</button>
          <span aria-live="polite">{currentPage + 1}/{pages}</span>
          <button type="button" aria-label="Next members" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)} className="cursor-pointer rounded p-1 focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-30">→</button>
        </div>
      )}
    </div>
  )
}
