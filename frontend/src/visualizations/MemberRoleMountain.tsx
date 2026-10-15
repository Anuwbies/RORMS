import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { Member, MemberRole } from '../types/member'

const roles: { role: MemberRole; color: string }[] = [
  { role: 'University Administrator', color: '#0284c7' },
  { role: 'Admin', color: '#9333ea' },
  { role: 'Registrar', color: '#2563eb' },
  { role: 'Dean', color: '#d97706' },
  { role: 'Program Head', color: '#e11d48' },
  { role: 'Instructor', color: '#059669' },
]

const treeAssets = [
  '/role-mountain/tree-2.svg',
  '/role-mountain/tree-6.svg',
  '/role-mountain/tree-1.svg',
]

// Each asset is randomly assigned to one traffic direction on page load.
// Adjust an asset's yOffset to fine-tune its vertical position: positive moves down, negative moves up.
const roadVehicleAssets = [
  { asset: '/role-mountain/beetle.svg', scale: 0.18, yOffset: 2 },
  { asset: '/role-mountain/volvo.svg', scale: 0.18, yOffset: 5 },
  { asset: '/role-mountain/horse-and-cart.svg', scale: 0.12, yOffset: -4 },
  { asset: '/role-mountain/corvette.svg', scale: 0.17, yOffset: 3 },
  { asset: '/role-mountain/car-side.svg', scale: 0.17, yOffset: 5 },
  { asset: '/role-mountain/fastcar.svg', scale: 0.17, yOffset: 4 },
]

// Adjust these lane offsets to center the cars vertically on the road.
// Higher values move a lane down; lower values move it up.
const roadLaneYOffsets = {
  right: 23, // Lower lane: vehicles driving left to right.
  left: 9, // Upper lane: vehicles driving right to left.
}

type TrafficDirection = 'left' | 'right'
type TrafficVehicle = (typeof roadVehicleAssets)[number] & { id: number; direction: TrafficDirection; travelDuration: number }

// Adjust these values to place each tree shadow relative to its log.
// x: positive moves right and negative moves left, using asset viewBox units.
// y: positive moves down and negative moves up, using chart units.
// width and height are the full shadow dimensions before the tree scale is applied.
const treeShadowOffsets: Record<string, { x: number; y: number; width: number; height: number }> = {
  '/role-mountain/tree-2.svg': { x: -6, y: 2, width: 24, height: 6 },
  '/role-mountain/tree-6.svg': { x: 1, y: 2, width: 24, height: 6 },
  '/role-mountain/tree-1.svg': { x: 0, y: -0.5, width: 24, height: 6 },
}

function useDepthLayerOrder(depthLayer: number) {
  const layerRef = useRef<SVGGElement>(null)

  useLayoutEffect(() => {
    const layer = layerRef.current
    const parent = layer?.parentElement
    if (!layer || !parent) return

    const orderedLayers = Array.from(parent.children)
      .filter((child): child is SVGGElement => child instanceof SVGGElement && child.dataset.depthLayer !== undefined)
      .sort((left, right) => Number(left.dataset.depthLayer) - Number(right.dataset.depthLayer))

    orderedLayers.forEach(child => parent.appendChild(child))
  }, [depthLayer])

  return layerRef
}

function MountainTree({ x, y, scale, asset, facing }: { x: number; y: number; scale: number; asset: string; facing: number }) {
  const shadowOffset = treeShadowOffsets[asset] ?? { x: 0, y: 1, width: 24, height: 6 }
  const depthLayer = Math.round(y + shadowOffset.y)
  const layerRef = useDepthLayerOrder(depthLayer)
  return (
    <g ref={layerRef} data-depth-layer={depthLayer}>
      <ellipse cx={x + shadowOffset.x * scale * facing} cy={y + shadowOffset.y} rx={(shadowOffset.width / 2) * scale} ry={(shadowOffset.height / 2) * scale} fill="#161f0e" opacity="0.2" />
      <g transform={`translate(${x} ${y}) scale(${facing * scale} ${scale})`}>
        <image href={asset} x="-32" y="-52" width="64" height="64" preserveAspectRatio="none" />
      </g>
    </g>
  )
}

type CreatureKind = 'fairy' | 'deer' | 'ghost' | 'piglet' | 'fox'

const creatureAssets: Record<CreatureKind, string> = {
  fairy: '/role-mountain/fairy.svg',
  deer: '/role-mountain/deer.svg',
  ghost: '/role-mountain/ghost.svg',
  piglet: '/role-mountain/piglet.svg',
  fox: '/role-mountain/fox.svg',
}

