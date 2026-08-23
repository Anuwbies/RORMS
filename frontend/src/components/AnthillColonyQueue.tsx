import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { Member, Department, MemberRole, MemberStatus } from '../types/member';

interface AnthillColonyQueueProps {
  members: Member[];
  users: Member[];
  invites: Member[];
  departments: Department[];
}

export type AntClass = 'guard' | 'tank' | 'warrior' | 'worker';
export type ResourceType = 'leaf' | 'mushroom' | 'seed' | 'insect_loot';
export type CarriedItem = ResourceType | 'none';
export type InsectType = 'beetle' | 'spider' | 'ladybug' | 'wasp';

export interface AntCombatStats {
  maxHp: number;
  attack: number;
  respawnCooldown: number; // seconds
  title: string;
  role: MemberRole;
}

// ─── REBALANCED COMBAT STATS (NERFED ANTS, BUFFED ENEMIES) ───
export const ANT_CLASS_STATS: Record<AntClass, AntCombatStats> = {
  guard: {
    maxHp: 60,
    attack: 7,
    respawnCooldown: 8,
    title: 'HQ Guard',
    role: 'Registrar',
  },
  tank: {
    maxHp: 110,
    attack: 4,
    respawnCooldown: 10,
    title: 'Tank Defender',
    role: 'Dean',
  },
  warrior: {
    maxHp: 45,
    attack: 10,
    respawnCooldown: 12,
    title: 'Warrior DPS',
    role: 'Program Head',
  },
  worker: {
    maxHp: 30,
    attack: 0,
    respawnCooldown: 8,
    title: 'Worker Gatherer',
    role: 'Instructor',
  },
};

// ─── DISTINCT STATS FOR EACH ENEMY INSECT TYPE ───
export interface EnemyCombatStats {
  maxHp: number;
  attack: number;
  speed: number;
  attackCooldown: number; // ms
  title: string;
  badge: string;
  badgeStyle: string;
}

export const ENEMY_TYPE_STATS: Record<InsectType, EnemyCombatStats> = {
  beetle: {
    maxHp: 850,
    attack: 24,
    speed: 2.8,
    attackCooldown: 1000,
    title: 'Rhino Beetle',
    badge: 'Armored Colossus',
    badgeStyle: 'bg-amber-950/80 text-amber-300 border-amber-600/50',
  },
  spider: {
    maxHp: 480,
    attack: 42,
    speed: 4.0,
    attackCooldown: 750,
    title: 'Shadow Spider',
    badge: 'Venom Assassin',
    badgeStyle: 'bg-purple-950/80 text-purple-300 border-purple-600/50',
  },
  ladybug: {
    maxHp: 640,
    attack: 30,
    speed: 3.4,
    attackCooldown: 850,
    title: 'Armored Ladybug',
    badge: 'Iron Bruiser',
    badgeStyle: 'bg-rose-950/80 text-rose-300 border-rose-600/50',
  },
  wasp: {
    maxHp: 520,
    attack: 36,
    speed: 4.4,
    attackCooldown: 650,
    title: 'Hornet Wasp',
    badge: 'Aerial Striker',
    badgeStyle: 'bg-yellow-950/80 text-yellow-300 border-yellow-600/50',
  },
};

export function roleToAntClass(role: MemberRole): AntClass {
  switch (role) {
    case 'Registrar':
      return 'guard';
    case 'Dean':
      return 'tank';
    case 'Program Head':
      return 'warrior';
    case 'Instructor':
    default:
      return 'worker';
  }
}

const roleStyles: Record<MemberRole, { color: string; hex: string; accessory: string; label: string; badge: string; textColor: string }> = {
  Admin: {
    color: 'bg-purple-600',
    hex: '#9333ea',
    accessory: '👑',
    label: 'Admin (Boss Insect)',
    badge: 'bg-purple-100 text-purple-700 border-purple-200',
    textColor: 'text-purple-400',
  },
  Registrar: {
    color: 'bg-blue-600',
    hex: '#2563eb',
    accessory: '🛡️',
    label: 'Registrar (Guard)',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    textColor: 'text-blue-400',
  },
  Dean: {
    color: 'bg-amber-600',
    hex: '#d97706',
    accessory: '📜',
    label: 'Dean (Tank)',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    textColor: 'text-amber-400',
  },
  'Program Head': {
    color: 'bg-rose-600',
    hex: '#e11d48',
    accessory: '⚔️',
    label: 'Program Head (Warrior)',
    badge: 'bg-rose-100 text-rose-700 border-rose-200',
    textColor: 'text-rose-400',
  },
  Instructor: {
    color: 'bg-emerald-600',
    hex: '#059669',
    accessory: '🍃',
    label: 'Instructor (Worker)',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    textColor: 'text-emerald-400',
  },
};

export interface GroundItem {
  id: string;
  type: ResourceType;
  lootName?: string;
  x: number;
  y: number;
  harvestsLeft: number;
  maxHarvests: number;
}

export interface EnemyInsect {
  id: string;
  memberId: string;
  memberName: string;
  insectType: InsectType;
  x: number;
  y: number;
  spawnX: number;
  spawnY: number;
  hp: number;
  maxHp: number;
  attack: number;
  heading: number;
  state: 'patrol' | 'aggro' | 'dead' | 'respawning';
  respawnTimer: number;
  targetAntId: string | null;
  lastAttackTime: number;
  isFighting?: boolean;
  waypointX: number;
  waypointY: number;
  isStationary?: boolean;
  idleTimer: number;
  lastCombatTime: number;
}

export interface DamageSplat {
  id: string;
  x: number;
  y: number;
  damage: number;
  isEnemyDamage: boolean;
  createdAt: number;
}

export interface KillFeedEntry {
  id: string;
  antName: string;
  antRole: MemberRole;
  enemyName: string;
  timeStr: string;
}

// ─── UTILITIES ───

