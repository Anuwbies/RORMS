import React, { useEffect, useRef, useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { SettingsIcon } from '../components/Icons'
import { db } from '../firebase'

export type EntranceSide = 'top' | 'bottom' | 'left' | 'right';

export interface MapBuilding {
  id: string;
  buildingId: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  entranceSide?: EntranceSide;
  entranceSize?: number;
  entrancePosition?: number;
  colorIndex?: number;
}
export interface MapData {
  type: 'freeform';
  buildings: MapBuilding[];
}

interface Building {
  id: string
  code: string
  name: string
}
const BUILDING_COLORS = [
  {
    bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-700', top: 'bg-blue-500/20',
    doorBg: 'bg-blue-600', doorBorder: 'border-blue-800', doorInner: 'bg-blue-200',
    btnBg: 'bg-blue-600/30 hover:bg-blue-600', btnActive: 'bg-blue-600 text-white ring-2 ring-blue-400',
    modalBorder: 'border-blue-300', modalAccent: 'text-blue-600', sliderAccent: 'accent-blue-600',
    btnSideActive: 'bg-blue-600 text-white', badgeBg: 'bg-blue-50 text-blue-700 border-blue-200'
  },
  {
    bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-700', top: 'bg-amber-500/20',
    doorBg: 'bg-amber-600', doorBorder: 'border-amber-800', doorInner: 'bg-amber-200',
    btnBg: 'bg-amber-600/30 hover:bg-amber-600', btnActive: 'bg-amber-600 text-white ring-2 ring-amber-400',
    modalBorder: 'border-amber-300', modalAccent: 'text-amber-600', sliderAccent: 'accent-amber-600',
    btnSideActive: 'bg-amber-600 text-white', badgeBg: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  {
    bg: 'bg-rose-100', border: 'border-rose-400', text: 'text-rose-700', top: 'bg-rose-500/20',
    doorBg: 'bg-rose-600', doorBorder: 'border-rose-800', doorInner: 'bg-rose-200',
    btnBg: 'bg-rose-600/30 hover:bg-rose-600', btnActive: 'bg-rose-600 text-white ring-2 ring-rose-400',
    modalBorder: 'border-rose-300', modalAccent: 'text-rose-600', sliderAccent: 'accent-rose-600',
    btnSideActive: 'bg-rose-600 text-white', badgeBg: 'bg-rose-50 text-rose-700 border-rose-200'
  },
  {
    bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-700', top: 'bg-purple-500/20',
    doorBg: 'bg-purple-600', doorBorder: 'border-purple-800', doorInner: 'bg-purple-200',
    btnBg: 'bg-purple-600/30 hover:bg-purple-600', btnActive: 'bg-purple-600 text-white ring-2 ring-purple-400',
    modalBorder: 'border-purple-300', modalAccent: 'text-purple-600', sliderAccent: 'accent-purple-600',
    btnSideActive: 'bg-purple-600 text-white', badgeBg: 'bg-purple-50 text-purple-700 border-purple-200'
  },
  {
    bg: 'bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-700', top: 'bg-emerald-500/20',
    doorBg: 'bg-emerald-600', doorBorder: 'border-emerald-800', doorInner: 'bg-emerald-200',
    btnBg: 'bg-emerald-600/30 hover:bg-emerald-600', btnActive: 'bg-emerald-600 text-white ring-2 ring-emerald-400',
    modalBorder: 'border-emerald-300', modalAccent: 'text-emerald-600', sliderAccent: 'accent-emerald-600',
    btnSideActive: 'bg-emerald-600 text-white', badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  {
    bg: 'bg-cyan-100', border: 'border-cyan-400', text: 'text-cyan-700', top: 'bg-cyan-500/20',
    doorBg: 'bg-cyan-600', doorBorder: 'border-cyan-800', doorInner: 'bg-cyan-200',
    btnBg: 'bg-cyan-600/30 hover:bg-cyan-600', btnActive: 'bg-cyan-600 text-white ring-2 ring-cyan-400',
    modalBorder: 'border-cyan-300', modalAccent: 'text-cyan-600', sliderAccent: 'accent-cyan-600',
    btnSideActive: 'bg-cyan-600 text-white', badgeBg: 'bg-cyan-50 text-cyan-700 border-cyan-200'
  },
  {
    bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-700', top: 'bg-orange-500/20',
    doorBg: 'bg-orange-600', doorBorder: 'border-orange-800', doorInner: 'bg-orange-200',
    btnBg: 'bg-orange-600/30 hover:bg-orange-600', btnActive: 'bg-orange-600 text-white ring-2 ring-orange-400',
    modalBorder: 'border-orange-300', modalAccent: 'text-orange-600', sliderAccent: 'accent-orange-600',
    btnSideActive: 'bg-orange-600 text-white', badgeBg: 'bg-orange-50 text-orange-700 border-orange-200'
  },
  {
    bg: 'bg-indigo-100', border: 'border-indigo-400', text: 'text-indigo-700', top: 'bg-indigo-500/20',
    doorBg: 'bg-indigo-600', doorBorder: 'border-indigo-800', doorInner: 'bg-indigo-200',
    btnBg: 'bg-indigo-600/30 hover:bg-indigo-600', btnActive: 'bg-indigo-600 text-white ring-2 ring-indigo-400',
    modalBorder: 'border-indigo-300', modalAccent: 'text-indigo-600', sliderAccent: 'accent-indigo-600',
    btnSideActive: 'bg-indigo-600 text-white', badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200'
  },
  {
    bg: 'bg-pink-100', border: 'border-pink-400', text: 'text-pink-700', top: 'bg-pink-500/20',
    doorBg: 'bg-pink-600', doorBorder: 'border-pink-800', doorInner: 'bg-pink-200',
    btnBg: 'bg-pink-600/30 hover:bg-pink-600', btnActive: 'bg-pink-600 text-white ring-2 ring-pink-400',
    modalBorder: 'border-pink-300', modalAccent: 'text-pink-600', sliderAccent: 'accent-pink-600',
    btnSideActive: 'bg-pink-600 text-white', badgeBg: 'bg-pink-50 text-pink-700 border-pink-200'
  },
  {
    bg: 'bg-slate-800', border: 'border-slate-950', text: 'text-slate-900', top: 'bg-slate-700/40',
    doorBg: 'bg-slate-600', doorBorder: 'border-slate-400', doorInner: 'bg-slate-200',
    btnBg: 'bg-slate-700/50 hover:bg-slate-700', btnActive: 'bg-slate-900 text-white ring-2 ring-slate-400',
    modalBorder: 'border-slate-700', modalAccent: 'text-slate-700', sliderAccent: 'accent-slate-800',
    btnSideActive: 'bg-slate-800 text-white font-black', badgeBg: 'bg-slate-100 text-slate-900 border-slate-300'
  },
  {
    bg: 'bg-[#f4f1ea]', border: 'border-[#c8c0b0]', text: 'text-[#4a4438]', top: 'bg-stone-400/20',
    doorBg: 'bg-[#5c5446]', doorBorder: 'border-[#3d372e]', doorInner: 'bg-[#e8e2d5]',
    btnBg: 'bg-[#5c5446]/30 hover:bg-[#5c5446]', btnActive: 'bg-[#5c5446] text-white ring-2 ring-[#a89d89]',
    modalBorder: 'border-[#c8c0b0]', modalAccent: 'text-[#5c5446]', sliderAccent: 'accent-[#5c5446]',
    btnSideActive: 'bg-[#5c5446] text-white', badgeBg: 'bg-[#f8f6f0] text-[#4a4438] border-[#c8c0b0]'
  },
];

const getBuildingColor = (mb: MapBuilding | string) => {
  if (typeof mb === 'object' && mb.colorIndex !== undefined) {
    return BUILDING_COLORS[mb.colorIndex % BUILDING_COLORS.length];
  }
  const id = typeof mb === 'string' ? mb : mb.buildingId;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return BUILDING_COLORS[Math.abs(hash) % BUILDING_COLORS.length];
};

const getBuildingEntranceCoord = (mb: MapBuilding, offsetRatio: number = 0) => {
  const w = mb.w || 12;
  const h = mb.h || 15;
  const side: EntranceSide = mb.entranceSide || 'bottom';
  const sizeRatio = ((mb.entranceSize ?? 40) / 100);
  const posRatio = ((mb.entrancePosition ?? 50) / 100);

  let x = mb.x;
  let y = mb.y;

  if (side === 'bottom' || side === 'top') {
    const doorCenterX = (posRatio * (1 - sizeRatio) + sizeRatio / 2 - 0.5) * w;
    const finalDoorX = doorCenterX + offsetRatio * (w * sizeRatio);
    x = mb.x + finalDoorX;
    y = side === 'bottom' ? mb.y + h / 2 : mb.y - h / 2;
  } else if (side === 'left' || side === 'right') {
    const doorCenterY = (posRatio * (1 - sizeRatio) + sizeRatio / 2 - 0.5) * h;
    const finalDoorY = doorCenterY + offsetRatio * (h * sizeRatio);
    x = side === 'right' ? mb.x + w / 2 : mb.x - w / 2;
    y = mb.y + finalDoorY;
  }

  return { x, y };
};

const getBuildingStandoffCoord = (mb: MapBuilding, offsetRatio: number = 0) => {
  const door = getBuildingEntranceCoord(mb, offsetRatio);
  const side: EntranceSide = mb.entranceSide || 'bottom';
  const margin = 3.5;

  let x = door.x;
  let y = door.y;

  if (side === 'bottom') y += margin;
  else if (side === 'top') y -= margin;
  else if (side === 'left') x -= margin;
  else if (side === 'right') x += margin;

  return { x, y };
};

const isPointInBox = (p: { x: number, y: number }, box: { xmin: number, xmax: number, ymin: number, ymax: number }) => {
  return p.x >= box.xmin && p.x <= box.xmax && p.y >= box.ymin && p.y <= box.ymax;
};

const lineIntersectsSegment = (p1: { x: number, y: number }, p2: { x: number, y: number }, p3: { x: number, y: number }, p4: { x: number, y: number }) => {
  const ccw = (A: { x: number, y: number }, B: { x: number, y: number }, C: { x: number, y: number }) => {
    return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
  };
  return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
};

const lineIntersectsBox = (p1: { x: number, y: number }, p2: { x: number, y: number }, box: { xmin: number, xmax: number, ymin: number, ymax: number }) => {
  if (isPointInBox(p1, box) || isPointInBox(p2, box)) return true;

  const c1 = { x: box.xmin, y: box.ymin };
  const c2 = { x: box.xmax, y: box.ymin };
  const c3 = { x: box.xmax, y: box.ymax };
  const c4 = { x: box.xmin, y: box.ymax };

  return lineIntersectsSegment(p1, p2, c1, c2) ||
    lineIntersectsSegment(p1, p2, c2, c3) ||
    lineIntersectsSegment(p1, p2, c3, c4) ||
    lineIntersectsSegment(p1, p2, c4, c1);
};

type Pt = { x: number; y: number };

// Core Dijkstra pathfinding between any two outdoor points, avoiding all buildings
const findOutdoorPath = (
  start: Pt,
  end: Pt,
  allBuildings: MapBuilding[]
): Pt[] => {
  // Obstacle bounding boxes with padding
  const obstacles = allBuildings.map(mb => {
    const w = mb.w || 12;
    const h = mb.h || 15;
    const pad = 1.5;
    return {
      xmin: mb.x - w / 2 - pad,
      xmax: mb.x + w / 2 + pad,
      ymin: mb.y - h / 2 - pad,
      ymax: mb.y + h / 2 + pad,
    };
  });

  const isSegmentClear = (p1: Pt, p2: Pt) =>
    !obstacles.some(box => lineIntersectsBox(p1, p2, box));

  // Direct line clear? Skip graph construction
  if (isSegmentClear(start, end)) return [start, end];

  // Build visibility graph nodes: start + end + all building corners
  const margin = 3.5;
  const cornerNodes: Pt[] = [];
  allBuildings.forEach(mb => {
    const w = mb.w || 12;
    const h = mb.h || 15;
    const pts: Pt[] = [
      { x: mb.x - w / 2 - margin, y: mb.y - h / 2 - margin },
      { x: mb.x + w / 2 + margin, y: mb.y - h / 2 - margin },
      { x: mb.x - w / 2 - margin, y: mb.y + h / 2 + margin },
      { x: mb.x + w / 2 + margin, y: mb.y + h / 2 + margin },
    ];
    pts.forEach(pt => {
      if (pt.x >= 1 && pt.x <= 99 && pt.y >= 1 && pt.y <= 99) {
        if (!obstacles.some(b => isPointInBox(pt, b))) {
          cornerNodes.push(pt);
        }
      }
    });
  });

  // [0]=start, [1]=end, [2..N]=corners
  const nodes: Pt[] = [start, end, ...cornerNodes];
  const n = nodes.length;

  // Build adjacency
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const adj: number[][] = Array.from({ length: n }, () => new Array(n).fill(Infinity));
  for (let i = 0; i < n; i++) {
    adj[i][i] = 0;
    for (let j = i + 1; j < n; j++) {
      if (isSegmentClear(nodes[i], nodes[j])) {
        const d = dist(nodes[i], nodes[j]);
        adj[i][j] = d;
        adj[j][i] = d;
      }
    }
  }

  // Dijkstra from node 0 to node 1
  const visited = new Array(n).fill(false);
  const best = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  best[0] = 0;

  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && (u === -1 || best[i] < best[u])) u = i;
    }
    if (u === -1 || best[u] === Infinity) break;
    visited[u] = true;
    if (u === 1) break;
    for (let v = 0; v < n; v++) {
      if (!visited[v] && adj[u][v] < Infinity) {
        const alt = best[u] + adj[u][v];
        if (alt < best[v]) {
          best[v] = alt;
          prev[v] = u;
        }
      }
    }
  }

  // Reconstruct
  const waypoints: Pt[] = [];
  if (best[1] < Infinity) {
    let cur = 1;
    while (cur !== -1) {
      waypoints.unshift(nodes[cur]);
      cur = prev[cur];
    }
  } else {
    waypoints.push(start, end);
  }
  return waypoints;
};