// Adjust these values to place each animal shadow relative to the animal.
// x: positive moves right and negative moves left; y: positive moves down and negative moves up.
// width and height are the full shadow dimensions.
const creatureShadowOffsets: Record<CreatureKind, { x: number; y: number; width: number; height: number }> = {
  deer: { x: -1.5, y: 0, width: 18, height: 5.2 },
  fairy: { x: 0, y: 0, width: 14, height: 3.6 },
  ghost: { x: 0, y: 0, width: 14, height: 4 },
  piglet: { x: 0, y: -2, width: 16, height: 4 },
  fox: { x: 1, y: -2, width: 16, height: 4 },
}

function motionKeyframes(name: string, motion: string) {
  const frames = motion.split(';').map(frame => frame.trim().split(/\s+/))
  return `@keyframes ${name} { ${frames.map(([x, y], index) => `${(index / (frames.length - 1)) * 100}% { transform: translate(${x}px, ${y}px); }`).join(' ')} }`
}

function RoadTraffic({ id, baseline }: { id: string; baseline: number }) {
  const [vehicles, setVehicles] = useState<TrafficVehicle[]>([])
  const nextVehicleId = useRef(0)

  useEffect(() => {
    const timeoutIds = new Set<number>()
    let nextDirection: TrafficDirection = Math.random() < 0.5 ? 'right' : 'left'
    let waitBeforeSpawn = 1000 + Math.random() * 3000
    const startedAt = performance.now()
    const lastLaneSpawnAt: Record<TrafficDirection, number> = {
      right: startedAt - (2000 + Math.random() * 6000),
      left: startedAt - (2000 + Math.random() * 6000),
    }

    const schedule = (callback: () => void, delay: number) => {
      const timeoutId = window.setTimeout(() => {
        timeoutIds.delete(timeoutId)
        callback()
      }, delay)
      timeoutIds.add(timeoutId)
    }

    const spawnVehicle = () => {
      const source = roadVehicleAssets[Math.floor(Math.random() * roadVehicleAssets.length)]
      const spawnedAt = performance.now()
      const laneWait = Math.min(8, Math.max(2, (spawnedAt - lastLaneSpawnAt[nextDirection]) / 1000))
      // The longer a lane has waited before this spawn, the faster this vehicle travels.
      // A 2–8 second lane gap maps to a clearly visible, no-overtake 24–18 second crossing time.
      const travelDuration = 24 - (laneWait - 2)
      lastLaneSpawnAt[nextDirection] = spawnedAt
      const vehicle: TrafficVehicle = {
        ...source,
        id: nextVehicleId.current,
        direction: nextDirection,
        travelDuration,
      }
      nextVehicleId.current += 1
      nextDirection = nextDirection === 'right' ? 'left' : 'right'

      setVehicles(current => [...current, vehicle])
      schedule(() => setVehicles(current => current.filter(currentVehicle => currentVehicle.id !== vehicle.id)), travelDuration * 1000)
      waitBeforeSpawn = 1000 + Math.random() * 3000
      schedule(spawnVehicle, waitBeforeSpawn)
    }

    schedule(spawnVehicle, waitBeforeSpawn)
    return () => timeoutIds.forEach(timeoutId => window.clearTimeout(timeoutId))
  }, [])

  return (
    <g aria-hidden="true" className="pointer-events-none">
      {vehicles.map(vehicle => {
        const laneY = baseline + roadLaneYOffsets[vehicle.direction] + vehicle.yOffset
        const facing = vehicle.direction === 'right' ? 1 : -1
        return (
          <g key={vehicle.id} style={{ animation: `${id}-drive-${vehicle.direction} ${vehicle.travelDuration}s linear forwards` }}>
            <g transform={`translate(0 ${laneY})`}>
              <image
                href={vehicle.asset}
                width="400"
                height="400"
                transform={`scale(${facing * vehicle.scale} ${vehicle.scale}) translate(-200 -300)`}
                preserveAspectRatio="none"
              />
            </g>
          </g>
        )
      })}
    </g>
  )
}