function angleDiff(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

const HQ = { x: 50, y: 50 };

const MAP_SECTORS = [
  // 4 Outer Corners (Far Map Reaches)
  { minX: 6, maxX: 24, minY: 6, maxY: 24 },   // Far Top-Left Corner
  { minX: 76, maxX: 94, minY: 6, maxY: 24 },  // Far Top-Right Corner
  { minX: 6, maxX: 24, minY: 76, maxY: 94 },  // Far Bottom-Left Corner
  { minX: 76, maxX: 94, minY: 76, maxY: 94 }, // Far Bottom-Right Corner

  // 4 Outer Edges (Far Borders)
  { minX: 36, maxX: 64, minY: 6, maxY: 20 },  // Far Top Edge
  { minX: 36, maxX: 64, minY: 80, maxY: 94 }, // Far Bottom Edge
  { minX: 6, maxX: 20, minY: 36, maxY: 64 },  // Far Left Edge
  { minX: 80, maxX: 94, minY: 36, maxY: 64 }, // Far Right Edge

  // 4 Mid Quadrants
  { minX: 24, maxX: 42, minY: 22, maxY: 42 }, // Mid Top-Left
  { minX: 58, maxX: 76, minY: 22, maxY: 42 }, // Mid Top-Right
  { minX: 24, maxX: 42, minY: 58, maxY: 78 }, // Mid Bottom-Left
  { minX: 58, maxX: 76, minY: 58, maxY: 78 }, // Mid Bottom-Right

  // 4 Cardinal Mid-Bands
  { minX: 14, maxX: 32, minY: 44, maxY: 56 }, // Mid West
  { minX: 68, maxX: 86, minY: 44, maxY: 56 }, // Mid East
  { minX: 44, maxX: 56, minY: 14, maxY: 32 }, // Mid North
  { minX: 44, maxX: 56, minY: 68, maxY: 86 }, // Mid South
];

function generateRandomItem(id: string, sectorIndex?: number): GroundItem {
  const types: ('leaf' | 'mushroom' | 'seed')[] = ['leaf', 'mushroom', 'seed'];
  const type = types[Math.floor(Math.random() * types.length)];

  let sec = MAP_SECTORS[Math.floor(Math.random() * MAP_SECTORS.length)];
  if (typeof sectorIndex === 'number' && MAP_SECTORS[sectorIndex % MAP_SECTORS.length]) {
    sec = MAP_SECTORS[sectorIndex % MAP_SECTORS.length];
  }

  let x = sec.minX + Math.random() * (sec.maxX - sec.minX);
  let y = sec.minY + Math.random() * (sec.maxY - sec.minY);

  // Ensure items do not spawn inside the HQ safe haven mound
  while (Math.hypot(x - 50, y - 50) < 8) {
    x = sec.minX + Math.random() * (sec.maxX - sec.minX);
    y = sec.minY + Math.random() * (sec.maxY - sec.minY);
  }

  const maxHarvests = 2 + Math.floor(Math.random() * 3);
  return {
    id,
    type,
    x,
    y,
    harvestsLeft: maxHarvests,
    maxHarvests,
  };
}

function generateSafeEnemySpawn(existingSpawns: { x: number; y: number }[]): { x: number; y: number } {
  let attempts = 0;
  const minDistanceToHQ = 28; // Spawn in the outer perimeter far from HQ (50, 50)

  while (attempts < 100) {
    const x = 10 + Math.random() * 80;
    const y = 10 + Math.random() * 80;
    const distToHQ = Math.hypot(x - HQ.x, y - HQ.y);
    const minEnemyDistance = attempts > 50 ? 18 : 24;
    const tooCloseToOther = existingSpawns.some(s => Math.hypot(s.x - x, s.y - y) < minEnemyDistance);

    const minAllowedDist = attempts > 60 ? 22 : minDistanceToHQ;

    if (distToHQ >= minAllowedDist && !tooCloseToOther) {
      return { x, y };
    }
    attempts++;
  }

  // Fallback outer sector spawn if density is high
  const angle = Math.random() * Math.PI * 2;
  const radius = 28 + Math.random() * 12;
  const x = Math.max(10, Math.min(90, HQ.x + Math.cos(angle) * radius));
  const y = Math.max(10, Math.min(90, HQ.y + Math.sin(angle) * radius));
  return { x, y };
}

function getRandomWaypointInTerritory(
  currentX: number,
  currentY: number,
  otherEnemyLocations?: { x: number; y: number }[]
): { x: number; y: number; newSpawnX: number; newSpawnY: number } {
  let attempts = 0;

  while (attempts < 60) {
    // Wander to a nearby adjacent area (5.0 to 12.0 units away from current position)
    const angle = Math.random() * Math.PI * 2;
    const dist = 5.0 + Math.random() * 7.0;
    const targetX = Math.max(10, Math.min(90, currentX + Math.cos(angle) * dist));
    const targetY = Math.max(10, Math.min(90, currentY + Math.sin(angle) * dist));

    const distToHQ = Math.hypot(targetX - HQ.x, targetY - HQ.y);
    const minEnemyDistance = attempts > 40 ? 14 : 18;
    const tooCloseToOther = otherEnemyLocations
      ? otherEnemyLocations.some(s => Math.hypot(s.x - targetX, s.y - targetY) < minEnemyDistance)
      : false;

    if (distToHQ >= 22.0 && !tooCloseToOther) {
      return { x: targetX, y: targetY, newSpawnX: targetX, newSpawnY: targetY };
    }
    attempts++;
  }

  // Fallback: slight local shift away from HQ
  const angleAwayFromHQ = Math.atan2(currentY - HQ.y, currentX - HQ.x) + (Math.random() - 0.5) * 0.8;
  const dist = 6.0;
  const x = Math.max(10, Math.min(90, currentX + Math.cos(angleAwayFromHQ) * dist));
  const y = Math.max(10, Math.min(90, currentY + Math.sin(angleAwayFromHQ) * dist));
  return { x, y, newSpawnX: x, newSpawnY: y };
}

function pickRandomHQPatrolPoint(minRadius = 6, maxRadius = 12): { x: number; y: number } {
  const angle = Math.random() * Math.PI * 2;
  const radius = minRadius + Math.random() * (maxRadius - minRadius);
  const x = Math.max(8, Math.min(92, HQ.x + Math.cos(angle) * radius));
  const y = Math.max(8, Math.min(92, HQ.y + Math.sin(angle) * radius));
  return { x, y };
}

export interface HoveredAntStats {
  member: Member;
  antClass: AntClass;
  hp: number;
  maxHp: number;
  attack: number;
}

export interface AntRegistryEntry {
  id: string;
  memberId: string;
  name: string;
  email?: string;
  avatar?: string;
  department?: string;
  role: MemberRole;
  status?: MemberStatus;
  antClass: AntClass;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  isAlive: boolean;
  isNearAction?: boolean;
  workerActionType?: 'collecting' | 'dropping';
  activityText?: string;
  carriedItem?: CarriedItem;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔍 CONFIGURATION CONSTANTS (ADJUST ZOOM & MAP SETTINGS HERE)
// ─────────────────────────────────────────────────────────────────────────────
export const MAP_WIDTH = 1200;                    // Meadow canvas width (pixels)
export const MAP_HEIGHT = 800;                    // Meadow canvas height (pixels)
export const DEFAULT_ZOOM = 0.8;                 // Initial default zoom level
export const COMBAT_ZOOM = 1.15;                  // Dynamic zoom level during combat encounters
export const MAX_ZOOM_OUT = 0.65;                 // Maximum zoom out limit (minimum scale)
export const MAX_ZOOM_IN = 1.5;                   // Maximum zoom in limit (maximum scale)
export const SIMPLE_MODEL_ZOOM_TRIGGER = 0.70;    // Zoom threshold below which units use simple LOD models

export function AnthillColonyQueue({ members, users, invites }: AnthillColonyQueueProps) {
  const [hoveredAnt, setHoveredAnt] = useState<HoveredAntStats | null>(null);
  const [hoveredEnemyId, setHoveredEnemyId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isHqSelected, setIsHqSelected] = useState(false);
  const [isCardHovered, setIsCardHovered] = useState(false);

  // Click-to-Attack Target State
  const [selectedTargetEnemyId, setSelectedTargetEnemyId] = useState<string | null>(null);
  const selectedTargetEnemyIdRef = useRef<string | null>(null);
  const enemyLastAttackTimesRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    selectedTargetEnemyIdRef.current = selectedTargetEnemyId;
  }, [selectedTargetEnemyId]);

  // Pan & Zoom state
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const zoomRef = useRef(DEFAULT_ZOOM);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isQuickZooming, setIsQuickZooming] = useState(false);

  const dragStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 1000, height: 650 });

  // Auto-Focus Spectator Camera State
  const isMouseOverCardRef = useRef(false);
  const currentFocusTargetRef = useRef<{ type: 'enemy' | 'ant' | 'loot'; id: string; switchTime: number; isWorkerAction?: boolean } | null>(null);
  const recentlyRespawnedEnemyRef = useRef<{ id: string; time: number } | null>(null);
  const recentlyDroppedLootRef = useRef<{ id: string; x: number; y: number; time: number } | null>(null);
  const nextAllowedWorkerFocusTimeRef = useRef<number>(Date.now() + 10000);
  const lastWorkerActionTypeRef = useRef<'collecting' | 'dropping' | null>(null);

  // Coordinated Tank & Warrior Squad Raid State & Post-Respawn Loss Cooldown
  const autoRaidTargetEnemyIdRef = useRef<string | null>(null);
  const hasPendingPostRespawnCooldownRef = useRef(false);
  const raidLossCooldownEndTimeRef = useRef<number>(0);

  // Live Spectator Camera Focused Ant State
  const [focusedAntData, setFocusedAntData] = useState<AntRegistryEntry | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const focusTarget = currentFocusTargetRef.current;
      let targetEntry: AntRegistryEntry | null = null;

      // 1. If camera focus target is an ant
      if (focusTarget && focusTarget.type === 'ant') {
        const entry = antsPositionRef.current.get(focusTarget.id);
        if (entry && entry.isAlive) {
          targetEntry = { ...entry };
        }
      }

      // 2. If camera focus target is an enemy (during combat/fight focus)
      if (!targetEntry && focusTarget && focusTarget.type === 'enemy') {
        const enemy = enemiesRef.current.find(e => e.id === focusTarget.id && e.state !== 'dead' && e.state !== 'respawning');
        if (enemy) {
          // Find the defending/attacking ant engaged in combat with this enemy
          let closestCombatAnt: AntRegistryEntry | null = null;
          let minD = 14;

          antsPositionRef.current.forEach(ant => {
            if (ant.isAlive && ant.hp > 0) {
              const d = Math.hypot(ant.x - enemy.x, ant.y - enemy.y);
              if (d < minD) {
                minD = d;
                closestCombatAnt = ant;
              }
            }
          });

          if (closestCombatAnt) {
            targetEntry = { ...(closestCombatAnt as AntRegistryEntry) };
          } else {
            // Display the enemy Admin user member
            targetEntry = {
              id: enemy.id,
              memberId: enemy.memberId,
              name: enemy.memberName,
              role: 'Admin',
              status: 'Active',
              antClass: 'warrior',
              x: enemy.x,
              y: enemy.y,
              hp: enemy.hp,
              maxHp: enemy.maxHp,
              attack: enemy.attack,
              isAlive: true,
              activityText: enemy.state === 'aggro' || enemy.isFighting ? 'Battling Colony Forces' : 'Patrolling Territory',
              carriedItem: 'none',
            };
          }
        }
      }

      // 3. If any active fight is taking place across the map
      if (!targetEntry) {
        const fightingEnemy = enemiesRef.current.find(e => (e.isFighting || e.state === 'aggro') && e.state !== 'dead' && e.state !== 'respawning');
        if (fightingEnemy) {
          let combatAnt: AntRegistryEntry | null = null;
          let minD = 14;
          antsPositionRef.current.forEach(ant => {
            if (ant.isAlive && ant.hp > 0) {
              const d = Math.hypot(ant.x - fightingEnemy.x, ant.y - fightingEnemy.y);
              if (d < minD) {
                minD = d;
                combatAnt = ant;
              }
            }
          });
          if (combatAnt) {
            targetEntry = { ...(combatAnt as AntRegistryEntry) };
          }
        }
      }

      // 4. Default / Ambient ant follow
      if (!targetEntry) {
        const liveAnts: AntRegistryEntry[] = [];
        antsPositionRef.current.forEach(a => {
          if (a.isAlive && a.hp > 0 && a.x > 0 && a.y > 0) {
            liveAnts.push({ ...a });
          }
        });

        if (liveAnts.length > 0) {
          const activeAnt = liveAnts.find(a => a.isNearAction || a.activityText?.includes('Defending') || a.activityText?.includes('Striking') || a.activityText?.includes('Shielding')) || liveAnts[0];
          targetEntry = activeAnt;
        }
      }

      setFocusedAntData(targetEntry);
    }, 100);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setContainerSize({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Double-Click Drag to Zoom Tracking
  const lastMouseDownTimeRef = useRef(0);
  const lastMouseDownPosRef = useRef({ x: 0, y: 0 });
  const isQuickZoomingRef = useRef(false);
  const zoomDragStartYRef = useRef(0);
  const zoomDragStartZoomRef = useRef(DEFAULT_ZOOM);
  const hasDraggedRef = useRef(false);

  // Active, Pending & Total Member Counts
  const totalCount = members.length;
  const activeCount = useMemo(() => members.filter(m => m.status === 'Active').length, [members]);
  const pendingCount = useMemo(() => members.filter(m => m.status === 'Pending').length, [members]);

  // Harvest & Kill Counters
  const [harvestCount, setHarvestCount] = useState({ leaf: 0, mushroom: 0, seed: 0, insect_loot: 0, total: 0 });
  const [enemiesDefeated, setEnemiesDefeated] = useState(0);
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([]);

  // Damage Splats (hit numbers)
  const [damageSplats, setDamageSplats] = useState<DamageSplat[]>([]);

  // Ground Items: 10 dynamically scattered botanicals across map
  const [groundItems, setGroundItems] = useState<GroundItem[]>(() => {
    return Array.from({ length: 10 }, (_, i) => generateRandomItem(`item-${i + 1}`, i));
  });
  const groundItemsRef = useRef<GroundItem[]>(groundItems);
  useEffect(() => {
    groundItemsRef.current = groundItems;
  }, [groundItems]);

  // ─── 1:1 ACTIVE & PENDING MEMBER-TO-ENTITY MAPPING ───
  const eligibleMembers = useMemo(() => {
    return members.filter(m => m.status === 'Active' || m.status === 'Pending');
  }, [members]);

  const { adminMembers, antMembers } = useMemo(() => {
    if (eligibleMembers.length === 0 && members.length === 0) {
      // Fallback demo only when database hasn't loaded
      const defaultMembers: Member[] = [
        { id: 'admin-1', name: 'Admin Leader', role: 'Admin', status: 'Active', department: 'CITE', email: 'admin@phinmaed.com', joinedDate: '', avatar: '' },
        { id: 'reg-1', name: 'Registrar Staff', role: 'Registrar', status: 'Active', department: 'CITE', email: 'reg@phinmaed.com', joinedDate: '', avatar: '' },
        { id: 'dean-1', name: 'Dean Office', role: 'Dean', status: 'Active', department: 'CITE', email: 'dean@phinmaed.com', joinedDate: '', avatar: '' },
        { id: 'prog-1', name: 'Program Head', role: 'Program Head', status: 'Active', department: 'CITE', email: 'prog@phinmaed.com', joinedDate: '', avatar: '' },
        { id: 'inst-1', name: 'Faculty Instructor', role: 'Instructor', status: 'Active', department: 'CITE', email: 'inst@phinmaed.com', joinedDate: '', avatar: '' },
      ];
      return {
        adminMembers: defaultMembers.filter(m => m.role === 'Admin'),
        antMembers: defaultMembers.filter(m => m.role !== 'Admin'),
      };
    }

    return {
      adminMembers: eligibleMembers.filter(m => m.role === 'Admin'),
      antMembers: eligibleMembers.filter(m => m.role !== 'Admin'),
    };
  }, [eligibleMembers, members.length]);

  // ─── INITIALIZE & SYNC RANDOMIZED BUFFED ENEMY INSECTS FROM ACTIVE/PENDING ADMINS ───
  const ALL_INSECT_TYPES: InsectType[] = ['beetle', 'spider', 'ladybug', 'wasp'];

  const [enemies, setEnemies] = useState<EnemyInsect[]>(() => {
    const spawns: { x: number; y: number }[] = [];
    const shuffledTypes = [...ALL_INSECT_TYPES].sort(() => Math.random() - 0.5);

    return adminMembers.map((admin, idx) => {
      const spawn = generateSafeEnemySpawn(spawns);
      spawns.push(spawn);
      const insectType = shuffledTypes[idx % shuffledTypes.length];
      const stats = ENEMY_TYPE_STATS[insectType];
      const initialWp = getRandomWaypointInTerritory(spawn.x, spawn.y);

      return {
        id: `enemy-${admin.id}`,
        memberId: admin.id,
        memberName: admin.name || admin.email || `Admin ${idx + 1}`,
        insectType,
        x: spawn.x,
        y: spawn.y,
        spawnX: spawn.x,
        spawnY: spawn.y,
        hp: stats.maxHp,
        maxHp: stats.maxHp,
        attack: stats.attack,
        heading: Math.random() * Math.PI * 2,
        state: 'patrol',
        respawnTimer: 0,
        targetAntId: null,
        lastAttackTime: 0,
        isFighting: false,
        waypointX: initialWp.x,
        waypointY: initialWp.y,
        isStationary: false,
        idleTimer: 0,
        lastCombatTime: 0,
      };
    });
  });

  // Keep enemies state strictly in sync with adminMembers (ensuring random non-repeating distribution)
  useEffect(() => {
    setEnemies(prev => {
      const spawns = prev.map(e => ({ x: e.spawnX, y: e.spawnY }));
      const currentEnemies = [...prev];

      return adminMembers.map((admin, idx) => {
        const existing = currentEnemies.find(e => e.memberId === admin.id);
        if (existing) {
          return {
            ...existing,
            memberName: admin.name || admin.email || `Admin ${idx + 1}`,
          };
        }
        const spawn = generateSafeEnemySpawn(spawns);
        spawns.push(spawn);

        // Pick from remaining unused insect types first to ensure full variety before repeating
        const assignedTypes = currentEnemies.map(e => e.insectType);
        const unusedTypes = ALL_INSECT_TYPES.filter(t => !assignedTypes.includes(t));
        const pool = unusedTypes.length > 0 ? unusedTypes : ALL_INSECT_TYPES;
        const insectType = pool[Math.floor(Math.random() * pool.length)];
        const stats = ENEMY_TYPE_STATS[insectType];
        const initialWp = getRandomWaypointInTerritory(spawn.x, spawn.y);

        const newEnemy: EnemyInsect = {
          id: `enemy-${admin.id}`,
          memberId: admin.id,
          memberName: admin.name || admin.email || `Admin ${idx + 1}`,
          insectType,
          x: spawn.x,
          y: spawn.y,
          spawnX: spawn.x,
          spawnY: spawn.y,
          hp: stats.maxHp,
          maxHp: stats.maxHp,
          attack: stats.attack,
          heading: Math.random() * Math.PI * 2,
          state: 'patrol' as const,
          respawnTimer: 0,
          targetAntId: null,
          lastAttackTime: 0,
          isFighting: false,
          waypointX: initialWp.x,
          waypointY: initialWp.y,
          isStationary: false,
          idleTimer: 0,
          lastCombatTime: 0,
        };

        currentEnemies.push(newEnemy);
        return newEnemy;
      });
    });
  }, [adminMembers]);

  const enemiesRef = useRef<EnemyInsect[]>(enemies);
  useEffect(() => {
    enemiesRef.current = enemies;
  }, [enemies]);

  const isFightingActive = enemies.some(
    e => (e.isFighting || e.state === 'aggro') && e.state !== 'dead' && e.state !== 'respawning'
  );

  // Ants live position & health registry for real-time combat lookups
  const antsPositionRef = useRef<Map<string, AntRegistryEntry>>(new Map());
  const antLastAttackTimesRef = useRef<Map<string, number>>(new Map());

  // ─── TANK & WARRIOR COORDINATED RAID SWARM SYSTEM ───
  useEffect(() => {
    const combatMembers = antMembers.filter(m => {
      const cls = roleToAntClass(m.role);
      return cls === 'tank' || cls === 'warrior';
    });

    const interval = setInterval(() => {
      // Disable auto raid when user is hovering the card or has manually targeted an enemy
      if (isMouseOverCardRef.current || selectedTargetEnemyIdRef.current) {
        autoRaidTargetEnemyIdRef.current = null;
        return;
      }

      if (combatMembers.length === 0) {
        autoRaidTargetEnemyIdRef.current = null;
        return;
      }

      // Check if ALL tank and warrior ants are currently spawned and alive on the battlefield
      const allCombatAntsSpawned = combatMembers.every(m => {
        const entry = antsPositionRef.current.get(`ant-${m.id}`);
        return entry && entry.isAlive && entry.hp > 0 && entry.x > 0 && entry.y > 0;
      });

      if (!allCombatAntsSpawned) {
        // While any combat ant is waiting to respawn, arm the flag so cooldown triggers once ALL have respawned
        hasPendingPostRespawnCooldownRef.current = true;
        autoRaidTargetEnemyIdRef.current = null;
        return;
      }

      // All combat ants ARE now fully respawned and alive on the battlefield!
      if (hasPendingPostRespawnCooldownRef.current) {
        // The exact moment all combat ants have respawned, start the 16-second tactical regroup cooldown!
        hasPendingPostRespawnCooldownRef.current = false;
        raidLossCooldownEndTimeRef.current = performance.now() + 16000;
        autoRaidTargetEnemyIdRef.current = null;
        return;
      }

      // Check if post-respawn regroup cooldown is still active
      if (performance.now() < raidLossCooldownEndTimeRef.current) {
        autoRaidTargetEnemyIdRef.current = null;
        return;
      }

      // All combat ants are respawned AND the cooldown has elapsed -> coordinate next raid!
      const currentRaidEnemy = autoRaidTargetEnemyIdRef.current
        ? enemiesRef.current.find(e => e.id === autoRaidTargetEnemyIdRef.current && e.state !== 'dead' && e.state !== 'respawning')
        : null;

      if (!currentRaidEnemy) {
        const aliveEnemies = enemiesRef.current.filter(e => e.state !== 'dead' && e.state !== 'respawning');
        if (aliveEnemies.length > 0) {
          // Prioritize closest living enemy within HQ perimeter range (22.0)
          const HQ_DEFENSE_PROXIMITY = 22.0;
          const nearbyEnemies = aliveEnemies.filter(e => Math.hypot(e.x - HQ.x, e.y - HQ.y) <= HQ_DEFENSE_PROXIMITY);

          if (nearbyEnemies.length > 0) {
            const sortedByHqDist = [...nearbyEnemies].sort((a, b) => {
              const distA = Math.hypot(a.x - HQ.x, a.y - HQ.y);
              const distB = Math.hypot(b.x - HQ.x, b.y - HQ.y);
              return distA - distB;
            });
            autoRaidTargetEnemyIdRef.current = sortedByHqDist[0]?.id || null;
          } else {
            // If all enemies are far enough from HQ, randomly select an enemy
            const randomEnemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
            autoRaidTargetEnemyIdRef.current = randomEnemy?.id || null;
          }
        } else {
          autoRaidTargetEnemyIdRef.current = null;
        }
      }
    }, 400);

    return () => clearInterval(interval);
  }, [antMembers]);

  // Add floating damage number
  const triggerDamageSplat = useCallback((x: number, y: number, damage: number, isEnemyDamage: boolean) => {
    const splat: DamageSplat = {
      id: `dmg-${Date.now()}-${Math.random()}`,
      x: x + (Math.random() - 0.5) * 2,
      y: y + (Math.random() - 0.5) * 2,
      damage,
      isEnemyDamage,
      createdAt: Date.now(),
    };
    setDamageSplats(prev => [...prev.slice(-15), splat]);
  }, []);

  // Cleanup old damage splats
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setDamageSplats(prev => prev.filter(s => now - s.createdAt < 900));
    }, 300);
    return () => clearInterval(interval);
  }, []);

  // Callback when an ant harvests an item on the ground
  const handleHarvest = useCallback((itemId: string) => {
    setGroundItems(prevItems => {
      return prevItems
        .map(it => {
          if (it.id !== itemId) return it;
          return { ...it, harvestsLeft: it.harvestsLeft - 1 };
        })
        .filter(it => it.harvestsLeft > 0);
    });
  }, []);

  // Callback when an ant deposits item into Anthill HQ
  const handleDeposit = useCallback((type: ResourceType) => {
    setHarvestCount(prev => ({
      ...prev,
      [type]: (prev[type] || 0) + 1,
      total: prev.total + 1,
    }));
  }, []);

  // Callback when an ant deals damage to an enemy (with per-ant cooldown enforcement and immediate damage UI)
  const handleAntAttackEnemy = useCallback((antId: string, enemyId: string, damage: number, attackerName: string, attackerRole: MemberRole) => {
    const now = performance.now();
    const lastAtk = antLastAttackTimesRef.current.get(antId) || 0;
    if (now - lastAtk < 850) {
      return; // Prevent duplicate/rapid damage bug
    }
    antLastAttackTimesRef.current.set(antId, now);

    // Look up target enemy synchronously from enemiesRef
    const enemy = enemiesRef.current.find(e => e.id === enemyId && e.state !== 'dead' && e.state !== 'respawning');
    if (!enemy) return;

    // Trigger floating damage number immediately at enemy position
    triggerDamageSplat(enemy.x, enemy.y, damage, true);

    const nextHp = Math.max(0, enemy.hp - damage);
    const didKill = nextHp <= 0;

    if (didKill) {
      const lootItem: GroundItem = {
        id: `loot-${Date.now()}-${Math.random()}`,
        type: 'insect_loot',
        lootName: `${enemy.memberName}'s Trophy Chitin`,
        x: enemy.x,
        y: enemy.y,
        harvestsLeft: 3,
        maxHarvests: 3,
      };
      setGroundItems(prev => [...prev, lootItem]);
      setEnemiesDefeated(c => c + 1);

      // Keep camera focused on the dropped trophy loot after enemy dies
      recentlyDroppedLootRef.current = { id: lootItem.id, x: enemy.x, y: enemy.y, time: performance.now() + 5000 };

      // Reset target lock if killed enemy was targeted
      if (selectedTargetEnemyIdRef.current === enemy.id) {
        setSelectedTargetEnemyId(null);
      }

      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setKillFeed(prev => [
        {
          id: `kill-${Date.now()}`,
          antName: attackerName,
          antRole: attackerRole,
          enemyName: enemy.memberName,
          timeStr: time,
        },
        ...prev.slice(0, 4),
      ]);
    }

    setEnemies(prevEnemies => {
      return prevEnemies.map(e => {
        if (e.id !== enemyId || e.state === 'dead' || e.state === 'respawning') {
          return e;
        }

        if (didKill) {
          return {
            ...e,
            hp: 0,
            state: 'dead' as const,
            respawnTimer: 20,
            isFighting: false,
          };
        }

        // Instantly switch to aggro mode and fight back against the attacking ant
        return {
          ...e,
          hp: nextHp,
          state: 'aggro' as const,
          targetAntId: antId,
          isFighting: true,
          isStationary: false,
          idleTimer: 0,
          lastCombatTime: performance.now(),
        };
      });
    });
  }, [triggerDamageSplat]);

  // ─── ENEMY INSECTS REAL-TIME AI & COMBAT LOOP (WAYPOINT ROAM & IDLE STOP MECHANIC) ───
  useEffect(() => {
    let lastTime = performance.now();
    let rafId = 0;

    function enemyTick(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      setEnemies(prevEnemies => {
        const updated = prevEnemies.map(enemy => {
          if (enemy.state === 'dead' || enemy.state === 'respawning') {
            const nextTimer = enemy.respawnTimer - dt;
            if (nextTimer <= 0) {
              const spawns = prevEnemies.filter(e => e.id !== enemy.id).map(e => ({ x: e.spawnX, y: e.spawnY }));
              const newSpawn = generateSafeEnemySpawn(spawns);
              const initialWp = getRandomWaypointInTerritory(newSpawn.x, newSpawn.y);

              // Trigger dramatic camera focus on newly respawned enemy
              recentlyRespawnedEnemyRef.current = { id: enemy.id, time: performance.now() + 3500 };

              return {
                ...enemy,
                x: newSpawn.x,
                y: newSpawn.y,
                spawnX: newSpawn.x,
                spawnY: newSpawn.y,
                hp: enemy.maxHp,
                state: 'patrol' as const,
                respawnTimer: 0,
                targetAntId: null,
                isFighting: false,
                waypointX: initialWp.x,
                waypointY: initialWp.y,
                isStationary: false,
                idleTimer: 0,
                lastCombatTime: 0,
              };
            }
            return { ...enemy, respawnTimer: nextTimer, state: 'respawning' as const, isFighting: false };
          }

          // ─── COMBAT TARGETING & IMMEDIATE SELF-DEFENSE ───
          const MIN_HQ_SANCTUARY_DIST = 22.0;
          const distEnemyToHQ = Math.hypot(enemy.x - HQ.x, enemy.y - HQ.y);

          let targetAnt: { id: string; name: string; role: MemberRole; x: number; y: number; hp: number } | null = null;
          let closestDist = Infinity;

          // 1. Direct Self-Defense: If an ant is currently attacking this enemy, always fight back immediately!
          if (enemy.targetAntId) {
            const currentAttacker = antsPositionRef.current.get(enemy.targetAntId);
            if (currentAttacker && currentAttacker.isAlive && currentAttacker.hp > 0 && currentAttacker.x > 0) {
              const dist = Math.hypot(currentAttacker.x - enemy.x, currentAttacker.y - enemy.y);
              // Only pursue if attacker is within 11.0 range and enemy does not cross into HQ sanctuary
              if (dist < 11.0 && distEnemyToHQ >= MIN_HQ_SANCTUARY_DIST) {
                targetAnt = currentAttacker;
                closestDist = dist;
              }
            }
          }

          // 2. Nearby Proactive Aggro: Scan for any nearby alive ant within 9.0 threat radius (outside HQ)
          if (!targetAnt && distEnemyToHQ >= MIN_HQ_SANCTUARY_DIST) {
            antsPositionRef.current.forEach(ant => {
              if (ant.isAlive && ant.hp > 0 && ant.x > 0 && ant.y > 0) {
                const distFromEnemy = Math.hypot(ant.x - enemy.x, ant.y - enemy.y);
                if (distFromEnemy < 9.0 && distFromEnemy < closestDist) {
                  closestDist = distFromEnemy;
                  targetAnt = ant;
                }
              }
            });
          }

          let nextX = enemy.x;
          let nextY = enemy.y;
          let nextHeading = enemy.heading;
          let nextState: 'patrol' | 'aggro' = targetAnt ? 'aggro' : 'patrol';
          let nextLastAttack = enemy.lastAttackTime;
          let isFighting = false;

          // Fight back while the ant is within engagement range
          if (targetAnt) {
            nextState = 'aggro';
            const dx = (targetAnt as any).x - enemy.x;
            const dy = (targetAnt as any).y - enemy.y;
            const desiredAngle = Math.atan2(dx, -dy);
            const diff = angleDiff(enemy.heading, desiredAngle);
            nextHeading += Math.max(-3.5 * dt, Math.min(3.5 * dt, diff));

            const enemyTypeStats = ENEMY_TYPE_STATS[enemy.insectType];

            if (closestDist > 3.2) {
              const speed = enemyTypeStats.speed;
              nextX += Math.sin(nextHeading) * speed * dt;
              nextY += -Math.cos(nextHeading) * speed * dt;
              isFighting = false;
            } else {
              isFighting = true;
              const lastAtkTime = enemyLastAttackTimesRef.current.get(enemy.id) || 0;
              if (now - lastAtkTime > enemyTypeStats.attackCooldown) {
                enemyLastAttackTimesRef.current.set(enemy.id, now);
                nextLastAttack = now;
                const antData = antsPositionRef.current.get((targetAnt as any).id);
                if (antData && antData.isAlive && antData.hp > 0) {
                  const newHp = Math.max(0, antData.hp - enemy.attack);
                  antData.hp = newHp;
                  triggerDamageSplat((targetAnt as any).x, (targetAnt as any).y, enemy.attack, false);
                  if (newHp <= 0) {
                    antData.isAlive = false;
                    antData.x = -999;
                    antData.y = -999;
                    isFighting = false;
                    nextState = 'patrol';

                    // If a combat ant falls, trigger an 18s raid loss tactical cooldown
                    if (antData.antClass === 'tank' || antData.antClass === 'warrior' || antData.antClass === 'guard') {
                      raidLossCooldownEndTimeRef.current = performance.now() + 18000;
                      autoRaidTargetEnemyIdRef.current = null;
                    }
                  }
                }
              }
            }

            return {
              ...enemy,
              x: Math.max(8, Math.min(92, nextX)),
              y: Math.max(8, Math.min(92, nextY)),
              heading: nextHeading,
              state: nextState,
              targetAntId: (targetAnt as any).id,
              lastAttackTime: nextLastAttack,
              isFighting,
              isStationary: false,
              lastCombatTime: now,
            };
          } else {
            // ─── NATURAL WAYPOINT ROAM & IDLE STOP MECHANIC ───
            nextState = 'patrol';
            isFighting = false;

            const enemyTypeStats = ENEMY_TYPE_STATS[enemy.insectType];
            let wpX = enemy.waypointX ?? enemy.spawnX;
            let wpY = enemy.waypointY ?? enemy.spawnY;
            let nextSpawnX = enemy.spawnX;
            let nextSpawnY = enemy.spawnY;
            let nextIdleTimer = enemy.idleTimer ?? 0;
            let isStationary = enemy.isStationary ?? false;

            // Collect all other living enemy locations (current positions, anchors, and targets)
            const otherEnemyLocations: { x: number; y: number }[] = [];
            prevEnemies.forEach(other => {
              if (other.id !== enemy.id && other.state !== 'dead' && other.state !== 'respawning') {
                otherEnemyLocations.push({ x: other.x, y: other.y });
                otherEnemyLocations.push({ x: other.spawnX, y: other.spawnY });
                if (other.waypointX && other.waypointY) {
                  otherEnemyLocations.push({ x: other.waypointX, y: other.waypointY });
                }
              }
            });

            // If another enemy gets too close to a stationary enemy, immediately wake up and relocate
            if (isStationary) {
              const isCrowdedByOther = prevEnemies.some(
                other => other.id !== enemy.id && other.state !== 'dead' && other.state !== 'respawning' && Math.hypot(other.x - enemy.x, other.y - enemy.y) < 10.0
              );
              if (isCrowdedByOther) {
                nextIdleTimer = 0;
              }

              nextIdleTimer -= dt;
              if (nextIdleTimer <= 0) {
                // Dynamically migrate territory avoiding all other enemies
                const newWp = getRandomWaypointInTerritory(enemy.x, enemy.y, otherEnemyLocations);
                wpX = newWp.x;
                wpY = newWp.y;
                nextSpawnX = newWp.newSpawnX;
                nextSpawnY = newWp.newSpawnY;
                isStationary = false;
                nextIdleTimer = 0;
              }
            } else {
              const dx = wpX - enemy.x;
              const dy = wpY - enemy.y;
              const distToWp = Math.hypot(dx, dy);

              if (distToWp < 1.4) {
                isStationary = true;
                nextIdleTimer = 2.5 + Math.random() * 3.5; // Idle and observe the new area for 2.5 - 6.0s
              } else {
                // Dynamic mutual separation repulsion steering between all living enemies
                let repelDx = 0;
                let repelDy = 0;
                prevEnemies.forEach(other => {
                  if (other.id !== enemy.id && other.state !== 'dead' && other.state !== 'respawning') {
                    const dist = Math.hypot(other.x - enemy.x, other.y - enemy.y);
                    if (dist < 14.0 && dist > 0.1) {
                      const strength = Math.pow((14.0 - dist) / 14.0, 2);
                      repelDx += ((enemy.x - other.x) / dist) * strength * 2.5;
                      repelDy += ((enemy.y - other.y) / dist) * strength * 2.5;
                    }
                  }
                });

                const moveDx = (dx / (distToWp || 0.001)) + repelDx;
                const moveDy = (dy / (distToWp || 0.001)) + repelDy;
                const desiredAngle = Math.atan2(moveDx, -moveDy);
                const diff = angleDiff(enemy.heading, desiredAngle);
                nextHeading += Math.max(-2.6 * dt, Math.min(2.6 * dt, diff));

                const speed = enemyTypeStats.speed * 0.6;
                nextX += Math.sin(nextHeading) * speed * dt;
                nextY += -Math.cos(nextHeading) * speed * dt;
              }
            }

            return {
              ...enemy,
              x: Math.max(8, Math.min(92, nextX)),
              y: Math.max(8, Math.min(92, nextY)),
              spawnX: nextSpawnX,
              spawnY: nextSpawnY,
              heading: nextHeading,
              state: nextState,
              targetAntId: null,
              lastAttackTime: nextLastAttack,
              isFighting: false,
              waypointX: wpX,
              waypointY: wpY,
              isStationary,
              idleTimer: nextIdleTimer,
            };
          }
        });

        return updated;
      });

      rafId = requestAnimationFrame(enemyTick);
    }

    rafId = requestAnimationFrame(enemyTick);
    return () => cancelAnimationFrame(rafId);
  }, [triggerDamageSplat]);

  // ─── SPECTATOR CAMERA AUTO-FOCUS / FOLLOW SYSTEM ───
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    function autoFocusTick(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Auto-focus is paused when user is hovering the card or manually dragging/zooming
      if (!isMouseOverCardRef.current && !isDragging) {
        let targetPos: { x: number; y: number } | null = null;
        let isFightingFocus = false;

        const manualTargetId = selectedTargetEnemyIdRef.current;
        const targetedEnemy = manualTargetId
          ? enemiesRef.current.find(e => e.id === manualTargetId && e.state !== 'dead' && e.state !== 'respawning')
          : null;

        // ─── 0. TOP PRIORITY: CLICK-TO-TARGET DYNAMIC COMBAT FOCUS FLOW ───
        if (targetedEnemy) {
          const distHqToEnemy = Math.hypot(HQ.x - targetedEnemy.x, HQ.y - targetedEnemy.y);
          let closestCombatAnt: { id: string; x: number; y: number; dist: number } | null = null;
          let minAntDist = Infinity;

          antsPositionRef.current.forEach(ant => {
            if (ant.isAlive && ant.hp > 0 && (ant.antClass === 'tank' || ant.antClass === 'warrior' || ant.antClass === 'guard')) {
              const d = Math.hypot(ant.x - targetedEnemy.x, ant.y - targetedEnemy.y);
              if (d < minAntDist) {
                minAntDist = d;
                closestCombatAnt = { id: ant.id, x: ant.x, y: ant.y, dist: d };
              }
            }
          });

          const isFightingNow = targetedEnemy.isFighting || targetedEnemy.state === 'aggro' || minAntDist <= 4.0;
          const isAntsHalfway = !isFightingNow && closestCombatAnt !== null && minAntDist <= distHqToEnemy * 0.65 && minAntDist > 4.0;

          if (isFightingNow) {
            // Bring focus back to target enemy while fighting
            isFightingFocus = true;
            currentFocusTargetRef.current = { type: 'enemy', id: targetedEnemy.id, switchTime: now + 4000 };
            targetPos = { x: targetedEnemy.x, y: targetedEnemy.y };
          } else if (isAntsHalfway && closestCombatAnt) {
            // Focus on charging ants marching halfway towards the enemy
            const leadAnt: { id: string; x: number; y: number; dist: number } = closestCombatAnt;
            currentFocusTargetRef.current = { type: 'ant', id: leadAnt.id, switchTime: now + 4000 };
            targetPos = { x: leadAnt.x, y: leadAnt.y };
          } else {
            // Keep focus on the target enemy initially
            currentFocusTargetRef.current = { type: 'enemy', id: targetedEnemy.id, switchTime: now + 4000 };
            targetPos = { x: targetedEnemy.x, y: targetedEnemy.y };
          }
        } else {
          // 1. Priority 1: Check if any enemy is actively fighting
          const fightingEnemy = enemiesRef.current.find(
            e => (e.state === 'aggro' || e.isFighting) && e.state !== 'dead' && e.state !== 'respawning'
          );

          // 2. Priority 2: Stay focused on dropped enemy loot after enemy dies
          const droppedLoot = (!fightingEnemy && recentlyDroppedLootRef.current && now < recentlyDroppedLootRef.current.time)
            ? groundItemsRef.current.find(it => it.id === recentlyDroppedLootRef.current?.id && it.harvestsLeft > 0)
            : null;

          // 3. Priority 3: Check if an enemy has recently respawned
          const respawnedEnemy = (!fightingEnemy && !droppedLoot && recentlyRespawnedEnemyRef.current && now < recentlyRespawnedEnemyRef.current.time)
            ? enemiesRef.current.find(e => e.id === recentlyRespawnedEnemyRef.current?.id && e.state !== 'dead' && e.state !== 'respawning')
            : null;

          if (fightingEnemy) {
            isFightingFocus = true;
            currentFocusTargetRef.current = { type: 'enemy', id: fightingEnemy.id, switchTime: now + 4000 };
            targetPos = { x: fightingEnemy.x, y: fightingEnemy.y };
          } else if (droppedLoot) {
            currentFocusTargetRef.current = { type: 'loot', id: droppedLoot.id, switchTime: now + 4500 };
            targetPos = { x: droppedLoot.x, y: droppedLoot.y };
          } else if (respawnedEnemy) {
            currentFocusTargetRef.current = { type: 'enemy', id: respawnedEnemy.id, switchTime: now + 3500 };
            targetPos = { x: respawnedEnemy.x, y: respawnedEnemy.y };
          } else {
            // 4. Priority 4: Worker ant about to collect or drop item
            const curTarget = currentFocusTargetRef.current;
            const isCurrentlyFocusingWorker = curTarget?.type === 'ant' && curTarget.isWorkerAction && now < curTarget.switchTime;

            if (isCurrentlyFocusingWorker) {
              // Stay locked onto this specific worker ant until their action/time is complete
              const ant = antsPositionRef.current.get(curTarget.id);
              if (ant && ant.isAlive && ant.x > 0 && ant.y > 0) {
                targetPos = { x: ant.x, y: ant.y };
              } else {
                currentFocusTargetRef.current = null;
                nextAllowedWorkerFocusTimeRef.current = now + 16000;
              }
            } else {
              const canFocusWorkerAction = now > nextAllowedWorkerFocusTimeRef.current;
              const activeWorkers: { id: string; x: number; y: number; actionType?: 'collecting' | 'dropping' }[] = [];

              if (canFocusWorkerAction) {
                antsPositionRef.current.forEach(ant => {
                  if (ant.isAlive && ant.x > 0 && ant.y > 0 && ant.antClass === 'worker' && ant.isNearAction) {
                    activeWorkers.push({ id: ant.id, x: ant.x, y: ant.y, actionType: ant.workerActionType });
                  }
                });
              }

              if (activeWorkers.length > 0) {
                const alternatingWorkers = activeWorkers.filter(w => w.actionType && w.actionType !== lastWorkerActionTypeRef.current);
                const pool = alternatingWorkers.length > 0 ? alternatingWorkers : activeWorkers;
                const picked = pool[Math.floor(Math.random() * pool.length)];

                lastWorkerActionTypeRef.current = picked.actionType || null;
                currentFocusTargetRef.current = {
                  type: 'ant',
                  id: picked.id,
                  isWorkerAction: true,
                  switchTime: now + 4000,
                };
                targetPos = { x: picked.x, y: picked.y };
                nextAllowedWorkerFocusTimeRef.current = now + 4000 + 16000;
              } else {
                // 5. Priority 5: Follow a random ant or roaming enemy, switching every 5-7.5 seconds
                let isValid = false;

                if (curTarget && now < curTarget.switchTime && !curTarget.isWorkerAction) {
                  if (curTarget.type === 'enemy') {
                    const en = enemiesRef.current.find(e => e.id === curTarget.id && e.state !== 'dead' && e.state !== 'respawning');
                    if (en) {
                      targetPos = { x: en.x, y: en.y };
                      isValid = true;
                    }
                  } else {
                    const ant = antsPositionRef.current.get(curTarget.id);
                    if (ant && ant.isAlive && ant.x > 0 && ant.y > 0) {
                      targetPos = { x: ant.x, y: ant.y };
                      isValid = true;
                    }
                  }
                }

                if (!isValid) {
                  const candidates: { type: 'enemy' | 'ant'; id: string; x: number; y: number }[] = [];

                  enemiesRef.current.forEach(e => {
                    if (e.state !== 'dead' && e.state !== 'respawning') {
                      candidates.push({ type: 'enemy', id: e.id, x: e.x, y: e.y });
                    }
                  });

                  antsPositionRef.current.forEach(a => {
                    if (a.isAlive && a.x > 0 && a.y > 0) {
                      candidates.push({ type: 'ant', id: a.id, x: a.x, y: a.y });
                    }
                  });

                  if (candidates.length > 0) {
                    const picked = candidates[Math.floor(Math.random() * candidates.length)];
                    currentFocusTargetRef.current = {
                      type: picked.type,
                      id: picked.id,
                      isWorkerAction: false,
                      switchTime: now + 5000 + Math.random() * 2500,
                    };
                    targetPos = { x: picked.x, y: picked.y };
                  }
                }
              }
            }
          }
        }

        // Dynamic Zoom Level: Zoom in during active combat encounters, keep DEFAULT_ZOOM otherwise
        const targetZoom = isFightingFocus
          ? Math.min(MAX_ZOOM_IN, COMBAT_ZOOM)
          : DEFAULT_ZOOM;
        const currentZ = zoomRef.current;
        let nextZ = currentZ;

        if (Math.abs(targetZoom - currentZ) > 0.005) {
          nextZ = currentZ + (targetZoom - currentZ) * Math.min(1, dt * 2.2);
          setZoom(nextZ);
        }

        // Smoothly pan camera towards the focused unit
        if (targetPos) {
          const effectiveZoom = nextZ;
          const dX_map = (targetPos.x / 100 - 0.5) * MAP_WIDTH;
          const dY_map = (targetPos.y / 100 - 0.5) * MAP_HEIGHT;
          const desiredPan = clampPan({ x: -dX_map * effectiveZoom, y: -dY_map * effectiveZoom }, effectiveZoom, containerRef.current);

          setPan(prevPan => {
            const lerpSpeed = Math.min(1, dt * 2.5); // Smooth cinematic follow
            const nextX = prevPan.x + (desiredPan.x - prevPan.x) * lerpSpeed;
            const nextY = prevPan.y + (desiredPan.y - prevPan.y) * lerpSpeed;
            return clampPan({ x: nextX, y: nextY }, effectiveZoom, containerRef.current);
          });
        }
      }

      rafId = requestAnimationFrame(autoFocusTick);
    }

    rafId = requestAnimationFrame(autoFocusTick);
    return () => cancelAnimationFrame(rafId);
  }, [isDragging]);

  // Mouse Drag to Pan / Double-Click Drag to Zoom Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left click only

    const now = performance.now();
    const timeSinceLastClick = now - lastMouseDownTimeRef.current;
    const distFromLastClick = Math.hypot(
      e.clientX - lastMouseDownPosRef.current.x,
      e.clientY - lastMouseDownPosRef.current.y
    );

    hasDraggedRef.current = false;
    setIsDragging(true);

    if (timeSinceLastClick < 380 && distFromLastClick < 30) {
      // ─── Double Click & Hold Detected -> Quick Zoom Mode ───
      isQuickZoomingRef.current = true;
      setIsQuickZooming(true);
      zoomDragStartYRef.current = e.clientY;
      zoomDragStartZoomRef.current = zoomRef.current;
      lastMouseDownTimeRef.current = 0; // Consume double click
    } else {
      // ─── Regular Click -> Pan Mode ───
      isQuickZoomingRef.current = false;
      setIsQuickZooming(false);
      lastMouseDownTimeRef.current = now;
      lastMouseDownPosRef.current = { x: e.clientX, y: e.clientY };
      dragStartRef.current = {
        x: e.clientX - pan.x,
        y: e.clientY - pan.y,
      };
    }
  };

  function clampPan(targetPan: { x: number; y: number }, currentZoom: number, container: HTMLElement | null): { x: number; y: number } {
    const viewW = container?.clientWidth || 1000;
    const viewH = container?.clientHeight || 650;
    const mapW = MAP_WIDTH * currentZoom;
    const mapH = MAP_HEIGHT * currentZoom;

    const maxPanX = Math.max(0, (mapW - viewW) / 2);
    const maxPanY = Math.max(0, (mapH - viewH) / 2);

    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, targetPan.x)),
      y: Math.max(-maxPanY, Math.min(maxPanY, targetPan.y)),
    };
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    const moveDist = Math.hypot(
      e.clientX - lastMouseDownPosRef.current.x,
      e.clientY - (isQuickZoomingRef.current ? zoomDragStartYRef.current : lastMouseDownPosRef.current.y)
    );
    if (moveDist > 3) {
      hasDraggedRef.current = true;
    }

    if (isQuickZoomingRef.current) {
      // ─── Double-Click Drag to Zoom ───
      // Moving mouse UP (deltaY < 0): zoom in (closer view)
      // Moving mouse DOWN (deltaY > 0): zoom out (wider view)
      const deltaY = e.clientY - zoomDragStartYRef.current;
      const sensitivity = 0.005;
      const targetZoom = zoomDragStartZoomRef.current - deltaY * sensitivity;
      const clampedZoom = Math.min(MAX_ZOOM_IN, Math.max(MAX_ZOOM_OUT, +targetZoom.toFixed(3)));
      setZoom(clampedZoom);
      setPan(prev => clampPan(prev, clampedZoom, containerRef.current));
    } else {
      // ─── Regular Drag to Pan (Strictly Clamped to Map Bounds) ───
      const rawPan = {
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      };
      setPan(clampPan(rawPan, zoomRef.current, containerRef.current));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    isQuickZoomingRef.current = false;
    setIsQuickZooming(false);
  };

  // Scroll to Zoom Handler with Map Bounds Clamping
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setZoom(prev => {
      const nextZoom = Math.min(MAX_ZOOM_IN, Math.max(MAX_ZOOM_OUT, +(prev + delta).toFixed(2)));
      setPan(currentPan => clampPan(currentPan, nextZoom, containerRef.current));
      return nextZoom;
    });
  };

  const handleResetView = () => {
    setZoom(DEFAULT_ZOOM);
    setPan({ x: 0, y: 0 });
  };

  const aliveEnemiesCount = enemies.filter(e => e.state !== 'dead' && e.state !== 'respawning').length;
  const targetedEnemy = enemies.find(e => e.id === selectedTargetEnemyId && e.state !== 'dead' && e.state !== 'respawning');

  return (
    <div
      ref={containerRef}
      className={`flex-1 w-full h-full relative rounded-xl overflow-hidden select-none border border-slate-200 shadow-inner bg-[#3d6025] flex flex-col justify-between ${isQuickZooming ? 'cursor-ns-resize' : isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      onMouseEnter={() => {
        isMouseOverCardRef.current = true;
        setIsCardHovered(true);
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        isMouseOverCardRef.current = false;
        setIsCardHovered(false);
        handleMouseUp();
      }}
      onWheel={handleWheel}
      onClick={() => {
        // Deselect target, item, and HQ if clicking empty terrain without dragging
        if (!hasDraggedRef.current) {
          setSelectedTargetEnemyId(null);
          setSelectedItemId(null);
          setIsHqSelected(false);
        }
      }}
    >
      <style>{`
        /* Ant Realistic 6-Leg Walking Cycles */
        @keyframes legSwingFrontL {
          0%, 100% { transform: rotate(-22deg); }
          50% { transform: rotate(24deg); }
        }
        @keyframes legSwingFrontR {
          0%, 100% { transform: rotate(24deg); }
          50% { transform: rotate(-22deg); }
        }
        @keyframes legSwingMidL {
          0%, 100% { transform: rotate(20deg); }
          50% { transform: rotate(-20deg); }
        }
        @keyframes legSwingMidR {
          0%, 100% { transform: rotate(-20deg); }
          50% { transform: rotate(20deg); }
        }
        @keyframes legSwingRearL {
          0%, 100% { transform: rotate(-24deg); }
          50% { transform: rotate(22deg); }
        }
        @keyframes legSwingRearR {
          0%, 100% { transform: rotate(22deg); }
          50% { transform: rotate(-24deg); }
        }

        /* Enemy Beetle 6-Leg Walking Animations */
        @keyframes beetleLegFrontL {
          0%, 100% { transform: rotate(-18deg); }
          50% { transform: rotate(20deg); }
        }
        @keyframes beetleLegFrontR {
          0%, 100% { transform: rotate(20deg); }
          50% { transform: rotate(-18deg); }
        }
        @keyframes beetleLegMidL {
          0%, 100% { transform: rotate(18deg); }
          50% { transform: rotate(-18deg); }
        }
        @keyframes beetleLegMidR {
          0%, 100% { transform: rotate(-18deg); }
          50% { transform: rotate(18deg); }
        }
        @keyframes beetleLegRearL {
          0%, 100% { transform: rotate(-20deg); }
          50% { transform: rotate(18deg); }
        }
        @keyframes beetleLegRearR {
          0%, 100% { transform: rotate(18deg); }
          50% { transform: rotate(-20deg); }
        }

        /* Enemy Spider 8-Leg Walking Animations */
        @keyframes spiderLegFL {
          0%, 100% { transform: rotate(-22deg); }
          50% { transform: rotate(22deg); }
        }
        @keyframes spiderLegFR {
          0%, 100% { transform: rotate(22deg); }
          50% { transform: rotate(-22deg); }
        }
        @keyframes spiderLegMFL {
          0%, 100% { transform: rotate(18deg); }
          50% { transform: rotate(-18deg); }
        }
        @keyframes spiderLegMFR {
          0%, 100% { transform: rotate(-18deg); }
          50% { transform: rotate(18deg); }
        }
        @keyframes spiderLegMRL {
          0%, 100% { transform: rotate(-18deg); }
          50% { transform: rotate(18deg); }
        }
        @keyframes spiderLegMRR {
          0%, 100% { transform: rotate(18deg); }
          50% { transform: rotate(-18deg); }
        }
        @keyframes spiderLegRL {
          0%, 100% { transform: rotate(-22deg); }
          50% { transform: rotate(20deg); }
        }
        @keyframes spiderLegRR {
          0%, 100% { transform: rotate(20deg); }
          50% { transform: rotate(-22deg); }
        }

        /* Enemy Ladybug 6-Leg Walking Animations */
        @keyframes ladybugLegFL {
          0%, 100% { transform: rotate(-20deg); }
          50% { transform: rotate(20deg); }
        }
        @keyframes ladybugLegFR {
          0%, 100% { transform: rotate(20deg); }
          50% { transform: rotate(-20deg); }
        }
        @keyframes ladybugLegML {
          0%, 100% { transform: rotate(16deg); }
          50% { transform: rotate(-16deg); }
        }
        @keyframes ladybugLegMR {
          0%, 100% { transform: rotate(-16deg); }
          50% { transform: rotate(16deg); }
        }
        @keyframes ladybugLegRL {
          0%, 100% { transform: rotate(-20deg); }
          50% { transform: rotate(20deg); }
        }
        @keyframes ladybugLegRR {
          0%, 100% { transform: rotate(20deg); }
          50% { transform: rotate(-20deg); }
        }

        /* Enemy Wasp 6-Leg Walking Animations */
        @keyframes waspLegFL {
          0%, 100% { transform: rotate(-20deg); }
          50% { transform: rotate(20deg); }
        }
        @keyframes waspLegFR {
          0%, 100% { transform: rotate(20deg); }
          50% { transform: rotate(-20deg); }
        }
        @keyframes waspLegML {
          0%, 100% { transform: rotate(16deg); }
          50% { transform: rotate(-16deg); }
        }
        @keyframes waspLegMR {
          0%, 100% { transform: rotate(-16deg); }
          50% { transform: rotate(16deg); }
        }
        @keyframes waspLegRL {
          0%, 100% { transform: rotate(-20deg); }
          50% { transform: rotate(20deg); }
        }
        @keyframes waspLegRR {
          0%, 100% { transform: rotate(20deg); }
          50% { transform: rotate(-20deg); }
        }

        @keyframes nestPulse {
          0%, 100% { transform: scale(1); opacity: 0.35; }
          50% { transform: scale(1.15); opacity: 0.75; }
        }
        @keyframes wingFlutterL {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-18deg) scaleY(0.85); }
        }
        @keyframes wingFlutterR {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(18deg) scaleY(0.85); }
        }
        @keyframes clashSpark {
          0%, 100% { transform: scale(0.6) rotate(0deg); opacity: 0.3; }
          50% { transform: scale(1.2) rotate(45deg); opacity: 1; }
        }
        @keyframes itemSpawnIn {
          0% { transform: scale(0); opacity: 0; }
          70% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes carriedItemBounce {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-1.5px) scale(1.05); }
        }
        @keyframes floatDamageUp {
          0% { opacity: 1; transform: translateY(0px) scale(1.25); }
          50% { transform: translateY(-16px) scale(1); opacity: 0.95; }
          100% { opacity: 0; transform: translateY(-30px) scale(0.8); }
        }
        @keyframes combatPulseShimmer {
          0%, 100% { opacity: 1; filter: drop-shadow(0 0 1px rgba(245,158,11,0.2)); }
          50% { opacity: 0.85; filter: drop-shadow(0 0 4px rgba(245,158,11,0.8)); }
        }
        @keyframes targetPing {
          0% { transform: scale(0.9); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.4; }
          100% { transform: scale(0.9); opacity: 1; }
        }
      `}</style>

      {/* ─── 1. EXPANSIVE 2D MEADOW MAP (1200px x 800px) ─── */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none will-change-transform"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: isDragging ? 'none' : 'transform 0.15s ease-out',
        }}
      >
        <div
          className="w-[1200px] h-[800px] relative shrink-0 shadow-2xl rounded-3xl overflow-hidden border-4 border-[#253e16]"
          style={{
            background: `
              radial-gradient(circle 110px at 50% 50%, rgba(85, 56, 30, 0.35) 0%, rgba(72, 48, 26, 0.15) 50%, transparent 100%),
              radial-gradient(ellipse 260px 120px at 22% 24%, rgba(85, 56, 30, 0.28) 0%, rgba(72, 94, 38, 0.12) 60%, transparent 100%),
              radial-gradient(ellipse 240px 120px at 78% 76%, rgba(85, 56, 30, 0.28) 0%, rgba(72, 94, 38, 0.12) 60%, transparent 100%),
              radial-gradient(ellipse 200px 100px at 82% 22%, rgba(80, 52, 28, 0.22) 0%, transparent 100%),
              radial-gradient(ellipse 200px 100px at 18% 78%, rgba(80, 52, 28, 0.22) 0%, transparent 100%),
              linear-gradient(135deg, #466b28 0%, #598334 25%, #4f752c 50%, #5e8a38 75%, #3a561f 100%)
            `,
          }}
        >
          {/* Ground Soil & Grass Texture Grain Layers */}
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#1e3510_1.5px,transparent_1.5px)] [background-size:22px_22px] pointer-events-none" />
          <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#3a2512_1.5px,transparent_1.5px)] [background-size:32px_32px] pointer-events-none" />

          {/* Safe Zone Boundary Ring around Ant HQ */}
          <div
            className="absolute rounded-full border border-amber-400/25 pointer-events-none"
            style={{
              width: '19%',
              height: '19%',
              top: '40.5%',
              left: '40.5%',
            }}
          />

          {/* ─── 2. DYNAMIC RANDOMLY SPAWNED GROUND RESOURCE & LOOT ITEMS ─── */}
          {groundItems.map(item => (
            <div
              key={item.id}
              className="absolute -ml-4 -mt-4 pointer-events-auto cursor-pointer flex flex-col items-center group/item transition-all duration-300 z-20"
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                animation: 'itemSpawnIn 0.4s ease-out',
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedItemId(prev => prev === item.id ? null : item.id);
                setSelectedTargetEnemyId(null);
              }}
            >
              {item.type === 'leaf' && (
                <VectorLeaf className="w-9 h-9 text-emerald-400 drop-shadow-md group-hover/item:scale-115 transition-transform" />
              )}
              {item.type === 'mushroom' && (
                <VectorMushroom className="w-9 h-9 drop-shadow-md group-hover/item:scale-115 transition-transform" />
              )}
              {item.type === 'seed' && (
                <VectorSeed className="w-7 h-8 text-amber-300 drop-shadow-md group-hover/item:scale-115 transition-transform" />
              )}
              {item.type === 'insect_loot' && (
                <VectorInsectLoot className="w-10 h-10 drop-shadow-lg group-hover/item:scale-120 transition-transform animate-bounce" />
              )}
            </div>
          ))}

          {/* Scattered Grass & Terrain Details */}
          <div className="absolute top-[20%] left-[15%]"><VectorGrassTuft className="w-7 h-5 opacity-60 text-[#1e3810]" /></div>
          <div className="absolute top-[28%] left-[24%]"><VectorGrassTuft className="w-6 h-4 opacity-55 text-[#1e3810]" /></div>
          <div className="absolute top-[38%] left-[34%]"><VectorGrassTuft className="w-5 h-3 opacity-55 text-[#1e3810]" /></div>
          <div className="absolute bottom-[25%] left-[18%]"><VectorGrassTuft className="w-7 h-5 opacity-60 text-[#1e3810]" /></div>
          <div className="absolute bottom-[35%] left-[28%]"><VectorGrassTuft className="w-6 h-4 opacity-60 text-[#1e3810]" /></div>
          <div className="absolute top-[22%] right-[18%]"><VectorGrassTuft className="w-7 h-5 opacity-60 text-[#1e3810]" /></div>
          <div className="absolute top-[32%] right-[28%]"><VectorGrassTuft className="w-6 h-4 opacity-60 text-[#1e3810]" /></div>
          <div className="absolute bottom-[28%] right-[20%]"><VectorGrassTuft className="w-7 h-5 opacity-55 text-[#1e3810]" /></div>
          <div className="absolute bottom-[38%] right-[32%]"><VectorGrassTuft className="w-5 h-3 opacity-55 text-[#1e3810]" /></div>
          <div className="absolute top-[68%] right-[15%]"><VectorGrassTuft className="w-7 h-5 opacity-60 text-[#1e3810]" /></div>

          {/* ─── 3. DYNAMIC ENEMY INSECTS (WAYPOINT ROAM & IDLE STOP) ─── */}
          {enemies.map(enemy => {
            if (enemy.state === 'dead' || enemy.state === 'respawning') return null;

            const isWalking = !enemy.isFighting && !enemy.isStationary;
            const isTargeted = selectedTargetEnemyId === enemy.id;

            return (
              <div
                key={enemy.id}
                className="absolute pointer-events-auto cursor-pointer will-change-transform z-30 transition-opacity duration-300"
                style={{
                  left: `${enemy.x}%`,
                  top: `${enemy.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                onMouseEnter={() => setHoveredEnemyId(enemy.id)}
                onMouseLeave={() => setHoveredEnemyId(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTargetEnemyId(prev => (prev === enemy.id ? null : enemy.id));
                }}
              >
                {/* Clicked Target Reticle Ring */}
                {isTargeted && (
                  <div
                    className="absolute -inset-4 rounded-full border-2 border-red-500 pointer-events-none"
                    style={{ animation: 'targetPing 1s ease-in-out infinite' }}
                  />
                )}

                {/* 1. ROTATED BODY WRAPPER */}
                <div
                  className="relative will-change-transform flex items-center justify-center"
                  style={{
                    transform: `rotate(${enemy.heading * (180 / Math.PI)}deg)`,
                    transformOrigin: 'center center',
                  }}
                >
                  <div style={{ animation: enemy.isFighting ? 'combatPulseShimmer 0.4s ease-in-out infinite' : 'none' }}>
                    {zoom < SIMPLE_MODEL_ZOOM_TRIGGER ? (
                      <InsectLowDetail insectType={enemy.insectType} isWalking={isWalking} />
                    ) : (
                      <>
                        {enemy.insectType === 'beetle' && (
                          <InsectBeetle className="w-18 h-20 text-[#2c1810] filter drop-shadow-xl" isWalking={isWalking} />
                        )}
                        {enemy.insectType === 'spider' && (
                          <InsectSpider className="w-20 h-20 text-[#18181b] filter drop-shadow-xl" isWalking={isWalking} />
                        )}
                        {enemy.insectType === 'ladybug' && (
                          <InsectLadybug className="w-18 h-18 filter drop-shadow-xl" isWalking={isWalking} />
                        )}
                        {enemy.insectType === 'wasp' && (
                          <InsectWasp className="w-20 h-20 filter drop-shadow-xl" isWalking={isWalking} />
                        )}
                      </>
                    )}
                  </div>

                  {/* Aggro / Clash Indicator */}
                  {enemy.state === 'aggro' && (
                    <div
                      className="absolute -top-3 -right-2 text-sm select-none animate-pulse"
                      style={{ animation: 'clashSpark 0.6s ease-in-out infinite' }}
                    >
                      ⚔️
                    </div>
                  )}
                </div>

                {/* 2. BOSS HEALTH BAR — absolutely positioned below the enemy so it never pushes the body */}
                {(() => {
                  const now = performance.now();
                  const isInCombat = enemy.isFighting || enemy.state === 'aggro' || (enemy.lastCombatTime > 0 && (now - enemy.lastCombatTime < 3000));
                  const showHealthBar = isTargeted || hoveredEnemyId === enemy.id || isInCombat;

                  if (!showHealthBar) return null;

                  return (
                    <div className="absolute left-1/2 -translate-x-1/2 top-full mt-0.5 flex items-center pointer-events-none select-none animate-in fade-in duration-200">
                      {/* Boss Health Bar */}
                      <div className="w-16 h-2 rounded-full bg-black/90 border border-purple-500/80 shadow-[0_0_8px_rgba(168,85,247,0.5)] overflow-hidden relative">
                        <div
                          className={`h-full transition-all duration-150 ${enemy.hp / enemy.maxHp > 0.5
                              ? 'bg-gradient-to-r from-purple-500 via-rose-500 to-amber-400'
                              : enemy.hp / enemy.maxHp > 0.25
                                ? 'bg-gradient-to-r from-rose-600 via-amber-500 to-amber-300'
                                : 'bg-gradient-to-r from-red-700 via-red-600 to-rose-500 animate-pulse'
                            }`}
                          style={{ width: `${Math.max(0, Math.min(100, (enemy.hp / enemy.maxHp) * 100))}%` }}
                        />
                        {/* Segment Notches */}
                        <div className="absolute inset-0 flex justify-evenly pointer-events-none opacity-40">
                          <div className="w-[1px] h-full bg-slate-950" />
                          <div className="w-[1px] h-full bg-slate-950" />
                          <div className="w-[1px] h-full bg-slate-950" />
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}

          {/* ─── 4. CENTRAL ANTHILL HQ MOUND (UPANG) ─── */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center pointer-events-auto cursor-pointer z-10 select-none group/hq transition-transform hover:scale-105"
            onClick={(e) => {
              e.stopPropagation();
              setIsHqSelected(prev => !prev);
              setSelectedTargetEnemyId(null);
              setSelectedItemId(null);
            }}
          >
            <div className={`w-40 h-40 rounded-full bg-radial from-[#8c6239] via-[#6f4b27] to-[#4d3217]/95 shadow-2xl flex items-center justify-center border-4 transition-colors ${isHqSelected ? 'border-amber-400 ring-4 ring-amber-400/40 animate-pulse' : 'border-[#a67c4e]/70 group-hover/hq:border-amber-300'} relative`}>
              <div className="w-28 h-28 rounded-full bg-radial from-[#593c1f] via-[#452d15] to-[#36210e] flex items-center justify-center border-2 border-[#b38b59]/60 shadow-inner relative">
                <div
                  className="absolute inset-0 rounded-full border-2 border-amber-300/40"
                  style={{ animation: 'nestPulse 3s ease-in-out infinite' }}
                />
                <div className="w-16 h-16 rounded-full bg-radial from-[#050302] via-[#120a06] to-[#24150b] border-2 border-[#1a0e07] shadow-[inset_0_4px_10px_rgba(0,0,0,0.95)] flex flex-col items-center justify-center relative overflow-hidden">
                  <span className="text-[0.6rem] filter drop-shadow-xs -mb-0.5">🔥</span>
                  <span className="text-[0.65rem] font-black text-amber-300 tracking-wider uppercase drop-shadow-md">
                    UPANG
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ─── 5. EXACT 1:1 ROLE-BASED FRIENDLY ANTS ─── */}
          {antMembers.map((member, i) => {
            const antClass = roleToAntClass(member.role);
            return (
              <AutonomousRoleAnt
                key={`ant-${member.id}`}
                member={member}
                antIndex={i}
                antClass={antClass}
                isLowDetail={zoom < SIMPLE_MODEL_ZOOM_TRIGGER}
                groundItemsRef={groundItemsRef}
                enemiesRef={enemiesRef}
                antsPositionRef={antsPositionRef}
                selectedTargetEnemyIdRef={selectedTargetEnemyIdRef}
                autoRaidTargetEnemyIdRef={autoRaidTargetEnemyIdRef}
                isMouseOverCardRef={isMouseOverCardRef}
                onHarvest={handleHarvest}
                onDeposit={handleDeposit}
                onAttackEnemy={handleAntAttackEnemy}
                onHover={setHoveredAnt}
              />
            );
          })}

          {/* ─── 6. FLOATING RPG DAMAGE HIT NUMBERS ─── */}
          {damageSplats.map(splat => (
            <div
              key={splat.id}
              className={`absolute pointer-events-none font-black text-xs filter drop-shadow-md z-50 ${splat.isEnemyDamage ? 'text-amber-300 font-extrabold' : 'text-red-400 font-black'}`}
              style={{
                left: `${splat.x}%`,
                top: `${splat.y}%`,
                animation: 'floatDamageUp 0.85s ease-out forwards',
              }}
            >
              {splat.isEnemyDamage ? `-${splat.damage}` : `💥 -${splat.damage}`}
            </div>
          ))}
        </div>
      </div>

      {/* ─── 7. TOP RIGHT HOVERED ANT, ENEMY (CLICK/HOVER), OR ITEM (CLICK) STATS POPUP ─── */}
      {hoveredAnt ? (
        <div className="absolute top-3 right-3 z-50 pointer-events-none animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-3.5 py-2.5 rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-2xl flex flex-col gap-1 min-w-44 text-white">
            {/* Header: Member Name & Role */}
            <div className="flex items-center justify-between gap-2.5">
              <span className="text-xs font-black text-white truncate max-w-[130px] drop-shadow-xs">
                {hoveredAnt.member.name || hoveredAnt.member.email || 'Friendly Ant'}
              </span>
              <span className={`text-[0.6rem] font-bold ${roleStyles[hoveredAnt.member.role]?.textColor || 'text-slate-300'}`}>
                {hoveredAnt.member.role}
              </span>
            </div>

            {/* Health & Damage Numbers */}
            <div className="mt-1 flex items-center justify-between text-[0.625rem] font-extrabold border-t border-slate-800 pt-1.5">
              <div className="flex items-center gap-1 text-emerald-400">
                <span>❤️</span>
                <span>{hoveredAnt.hp} / {hoveredAnt.maxHp} HP</span>
              </div>
              <div className="flex items-center gap-1 text-amber-400">
                <span>⚔️</span>
                <span>{hoveredAnt.attack} DMG</span>
              </div>
            </div>

            {/* Mini Visual Health Bar */}
            <div className="w-full h-1.5 rounded-full bg-black/60 border border-slate-750 overflow-hidden mt-0.5">
              <div
                className={`h-full transition-all duration-150 ${hoveredAnt.hp / hoveredAnt.maxHp > 0.5 ? 'bg-emerald-400' : hoveredAnt.hp / hoveredAnt.maxHp > 0.25 ? 'bg-amber-400' : 'bg-red-500'}`}
                style={{ width: `${Math.max(0, Math.min(100, (hoveredAnt.hp / hoveredAnt.maxHp) * 100))}%` }}
              />
            </div>
          </div>
        </div>
      ) : hoveredEnemyId ? (() => {
        const inspectedEnemy = enemies.find(e => e.id === hoveredEnemyId && e.state !== 'dead' && e.state !== 'respawning');
        if (!inspectedEnemy) return null;

        return (
          <div className="absolute top-3 right-3 z-50 pointer-events-none animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="px-3.5 py-2.5 rounded-xl bg-slate-900/95 backdrop-blur-md border border-purple-500/40 shadow-2xl flex flex-col gap-1 min-w-48 text-white">
              {/* Header: Enemy Member Name & Role */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-purple-200 truncate max-w-[125px] drop-shadow-xs flex items-center gap-1">
                  <span>👑</span>
                  <span>{inspectedEnemy.memberName}</span>
                </span>
                <span className="text-[0.6rem] font-bold text-purple-400">
                  Admin
                </span>
              </div>

              {/* Health & Damage Numbers */}
              <div className="mt-1 flex items-center justify-between text-[0.625rem] font-extrabold border-t border-slate-800 pt-1.5">
                <div className="flex items-center gap-1 text-emerald-400">
                  <span>❤️</span>
                  <span>{inspectedEnemy.hp} / {inspectedEnemy.maxHp} HP</span>
                </div>
                <div className="flex items-center gap-1 text-amber-400">
                  <span>⚔️</span>
                  <span>{inspectedEnemy.attack} DMG</span>
                </div>
              </div>

              {/* Mini Visual Health Bar */}
              <div className="w-full h-1.5 rounded-full bg-black/60 border border-slate-750 overflow-hidden mt-0.5">
                <div
                  className="h-full bg-gradient-to-r from-red-600 via-amber-500 to-purple-500 transition-all duration-150"
                  style={{ width: `${Math.max(0, Math.min(100, (inspectedEnemy.hp / inspectedEnemy.maxHp) * 100))}%` }}
                />
              </div>
            </div>
          </div>
        );
      })() : selectedItemId ? (() => {
        const item = groundItems.find(it => it.id === selectedItemId);
        if (!item) return null;

        const itemNames: Record<ResourceType, string> = {
          leaf: 'Botanical Leaf',
          seed: 'Amber Seed',
          mushroom: 'Mushroom Spore',
          insect_loot: item.lootName || 'Trophy Chitin',
        };

        const itemIcons: Record<ResourceType, string> = {
          leaf: '🍃',
          seed: '🌰',
          mushroom: '🍄',
          insect_loot: '🏆',
        };

        return (
          <div className="absolute top-3 right-3 z-50 pointer-events-none animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="px-3.5 py-2.5 rounded-xl bg-slate-900/95 backdrop-blur-md border border-emerald-500/40 shadow-2xl flex flex-col gap-1 min-w-44 text-white">
              {/* Header: Item Name & Type */}
              <div className="flex items-center justify-between gap-2.5">
                <span className="text-xs font-black text-emerald-300 truncate max-w-[130px] drop-shadow-xs flex items-center gap-1.5">
                  <span className="text-sm">{itemIcons[item.type]}</span>
                  <span>{itemNames[item.type]}</span>
                </span>
                <span className="text-[0.6rem] font-bold text-slate-400 capitalize">
                  Resource
                </span>
              </div>

              {/* Harvests Count */}
              <div className="mt-1 flex items-center justify-between text-[0.625rem] font-extrabold border-t border-slate-800 pt-1.5">
                <div className="flex items-center gap-1 text-amber-300">
                  <span>🌾</span>
                  <span>Remaining: {item.harvestsLeft} / {item.maxHarvests}</span>
                </div>
              </div>

              {/* Harvest Progress Bar */}
              <div className="w-full h-1.5 rounded-full bg-black/60 border border-slate-750 overflow-hidden mt-0.5">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-150"
                  style={{ width: `${Math.max(0, Math.min(100, (item.harvestsLeft / item.maxHarvests) * 100))}%` }}
                />
              </div>
            </div>
          </div>
        );
      })() : (!isCardHovered && focusedAntData) ? (() => {
        const rawText = focusedAntData.status === 'Pending' || !focusedAntData.name
          ? (focusedAntData.email || focusedAntData.name || 'Friendly Ant')
          : focusedAntData.name;
        const displayName = rawText.includes('@') ? rawText.split('@')[0] : rawText;

        return (
          <div className="absolute top-3 right-3 z-40 pointer-events-none animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="h-8 px-3 rounded-xl bg-slate-900/90 backdrop-blur-md border border-emerald-500/40 shadow-2xl flex items-center gap-2 max-w-[200px] text-white">
              <span className="text-xs font-bold text-white truncate drop-shadow-xs leading-none">
                {displayName}
              </span>
              <span className={`text-[0.55rem] font-extrabold px-1.5 py-0.5 rounded border shrink-0 leading-tight ${roleStyles[focusedAntData.role]?.badge || 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                {focusedAntData.role}
              </span>
            </div>
          </div>
        );
      })() : null}

      {/* ─── 6. TOP LEFT: TOTAL MEMBERS HUD ─── */}
      <div className="absolute top-3 left-3 z-50 pointer-events-none flex items-center gap-2">
        <div className="h-8 px-3 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 shadow-2xl flex items-center text-white">
          <span className="text-xs font-black text-white tracking-wide leading-none">{totalCount} Total</span>
        </div>
      </div>

      {/* ─── 9. BOTTOM LEFT: HQ DETAILED STATS (WHEN HQ IS CLICKED) ─── */}
      {isHqSelected && (
        <div className="absolute bottom-3 left-3 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="px-4 py-3 rounded-2xl bg-slate-900/95 backdrop-blur-md border border-emerald-500/50 shadow-2xl flex flex-col gap-2 min-w-56 text-white">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-950 border border-emerald-400/80 flex items-center justify-center text-sm shadow-inner">
                  🏰
                </div>
                <div>
                  <div className="text-xs font-black text-emerald-300">Ant HQ Colony</div>
                  <div className="text-[0.55rem] font-bold text-amber-400 uppercase tracking-wider">UPANG Base</div>
                </div>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-white text-xs p-1 rounded-md hover:bg-slate-800 cursor-pointer transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsHqSelected(false);
                }}
              >
                ✕
              </button>
            </div>

            {/* Stats Grid: Total, Active, Pending */}
            <div className="grid grid-cols-3 gap-2 text-center py-0.5">
              <div className="px-2 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
                <div className="text-[0.55rem] font-bold text-slate-400 uppercase">Total</div>
                <div className="text-sm font-black text-white">{totalCount}</div>
              </div>
              <div className="px-2 py-1.5 rounded-xl bg-emerald-950/70 border border-emerald-500/40">
                <div className="text-[0.55rem] font-bold text-emerald-400 uppercase">Active</div>
                <div className="text-sm font-black text-emerald-300">{activeCount}</div>
              </div>
              <div className="px-2 py-1.5 rounded-xl bg-amber-950/70 border border-amber-500/40">
                <div className="text-[0.55rem] font-bold text-amber-400 uppercase">Pending</div>
                <div className="text-sm font-black text-amber-300">{pendingCount}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 10. OFF-SCREEN EDGE INDICATORS (FOR HQ & ENEMIES - HIDDEN WHILE IN FIGHT) ─── */}
      {!isFightingActive && (() => {
        const padding = 16;
        const cx = containerSize.width / 2;
        const cy = containerSize.height / 2;
        const halfW = cx - padding;
        const halfH = cy - padding;

        const getScreenPos = (mapX: number, mapY: number) => {
          const mapPxX = (mapX / 100 - 0.5) * MAP_WIDTH;
          const mapPxY = (mapY / 100 - 0.5) * MAP_HEIGHT;
          return {
            x: cx + mapPxX * zoom + pan.x,
            y: cy + mapPxY * zoom + pan.y,
          };
        };

        const getClampedEdgePos = (screenX: number, screenY: number) => {
          const dx = screenX - cx;
          const dy = screenY - cy;
          const isInside =
            screenX >= padding &&
            screenX <= containerSize.width - padding &&
            screenY >= padding &&
            screenY <= containerSize.height - padding;

          if (isInside) return null;

          const scale = Math.min(
            halfW / (Math.abs(dx) || 0.0001),
            halfH / (Math.abs(dy) || 0.0001)
          );

          const clampedX = cx + dx * scale;
          const clampedY = cy + dy * scale;

          return { x: clampedX, y: clampedY };
        };

        const hqScreenPos = getScreenPos(HQ.x, HQ.y);
        const hqEdge = getClampedEdgePos(hqScreenPos.x, hqScreenPos.y);

        const enemyEdges = enemies
          .filter(e => e.state !== 'dead' && e.state !== 'respawning')
          .map(e => {
            const pos = getScreenPos(e.x, e.y);
            const edge = getClampedEdgePos(pos.x, pos.y);
            return edge ? { enemy: e, edge } : null;
          })
          .filter((item): item is { enemy: EnemyInsect; edge: { x: number; y: number } } => item !== null);

        const insectIcons: Record<InsectType, string> = {
          beetle: '🪲',
          spider: '🕷️',
          ladybug: '🐞',
          wasp: '🐝',
        };

        return (
          <>
            {/* HQ Off-screen Indicator */}
            {hqEdge && (
              <button
                type="button"
                className="absolute z-30 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-emerald-950/90 hover:bg-emerald-900 border border-emerald-400/80 shadow-2xl flex items-center justify-center text-sm text-white cursor-pointer transition-transform hover:scale-125 animate-in fade-in duration-200"
                style={{ left: `${hqEdge.x}px`, top: `${hqEdge.y}px` }}
                onClick={(e) => {
                  e.stopPropagation();
                  setPan({ x: 0, y: 0 });
                  setZoom(DEFAULT_ZOOM);
                }}
                title="Pan to Colony HQ"
              >
                <span>🏰</span>
              </button>
            )}

            {/* Enemy Off-screen Indicators */}
            {enemyEdges.map(({ enemy, edge }) => (
              <button
                key={enemy.id}
                type="button"
                className="absolute z-30 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-900/90 hover:bg-purple-950/95 border border-purple-500/80 shadow-2xl flex items-center justify-center text-xs text-white cursor-pointer transition-transform hover:scale-125 animate-in fade-in duration-200"
                style={{ left: `${edge.x}px`, top: `${edge.y}px` }}
                onClick={(e) => {
                  e.stopPropagation();
                  const dX_map = (enemy.x / 100 - 0.5) * MAP_WIDTH;
                  const dY_map = (enemy.y / 100 - 0.5) * MAP_HEIGHT;
                  setPan({ x: -dX_map * zoom, y: -dY_map * zoom });
                }}
                title={`View ${enemy.memberName} (${enemy.insectType})`}
              >
                <span>{insectIcons[enemy.insectType] || '🪲'}</span>
              </button>
            ))}
          </>
        );
      })()}

    </div>
  );
}

// ─── AUTONOMOUS ROLE-BASED ANT COMPONENT ───

interface AutonomousRoleAntProps {
  member: Member;
  antIndex: number;
  antClass: AntClass;
  isLowDetail?: boolean;
  groundItemsRef: React.MutableRefObject<GroundItem[]>;
  enemiesRef: React.MutableRefObject<EnemyInsect[]>;
  antsPositionRef: React.MutableRefObject<Map<string, AntRegistryEntry>>;
  selectedTargetEnemyIdRef: React.MutableRefObject<string | null>;
  autoRaidTargetEnemyIdRef: React.MutableRefObject<string | null>;
  isMouseOverCardRef: React.MutableRefObject<boolean>;
  onHarvest: (itemId: string) => void;
  onDeposit: (type: ResourceType) => void;
  onAttackEnemy: (antId: string, enemyId: string, damage: number, attackerName: string, attackerRole: MemberRole) => void;
  onHover: (stats: HoveredAntStats | null) => void;
}

function AutonomousRoleAnt({
  member,
  antIndex,
  antClass,
  isLowDetail = false,
  groundItemsRef,
  enemiesRef,
  antsPositionRef,
  selectedTargetEnemyIdRef,
  autoRaidTargetEnemyIdRef,
  isMouseOverCardRef,
  onHarvest,
  onDeposit,
  onAttackEnemy,
  onHover,
}: AutonomousRoleAntProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [carriedItem, setCarriedItem] = useState<CarriedItem>('none');
  const stats = ANT_CLASS_STATS[antClass];

  const [currentHp, setCurrentHp] = useState(stats.maxHp);
  const lastRenderedHpRef = useRef(stats.maxHp);
  const [isDead, setIsDead] = useState(false);
  const [isScared, setIsScared] = useState(false);
  const [isFighting, setIsFighting] = useState(false);
  const [isStationary, setIsStationary] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const isHoveredRef = useRef(false);

  // Persistent callback refs to avoid recreating the animation frame loop on re-renders
  const onHarvestRef = useRef(onHarvest);
  onHarvestRef.current = onHarvest;
  const onDepositRef = useRef(onDeposit);
  onDepositRef.current = onDeposit;
  const onAttackEnemyRef = useRef(onAttackEnemy);
  onAttackEnemyRef.current = onAttackEnemy;
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;

  // Stagger initial attacks and preserve attack cooldown timestamp across renders
  const lastAttackTimeRef = useRef(performance.now() + Math.random() * 500);

  useEffect(() => {
    const baseSpeed = 2.4 + (antIndex % 4) * 0.3;
    const turnRate = 1.3 + (antIndex % 3) * 0.3;
    const wobbleFreq = 0.8 + (antIndex % 4) * 0.2;
    const wobbleAmp = 0.15 + (antIndex % 3) * 0.05;

    let antState: 'exiting_hq' | 'seeking_item' | 'returning_hq' | 'guard_patrol' | 'garrison_patrol' | 'charging_target' | 'fighting' | 'dead' | 'respawning' =
      antClass === 'guard' ? 'guard_patrol' : antClass === 'worker' ? 'exiting_hq' : 'garrison_patrol';

    let localCarried: CarriedItem = 'none';
    let hp = stats.maxHp;
    let isAlive = true;
    let respawnCooldownRemaining = 0;

    let x = HQ.x + (Math.random() - 0.5) * 3;
    let y = HQ.y + (Math.random() - 0.5) * 3;
    let heading = (antIndex * (Math.PI / 4)) % (Math.PI * 2);
    let wobblePhase = antIndex * 1.5;
    let lastTime = performance.now();
    let currentTargetId: string | null = null;
    let lastSpookTime = 0;

    // ─── WAYPOINT ROAM & IDLE STOP STATE FOR PATROLLING ANTS ───
    let patrolWpX = HQ.x;
    let patrolWpY = HQ.y;
    let isAntStationary = false;
    let antIdleTimer = 0;

    if (antClass === 'guard' || antClass === 'tank' || antClass === 'warrior') {
      const initWp = pickRandomHQPatrolPoint(antClass === 'guard' ? 6 : 7, antClass === 'guard' ? 10 : 12);
      patrolWpX = initWp.x;
      patrolWpY = initWp.y;
    }

    const antId = `ant-${member.id}`;
    antsPositionRef.current.set(antId, {
      id: antId,
      memberId: member.id,
      name: member.name || member.email || 'Friendly Ant',
      email: member.email,
      avatar: member.avatar,
      department: member.department,
      role: member.role,
      status: member.status,
      antClass,
      x,
      y,
      hp,
      maxHp: stats.maxHp,
      attack: stats.attack,
      isAlive: true,
      activityText: 'Patrolling Colony',
      carriedItem: 'none',
    });

    function selectSafeTargetItem(excludeItemId?: string | null): { x: number; y: number; id: string } | null {
      const items = groundItemsRef.current;
      if (!items || items.length === 0) return null;

      const activeEnemies = enemiesRef.current.filter(e => e.state !== 'dead' && e.state !== 'respawning');
      const safeItems = items.filter(it => {
        if (excludeItemId && it.id === excludeItemId) return false;
        return !activeEnemies.some(e => Math.hypot(e.x - it.x, e.y - it.y) < 13);
      });

      const pool = safeItems.length > 0 ? safeItems : items.filter(it => !excludeItemId || it.id !== excludeItemId);
      if (pool.length === 0) return null;

      // 🏆 Top Priority: Enemy Loot Drops (Trophy Chitin from defeated boss insects)
      const enemyLootDrops = pool.filter(it => it.type === 'insect_loot' && it.harvestsLeft > 0);
      if (enemyLootDrops.length > 0) {
        const sortedLoot = [...enemyLootDrops].sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
        const chosen = sortedLoot[antIndex % sortedLoot.length];
        return { x: chosen.x, y: chosen.y, id: chosen.id };
      }

      const target = pool[(antIndex + Math.floor(Math.random() * pool.length)) % pool.length];
      return target ? { x: target.x, y: target.y, id: target.id } : null;
    }

    let targetCoords = selectSafeTargetItem() || { x: 35, y: 35, id: '' };
    currentTargetId = targetCoords.id;

    let rafId = 0;

    function tick(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const registryEntry = antsPositionRef.current.get(antId);
      if (registryEntry) {
        hp = registryEntry.hp;
        if (hp !== lastRenderedHpRef.current) {
          lastRenderedHpRef.current = hp;
          setCurrentHp(hp);
        }
      }

      if (hp <= 0 && isAlive) {
        isAlive = false;
        setIsDead(true);
        setIsFighting(false);
        setIsStationary(false);
        antState = 'dead';
        respawnCooldownRemaining = stats.respawnCooldown;
        x = -999;
        y = -999;
        if (registryEntry) {
          registryEntry.isAlive = false;
          registryEntry.hp = 0;
          registryEntry.x = -999;
          registryEntry.y = -999;
        }
      }

      if (!isAlive) {
        respawnCooldownRemaining -= dt;
        if (respawnCooldownRemaining <= 0) {
          isAlive = true;
          setIsDead(false);
          setIsFighting(false);
          setIsStationary(false);
          isAntStationary = false;
          hp = stats.maxHp;
          lastRenderedHpRef.current = stats.maxHp;
          setCurrentHp(stats.maxHp);
          x = HQ.x + (Math.random() - 0.5) * 3;
          y = HQ.y + (Math.random() - 0.5) * 3;
          antState = antClass === 'guard' ? 'guard_patrol' : antClass === 'worker' ? 'exiting_hq' : 'garrison_patrol';
          if (antClass === 'guard' || antClass === 'tank' || antClass === 'warrior') {
            const nextWp = pickRandomHQPatrolPoint(antClass === 'guard' ? 6 : 7, antClass === 'guard' ? 10 : 12);
            patrolWpX = nextWp.x;
            patrolWpY = nextWp.y;
          }
          if (registryEntry) {
            registryEntry.hp = stats.maxHp;
            registryEntry.isAlive = true;
            registryEntry.x = x;
            registryEntry.y = y;
          }
        } else {
          if (registryEntry) {
            registryEntry.isAlive = false;
            registryEntry.hp = 0;
            registryEntry.x = -999;
            registryEntry.y = -999;
          }
          rafId = requestAnimationFrame(tick);
          return;
        }
      }

      let targetX = HQ.x;
      let targetY = HQ.y;
      let afraid = false;
      let fighting = false;

      // ─── CLASS-SPECIFIC AI LOGIC (WAYPOINT ROAM & IDLE STOP) ───

      if (antClass === 'guard') {
        const activeEnemies = enemiesRef.current.filter(e => e.state !== 'dead' && e.state !== 'respawning');

        // 1. If targeted by any enemy while walking, retaliate against that enemy immediately
        const enemyTargetingMe = activeEnemies.find(e =>
          (e.targetAntId === antId || (e.state === 'aggro' && Math.hypot(e.x - x, e.y - y) < 13.5))
        );

        // 2. Otherwise prioritize the threatening enemy closest to HQ
        const sortedThreats = [...activeEnemies]
          .filter(e => Math.hypot(e.x - HQ.x, e.y - HQ.y) < 13 || Math.hypot(e.x - x, e.y - y) < 11)
          .sort((a, b) => Math.hypot(a.x - HQ.x, a.y - HQ.y) - Math.hypot(b.x - HQ.x, b.y - HQ.y));
        const threateningEnemy = enemyTargetingMe || sortedThreats[0] || null;

        if (threateningEnemy) {
          isAntStationary = false;
          targetX = threateningEnemy.x;
          targetY = threateningEnemy.y;
          const distToEnemy = Math.hypot(targetX - x, targetY - y);

          if (distToEnemy < 3.2) {
            fighting = true;
            if (now - lastAttackTimeRef.current > 1200) {
              lastAttackTimeRef.current = now;
              onAttackEnemyRef.current(antId, threateningEnemy.id, stats.attack, member.name || 'Guard', member.role);
            }
          }
        } else {
          // Patrol Waypoint Roam & Stop Mechanic
          if (isAntStationary) {
            targetX = patrolWpX;
            targetY = patrolWpY;
            antIdleTimer -= dt;
            if (antIdleTimer <= 0) {
              const newWp = pickRandomHQPatrolPoint(6, 10);
              patrolWpX = newWp.x;
              patrolWpY = newWp.y;
              isAntStationary = false;
              antIdleTimer = 0;
            }
          } else {
            targetX = patrolWpX;
            targetY = patrolWpY;
            const distToWp = Math.hypot(targetX - x, targetY - y);
            if (distToWp < 1.2) {
              isAntStationary = true;
              antIdleTimer = 2.0 + Math.random() * 3.0; // Stand guard at waypoint for 2.0 - 5.0 seconds
            }
          }
        }

      } else if (antClass === 'tank' || antClass === 'warrior') {
        const activeEnemies = enemiesRef.current.filter(e => e.state !== 'dead' && e.state !== 'respawning');

        // 1. If targeted by any enemy while walking, retaliate against that enemy immediately
        const enemyTargetingMe = activeEnemies.find(e =>
          (e.targetAntId === antId || (e.state === 'aggro' && Math.hypot(e.x - x, e.y - y) < 13.5))
        );

        // 2. Manual click target or auto raid target (closest to HQ)
        const manualTargetId = selectedTargetEnemyIdRef.current;
        const autoRaidTargetId = !isMouseOverCardRef.current ? autoRaidTargetEnemyIdRef.current : null;
        const activeTargetId = manualTargetId || autoRaidTargetId;

        let targetEnemy: EnemyInsect | null = enemyTargetingMe || null;

        if (!targetEnemy && activeTargetId) {
          targetEnemy = activeEnemies.find(e => e.id === activeTargetId) || null;
        }

        // 3. Proactive Colony HQ Perimeter Defense (Only engage if an enemy invades near the HQ mound)
        if (!targetEnemy) {
          const HQ_DEFENSE_PROXIMITY = 16.0;
          const nearbyEnemies = activeEnemies.filter(
            e => Math.hypot(e.x - HQ.x, e.y - HQ.y) <= HQ_DEFENSE_PROXIMITY || Math.hypot(e.x - x, e.y - y) < 10.0
          );

          if (nearbyEnemies.length > 0) {
            const sortedDefenders = [...nearbyEnemies].sort((a, b) => Math.hypot(a.x - HQ.x, a.y - HQ.y) - Math.hypot(b.x - HQ.x, b.y - HQ.y));
            targetEnemy = sortedDefenders[0] || null;
          }
        }

        if (targetEnemy) {
          isAntStationary = false;
          targetX = targetEnemy.x;
          targetY = targetEnemy.y;
          const distToEnemy = Math.hypot(targetX - x, targetY - y);

          if (distToEnemy < 3.2) {
            fighting = true;
            const cooldown = antClass === 'warrior' ? 1000 : 1300;
            if (now - lastAttackTimeRef.current > cooldown) {
              lastAttackTimeRef.current = now;
              onAttackEnemyRef.current(antId, targetEnemy.id, stats.attack, member.name || stats.title, member.role);
            }
          }
        } else {
          // Garrison Waypoint Roam & Stop Mechanic
          if (isAntStationary) {
            targetX = patrolWpX;
            targetY = patrolWpY;
            antIdleTimer -= dt;
            if (antIdleTimer <= 0) {
              const newWp = pickRandomHQPatrolPoint(7, 12);
              patrolWpX = newWp.x;
              patrolWpY = newWp.y;
              isAntStationary = false;
              antIdleTimer = 0;
            }
          } else {
            targetX = patrolWpX;
            targetY = patrolWpY;
            const distToWp = Math.hypot(targetX - x, targetY - y);
            if (distToWp < 1.2) {
              isAntStationary = true;
              antIdleTimer = 2.5 + Math.random() * 3.5; // Garrison post guard for 2.5 - 6.0 seconds
            }
          }
        }

      } else {
        // Worker Gatherer
        const activeEnemies = enemiesRef.current.filter(e => e.state !== 'dead' && e.state !== 'respawning');
        let repulsionX = 0;
        let repulsionY = 0;

        activeEnemies.forEach(e => {
          const d = Math.hypot(e.x - x, e.y - y);
          if (d < 13) {
            afraid = true;
            const repStrength = (13 - d) / 13;
            repulsionX += ((x - e.x) / d) * repStrength * 35;
            repulsionY += ((y - e.y) / d) * repStrength * 35;
          }
        });

        if (afraid && now - lastSpookTime > 2000) {
          lastSpookTime = now;
          if (antState === 'seeking_item' || antState === 'exiting_hq') {
            const newSafeTarget = selectSafeTargetItem(currentTargetId);
            if (newSafeTarget) {
              targetCoords = newSafeTarget;
              currentTargetId = newSafeTarget.id;
              targetX = newSafeTarget.x;
              targetY = newSafeTarget.y;
            }
          }
        }

        setIsScared(afraid);

        if (antState === 'returning_hq') {
          targetX = HQ.x;
          targetY = HQ.y;
          const distToHQ = Math.hypot(targetX - x, targetY - y);

          if (distToHQ < 3.2) {
            if (localCarried !== 'none') {
              onDepositRef.current(localCarried as ResourceType);
            }
            localCarried = 'none';
            setCarriedItem('none');
            antState = 'exiting_hq';
            const nextTarget = selectSafeTargetItem();
            if (nextTarget) {
              targetCoords = nextTarget;
              currentTargetId = nextTarget.id;
            }
          }
        } else {
          // Dynamic Priority Check: If a rare enemy loot drop appeared, switch target immediately
          const currentItem = groundItemsRef.current.find(it => it.id === currentTargetId);
          if (currentItem && currentItem.type !== 'insect_loot') {
            const hasEnemyLoot = groundItemsRef.current.some(it => it.type === 'insect_loot' && it.harvestsLeft > 0);
            if (hasEnemyLoot) {
              const lootTarget = selectSafeTargetItem();
              if (lootTarget && lootTarget.id !== currentTargetId) {
                targetCoords = lootTarget;
                currentTargetId = lootTarget.id;
                targetX = lootTarget.x;
                targetY = lootTarget.y;
              }
            }
          }

          if (currentItem) {
            targetX = currentItem.x;
            targetY = currentItem.y;
          } else {
            const newTarget = selectSafeTargetItem();
            if (newTarget) {
              targetCoords = newTarget;
              currentTargetId = newTarget.id;
              targetX = newTarget.x;
              targetY = newTarget.y;
            }
          }

          const distToItem = Math.hypot(targetX - x, targetY - y);
          if (distToItem < 3.5 && currentTargetId) {
            const itemToHarvest = groundItemsRef.current.find(it => it.id === currentTargetId);
            if (itemToHarvest) {
              const harvestedType = itemToHarvest.type;
              localCarried = harvestedType;
              setCarriedItem(harvestedType);
              onHarvestRef.current(currentTargetId);
              antState = 'returning_hq';
            }
          }
        }

        if (afraid) {
          targetX += repulsionX;
          targetY += repulsionY;
        }
      }

      setIsFighting(fighting);
      setIsStationary(isAntStationary);

      const isStopped = fighting || isAntStationary || isHoveredRef.current;

      if (!isAntStationary && !isHoveredRef.current) {
        const toDx = targetX - x;
        const toDy = targetY - y;
        const desiredHeading = Math.atan2(toDx, -toDy);

        const diff = angleDiff(heading, desiredHeading);
        const maxTurn = turnRate * dt;
        heading += Math.max(-maxTurn, Math.min(maxTurn, diff));
      }

      wobblePhase += dt * wobbleFreq * Math.PI * 2;
      const wobble = isStopped ? 0 : Math.sin(wobblePhase) * (afraid ? wobbleAmp * 2 : wobbleAmp);
      const effectiveHeading = heading + wobble;

      const currentSpeed = isStopped ? 0 : afraid ? baseSpeed * 1.35 : baseSpeed;
      if (!isStopped) {
        x += Math.sin(effectiveHeading) * currentSpeed * dt;
        y += -Math.cos(effectiveHeading) * currentSpeed * dt;
      }

      x = Math.max(5, Math.min(95, x));
      y = Math.max(5, Math.min(95, y));

      if (registryEntry) {
        registryEntry.x = x;
        registryEntry.y = y;
        registryEntry.hp = hp;
        registryEntry.isAlive = isAlive;
        registryEntry.carriedItem = localCarried;
        const isDropping = antState === 'returning_hq' && Math.hypot(HQ.x - x, HQ.y - y) < 14;
        const isCollecting = localCarried === 'none' && Math.hypot(targetX - x, targetY - y) < 12;
        registryEntry.isNearAction = (antClass === 'worker') && (isDropping || isCollecting);
        registryEntry.workerActionType = isDropping ? 'dropping' : isCollecting ? 'collecting' : undefined;

        // Dynamic activity label
        if (!isAlive) {
          registryEntry.activityText = 'Respawning at Colony HQ';
        } else if (antClass === 'guard') {
          if (fighting) {
            registryEntry.activityText = 'Defending HQ Perimeter';
          } else if (isAntStationary) {
            registryEntry.activityText = 'Standing Guard on Watch';
          } else {
            registryEntry.activityText = 'Patrolling HQ Perimeter';
          }
        } else if (antClass === 'tank' || antClass === 'warrior') {
          if (fighting) {
            registryEntry.activityText = antClass === 'tank' ? 'Shielding in Combat' : 'Striking Boss Insect';
          } else if (isAntStationary) {
            registryEntry.activityText = 'Garrisoned on Watch';
          } else {
            registryEntry.activityText = 'Patrolling Territory';
          }
        } else {
          // Worker
          if (afraid) {
            registryEntry.activityText = 'Evading Hostile Predator';
          } else if (antState === 'returning_hq' || localCarried !== 'none') {
            if (localCarried === 'leaf') registryEntry.activityText = 'Delivering Botanical Leaf';
            else if (localCarried === 'mushroom') registryEntry.activityText = 'Delivering Spore to HQ';
            else if (localCarried === 'seed') registryEntry.activityText = 'Delivering Amber Seed';
            else if (localCarried === 'insect_loot') registryEntry.activityText = 'Hauling Trophy Loot';
            else registryEntry.activityText = 'Returning Resources to HQ';
          } else {
            registryEntry.activityText = 'Foraging Meadow Resources';
          }
        }
      }

      if (elRef.current) {
        elRef.current.style.left = `${x}%`;
        elRef.current.style.top = `${y}%`;
      }

      if (bodyRef.current) {
        bodyRef.current.style.transform = `rotate(${effectiveHeading * (180 / Math.PI)}deg)`;
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      antsPositionRef.current.delete(antId);
    };
  }, [member.id, member.role, antIndex, antClass, stats.maxHp, stats.attack, stats.respawnCooldown]);

  if (isDead) {
    return null;
  }

  // Only walk when not fighting, not dead, not stopped at waypoint, and not hovered
  const isWalking = !isFighting && !isDead && !isStationary && !isHovered;

  return (
    <div
      ref={elRef}
      className={`absolute pointer-events-auto cursor-pointer -ml-3.5 -mt-4 will-change-transform z-30 flex flex-col items-center ${isScared ? 'animate-pulse' : ''}`}
      onMouseEnter={() => {
        isHoveredRef.current = true;
        setIsHovered(true);
        onHoverRef.current({
          member,
          antClass,
          hp: currentHp,
          maxHp: stats.maxHp,
          attack: stats.attack,
        });
      }}
      onMouseLeave={() => {
        isHoveredRef.current = false;
        setIsHovered(false);
        onHoverRef.current(null);
      }}
    >
      {/* 1. ROTATED ANT BODY */}
      <div
        ref={bodyRef}
        className="relative will-change-transform flex items-center justify-center"
        style={{
          transformOrigin: 'center center',
        }}
      >
        <div style={{ animation: isFighting ? 'combatPulseShimmer 0.4s ease-in-out infinite' : 'none' }}>
          <AntBody member={member} carriedItem={carriedItem} antClass={antClass} isWalking={isWalking} isLowDetail={isLowDetail} />
        </div>
      </div>

      {/* 2. HEALTH BAR DISPLAYED BELOW FIGHTING ANTS */}
      {isFighting && (
        <div className="w-8 h-1.5 rounded-full bg-black/80 border border-slate-700/80 overflow-hidden mt-1 shadow-md pointer-events-none">
          <div
            className={`h-full transition-all duration-150 ${currentHp / stats.maxHp > 0.5
                ? 'bg-emerald-400'
                : currentHp / stats.maxHp > 0.25
                  ? 'bg-amber-400'
                  : 'bg-red-500'
              }`}
            style={{ width: `${Math.max(0, Math.min(100, (currentHp / stats.maxHp) * 100))}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Top-Down Realistic Vector Ant with Articulated Leg Walking and Combat Stance
 * Supports Level of Detail (LOD) switching when zoomed out
 */
function AntBody({
  member,
  carriedItem,
  antClass,
  isWalking = true,
  isLowDetail = false
}: {
  member: Member;
  carriedItem: CarriedItem;
  antClass: AntClass;
  isWalking?: boolean;
  isLowDetail?: boolean;
}) {
  const roleStyle = roleStyles[member.role] || roleStyles.Instructor;
  const initial = (member.name || member.email || 'M').charAt(0).toUpperCase();
  const animPlayState = isWalking ? 'running' : 'paused';

  if (isLowDetail) {
    return (
      <div className="relative flex flex-col items-center select-none filter drop-shadow-[0_0_5px_rgba(255,255,255,0.7)]">
        {/* Carried Item Icon */}
        {carriedItem !== 'none' && (
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none text-[0.7rem] drop-shadow-md">
            {carriedItem === 'leaf' && '🍃'}
            {carriedItem === 'seed' && '🌰'}
            {carriedItem === 'mushroom' && '🍄'}
            {carriedItem === 'insect_loot' && '🏆'}
          </div>
        )}

        {/* High-Contrast Bold Ant Silhouette for Zoomed Out Map View */}
        <svg className="w-8 h-9 overflow-visible" viewBox="0 0 24 28">
          {/* Bold Directional Legs */}
          <path d="M 6,10 L 1,6 M 18,10 L 23,6 M 5,14 L 0,15 M 19,14 L 24,15 M 6,18 L 1,23 M 18,18 L 23,23" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" opacity="0.9" />
          <path d="M 6,10 L 1,6 M 18,10 L 23,6 M 5,14 L 0,15 M 19,14 L 24,15 M 6,18 L 1,23 M 18,18 L 23,23" stroke="#1c1917" strokeWidth="1.4" strokeLinecap="round" />

          {/* Abdomen */}
          <ellipse cx="12" cy="20" rx="4.8" ry="5.5" fill="#1c1917" stroke="#ffffff" strokeWidth="1.4" />

          {/* Thorax with Vibrant Role Color */}
          <ellipse cx="12" cy="13" rx="4" ry="4" fill={roleStyle.hex} stroke="#ffffff" strokeWidth="1.6" />

          {/* Head */}
          <circle cx="12" cy="6.8" r="3.6" fill="#1c1917" stroke="#ffffff" strokeWidth="1.4" />

          {/* High Contrast Initial */}
          <text
            x="12"
            y="8.5"
            textAnchor="middle"
            fontSize="4"
            fontWeight="900"
            fill="#ffffff"
            fontFamily="sans-serif"
          >
            {initial}
          </text>
        </svg>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center group/ant select-none">

      {/* ─── PROMINENT CARRIED ITEM IN MANDIBLES ─── */}
      {carriedItem === 'leaf' && (
        <div
          className="absolute -top-4.5 left-1/2 -translate-x-1/2 z-40 pointer-events-none filter drop-shadow-md"
          style={{ animation: 'carriedItemBounce 0.25s ease-in-out infinite' }}
        >
          <VectorLeaf className="w-5.5 h-5.5 text-emerald-300 rotate-15" />
        </div>
      )}

      {carriedItem === 'seed' && (
        <div
          className="absolute -top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none filter drop-shadow-md"
          style={{ animation: 'carriedItemBounce 0.25s ease-in-out infinite' }}
        >
          <VectorSeed className="w-4 h-5 text-amber-300" />
        </div>
      )}

      {carriedItem === 'mushroom' && (
        <div
          className="absolute -top-4.5 left-1/2 -translate-x-1/2 z-40 pointer-events-none filter drop-shadow-md"
          style={{ animation: 'carriedItemBounce 0.25s ease-in-out infinite' }}
        >
          <VectorMushroom className="w-5 h-5" />
        </div>
      )}

      {carriedItem === 'insect_loot' && (
        <div
          className="absolute -top-5 left-1/2 -translate-x-1/2 z-40 pointer-events-none filter drop-shadow-md"
          style={{ animation: 'carriedItemBounce 0.25s ease-in-out infinite' }}
        >
          <VectorInsectLoot className="w-5 h-5" />
        </div>
      )}

      {/* Realistic Top-Down Ant Vector SVG */}
      <svg className="w-7 h-8 overflow-visible" viewBox="0 0 24 28">

        {/* ─── 6 PROPERLY ARTICULATED / JOINTED LEGS WITH PAUSE DURING COMBAT/IDLE ─── */}
        <g style={{ transformOrigin: '8px 12px', animation: `legSwingFrontL 0.22s ease-in-out infinite`, animationPlayState: animPlayState }}>
          <path d="M 8,12 Q 3,9 2,5" fill="none" stroke="#1c1917" strokeWidth="1.2" strokeLinecap="round" />
        </g>
        <g style={{ transformOrigin: '16px 12px', animation: `legSwingFrontR 0.22s ease-in-out infinite`, animationPlayState: animPlayState }}>
          <path d="M 16,12 Q 21,9 22,5" fill="none" stroke="#1c1917" strokeWidth="1.2" strokeLinecap="round" />
        </g>

        <g style={{ transformOrigin: '7px 14px', animation: `legSwingMidL 0.22s ease-in-out infinite`, animationPlayState: animPlayState }}>
          <path d="M 7,14 Q 2,14 1,18" fill="none" stroke="#1c1917" strokeWidth="1.2" strokeLinecap="round" />
        </g>
        <g style={{ transformOrigin: '17px 14px', animation: `legSwingMidR 0.22s ease-in-out infinite`, animationPlayState: animPlayState }}>
          <path d="M 17,14 Q 22,14 23,18" fill="none" stroke="#1c1917" strokeWidth="1.2" strokeLinecap="round" />
        </g>

        <g style={{ transformOrigin: '8px 16px', animation: `legSwingRearL 0.22s ease-in-out infinite`, animationPlayState: animPlayState }}>
          <path d="M 8,16 Q 4,21 3,26" fill="none" stroke="#1c1917" strokeWidth="1.2" strokeLinecap="round" />
        </g>
        <g style={{ transformOrigin: '16px 16px', animation: `legSwingRearR 0.22s ease-in-out infinite`, animationPlayState: animPlayState }}>
          <path d="M 16,16 Q 20,21 21,26" fill="none" stroke="#1c1917" strokeWidth="1.2" strokeLinecap="round" />
        </g>

        {/* ─── MANDIBLES ─── */}
        <path d="M 10.5,5 Q 12,3 11,2" stroke="#44403c" strokeWidth="1" fill="none" strokeLinecap="round" />
        <path d="M 13.5,5 Q 12,3 13,2" stroke="#44403c" strokeWidth="1" fill="none" strokeLinecap="round" />

        {/* ─── ANT BODY ANATOMY ─── */}
        <ellipse cx="12" cy="21" rx="3.5" ry="4.5" fill="#1c1917" />
        <path d="M 9.5,19 Q 12,20 14.5,19" stroke="#44403c" strokeWidth="0.8" fill="none" />
        <path d="M 9,21 Q 12,22 15,21" stroke="#44403c" strokeWidth="0.8" fill="none" />
        <path d="M 10,23 Q 12,24 14,23" stroke="#44403c" strokeWidth="0.8" fill="none" />

        <ellipse cx="12" cy="16.5" rx="1.2" ry="1" fill="#292524" />

        <ellipse cx="12" cy="13.5" rx="2.5" ry="3" fill={roleStyle.hex} stroke="#1c1917" strokeWidth="0.8" />
        <circle cx="12" cy="13.5" r="0.8" fill="#ffffff" opacity="0.6" />

        <ellipse cx="12" cy="9.5" rx="1" ry="0.8" fill="#292524" />

        <path d="M 11,6 Q 8,4 6,1" fill="none" stroke="#1c1917" strokeWidth="0.8" strokeLinecap="round" />
        <path d="M 13,6 Q 16,4 18,1" fill="none" stroke="#1c1917" strokeWidth="0.8" strokeLinecap="round" />

        <circle cx="12" cy="7" r="2.8" fill="#1c1917" />

        <text
          x="12"
          y="8.2"
          textAnchor="middle"
          fontSize="2.8"
          fontWeight="900"
          fill="#fef08a"
          fontFamily="sans-serif"
        >
          {initial}
        </text>
      </svg>
    </div>
  );
}

// ─── HIGH-CONTRAST LEVEL-OF-DETAIL (LOD) ENEMY INSECT FOR ZOOMED-OUT VIEW ───

function InsectLowDetail({ insectType, isWalking = true, className = "w-16 h-16" }: { insectType: InsectType; isWalking?: boolean; className?: string }) {
  return (
    <div className="relative flex items-center justify-center filter drop-shadow-[0_0_8px_rgba(192,132,252,0.9)]">
      <svg className={`${className} overflow-visible`} viewBox="0 0 36 36">
        {/* Glowing Boss Aura Ring */}
        <circle cx="18" cy="18" r="16" fill="#1e0b2b" stroke="#c084fc" strokeWidth="2.5" />

        {/* Distinct Boss Silhouette per insect type */}
        {insectType === 'beetle' && (
          <g>
            <path d="M 13,8 L 10,2 M 23,8 L 26,2" stroke="#e9d5ff" strokeWidth="2.5" strokeLinecap="round" />
            <ellipse cx="18" cy="13" rx="6" ry="4" fill="#581c87" stroke="#e9d5ff" strokeWidth="1.4" />
            <ellipse cx="18" cy="22" rx="8" ry="9" fill="#3b0764" stroke="#c084fc" strokeWidth="1.6" />
            <line x1="18" y1="13" x2="18" y2="30" stroke="#c084fc" strokeWidth="1.6" />
          </g>
        )}

        {insectType === 'spider' && (
          <g>
            <path d="M 5,9 L 13,13 M 31,9 L 23,13 M 3,24 L 13,20 M 33,24 L 23,20" stroke="#e9d5ff" strokeWidth="2.5" strokeLinecap="round" />
            <ellipse cx="18" cy="13" rx="5" ry="4" fill="#581c87" stroke="#e9d5ff" strokeWidth="1.4" />
            <ellipse cx="18" cy="22" rx="7.5" ry="8.5" fill="#1e1b4b" stroke="#c084fc" strokeWidth="1.6" />
          </g>
        )}

        {insectType === 'ladybug' && (
          <g>
            <ellipse cx="18" cy="12" rx="6" ry="4" fill="#581c87" stroke="#e9d5ff" strokeWidth="1.4" />
            <circle cx="18" cy="21" r="8.5" fill="#dc2626" stroke="#ffffff" strokeWidth="1.6" />
            <circle cx="14" cy="18" r="1.8" fill="#180b26" />
            <circle cx="22" cy="18" r="1.8" fill="#180b26" />
            <circle cx="18" cy="24" r="1.8" fill="#180b26" />
          </g>
        )}

        {insectType === 'wasp' && (
          <g>
            <ellipse cx="10" cy="11" rx="6.5" ry="2.8" fill="#fef08a" opacity="0.9" transform="rotate(-30 10 11)" />
            <ellipse cx="26" cy="11" rx="6.5" ry="2.8" fill="#fef08a" opacity="0.9" transform="rotate(30 26 11)" />
            <ellipse cx="18" cy="12" rx="5" ry="4" fill="#581c87" stroke="#e9d5ff" strokeWidth="1.4" />
            <ellipse cx="18" cy="23" rx="6" ry="9" fill="#eab308" stroke="#180b26" strokeWidth="1.6" />
            <line x1="12" y1="20" x2="24" y2="20" stroke="#180b26" strokeWidth="2.2" />
            <line x1="13" y1="24" x2="23" y2="24" stroke="#180b26" strokeWidth="2.2" />
          </g>
        )}

        {/* Glowing Boss Eyes */}
        <circle cx="15.5" cy="13" r="1.5" fill="#ef4444" />
        <circle cx="20.5" cy="13" r="1.5" fill="#ef4444" />

        {/* Crown Glyph */}
        <text x="18" y="10" textAnchor="middle" fontSize="6.5">👑</text>
      </svg>
    </div>
  );
}

// ─── 4 DETAILED VECTOR ENEMY INSECTS WITH ARTICULATED WALKING LEGS ───

function InsectBeetle({ className = "", isWalking = true }: { className?: string; isWalking?: boolean }) {
  const animPlayState = isWalking ? 'running' : 'paused';

  return (
    <svg className={className} viewBox="0 0 48 48">
      {/* 6 Articulated Walking Legs */}
      <g style={{ transformOrigin: '12px 20px', animation: 'beetleLegFrontL 0.28s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M12,20 Q4,16 2,10" stroke="#1e100a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '36px 20px', animation: 'beetleLegFrontR 0.28s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M36,20 Q44,16 46,10" stroke="#1e100a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '12px 26px', animation: 'beetleLegMidL 0.28s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M12,26 Q4,26 2,32" stroke="#1e100a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '36px 26px', animation: 'beetleLegMidR 0.28s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M36,26 Q44,26 46,32" stroke="#1e100a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '14px 32px', animation: 'beetleLegRearL 0.28s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M14,32 Q6,38 4,44" stroke="#1e100a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '34px 32px', animation: 'beetleLegRearR 0.28s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M34,32 Q42,38 44,44" stroke="#1e100a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </g>

      {/* Beetle Horns & Chitin Armor */}
      <path d="M20,12 Q18,2 12,0" stroke="#3b1d11" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M28,12 Q30,2 36,0" stroke="#3b1d11" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M24,10 L24,2" stroke="#2a140b" strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="24" cy="14" rx="7" ry="5" fill="#2a140b" stroke="#1a0c07" strokeWidth="1" />
      <circle cx="19" cy="13" r="1.5" fill="#f59e0b" />
      <circle cx="29" cy="13" r="1.5" fill="#f59e0b" />
      <path d="M15,17 C15,16 33,16 33,17 C35,22 35,24 33,25 C28,26 20,26 15,25 C13,24 13,22 15,17 Z" fill="#4a2516" stroke="#1e100a" strokeWidth="1" />
      <ellipse cx="24" cy="33" rx="11" ry="12" fill="#5c2e1b" stroke="#24120a" strokeWidth="1.5" />
      <path d="M24,24 L24,44" stroke="#24120a" strokeWidth="1.5" />
      <path d="M18,28 Q16,35 18,40" stroke="#85462b" strokeWidth="1.2" fill="none" opacity="0.6" strokeLinecap="round" />
    </svg>
  );
}

function InsectSpider({ className = "", isWalking = true }: { className?: string; isWalking?: boolean }) {
  const animPlayState = isWalking ? 'running' : 'paused';

  return (
    <svg className={className} viewBox="0 0 50 50">
      {/* 8 Articulated Walking Legs */}
      <g style={{ transformOrigin: '20px 18px', animation: 'spiderLegFL 0.25s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M20,18 Q12,10 4,4" stroke="#18181b" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '30px 18px', animation: 'spiderLegFR 0.25s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M30,18 Q38,10 46,4" stroke="#18181b" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '18px 22px', animation: 'spiderLegMFL 0.25s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M18,22 Q8,18 2,20" stroke="#18181b" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '32px 22px', animation: 'spiderLegMFR 0.25s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M32,22 Q42,18 48,20" stroke="#18181b" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '18px 26px', animation: 'spiderLegMRL 0.25s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M18,26 Q8,30 3,38" stroke="#18181b" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '32px 26px', animation: 'spiderLegMRR 0.25s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M32,26 Q42,30 47,38" stroke="#18181b" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '20px 28px', animation: 'spiderLegRL 0.25s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M20,28 Q12,40 8,48" stroke="#18181b" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '30px 28px', animation: 'spiderLegRR 0.25s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M30,28 Q38,40 42,48" stroke="#18181b" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>

      {/* Spider Pedipalps & Chitin Body */}
      <path d="M22,14 Q20,10 18,11" stroke="#3f3f46" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M28,14 Q30,10 32,11" stroke="#3f3f46" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <circle cx="25" cy="20" r="6" fill="#27272a" stroke="#09090b" strokeWidth="1.2" />
      <circle cx="23" cy="16" r="1.2" fill="#ef4444" />
      <circle cx="27" cy="16" r="1.2" fill="#ef4444" />
      <circle cx="21" cy="18" r="0.9" fill="#ef4444" />
      <circle cx="29" cy="18" r="0.9" fill="#ef4444" />
      <ellipse cx="25" cy="32" rx="8.5" ry="10" fill="#18181b" stroke="#09090b" strokeWidth="1.5" />
      <path d="M25,26 L23,32 L27,32 Z" fill="#eab308" />
      <path d="M25,38 L22,34 L28,34 Z" fill="#eab308" />
      <circle cx="25" cy="33" r="1.5" fill="#ef4444" />
    </svg>
  );
}

function InsectLadybug({ className = "", isWalking = true }: { className?: string; isWalking?: boolean }) {
  const animPlayState = isWalking ? 'running' : 'paused';

  return (
    <svg className={className} viewBox="0 0 46 46">
      {/* 6 Articulated Walking Legs */}
      <g style={{ transformOrigin: '14px 16px', animation: 'ladybugLegFL 0.26s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M14,16 Q6,12 3,7" stroke="#18181b" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '32px 16px', animation: 'ladybugLegFR 0.26s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M32,16 Q40,12 43,7" stroke="#18181b" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '12px 23px', animation: 'ladybugLegML 0.26s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M12,23 Q4,23 2,28" stroke="#18181b" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '34px 23px', animation: 'ladybugLegMR 0.26s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M34,23 Q42,23 44,28" stroke="#18181b" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '14px 32px', animation: 'ladybugLegRL 0.26s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M14,32 Q7,38 4,43" stroke="#18181b" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '32px 32px', animation: 'ladybugLegRR 0.26s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M32,32 Q39,38 42,43" stroke="#18181b" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </g>

      {/* Antennae & Head */}
      <path d="M20,9 Q16,4 12,3" stroke="#18181b" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M26,9 Q30,4 34,3" stroke="#18181b" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <circle cx="23" cy="10" r="4.5" fill="#09090b" />

      {/* Pronotum & Elytra Shell */}
      <path d="M14,17 C14,11 32,11 32,17 C33,20 33,20 32,21 C27,22 19,22 14,21 Z" fill="#18181b" stroke="#09090b" strokeWidth="1" />
      <ellipse cx="17" cy="16" rx="1.5" ry="2" fill="#ffffff" />
      <ellipse cx="29" cy="16" rx="1.5" ry="2" fill="#ffffff" />

      <ellipse cx="23" cy="29" rx="13" ry="14" fill="#dc2626" stroke="#991b1b" strokeWidth="1.5" />
      <line x1="23" y1="18" x2="23" y2="43" stroke="#09090b" strokeWidth="1.5" />

      {/* 7 Ladybug Black Spots */}
      <circle cx="23" cy="23" r="2.2" fill="#09090b" />
      <circle cx="17" cy="26" r="2.5" fill="#09090b" />
      <circle cx="29" cy="26" r="2.5" fill="#09090b" />
      <circle cx="15" cy="34" r="2.3" fill="#09090b" />
      <circle cx="31" cy="34" r="2.3" fill="#09090b" />
      <circle cx="19" cy="40" r="2" fill="#09090b" />
      <circle cx="27" cy="40" r="2" fill="#09090b" />
    </svg>
  );
}

function InsectWasp({ className = "", isWalking = true }: { className?: string; isWalking?: boolean }) {
  const animPlayState = isWalking ? 'running' : 'paused';

  return (
    <svg className={className} viewBox="0 0 52 52">
      {/* 6 Articulated Walking Legs */}
      <g style={{ transformOrigin: '19px 19px', animation: 'waspLegFL 0.24s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M19,19 Q11,18 7,23" stroke="#18181b" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '33px 19px', animation: 'waspLegFR 0.24s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M33,19 Q41,18 45,23" stroke="#18181b" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '20px 24px', animation: 'waspLegML 0.24s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M20,24 Q11,27 6,34" stroke="#18181b" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '32px 24px', animation: 'waspLegMR 0.24s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M32,24 Q41,27 46,34" stroke="#18181b" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '21px 28px', animation: 'waspLegRL 0.24s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M21,28 Q14,37 10,44" stroke="#18181b" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: '31px 28px', animation: 'waspLegRR 0.24s ease-in-out infinite', animationPlayState: animPlayState }}>
        <path d="M31,28 Q38,37 42,44" stroke="#18181b" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>

      {/* Head & Eyes */}
      <circle cx="26" cy="11" r="5" fill="#881337" stroke="#18181b" strokeWidth="1.2" />
      <circle cx="23" cy="10" r="1.5" fill="#09090b" />
      <circle cx="29" cy="10" r="1.5" fill="#09090b" />
      <path d="M24,8 Q18,3 13,2" stroke="#18181b" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M28,8 Q34,3 39,2" stroke="#18181b" strokeWidth="1.5" fill="none" strokeLinecap="round" />

      {/* Thorax */}
      <ellipse cx="26" cy="20" rx="5.5" ry="6.5" fill="#9f1239" stroke="#18181b" strokeWidth="1.2" />

      {/* Fluttering Wings Attached to Thorax */}
      <g style={{ transformOrigin: '24px 20px', animation: 'wingFlutterL 0.14s ease-in-out infinite' }}>
        <path d="M24,20 C18,12 8,8 2,12 C4,18 16,21 24,20 Z" fill="#bae6fd" opacity="0.75" stroke="#38bdf8" strokeWidth="0.9" />
      </g>
      <g style={{ transformOrigin: '28px 20px', animation: 'wingFlutterR 0.14s ease-in-out infinite' }}>
        <path d="M28,20 C34,12 44,8 50,12 C48,18 36,21 28,20 Z" fill="#bae6fd" opacity="0.75" stroke="#38bdf8" strokeWidth="0.9" />
      </g>

      <rect x="25" y="26" width="2" height="3.5" fill="#18181b" />

      {/* Abdomen & Stinger */}
      <ellipse cx="26" cy="37" rx="7" ry="9" fill="#e11d48" stroke="#18181b" strokeWidth="1.2" />
      <path d="M20,32 Q26,34 32,32" stroke="#18181b" strokeWidth="2.2" fill="none" />
      <path d="M19.5,37 Q26,39 32.5,37" stroke="#18181b" strokeWidth="2.2" fill="none" />
      <path d="M21,42 Q26,44 31,42" stroke="#18181b" strokeWidth="2.2" fill="none" />

      <path d="M26,46 L26,50" stroke="#18181b" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ─── BOTANICAL & RESOURCE MODELS (LEAF, TOP-DOWN MUSHROOM, SEED, GRASS, BUG LOOT) ───

export function VectorLeaf({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 21 C3 11, 10 3, 21 3 C21 14, 13 21, 3 21 Z" />
      <path d="M3 21 L16 8" stroke="#047857" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M7 17 Q10 15 11 13" stroke="#047857" strokeWidth="0.8" strokeLinecap="round" fill="none" />
      <path d="M11 13 Q14 11 15 9" stroke="#047857" strokeWidth="0.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function VectorMushroom({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10.5" fill="#e11d48" stroke="#9f1239" strokeWidth="1" />
      <circle cx="12" cy="12" r="9" fill="#f43f5e" />
      <circle cx="11.5" cy="11.5" r="7" fill="#fb7185" opacity="0.6" />
      <circle cx="12" cy="12" r="2.2" fill="#ffffff" stroke="#e2e8f0" strokeWidth="0.4" />
      <circle cx="8" cy="8" r="1.6" fill="#ffffff" stroke="#e2e8f0" strokeWidth="0.4" />
      <circle cx="16" cy="8" r="1.8" fill="#ffffff" stroke="#e2e8f0" strokeWidth="0.4" />
      <circle cx="7.5" cy="15" r="1.7" fill="#ffffff" stroke="#e2e8f0" strokeWidth="0.4" />
      <circle cx="16.5" cy="15" r="1.9" fill="#ffffff" stroke="#e2e8f0" strokeWidth="0.4" />
      <circle cx="12" cy="6" r="1.2" fill="#ffffff" stroke="#e2e8f0" strokeWidth="0.4" />
      <circle cx="12" cy="18" r="1.3" fill="#ffffff" stroke="#e2e8f0" strokeWidth="0.4" />
    </svg>
  );
}

export function VectorSeed({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 24" fill="currentColor">
      <path d="M4 8 C4 4, 16 4, 16 8 Z" fill="#78350f" />
      <path d="M4 8 C4 15, 8 21, 10 23 C12 21, 16 15, 16 8 Z" />
      <path d="M10 8 L10 21" stroke="#92400e" strokeWidth="0.9" fill="none" strokeLinecap="round" />
      <path d="M7 10 Q8 15 10 18" stroke="#92400e" strokeWidth="0.7" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function VectorInsectLoot({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="12" fill="#f59e0b" opacity="0.25" className="animate-pulse" />
      <polygon points="14,2 24,10 20,24 8,24 4,10" fill="#78350f" stroke="#d97706" strokeWidth="1.5" />
      <path d="M14,6 L14,20" stroke="#fef3c7" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8,12 L20,12" stroke="#fef3c7" strokeWidth="1" strokeLinecap="round" />
      <circle cx="14" cy="13" r="2.5" fill="#f59e0b" />
      <path d="M6,7 Q14,2 22,7" stroke="#fbbf24" strokeWidth="1" fill="none" />
    </svg>
  );
}

function VectorGrassTuft({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4 16 Q7 6 5 2" />
      <path d="M12 16 Q12 4 14 1" />
      <path d="M20 16 Q17 6 19 2" />
    </svg>
  );
}