// Generate a random outdoor point that's not inside any building
const randomOutdoorPoint = (allBuildings: MapBuilding[]): Pt => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const pt: Pt = { x: 8 + Math.random() * 84, y: 8 + Math.random() * 84 };
    const inside = allBuildings.some(mb => {
      const w = (mb.w || 12) / 2 + 2;
      const h = (mb.h || 15) / 2 + 2;
      return pt.x >= mb.x - w && pt.x <= mb.x + w && pt.y >= mb.y - h && pt.y <= mb.y + h;
    });
    if (!inside) return pt;
  }
  return { x: 50, y: 5 };
};

// Building-to-building pathfinding with optional outdoor stops along the way
const findWalkablePath = (
  startBldg: MapBuilding,
  endBldg: MapBuilding,
  startOffset: number,
  endOffset: number,
  allBuildings: MapBuilding[],
  outdoorStops: Pt[] = []
): Pt[] => {
  const startDoor = getBuildingEntranceCoord(startBldg, startOffset);
  const startStandoff = getBuildingStandoffCoord(startBldg, startOffset);
  const endDoor = getBuildingEntranceCoord(endBldg, endOffset);
  const endStandoff = getBuildingStandoffCoord(endBldg, endOffset);

  // Chain path through all stops: startStandoff → stop1 → stop2 → ... → endStandoff
  const stops = [startStandoff, ...outdoorStops, endStandoff];
  const fullPath: Pt[] = [startDoor];

  for (let i = 0; i < stops.length - 1; i++) {
    const segment = findOutdoorPath(stops[i], stops[i + 1], allBuildings);
    // Avoid duplicating the junction point between segments
    fullPath.push(...(i === 0 ? segment : segment.slice(1)));
  }

  fullPath.push(endDoor);
  return fullPath;
};