function SvgRepoCreature({
  kind,
  x,
  y,
  shadowY,
  scale,
  facing,
  tilt,
}: {
  kind: CreatureKind
  x: number
  y: number
  shadowY: number
  scale: number
  facing: number
  tilt: number
}) {
  const shadowOffset = creatureShadowOffsets[kind]
  const depthLayer = Math.round(shadowY + shadowOffset.y)
  const layerRef = useDepthLayerOrder(depthLayer)
  return (
    <g ref={layerRef} data-depth-layer={depthLayer}>
      {/* Animal shadow stays separate from the tilted or floating artwork. */}
      <ellipse cx={x + shadowOffset.x * facing} cy={shadowY + shadowOffset.y} rx={shadowOffset.width / 2} ry={shadowOffset.height / 2} fill="#161f0e" opacity={kind === 'fairy' ? 0.15 : 0.25} />
      <g transform={`translate(${x} ${y}) rotate(${tilt})`}>
        <image
          href={creatureAssets[kind]}
          width="400"
          height="400"
          transform={`scale(${facing * scale} ${scale}) translate(-200 -330)`}
          preserveAspectRatio="none"
        />
      </g>
    </g>
  )
}

function WanderingCreature({
  kind,
  initialX,
  initialDepth,
  scale,
  groundAt,
  baseline,
  verticalOffset = 0,
  speed,
}: {
  kind: CreatureKind
  initialX: number
  initialDepth: number
  scale: number
  groundAt: (x: number) => number
  baseline: number
  verticalOffset?: number
  speed: number
}) {
  const groundAtRef = useRef(groundAt)
  groundAtRef.current = groundAt
  const getBaseTerrainY = (x: number, depth: number) => groundAtRef.current(x) + (baseline - groundAtRef.current(x)) * depth
  const getTerrainY = (x: number, depth: number) => getBaseTerrainY(x, depth) + verticalOffset
  const [position, setPosition] = useState(() => ({
    x: initialX,
    y: getTerrainY(initialX, initialDepth),
    shadowY: getBaseTerrainY(initialX, initialDepth),
    facing: 1,
    tilt: 0,
  }))

  useEffect(() => {
    let frame = 0
    let lastTime = performance.now()
    let current = { x: initialX, depth: initialDepth, facing: 1 }
    let destination = { x: initialX, depth: initialDepth }
    let pauseUntil = 0
    const floatPhase = Math.random() * Math.PI * 2
    const terrainPathSamples = 48

    const chooseDestination = () => {
      // Keep a small inset so the animals remain visible while covering 95% of the terrain.
      const x = 15 + Math.random() * 570
      const depth = 0.025 + Math.random() * 0.95
      return { x, depth }
    }

    const chooseCooldown = () => 1000 + Math.random() * 4000

    const move = (time: number) => {
      const elapsed = Math.min((time - lastTime) / 1000, 0.05)
      lastTime = time

      const walking = time >= pauseUntil
      if (walking) {
        const step = speed * elapsed
        if (destination.x !== current.x) {
          current.facing = destination.x >= current.x ? 1 : -1
        }

        const deltaX = destination.x - current.x
        const deltaDepth = destination.depth - current.depth
        let travelled = 0
        let pathProgress = 1
        let previousPoint = { x: current.x, y: getBaseTerrainY(current.x, current.depth) }

        for (let sample = 1; sample <= terrainPathSamples; sample += 1) {
          const sampleProgress = sample / terrainPathSamples
          const sampleX = current.x + deltaX * sampleProgress
          const sampleDepth = current.depth + deltaDepth * sampleProgress
          const samplePoint = { x: sampleX, y: getBaseTerrainY(sampleX, sampleDepth) }
          const segmentDistance = Math.hypot(samplePoint.x - previousPoint.x, samplePoint.y - previousPoint.y)

          if (travelled + segmentDistance >= step) {
            const segmentProgress = segmentDistance === 0 ? 0 : (step - travelled) / segmentDistance
            pathProgress = ((sample - 1) + segmentProgress) / terrainPathSamples
            break
          }

          travelled += segmentDistance
          previousPoint = samplePoint
        }

        if (pathProgress >= 1) {
          current.x = destination.x
          current.depth = destination.depth
          destination = chooseDestination()
          pauseUntil = time + chooseCooldown()
        } else {
          current.x += deltaX * pathProgress
          current.depth += deltaDepth * pathProgress
        }
      }

      // The fairy and ghost keep floating even while they pause between destinations.
      const tilt = walking && (kind === 'deer' || kind === 'fox' || kind === 'piglet')
        ? Math.sin(time / 105 + floatPhase) * (kind === 'deer' ? 4 : 3)
        : 0
      const floatX = kind === 'fairy'
        ? Math.sin(time / 420 + floatPhase) * 2
        : kind === 'ghost'
          ? Math.sin(time / 360 + floatPhase) * 1.5
          : 0
      const floatY = kind === 'fairy'
        ? Math.sin(time / 265 + floatPhase * 1.4) * 4
        : kind === 'ghost'
          ? Math.sin(time / 220 + floatPhase * 0.8) * 2.5
          : 0
      setPosition({
        x: current.x + floatX,
        y: getTerrainY(current.x, current.depth) + floatY,
        shadowY: getBaseTerrainY(current.x, current.depth),
        facing: current.facing,
        tilt,
      })

      frame = requestAnimationFrame(move)
    }

    frame = requestAnimationFrame(move)
    return () => cancelAnimationFrame(frame)
  }, [initialDepth, initialX, kind, speed, verticalOffset])

  return <SvgRepoCreature kind={kind} x={position.x} y={position.y} shadowY={position.shadowY} scale={scale} facing={position.facing} tilt={position.tilt} />
}

export function getMemberRoleDistribution(members: Member[]) {
  return roles.map(({ role, color }) => ({
    role,
    color,
    // A person may have several departments, but occupies each role only once.
    count: new Set(members.filter(member => member.role === role).map(member => member.email.trim().toLowerCase() || member.id)).size,
  }))
}

export function MemberRoleMountain({ members }: { members: Member[] }) {
  const id = useId().replace(/:/g, '')
  const distribution = getMemberRoleDistribution(members)
  const maxCount = Math.max(...distribution.map(item => item.count))
  const ceiling = Math.max(1, maxCount)
  const baseline = 314
  const points = distribution.map((item, index) => ({
    ...item,
    x: 24 + index * 138,
    y: baseline - (item.count / ceiling) * 280,
  }))
  const ridge = `0,${points[0].y} ${points.map(point => `${point.x},${point.y}`).join(' ')} 600,${points[4].y}`
  const area = `M0 ${baseline} L${ridge.replace(/,/g, ' ')} L600 ${baseline} Z`
  const groundAt = (x: number) => {
    const segment = Math.min(3, Math.max(0, Math.floor((x - 24) / 138)))
    const left = points[segment]
    const right = points[segment + 1]
    const fraction = Math.min(1, Math.max(0, (x - left.x) / (right.x - left.x)))
    return left.y + (right.y - left.y) * fraction
  }

  const clouds = [
    { x: 110, y: 35, scale: 1, duration: '24s', begin: '-4s' },
    { x: 280, y: 24, scale: 0.8, duration: '31s', begin: '-17s' },
    { x: 455, y: 50, scale: 0.7, duration: '27s', begin: '-11s' },
  ]

  return (
    <div className="absolute inset-0 overflow-hidden rounded-xl border border-[#e3edda] bg-[#f3f7ee]">
      <svg viewBox="0 0 600 340" preserveAspectRatio="none" className="h-full w-full" role="group" aria-label="Member role distribution — mountain line graph" aria-describedby={`${id}-description`}>
        <desc id={`${id}-description`}>
          {distribution.map(item => `${item.role}: ${item.count}`).join('. ')}.
          All statuses included. Each member is counted once per role; members with multiple roles appear in each applicable role. Height indicates member count, not change over time.
        </desc>
        <defs>
          <linearGradient id={`${id}-sky`} x2="0" y2="1">
            <stop stopColor="#e3edda" />
            <stop offset="1" stopColor="#fcfcfc" />
          </linearGradient>
          <linearGradient id={`${id}-mountain`} x1="0" y1="0" x2="0.25" y2="1">
            <stop stopColor="#9fbd80" />
            <stop offset="0.3" stopColor="#759953" />
            <stop offset="0.72" stopColor="#526f34" />
            <stop offset="1" stopColor="#334322" />
          </linearGradient>
          <linearGradient id={`${id}-mountain-glow`} x1="0" y1="0" x2="1" y2="0">
            <stop stopColor="#e3edda" stopOpacity="0.5" />
            <stop offset="0.42" stopColor="#a3c48b" stopOpacity="0.08" />
            <stop offset="1" stopColor="#161f0e" stopOpacity="0.2" />
          </linearGradient>
          <pattern id={`${id}-mountain-grain`} width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="5" cy="8" r="0.8" fill="#e3edda" opacity="0.2" />
            <circle cx="19" cy="22" r="0.65" fill="#161f0e" opacity="0.14" />
            <circle cx="28" cy="12" r="0.55" fill="#e3edda" opacity="0.16" />
          </pattern>
          <linearGradient id={`${id}-ridge`}>
            {points.map((point, index) => <stop key={point.role} offset={`${index * 25}%`} stopColor={point.color} />)}
          </linearGradient>
          <clipPath id={`${id}-shape`}><path d={area} /></clipPath>
        </defs>
        <style>{`
          ${motionKeyframes(`${id}-cloud-110`, '-70 35;670 35')}
          ${motionKeyframes(`${id}-cloud-280`, '-70 24;670 24')}
          ${motionKeyframes(`${id}-cloud-455`, '-70 50;670 50')}
          .${id}-cloud-110 { transform: translate(110px, 35px); animation: ${id}-cloud-110 24s linear -4s infinite; }
          .${id}-cloud-280 { transform: translate(280px, 24px); animation: ${id}-cloud-280 31s linear -17s infinite; }
          .${id}-cloud-455 { transform: translate(455px, 50px); animation: ${id}-cloud-455 27s linear -11s infinite; }
          ${motionKeyframes(`${id}-drive-right`, '-45 0;645 0')}
          ${motionKeyframes(`${id}-drive-left`, '645 0;-45 0')}
        `}</style>
        <rect width="600" height="340" fill={`url(#${id}-sky)`} />
        {/* Sky decorations sit behind the terrain and never intercept tooltips. */}
        <g aria-hidden="true" className="pointer-events-none">
          <circle cx="430" cy="36" r="32" fill="#fbbf24" opacity="0.08" />
          <circle cx="430" cy="36" r="25" fill="#fbbf24" opacity="0.12" />
          <circle cx="430" cy="36" r="18" fill="#fbbf24" opacity="0.8" />
          {clouds.map(cloud => (
            <g key={cloud.duration} className={`${id}-cloud-${cloud.x}`}>
              <g transform={`scale(${cloud.scale})`}>
                <path d="M-37 12a12 12 0 0 1 0-24 18 18 0 0 1 34-6 14 14 0 0 1 24 6 12 12 0 0 1 0 24Z" fill="white" opacity="0.85" />
                <path d="M-35 12h54" stroke="#e3edda" strokeWidth="3" strokeLinecap="round" opacity="0.65" />
              </g>
            </g>
          ))}
        </g>
        <path d={area} fill={`url(#${id}-mountain)`} />
        {/* Soft contour bands add depth without breaking the mountain into sharp triangles. */}
        <g clipPath={`url(#${id}-shape)`}>
          <path d="M-30 194C72 176 144 218 248 196C362 172 470 220 630 177V340H-30Z" fill={`url(#${id}-mountain-glow)`} opacity="0.42" />
          <path d="M-30 236C80 207 161 257 271 233C394 207 494 259 630 213V340H-30Z" fill="#334322" opacity="0.16" />
          <path d="M-30 278C74 247 176 299 288 272C406 244 516 299 630 260V340H-30Z" fill="#a3c48b" opacity="0.12" />
          <path d="M-30 320C87 285 195 330 314 306C433 282 530 326 630 295V340H-30Z" fill="#161f0e" opacity="0.13" />
          <path d="M-30 218C75 194 154 239 258 215C369 189 481 241 630 196" fill="none" stroke="#d6e7c3" strokeWidth="2" opacity="0.13" />
          <path d="M-30 263C84 233 168 282 278 256C395 229 500 286 630 242" fill="none" stroke="#d6e7c3" strokeWidth="2" opacity="0.1" />
          <path d="M-30 307C86 274 187 317 305 291C421 266 527 315 630 281" fill="none" stroke="#161f0e" strokeWidth="2" opacity="0.12" />
          <rect width="600" height="340" fill={`url(#${id}-mountain-grain)`} opacity="0.3" />
          <polyline points={ridge} fill="none" stroke="#f3f7ee" strokeWidth="13" strokeLinejoin="bevel" opacity="0.65" />
        </g>
        {/* A quiet road sits beneath the mountain and gives the scene a finished base. */}
        <g aria-hidden="true" className="pointer-events-none">
          <path d={`M0 ${baseline}C120 ${baseline - 6} 220 ${baseline + 5} 330 ${baseline - 1}C445 ${baseline - 8} 520 ${baseline + 4} 600 ${baseline - 2}L600 340H0Z`} fill="#8b6a50" />
          <path d={`M0 ${baseline}C120 ${baseline - 6} 220 ${baseline + 5} 330 ${baseline - 1}C445 ${baseline - 8} 520 ${baseline + 4} 600 ${baseline - 2}`} fill="none" stroke="#d6b07a" strokeWidth="3" opacity="0.8" />
          <path d={`M0 ${baseline + 15}C120 ${baseline + 9} 220 ${baseline + 20} 330 ${baseline + 14}C445 ${baseline + 7} 520 ${baseline + 19} 600 ${baseline + 13}`} fill="none" stroke="#f3d8a5" strokeWidth="2" strokeDasharray="9 12" strokeLinecap="round" opacity="0.9" />
        </g>
        <polyline points={ridge} fill="none" stroke={`url(#${id}-ridge)`} strokeWidth="3" strokeLinejoin="round" />
        {/* Decorative wildlife follows the live slope, never floating in empty valleys. */}
        <g aria-hidden="true" className="pointer-events-none">
          {[18, 54, 99, 157, 199, 250, 314, 363, 424, 478, 534, 577].map((x, index) => {
            const ground = groundAt(x)
            const y = ground + (baseline - ground) * (index % 3 === 0 ? 0.6 : 0.22)
            const facing = Math.sin(x * 12.9898 + index * 78.233) >= 0 ? 1 : -1
            return y < baseline - 7 ? <MountainTree key={x} x={x} y={y} scale={0.65 + (index % 3) * 0.16} asset={treeAssets[index % treeAssets.length]} facing={facing} /> : null
          })}
          {/* Dean */}
          <WanderingCreature
            kind="deer"
            initialX={126}
            initialDepth={0.56}
            scale={0.075}
            groundAt={groundAt}
            baseline={baseline}
            speed={30}
          />
          {/* Admin */}
          <WanderingCreature
            kind="ghost"
            initialX={76}
            initialDepth={0.38}
            scale={0.07}
            groundAt={groundAt}
            baseline={baseline}
            verticalOffset={-14}
            speed={24}
          />
          {/* Program Head */}
          <WanderingCreature
            kind="fairy"
            initialX={310}
            initialDepth={0.34}
            scale={0.065}
            groundAt={groundAt}
            baseline={baseline}
            verticalOffset={-18}
            speed={24}
          />
          {/* Registrar */}
          <WanderingCreature
            kind="fox"
            initialX={430}
            initialDepth={0.48}
            scale={0.07}
            groundAt={groundAt}
            baseline={baseline}
            speed={34}
          />
          {/* Instructor */}
          <WanderingCreature
            kind="piglet"
            initialX={506}
            initialDepth={0.3}
            scale={0.065}
            groundAt={groundAt}
            baseline={baseline}
            speed={26}
          />
        </g>
        {/* Traffic sits over the mountain line and wildlife. The alternating spawner keeps same-lane cars safely spaced. */}
        <RoadTraffic id={id} baseline={baseline} />
        {points.map((point, index) => {
          const tooltipX = Math.min(486, Math.max(114, point.x))
          const tooltipY = Math.max(10, point.y - 88)
          const hitStart = index === 0 ? 0 : point.x - 69
          const hitEnd = index === points.length - 1 ? 600 : point.x + 69
          return (
          <g
            key={point.role}
            className="group/role outline-none"
            tabIndex={0}
            role="img"
            aria-label={`${point.role}: ${point.count} member${point.count === 1 ? '' : 's'}`}
          >
            {/* Wide, invisible targets make every role easy to inspect, even at zero. */}
            <rect x={hitStart} y="0" width={hitEnd - hitStart} height={baseline} fill="transparent" />
            <g aria-hidden="true" className="pointer-events-none opacity-0 group-hover/role:opacity-100 group-focus/role:opacity-100">
              <circle cx={point.x} cy={point.y} r="10" fill="white" opacity="0.55" />
              <circle cx={point.x} cy={point.y} r="6" fill={point.color} stroke="white" strokeWidth="2.5" />
              <rect x={tooltipX - 104} y={tooltipY} width="208" height="72" rx="13" fill="white" stroke="#c6dbb6" strokeWidth="1.5" />
              <text x={tooltipX} y={tooltipY + 29} textAnchor="middle" fill={point.color} fontSize="17" fontWeight="700">{point.role}</text>
              <text x={tooltipX} y={tooltipY + 55} textAnchor="middle" fill="#334155" fontSize="15">{point.count} {point.count === 1 ? 'member' : 'members'}</text>
            </g>
          </g>
          )
        })}
      </svg>
    </div>
  )
}