export const CampusMap = ({ buildings, mapData }: { buildings: Building[], mapData: MapData | null }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [editingEntranceBldgId, setEditingEntranceBldgId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeAnchor, setResizeAnchor] = useState({ x: 0, y: 0 });

  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 });
  const [hoveredBldgId, setHoveredBldgId] = useState<string | null>(null);

  const [localMapBuildings, setLocalMapBuildings] = useState<MapBuilding[]>([]);
  const [travelers, setTravelers] = useState<{ id: number, startBldgId: string, endBldgId: string, delay: number, color: string, startOffset: number, endOffset: number, outdoorStops: Pt[] }[]>([]);

  useEffect(() => {
    if (localMapBuildings.length < 2) return;

    // Generate travelers that walk between buildings through doors
    // ~40% take outdoor detours through random campus waypoints
    const count = Math.min(30, localMapBuildings.length * 5);
    const newTravelers = Array.from({ length: count }).map((_, i) => {
      const b1 = localMapBuildings[Math.floor(Math.random() * localMapBuildings.length)];
      let b2 = localMapBuildings[Math.floor(Math.random() * localMapBuildings.length)];
      while (b2 === b1) b2 = localMapBuildings[Math.floor(Math.random() * localMapBuildings.length)];

      // Some travelers wander through outdoor points before reaching destination
      // ~34% direct, ~33% one stop, ~33% two stops
      const outdoorStops: Pt[] = [];
      const rand = Math.random();
      if (rand > 0.34) {
        outdoorStops.push(randomOutdoorPoint(localMapBuildings));
      }
      if (rand > 0.67) {
        outdoorStops.push(randomOutdoorPoint(localMapBuildings));
      }

      return {
        id: i,
        startBldgId: b1.buildingId,
        endBldgId: b2.buildingId,
        delay: Math.random() * -15,
        color: ['bg-amber-400', 'bg-emerald-400', 'bg-blue-400', 'bg-rose-400', 'bg-purple-400'][Math.floor(Math.random() * 5)],
        startOffset: (Math.random() - 0.5) * 0.8,
        endOffset: (Math.random() - 0.5) * 0.8,
        outdoorStops,
      };
    });
    setTravelers(newTravelers);
  }, [localMapBuildings.length]); // Only regenerate if the number of buildings changes

  useEffect(() => {
    const savedBuildings = mapData?.type === 'freeform' ? mapData.buildings || [] : [];

    // Ensure all DB buildings exist in local state
    const syncedBuildings = buildings.map((b, i) => {
      const existing = savedBuildings.find(sb => sb.buildingId === b.id);
      if (existing) return existing;

      // Default spawn position for unplaced buildings (stack them or jitter)
      const w = 12;
      const h = 15;
      const halfW = w / 2;
      const halfH = h / 2;
      const spawnX = Math.max(halfW, Math.min(100 - halfW, 10 + (i * 2 % 80)));
      const spawnY = Math.max(halfH, Math.min(100 - halfH, 10 + (i * 2 % 80)));

      return {
        id: b.id,
        buildingId: b.id,
        x: spawnX,
        y: spawnY,
        w,
        h
      };
    });

    setLocalMapBuildings(syncedBuildings);
  }, [buildings, mapData]);

  const saveToFirestore = async (newBuildings: MapBuilding[]) => {
    await setDoc(doc(db, 'settings', 'campusMap'), {
      type: 'freeform',
      buildings: newBuildings,
      paths: []
    }, { merge: true });
  };

  const getPointerCoords = (e: React.PointerEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent, id: string, isResize: boolean) => {
    e.stopPropagation();
    if (isResize) {
      setResizingId(id);
      const b = localMapBuildings.find(x => x.buildingId === id);
      if (b) {
        setResizeAnchor({
          x: b.x - (b.w || 12) / 2,
          y: b.y - (b.h || 15) / 2
        });
      }
    } else {
      setDraggingId(id);
      const pointer = getPointerCoords(e);
      const b = localMapBuildings.find(x => x.buildingId === id);
      if (b) {
        setDragOffset({ x: b.x - pointer.x, y: b.y - pointer.y });
      }
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const checkCollision = (cx: number, cy: number, cw: number, ch: number, skipId: string) => {
    const leftA = cx - cw / 2;
    const rightA = cx + cw / 2;
    const topA = cy - ch / 2;
    const bottomA = cy + ch / 2;

    for (const other of localMapBuildings) {
      if (other.buildingId === skipId) continue;

      const ow = other.w || 12;
      const oh = other.h || 15;
      const leftB = other.x - ow / 2;
      const rightB = other.x + ow / 2;
      const topB = other.y - oh / 2;
      const bottomB = other.y + oh / 2;

      const margin = 0.1;

      if (
        leftA < rightB - margin &&
        rightA > leftB + margin &&
        topA < bottomB - margin &&
        bottomA > topB + margin
      ) {
        return true;
      }
    }
    return false;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const coords = getPointerCoords(e);
    setPointerPos(coords);

    if (draggingId) {
      const targetX = coords.x + dragOffset.x;
      const targetY = coords.y + dragOffset.y;

      setLocalMapBuildings(prev => prev.map(b => {
        if (b.buildingId === draggingId) {
          const halfW = (b.w || 12) / 2;
          const halfH = (b.h || 15) / 2;

          let clampedX = Math.max(halfW, Math.min(100 - halfW, targetX));
          let clampedY = Math.max(halfH, Math.min(100 - halfH, targetY));

          // 1. Direct teleport check: if the absolute target is totally free, jump there immediately!
          if (!checkCollision(clampedX, clampedY, b.w || 12, b.h || 15, b.buildingId)) {
            return { ...b, x: clampedX, y: clampedY };
          }

          // 2. Fallback to sliding against walls
          let finalX = b.x;
          let finalY = b.y;

          const canMoveX = !checkCollision(clampedX, b.y, b.w || 12, b.h || 15, b.buildingId);
          const canMoveY = !checkCollision(b.x, clampedY, b.w || 12, b.h || 15, b.buildingId);

          if (canMoveX && canMoveY) {
            // Blocked diagonally by a corner, pick dominant axis
            if (Math.abs(clampedX - b.x) > Math.abs(clampedY - b.y)) {
              finalX = clampedX;
            } else {
              finalY = clampedY;
            }
          } else if (canMoveX) {
            finalX = clampedX;
          } else if (canMoveY) {
            finalY = clampedY;
          }

          return { ...b, x: finalX, y: finalY };
        }
        return b;
      }));
    } else if (resizingId) {
      const { x, y } = getPointerCoords(e);
      setLocalMapBuildings(prev => prev.map(b => {
        if (b.buildingId === resizingId) {
          let newW = Math.max(3, Math.min(x - resizeAnchor.x, 100 - resizeAnchor.x));
          let newH = Math.max(3, Math.min(y - resizeAnchor.y, 100 - resizeAnchor.y));

          let testW = newW;
          let testX = resizeAnchor.x + testW / 2;

          if (checkCollision(testX, b.y, testW, b.h || 15, b.buildingId)) {
            testW = b.w || 12;
            testX = b.x;
          }

          let testH = newH;
          let testY = resizeAnchor.y + testH / 2;

          if (checkCollision(testX, testY, testW, testH, b.buildingId)) {
            testH = b.h || 15;
            testY = b.y;
          }

          return { ...b, x: testX, y: testY, w: testW, h: testH };
        }
        return b;
      }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingId || resizingId) {
      setDraggingId(null);
      setResizingId(null);
      e.currentTarget.releasePointerCapture(e.pointerId);
      // Save on release
      saveToFirestore(localMapBuildings);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-[16/9] bg-[#f3f7ee] rounded-xl border border-emerald-200/80 shadow-[inset_0_2px_8px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.05)] select-none touch-none @container"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* Background Texture Container (Clipped to Rounded Card Corners) */}
      <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none z-0">
        {/* Rich Campus Blueprint & Lawn Ground Texture Overlay */}
        <div
          className="absolute inset-0 opacity-85"
          style={{
            backgroundImage: `
              radial-gradient(circle at 50% 50%, rgba(98, 133, 62, 0.05) 0%, transparent 80%),
              radial-gradient(circle at 12px 12px, rgba(98, 133, 62, 0.14) 1px, transparent 1px),
              radial-gradient(circle at 24px 24px, rgba(98, 133, 62, 0.09) 1.5px, transparent 1.5px),
              linear-gradient(0deg, rgba(98, 133, 62, 0.07) 1px, transparent 1px),
              linear-gradient(90deg, rgba(98, 133, 62, 0.07) 1px, transparent 1px)
            `,
            backgroundSize: '100% 100%, 24px 24px, 48px 48px, 24px 24px, 24px 24px',
            backgroundPosition: '0 0, 0 0, 12px 12px, 0 0, 0 0'
          }}
        />
        {/* Perimeter Vignette Depth Layer */}
        <div
          className="absolute inset-0 shadow-[inset_0_0_50px_rgba(41,54,28,0.12),inset_0_0_15px_rgba(0,0,0,0.06)]"
        />
      </div>

      {/* Per-traveler dynamic keyframes generated from Dijkstra paths */}
      <style>{travelers.map(t => {
        const startBldg = localMapBuildings.find(b => b.buildingId === t.startBldgId);
        const endBldg = localMapBuildings.find(b => b.buildingId === t.endBldgId);
        if (!startBldg || !endBldg) return '';
        const path = findWalkablePath(startBldg, endBldg, t.startOffset, t.endOffset, localMapBuildings, t.outdoorStops);
        if (path.length < 2) return '';

        // Cumulative distances for proportional timing
        const segs = [0];
        for (let i = 1; i < path.length; i++) {
          segs.push(segs[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
        }
        const totalDist = segs[segs.length - 1] || 1;

        // Build keyframes: 0% spawn, 3% appear, path waypoints from 5%-95%, 97% arrive, 100% despawn
        let kf = `@keyframes trav_${t.id} {\n`;
        kf += `  0% { left:${path[0].x}%; top:${path[0].y}%; opacity:0; transform:translate(-50%,-50%) scale(0.4); }\n`;
        kf += `  3% { left:${path[0].x}%; top:${path[0].y}%; opacity:1; transform:translate(-50%,-50%) scale(1); }\n`;
        path.forEach((pt, i) => {
          const pct = 5 + (segs[i] / totalDist) * 90;
          kf += `  ${pct.toFixed(2)}% { left:${Math.max(1, Math.min(99, pt.x))}%; top:${Math.max(1, Math.min(99, pt.y))}%; opacity:1; transform:translate(-50%,-50%) scale(1); }\n`;
        });
        const last = path[path.length - 1];
        kf += `  97% { left:${last.x}%; top:${last.y}%; opacity:1; transform:translate(-50%,-50%) scale(1); }\n`;
        kf += `  100% { left:${last.x}%; top:${last.y}%; opacity:0; transform:translate(-50%,-50%) scale(0.4); }\n`;
        kf += `}\n`;
        return kf;
      }).join('')}</style>
      <div className="absolute inset-0 overflow-hidden rounded-xl">

        {/* Travelers walking between buildings via obstacle-free paths */}
        <div className={`absolute inset-0 pointer-events-none transition-opacity duration-200 ${draggingId || resizingId ? 'opacity-0' : 'opacity-100'}`}>
          {travelers.map(t => {
            const startBldg = localMapBuildings.find(b => b.buildingId === t.startBldgId);
            const endBldg = localMapBuildings.find(b => b.buildingId === t.endBldgId);
            if (!startBldg || !endBldg) return null;
            const path = findWalkablePath(startBldg, endBldg, t.startOffset, t.endOffset, localMapBuildings, t.outdoorStops);
            if (path.length < 2) return null;

            // Duration proportional to path length for consistent walk speed
            let totalDist = 0;
            for (let i = 1; i < path.length; i++) totalDist += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
            const duration = Math.max(6, totalDist / 4);

            return (
              <div
                key={t.id}
                className={`absolute w-1.5 h-1.5 rounded-full ${t.color} z-0 shadow-sm pointer-events-none`}
                style={{
                  animationName: `trav_${t.id}`,
                  animationDuration: `${duration}s`,
                  animationTimingFunction: 'linear',
                  animationIterationCount: 'infinite',
                  animationDirection: 'alternate',
                  animationDelay: `${t.delay}s`
                }}
              />
            );
          })}
        </div>

        {/* Buildings */}
        {localMapBuildings.map(mb => {
          const b = buildings.find(x => x.id === mb.buildingId);
          if (!b) return null;

          const w = mb.w || 12;
          const h = mb.h || 15;
          const isDragging = draggingId === mb.buildingId;
          const isResizing = resizingId === mb.buildingId;
          const color = getBuildingColor(mb);

          const side = mb.entranceSide || 'bottom';
          const entSize = mb.entranceSize || 40;
          const entPos = mb.entrancePosition ?? 50;
          const offsetPct = (entPos / 100) * (100 - entSize);

          return (
            <div
              key={mb.buildingId}
              onPointerDown={(e) => handlePointerDown(e, mb.buildingId, false)}
              onPointerEnter={() => setHoveredBldgId(mb.buildingId)}
              onPointerLeave={() => setHoveredBldgId(null)}
              className={`absolute z-10 flex flex-col items-center justify-center ${color.bg} border-2 ${color.border} rounded-lg shadow-[3px_4px_10px_rgba(0,0,0,0.18)] group/bldg pointer-events-auto ${isDragging || isResizing
                ? 'transition-none shadow-2xl z-50 cursor-grabbing scale-[1.03]'
                : 'transition-shadow duration-150 hover:shadow-xl hover:z-50 cursor-grab'
                }`}
              style={{
                top: `${mb.y}%`,
                left: `${mb.x}%`,
                width: `${w}%`,
                height: `${h}%`,
                transform: 'translate(-50%, -50%)',
                willChange: isDragging || isResizing ? 'top, left, width, height' : 'auto'
              }}
            >
              {/* Visual Entrance Doorway Cutout Threshold */}
              {side === 'bottom' && (
                <div
                  className={`absolute -bottom-[2px] ${color.doorBg} border-t border-x ${color.doorBorder} rounded-t-[3px] shadow-sm z-30 flex items-center justify-center pointer-events-none`}
                  style={{ left: `${offsetPct}%`, width: `${entSize}%`, height: '5px' }}
                >
                  <div className={`w-1/2 h-[1px] ${color.doorInner} rounded-full`} />
                </div>
              )}
              {side === 'top' && (
                <div
                  className={`absolute -top-[2px] ${color.doorBg} border-b border-x ${color.doorBorder} rounded-b-[3px] shadow-sm z-30 flex items-center justify-center pointer-events-none`}
                  style={{ left: `${offsetPct}%`, width: `${entSize}%`, height: '5px' }}
                >
                  <div className={`w-1/2 h-[1px] ${color.doorInner} rounded-full`} />
                </div>
              )}
              {side === 'left' && (
                <div
                  className={`absolute -left-[2px] ${color.doorBg} border-r border-y ${color.doorBorder} rounded-r-[3px] shadow-sm z-30 flex items-center justify-center pointer-events-none`}
                  style={{ top: `${offsetPct}%`, height: `${entSize}%`, width: '5px' }}
                >
                  <div className={`h-1/2 w-[1px] ${color.doorInner} rounded-full`} />
                </div>
              )}
              {side === 'right' && (
                <div
                  className={`absolute -right-[2px] ${color.doorBg} border-l border-y ${color.doorBorder} rounded-l-[3px] shadow-sm z-30 flex items-center justify-center pointer-events-none`}
                  style={{ top: `${offsetPct}%`, height: `${entSize}%`, width: '5px' }}
                >
                  <div className={`h-1/2 w-[1px] ${color.doorInner} rounded-full`} />
                </div>
              )}

              {/* Top-Down Roof Deck Surface */}
              <div className="absolute inset-[3px] rounded-[5px] border border-black/10 bg-white/20 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),inset_0_-2px_4px_rgba(0,0,0,0.12)] pointer-events-none flex flex-col items-center justify-center overflow-hidden">
                {/* Roof Architectural Hatch Grid Pattern */}
                <div
                  className="absolute inset-0 opacity-20 pointer-events-none"
                  style={{
                    backgroundImage: 'linear-gradient(0deg, rgba(0,0,0,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.15) 1px, transparent 1px)',
                    backgroundSize: '8px 8px'
                  }}
                />

                {/* Rooftop Penthouse / HVAC Mechanical Unit */}
                <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-black/10 border border-black/20 rounded-[1px] shadow-[inset_0_0_2px_rgba(0,0,0,0.2)] pointer-events-none flex items-center justify-center">
                  <div className="w-1 h-1 bg-black/20 rounded-full" />
                </div>

                {/* Secondary Vent Unit */}
                <div className="absolute bottom-1 left-1 w-2 h-2 bg-black/10 border border-black/15 rounded-[1px] pointer-events-none" />

                {/* Building Code Roof Plaque */}
                <div className="relative z-10 px-1 py-0.5 rounded bg-white/90 shadow-sm border border-slate-200/80 flex items-center justify-center max-w-[85%]">
                  <span
                    className={`font-black ${color.text} uppercase line-clamp-1 break-all text-center leading-none pointer-events-none tracking-tight`}
                    style={{ fontSize: `max(0.42rem, ${Math.min(w, h * 1.77) * 0.18}cqw)` }}
                  >
                    {b.code || b.name.substring(0, 3)}
                  </span>
                </div>
              </div>

              {/* Building Settings Trigger Button */}
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingEntranceBldgId(prev => prev === mb.buildingId ? null : mb.buildingId);
                }}
                className={`absolute top-1 left-1 w-4 h-4 rounded transition-all flex items-center justify-center z-40 shadow-sm ${editingEntranceBldgId === mb.buildingId
                  ? `${color.btnActive} opacity-100 pointer-events-auto`
                  : `opacity-0 group-hover/bldg:opacity-100 ${color.btnBg} text-slate-900 hover:text-white pointer-events-none group-hover/bldg:pointer-events-auto`
                  }`}
                title="Configure Building Settings & Entrance"
              >
                <SettingsIcon className="w-2.5 h-2.5" />
              </button>

              {/* Resize Handle */}
              <div
                className="absolute bottom-0 right-0 w-4 h-4 bg-white/80 cursor-se-resize rounded-tl-md rounded-br-sm border-t border-l border-slate-300 opacity-0 group-hover/bldg:opacity-100 z-50 flex items-center justify-center transition-opacity shadow-sm"
                onPointerDown={(e) => handlePointerDown(e, mb.buildingId, true)}
              >
                <svg className="w-2.5 h-2.5 text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </div>
            </div>
          )
        })}
      </div>

      {/* Floating Building Settings Config Modal */}
      {editingEntranceBldgId && (() => {
        const targetBldg = localMapBuildings.find(b => b.buildingId === editingEntranceBldgId);
        const targetInfo = buildings.find(b => b.id === editingEntranceBldgId);
        if (!targetBldg) return null;

        const targetColor = getBuildingColor(targetBldg);
        const currentSide = targetBldg.entranceSide || 'bottom';
        const currentSize = targetBldg.entranceSize || 40;
        const currentPos = targetBldg.entrancePosition ?? 50;

        const isNearBottom = targetBldg.y > 55;
        const modalTopY = isNearBottom
          ? targetBldg.y - (targetBldg.h || 15) / 2 - 1.5
          : targetBldg.y + (targetBldg.h || 15) / 2 + 1.5;

        return (
          <div
            className={`absolute z-[90] bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border ${targetColor.modalBorder} p-3 w-64 pointer-events-auto transition-all select-none`}
            style={{
              left: `${targetBldg.x}%`,
              top: `${modalTopY}%`,
              transform: `translate(-${targetBldg.x}%, ${isNearBottom ? '-100%' : '0%'})`
            }}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
              <div className="flex items-center gap-1.5">
                <SettingsIcon className={`w-4 h-4 ${targetColor.modalAccent}`} />
                <span className="text-xs font-black text-slate-800 uppercase tracking-wide truncate max-w-[140px]">
                  {targetInfo?.code || targetInfo?.name} Settings
                </span>
              </div>
              <button
                onClick={() => setEditingEntranceBldgId(null)}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold leading-none p-1 rounded hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {/* Building Color Theme Picker */}
            <div className="mb-2.5">
              <label className="block text-[0.6rem] font-extrabold text-slate-500 uppercase tracking-widest mb-1.5">
                Building Theme Color
              </label>
              <div className="grid grid-cols-6 gap-1.5">
                {BUILDING_COLORS.map((c, idx) => {
                  const defaultIdx = Math.abs(targetBldg.buildingId.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0)) % BUILDING_COLORS.length;
                  const isSelected = (targetBldg.colorIndex ?? defaultIdx) === idx;

                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        const updated = localMapBuildings.map(b => b.buildingId === editingEntranceBldgId ? { ...b, colorIndex: idx } : b);
                        setLocalMapBuildings(updated);
                        saveToFirestore(updated);
                      }}
                      className={`w-5 h-5 rounded-full ${c.bg} border-2 ${c.border} transition-all flex items-center justify-center ${isSelected ? 'ring-2 ring-slate-800 scale-110 shadow-sm' : 'hover:scale-105 opacity-80 hover:opacity-100'
                        }`}
                      title={`Theme Color ${idx + 1}`}
                    >
                      {isSelected && <div className={`w-1.5 h-1.5 rounded-full ${c.doorBg}`} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Entrance Side Buttons */}
            <div className="mb-2.5">
              <label className="block text-[0.6rem] font-extrabold text-slate-500 uppercase tracking-widest mb-1">
                Entrance Side
              </label>
              <div className="grid grid-cols-4 gap-1">
                {(['top', 'bottom', 'left', 'right'] as EntranceSide[]).map(s => {
                  const isSelected = currentSide === s;
                  const arrows: Record<EntranceSide, string> = { top: '↑', bottom: '↓', left: '←', right: '→' };
                  const titles: Record<EntranceSide, string> = { top: 'Top Side', bottom: 'Bottom Side', left: 'Left Side', right: 'Right Side' };

                  return (
                    <button
                      key={s}
                      title={titles[s]}
                      onClick={() => {
                        const updated = localMapBuildings.map(b => b.buildingId === editingEntranceBldgId ? { ...b, entranceSide: s } : b);
                        setLocalMapBuildings(updated);
                        saveToFirestore(updated);
                      }}
                      className={`py-1 text-[0.8rem] font-black rounded transition-all flex items-center justify-center ${isSelected
                        ? targetColor.btnSideActive + ' shadow-sm scale-105'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                        }`}
                    >
                      {arrows[s]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Slider 1: Entrance Size / Area Slider */}
            <div className="mb-2.5">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[0.6rem] font-extrabold text-slate-500 uppercase tracking-widest">
                  Entrance Area Size
                </label>
                <span className={`text-[0.65rem] font-black ${targetColor.badgeBg} px-1.5 py-0.5 rounded border`}>
                  {currentSize}%
                </span>
              </div>
              <input
                type="range"
                min="15"
                max="85"
                step="5"
                value={currentSize}
                onChange={(e) => {
                  const newSize = parseInt(e.target.value, 10);
                  const updated = localMapBuildings.map(b => b.buildingId === editingEntranceBldgId ? { ...b, entranceSize: newSize } : b);
                  setLocalMapBuildings(updated);
                  saveToFirestore(updated);
                }}
                className={`w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer ${targetColor.sliderAccent}`}
              />
              <div className="flex justify-between text-[0.52rem] font-bold text-slate-400 mt-0.5">
                <span>Narrow (15%)</span>
                <span>Wide (85%)</span>
              </div>
            </div>

            {/* Slider 2: Door Position on Side Slider */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[0.6rem] font-extrabold text-slate-500 uppercase tracking-widest">
                  Door Position on Side
                </label>
                <span className={`text-[0.65rem] font-black ${targetColor.badgeBg} px-1.5 py-0.5 rounded border`}>
                  {currentPos === 50 ? 'Center (50%)' : currentPos < 50 ? `Start (${currentPos}%)` : `End (${currentPos}%)`}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={currentPos}
                onChange={(e) => {
                  const newPos = parseInt(e.target.value, 10);
                  const updated = localMapBuildings.map(b => b.buildingId === editingEntranceBldgId ? { ...b, entrancePosition: newPos } : b);
                  setLocalMapBuildings(updated);
                  saveToFirestore(updated);
                }}
                className={`w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer ${targetColor.sliderAccent}`}
              />
              <div className="flex justify-between text-[0.52rem] font-bold text-slate-400 mt-0.5">
                <span>{currentSide === 'top' || currentSide === 'bottom' ? 'Left (0%)' : 'Top (0%)'}</span>
                <span>{currentSide === 'top' || currentSide === 'bottom' ? 'Right (100%)' : 'Bottom (100%)'}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Total Badge */}
      <div className="absolute top-3 left-3 z-20 bg-white/90 backdrop-blur px-2 py-1 rounded-md shadow-sm border border-slate-100 flex flex-col items-center pointer-events-none">
        <span className="text-sm font-black text-slate-800 leading-none">{buildings.length}</span>
        <span className="text-[0.5rem] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">Total</span>
      </div>
      {/* Global Cursor-tracking Tooltip */}
      {hoveredBldgId && !draggingId && !resizingId && (
        <div
          className="absolute z-[100] bg-slate-900 text-white text-xs sm:text-sm font-bold px-3 py-1.5 rounded-lg pointer-events-none whitespace-nowrap shadow-2xl border border-slate-700/60 transition-transform duration-75 ease-out"
          style={{
            left: `${pointerPos.x}%`,
            top: `${pointerPos.y}%`,
            transform: `translate(-${pointerPos.x}%, ${pointerPos.y < 50 ? '15px' : 'calc(-100% - 15px)'})`
          }}
        >
          {buildings.find(b => b.id === hoveredBldgId)?.name}
        </div>
      )}
    </div>
  );
}
