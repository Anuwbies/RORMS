import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { SectionHeader } from '../../components/SectionHeader'
import { SummaryCard } from '../../components/SummaryCard'
import { WeatherOverlay, type TimeOfDay, type MoonPhaseKey, getAstronomicalMoonPhase } from '../../components/WeatherOverlay'
import { BarChart, Bar, Tooltip, ResponsiveContainer, YAxis } from 'recharts'
import { BuildingBrowser } from '../../components/BuildingBrowser'
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
import { RoomInfoModal } from '../../components/RoomInfoModal'
import { ScheduleModal } from '../../components/ScheduleModal'
import { Button } from '../../components/Button'
import { IconOnlyButton } from '../../components/IconOnlyButton'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'
import { NumberInput } from '../../components/NumberInput'
import { TextInput } from '../../components/TextInput'
import { TextAreaInput } from '../../components/TextAreaInput'
import { RoomAmenities } from '../../components/RoomAmenities'
import { SettingsIcon, DoorIcon, DotsVerticalIcon, EditIcon, TrashIcon, UserIcon, SearchIcon, BuildingIcon, LayersIcon, UsersIcon, ChevronDownIcon, PlusIcon, CameraIcon, UploadIcon, CheckIcon, ClockIcon, CalendarIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { TimePicker } from '../../components/TimePicker'
import { Snackbar } from '../../components/Snackbar'

import { db, storage } from '../../firebase'
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  writeBatch,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore'
import { CropModal } from '../../components/CropModal'

type RoomStatus = 'Available' | 'Occupied' | 'Maintenance'

function createRoomImage() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <rect width="640" height="360" rx="28" fill="#f3f4f6" />
      <g transform="translate(225, 88) scale(8)" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M6 20V5.8c0-.64.43-1.2 1.04-1.36l7-1.84a1.4 1.4 0 0 1 1.76 1.35V20" />
        <path d="M6 20h11.5" />
        <path d="M11.95 12.15h.1" />
        <path d="M15.8 20V4.1" />
      </g>
    </svg>
  `

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

const DEFAULT_ROOM_IMAGE = createRoomImage()

const BOOKING_MINUTES_OPTIONS = ['30', '60', '90'] as const;

const LIQUID_OPTIONS = ['Water', 'Coffee', 'Blood', 'Mud', 'Slime', 'Random'] as const;
type DropdownLiquidType = typeof LIQUID_OPTIONS[number];
const LIQUID_ICONS: Record<DropdownLiquidType, string> = {
  Water: '💧',
  Coffee: '☕',
  Blood: '🩸',
  Mud: '🟤',
  Slime: '🦠',
  Random: '🎲'
};
type LiquidType = Exclude<DropdownLiquidType, 'Random'>;
const liquidColors: Record<LiquidType, { main: string, light: string }> = {
  Water: { main: 'bg-blue-400', light: 'bg-blue-300' },
  Coffee: { main: 'bg-red-950', light: 'bg-red-900' },
  Blood: { main: 'bg-red-600', light: 'bg-red-500' },
  Mud: { main: 'bg-stone-700', light: 'bg-stone-600' },
  Slime: { main: 'bg-lime-500', light: 'bg-lime-400' }
};

interface Room {
  id: string
  image: string
  code: string
  name: string
  type: string
  floor: number
  capacity: number
  status: RoomStatus
  description: string
  amenities: string[]
  availableDays: string[]
  startTime: string
  endTime: string
  minBookingMins: number
  maxBookingMins: number
}

interface Building {
  id: string
  code: string
  name: string
  floor: number
  capacity: number
  rooms: Room[]
}

const roomStatusClasses: Record<RoomStatus, string> = {
  Available: 'bg-emerald-100 text-emerald-700',
  Occupied: 'bg-amber-100 text-amber-700',
  Maintenance: 'bg-rose-100 text-rose-700',
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const ROOM_AMENITIES = [
  'WiFi', 'Computer', 'Television', 'Projector', 'Whiteboard',
  'Air Conditioning', 'Sound System', 'Printer', 'Webcam',
  'Microphone', 'Ethernet', 'Speakers', 'HDMI Cable',
  'Charging Station', 'Coffee Machine', 'Water Dispenser',
  'Digital Signage', 'Video Conferencing'
]

const shortAmenities = ROOM_AMENITIES.filter(a => a.length <= 10)
const longAmenities = ROOM_AMENITIES.filter(a => a.length > 10)

const shortGroups: string[][] = []
for (let i = 0; i < shortAmenities.length; i += 3) {
  shortGroups.push(shortAmenities.slice(i, i + 3))
}

const longGroups: string[][] = []
for (let i = 0; i < longAmenities.length; i += 2) {
  longGroups.push(longAmenities.slice(i, i + 2))
}

const ROOM_AMENITIES_GROUPS: string[][] = []
const maxGroups = Math.max(shortGroups.length, longGroups.length)

for (let i = 0; i < maxGroups; i++) {
  if (i < shortGroups.length) ROOM_AMENITIES_GROUPS.push(shortGroups[i])
  if (i < longGroups.length) ROOM_AMENITIES_GROUPS.push(longGroups[i])
}

const BuildingBarShape = (props: any) => {
  const { x, y, width, height: originalHeight, index } = props;
  const fill = index % 2 === 0 ? '#10b981' : '#34d399';

  // Enforce a minimum height of 12 so even 0-room buildings have a base
  const height = Math.max(12, originalHeight);
  // Shift Y up by the difference so the bar stays anchored to the baseline
  const diff = height - originalHeight;
  const actualY = y - diff;

  const windowSize = Math.max(2, width * 0.15);
  const gap = windowSize;
  const cols = Math.floor(width / (windowSize + gap));
  const startX = x + (width - (cols * windowSize + (cols - 1) * gap)) / 2;

  const rows = Math.floor((height - gap) / (windowSize + gap));
  const startY = actualY + gap * 2;

  const windows = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      windows.push(
        <rect
          key={`${r}-${c}`}
          x={startX + c * (windowSize + gap)}
          y={startY + r * (windowSize + gap)}
          width={windowSize}
          height={windowSize}
          fill="rgba(255,255,255,0.6)"
        />
      );
    }
  }

  return (
    <g style={{ outline: 'none' }} className="focus:outline-none outline-none">
      {/* Roof */}
      <path d={`M${x + width * 0.2},${actualY} L${x + width * 0.2},${actualY - 4} L${x + width * 0.8},${actualY - 4} L${x + width * 0.8},${actualY} Z`} fill={fill} opacity={0.9} />
      {/* Body */}
      <rect x={x} y={actualY} width={width} height={height} fill={fill} rx={2} />
      {/* Windows */}
      {windows}
    </g>
  );
};

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

const CampusMap = ({ buildings, mapData }: { buildings: Building[], mapData: MapData | null }) => {
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

function BuildingsRoomsPage() {

  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [buildings, setBuildings] = useState<Building[]>([])
  const [waterKey, setWaterKey] = useState(0)
  const [dismissedJars, setDismissedJars] = useState<Set<number>>(new Set())
  const [jars, setJars] = useState<Array<{ id: number, position: number, fillStatus: 'empty' | 'filling' | 'full' | 'labeled', buildingIndex: number, liquidType?: LiquidType }>>(() => {
    const saved = sessionStorage.getItem('rorms-jars');
    if (saved) {
      let parsed = JSON.parse(saved);
      let needsShift = false;

      parsed = parsed.map((j: any) => {
        if (j.fillStatus === 'filling') return { ...j, fillStatus: 'full' }; // instantly finish filling
        if (j.fillStatus === 'labeled' && j.position === 0) {
          needsShift = true; // instantly finish labeling/moving
        }
        return j;
      });

      if (needsShift) {
        parsed = parsed.map((j: any) => ({ ...j, position: j.position - 1 }));

        let buildingIdx = 40;
        const savedIdx = sessionStorage.getItem('rorms-nextBuildingIndex');
        if (savedIdx) buildingIdx = parseInt(savedIdx, 10);

        parsed.push({
          id: Date.now() + Math.random(),
          position: 19,
          fillStatus: 'empty',
          buildingIndex: buildingIdx
        });

        // Update sessionStorage so nextBuildingIndex initializes correctly on the next line
        sessionStorage.setItem('rorms-nextBuildingIndex', (buildingIdx + 1).toString());
      }

      return parsed;
    }
    return Array.from({ length: 20 }).map((_, i) => ({
      id: i + 1,
      position: i,
      fillStatus: 'empty',
      buildingIndex: i + 20
    }));
  });

  const [nextBuildingIndex, setNextBuildingIndex] = useState(() => {
    const saved = sessionStorage.getItem('rorms-nextBuildingIndex');
    return saved ? parseInt(saved, 10) : 40;
  });

  const [isJarsMoving, setIsJarsMoving] = useState(false);
  const [hoveredJarId, setHoveredJarId] = useState<number | null>(null);
  const [isHoveringTooltipBlock, setIsHoveringTooltipBlock] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTimeoutsRef = useRef<{ fill?: ReturnType<typeof setTimeout>, move?: ReturnType<typeof setTimeout>, stop?: ReturnType<typeof setTimeout> }>({});

  const [weatherData, setWeatherData] = useState<{ temp: number; code: number } | null>(null)
  const [timeOfDayOverride, setTimeOfDayOverride] = useState<TimeOfDay>('auto')
  const [moonPhaseOverride, setMoonPhaseOverride] = useState<MoonPhaseKey>('auto')
  const [supermanKey, setSupermanKey] = useState<number>(0)
  const [showTestButtons, setShowTestButtons] = useState(false)
  const [showFactoryControls, setShowFactoryControls] = useState<boolean>(() => JSON.parse(sessionStorage.getItem('rorms-factoryControls') || 'false'))
  const [isAutoMode, setIsAutoMode] = useState<boolean>(() => JSON.parse(sessionStorage.getItem('rorms-autoMode') || 'false'))
  const [selectedLiquid, setSelectedLiquid] = useState<DropdownLiquidType>(() => (sessionStorage.getItem('rorms-selectedLiquid') as DropdownLiquidType) || 'Random')

  const cycleTimeOfDay = () => {
    setTimeOfDayOverride(prev => {
      if (prev === 'auto') return 'dawn';
      if (prev === 'dawn') return 'day';
      if (prev === 'day') return 'sunset';
      if (prev === 'sunset') return 'night';
      return 'auto';
    });
  };

  const MOON_PHASE_SEQUENCE: MoonPhaseKey[] = [
    'auto',
    'new',
    'waxing_crescent',
    'first_quarter',
    'waxing_gibbous',
    'full',
    'waning_gibbous',
    'last_quarter',
    'waning_crescent'
  ];

  const cycleMoonPhase = () => {
    setMoonPhaseOverride(prev => {
      const idx = MOON_PHASE_SEQUENCE.indexOf(prev);
      const nextIdx = (idx + 1) % MOON_PHASE_SEQUENCE.length;
      return MOON_PHASE_SEQUENCE[nextIdx];
    });
  };

  const currentMoonInfo = useMemo(() => {
    const realMoon = getAstronomicalMoonPhase();
    if (moonPhaseOverride === 'auto') {
      return { name: realMoon.phaseName, emoji: realMoon.emoji };
    }
    const names: Record<MoonPhaseKey, { name: string; emoji: string }> = {
      auto: { name: realMoon.phaseName, emoji: realMoon.emoji },
      new: { name: 'New Moon', emoji: '🌑' },
      waxing_crescent: { name: 'Waxing Crescent', emoji: '🌒' },
      first_quarter: { name: 'First Quarter', emoji: '🌓' },
      waxing_gibbous: { name: 'Waxing Gibbous', emoji: '🌔' },
      full: { name: 'Full Moon', emoji: '🌕' },
      waning_gibbous: { name: 'Waning Gibbous', emoji: '🌖' },
      last_quarter: { name: 'Last Quarter', emoji: '🌗' },
      waning_crescent: { name: 'Waning Crescent', emoji: '🌘' }
    };
    return names[moonPhaseOverride];
  }, [moonPhaseOverride]);

  // Save state to sessionStorage
  useEffect(() => { sessionStorage.setItem('rorms-jars', JSON.stringify(jars)); }, [jars]);
  useEffect(() => { sessionStorage.setItem('rorms-nextBuildingIndex', nextBuildingIndex.toString()); }, [nextBuildingIndex]);
  useEffect(() => { sessionStorage.setItem('rorms-factoryControls', JSON.stringify(showFactoryControls)); }, [showFactoryControls]);
  useEffect(() => { sessionStorage.setItem('rorms-autoMode', JSON.stringify(isAutoMode)); }, [isAutoMode]);
  useEffect(() => { sessionStorage.setItem('rorms-selectedLiquid', selectedLiquid); }, [selectedLiquid]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoTimeoutsRef.current.fill) clearTimeout(autoTimeoutsRef.current.fill);
      if (autoTimeoutsRef.current.move) clearTimeout(autoTimeoutsRef.current.move);
      if (autoTimeoutsRef.current.stop) clearTimeout(autoTimeoutsRef.current.stop);
    };
  }, []);

  // Auto Mode Logic
  useEffect(() => {
    if (!isAutoMode) {
      return;
    }

    if (isJarsMoving) return;

    const centerJar = jars.find(j => j.position === 0);
    if (!centerJar) return;

    if (centerJar.fillStatus === 'empty') {
      const actualLiquid: LiquidType = selectedLiquid === 'Random'
        ? ['Water', 'Coffee', 'Blood', 'Mud', 'Slime'][Math.floor(Math.random() * 5)] as LiquidType
        : selectedLiquid as LiquidType;

      setJars(prev => prev.map(j => j.id === centerJar.id ? { ...j, fillStatus: 'filling', liquidType: actualLiquid } : j));
      setWaterKey(prev => prev + 1);

      autoTimeoutsRef.current.fill = setTimeout(() => {
        setJars(prev => prev.map(j => j.id === centerJar.id ? { ...j, fillStatus: 'full' } : j));
      }, 13500);
    }
    else if (centerJar.fillStatus === 'full') {
      setJars(prev => prev.map(j => j.id === centerJar.id ? { ...j, fillStatus: 'labeled' } : j));

      autoTimeoutsRef.current.move = setTimeout(() => {
        setIsJarsMoving(true);
        autoTimeoutsRef.current.stop = setTimeout(() => setIsJarsMoving(false), 2667);

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

          return nextJars.filter(j => j.position >= -15);
        });
      }, 1000);
    }
  }, [isAutoMode, jars, isJarsMoving, nextBuildingIndex, selectedLiquid]);
  const [expandedBuildingIds, setExpandedBuildingIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('rorms_buildings_expanded')
    return saved ? JSON.parse(saved) : []
  })
  const isInitialLoad = useRef(true)
  const knownBuildingIds = useRef<Set<string>>(new Set())

  const [rooms, setRooms] = useState<Room[]>([])
  const [mapData, setMapData] = useState<MapData | null>(null)

  const cycleWeather = () => {
    setWeatherData(prev => {
      if (!prev) return { temp: 28, code: 0 };
      if (prev.code === 0) return { temp: 26, code: 2 }; // Sunny -> Cloudy
      if (prev.code === 2) return { temp: 24, code: 61 }; // Cloudy -> Rain
      if (prev.code === 61) return { temp: 22, code: 95 }; // Rain -> Thunder
      return { temp: 32, code: 0 }; // Thunder -> Sunny
    });
  };

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=16.0433&longitude=120.3333&current_weather=true');
        const data = await res.json();
        if (data && data.current_weather) {
          setWeatherData({
            temp: data.current_weather.temperature,
            code: data.current_weather.weathercode
          });
        }
      } catch (err) {
        console.error("Failed to fetch weather", err);
      }
    };
    fetchWeather();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'campusMap'), (snap) => {
      if (snap.exists()) {
        setMapData(snap.data() as MapData)
      } else {
        setMapData(null)
      }
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    localStorage.setItem('rorms_buildings_expanded', JSON.stringify(expandedBuildingIds))
  }, [expandedBuildingIds])

  useEffect(() => {
    const buildingsQuery = query(collection(db, 'buildings'), orderBy('createdAt', 'desc'))
    const roomsQuery = query(collection(db, 'rooms'), orderBy('createdAt', 'desc'))

    let buildingsList: any[] = []
    let roomsList: any[] = []

    const updateState = () => {
      const mergedBuildings = buildingsList.map(building => {
        const buildingRooms = roomsList.filter(room => room.buildingId === building.id)
        const capacity = buildingRooms.reduce((sum, room) => sum + (room.capacity || 0), 0)
        const floor = buildingRooms.length > 0
          ? Math.max(...buildingRooms.map(room => room.floor || 0))
          : 0

        return {
          ...building,
          rooms: buildingRooms,
          floor,
          capacity,
        }
      }) as Building[]

      setBuildings(mergedBuildings)
      setRooms(roomsList)

      const currentIds = mergedBuildings.map(b => b.id)

      // Auto-expand ONLY for buildings added after the initial data fetch
      if (!isInitialLoad.current) {
        const newIds = currentIds.filter(id => !knownBuildingIds.current.has(id))
        if (newIds.length > 0) {
          setExpandedBuildingIds(prev => [...prev, ...newIds])
        }
      } else if (mergedBuildings.length > 0) {
        isInitialLoad.current = false
      }

      // Update known IDs for next time
      knownBuildingIds.current = new Set(currentIds)
    }

    const unsubscribeBuildings = onSnapshot(buildingsQuery, (snapshot) => {
      buildingsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      updateState()
    })

    const unsubscribeRooms = onSnapshot(roomsQuery, (snapshot) => {
      roomsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      updateState()
    })

    return () => {
      unsubscribeBuildings()
      unsubscribeRooms()
    }
  }, [])

  const [isBuildingModalOpen, setIsBuildingModalOpen] = useState(false)
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null)
  const [newBuildingName, setNewBuildingName] = useState('')
  const [newBuildingCode, setNewBuildingCode] = useState('')

  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false)
  const [isRoomInfoModalOpen, setIsRoomInfoModalOpen] = useState(false)
  const [isRoomScheduleModalOpen, setIsRoomScheduleModalOpen] = useState(false)
  const [selectedRoomInfo, setSelectedRoomInfo] = useState<Room | null>(null)
  const [selectedRoomForSchedule, setSelectedRoomForSchedule] = useState<Room | null>(null)
  const [isMultipleRooms, setIsMultipleRooms] = useState(false)
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  const [activeBuildingId, setActiveBuildingId] = useState<string | null>(null)
  const [roomModalStep, setRoomModalStep] = useState(1)

  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomCode, setNewRoomCode] = useState('')
  const [roomNamePrefix, setRoomNamePrefix] = useState('')
  const [roomCodePrefix, setRoomCodePrefix] = useState('')
  const [roomStartNumber, setRoomStartNumber] = useState('')
  const [roomEndNumber, setRoomEndNumber] = useState('')
  const [newRoomType, setNewRoomType] = useState('Lecture')
  const [newRoomFloor, setNewRoomFloor] = useState<string>('1')
  const [newRoomCapacity, setNewRoomCapacity] = useState<string>('50')
  const [newRoomStatus, setNewRoomStatus] = useState<RoomStatus>('Available')
  const [newRoomImage, setNewRoomImage] = useState(DEFAULT_ROOM_IMAGE)
  const [newRoomDescription, setNewRoomDescription] = useState('')
  const [newRoomAmenities, setNewRoomAmenities] = useState<string[]>([])
  const [newRoomAvailableDays, setNewRoomAvailableDays] = useState<string[]>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
  const [newRoomStartTime, setNewRoomStartTime] = useState('07:30')
  const [newRoomEndTime, setNewRoomEndTime] = useState('18:00')
  const [newRoomMinBookingMins, setNewRoomMinBookingMins] = useState('30')
  const [newRoomMaxBookingMins, setNewRoomMaxBookingMins] = useState('90')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cropModalData, setCropModalData] = useState<{ isOpen: boolean, imageSrc: string }>({
    isOpen: false,
    imageSrc: ''
  })
  const [isDraggingRoomImage, setIsDraggingRoomImage] = useState(false)
  const [pendingRoomImageBlob, setPendingRoomImageBlob] = useState<Blob | null>(null)
  const [errors, setErrors] = useState({ name: false, code: false, start: false, end: false })
  const [activeDropdowns, setActiveDropdowns] = useState(0)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleteRoomModalOpen, setIsDeleteRoomModalOpen] = useState(false)
  const [roomToDelete, setRoomToDelete] = useState<Room | null>(null)
  const [isDeletingRoom, setIsDeletingRoom] = useState(false)

  const [isDeleteBuildingModalOpen, setIsDeleteBuildingModalOpen] = useState(false)
  const [buildingToDelete, setBuildingToDelete] = useState<Building | null>(null)
  const [isDeletingBuilding, setIsDeletingBuilding] = useState(false)
  const [confirmBuildingName, setConfirmBuildingName] = useState('')

  const [snackbar, setSnackbar] = useState<{
    isOpen: boolean
    message: string
    title?: string
    type: 'error' | 'warning' | 'info' | 'success' | 'brand'
  }>({
    isOpen: false,
    message: '',
    title: '',
    type: 'success'
  })

  const showNotification = (message: string, type: 'error' | 'warning' | 'info' | 'success' | 'brand' = 'success', title?: string) => {
    setSnackbar({
      isOpen: true,
      message,
      title,
      type
    })
  }

  const handleDropdownToggle = useCallback((isOpen: boolean) => {
    setActiveDropdowns(prev => isOpen ? prev + 1 : Math.max(0, prev - 1))
  }, [])

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingRoomImage(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingRoomImage(false)
  }

  const handleRoomImageDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingRoomImage(false)

    // Check for files
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setCropModalData({ isOpen: true, imageSrc: reader.result })
        }
      }
      reader.readAsDataURL(file)
      return
    }

    // Check for dragged URL (e.g. from Google Images)
    const imageUrl = e.dataTransfer.getData('text/uri-list') ||
      e.dataTransfer.getData('text/plain') ||
      e.dataTransfer.getData('url')

    if (imageUrl && (imageUrl.startsWith('http') || imageUrl.startsWith('data:'))) {
      setCropModalData({ isOpen: true, imageSrc: imageUrl })
    }
  }

  const handleCropComplete = async (croppedImage: Blob) => {
    setPendingRoomImageBlob(croppedImage)
    const blobUrl = URL.createObjectURL(croppedImage)
    setNewRoomImage(blobUrl)
    setCropModalData({ isOpen: false, imageSrc: '' })
  }

  const toggleBuilding = (id: string) => {
    setExpandedBuildingIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const handleOpenRoomInfoModal = (room: Room) => {
    setSelectedRoomInfo(room)
    setIsRoomInfoModalOpen(true)
  }

  const handleOpenBuildingModal = (building?: Building) => {
    if (building) {
      setEditingBuilding(building)
      setNewBuildingName(building.name)
      setNewBuildingCode(building.code)
    } else {
      setEditingBuilding(null)
      setNewBuildingName('')
      setNewBuildingCode('')
    }
    setErrors({ name: false, code: false, start: false, end: false })
    setIsBuildingModalOpen(true)
  }

  const handleOpenRoomModal = (buildingId: string, room?: Room) => {
    setActiveBuildingId(buildingId)
    setRoomModalStep(1)
    if (room) {
      setEditingRoom(room)
      setIsMultipleRooms(false)
      setNewRoomName(room.name)
      setNewRoomCode(room.code)
      setNewRoomType(room.type)
      setNewRoomFloor(String(room.floor))
      setNewRoomCapacity(String(room.capacity))
      setNewRoomStatus(room.status)
      setNewRoomImage(room.image)
      setNewRoomDescription(room.description || '')
      setNewRoomAmenities(room.amenities || [])
      setNewRoomAvailableDays(room.availableDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
      setNewRoomStartTime(room.startTime || '07:30')
      setNewRoomEndTime(room.endTime || '18:00')
      const initialMin = String(room.minBookingMins || '30')
      setNewRoomMinBookingMins(BOOKING_MINUTES_OPTIONS.includes(initialMin as any) ? initialMin : '30')
      const initialMax = String(room.maxBookingMins || '90')
      setNewRoomMaxBookingMins(BOOKING_MINUTES_OPTIONS.includes(initialMax as any) ? initialMax : '90')
    } else {
      setEditingRoom(null)
      setIsMultipleRooms(false)
      setNewRoomName('')
      setNewRoomCode('')
      setRoomNamePrefix('')
      setRoomCodePrefix('')
      setRoomStartNumber('')
      setRoomEndNumber('')
      setNewRoomType('Lecture')
      setNewRoomFloor('1')
      setNewRoomCapacity('50')
      setNewRoomStatus('Available')
      setNewRoomImage(DEFAULT_ROOM_IMAGE)
      setNewRoomDescription('')
      setNewRoomAmenities([])
      setNewRoomAvailableDays(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
      setNewRoomStartTime('07:30')
      setNewRoomEndTime('18:00')
      setNewRoomMinBookingMins('30')
      setNewRoomMaxBookingMins('90')
    }
    setErrors({ name: false, code: false, start: false, end: false })
    setIsRoomModalOpen(true)
  }

  const handleCloseModals = () => {
    setIsBuildingModalOpen(false)
    setIsRoomModalOpen(false)
    setIsRoomInfoModalOpen(false)
    setIsRoomScheduleModalOpen(false)
    setEditingBuilding(null)
    setEditingRoom(null)
    setSelectedRoomInfo(null)
    setSelectedRoomForSchedule(null)
    setActiveBuildingId(null)
    setRoomModalStep(1)
    setPendingRoomImageBlob(null)
    setErrors({ name: false, code: false, start: false, end: false })
  }

  const handleOpenDeleteRoom = (room: Room) => {
    setRoomToDelete(room)
    setIsDeleteRoomModalOpen(true)
  }

  const handleCloseDeleteRoomModal = () => {
    setIsDeleteRoomModalOpen(false)
    setRoomToDelete(null)
  }

  const deleteImageFromStorage = async (imageUrl: string) => {
    if (!imageUrl || !imageUrl.includes('firebasestorage.googleapis.com')) return
    try {
      const imageRef = ref(storage, imageUrl)
      await deleteObject(imageRef)
    } catch (error) {
      console.error("Error deleting image from storage:", error)
    }
  }

  const handleDeleteRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!roomToDelete) return

    setIsDeletingRoom(true)
    try {
      const roomName = roomToDelete.name
      // Delete image from storage first
      await deleteImageFromStorage(roomToDelete.image)

      await deleteDoc(doc(db, 'rooms', roomToDelete.id))
      handleCloseDeleteRoomModal()
      showNotification(`Room "${roomName}" deleted successfully.`, 'success', 'Room Deleted')
    } catch (error) {
      console.error('Error deleting room:', error)
      showNotification('Failed to delete room. Please try again.', 'error', 'Error Deleting Room')
    } finally {
      setIsDeletingRoom(false)
    }
  }

  const handleOpenDeleteBuilding = (building: Building) => {
    setBuildingToDelete(building)
    setConfirmBuildingName('')
    setIsDeleteBuildingModalOpen(true)
  }

  const handleCloseDeleteBuildingModal = () => {
    setIsDeleteBuildingModalOpen(false)
    setBuildingToDelete(null)
    setConfirmBuildingName('')
  }

  const handleDeleteBuildingSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!buildingToDelete) return

    setIsDeletingBuilding(true)
    try {
      const buildingName = buildingToDelete.name
      // Delete all room images from storage
      await Promise.all(buildingToDelete.rooms.map(room => deleteImageFromStorage(room.image)))

      const batch = writeBatch(db)

      // Delete all rooms associated with the building
      buildingToDelete.rooms.forEach(room => {
        batch.delete(doc(db, 'rooms', room.id))
      })

      // Delete the building itself
      batch.delete(doc(db, 'buildings', buildingToDelete.id))

      await batch.commit()
      handleCloseDeleteBuildingModal()
      showNotification(`Building "${buildingName}" and its rooms deleted successfully.`, 'success', 'Building Deleted')
    } catch (error) {
      console.error('Error deleting building:', error)
      showNotification('Failed to delete building. Please try again.', 'error', 'Error Deleting Building')
    } finally {
      setIsDeletingBuilding(false)
    }
  }

  const handleBuildingSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBuildingName.trim() || !newBuildingCode.trim()) {
      setErrors({ name: !newBuildingName.trim(), code: !newBuildingCode.trim(), start: false, end: false })
      if (!newBuildingName.trim() && !newBuildingCode.trim()) {
        showNotification('Building name and code are required.', 'error', 'Missing Information')
      } else if (!newBuildingName.trim()) {
        showNotification('Building name is required.', 'error', 'Missing Information')
      } else {
        showNotification('Building code is required.', 'error', 'Missing Information')
      }
      return
    }

    // Check for uniqueness
    const normalizedName = newBuildingName.trim().toLowerCase()
    const normalizedCode = newBuildingCode.trim().toLowerCase()

    const isDuplicateName = buildings.some(b =>
      b.name.trim().toLowerCase() === normalizedName &&
      (!editingBuilding || b.id !== editingBuilding.id)
    )
    const isDuplicateCode = buildings.some(b =>
      b.code.trim().toLowerCase() === normalizedCode &&
      (!editingBuilding || b.id !== editingBuilding.id)
    )

    if (isDuplicateName || isDuplicateCode) {
      setErrors({ name: isDuplicateName, code: isDuplicateCode, start: false, end: false })
      if (isDuplicateName && isDuplicateCode) {
        showNotification('A building with this name and code already exists.', 'warning', 'Duplicate Building')
      } else if (isDuplicateName) {
        showNotification('A building with this name already exists.', 'warning', 'Duplicate Building')
      } else {
        showNotification('A building with this code already exists.', 'warning', 'Duplicate Building')
      }
      return
    }

    setIsSubmitting(true)
    try {
      if (editingBuilding) {
        const buildingRef = doc(db, 'buildings', editingBuilding.id)
        await updateDoc(buildingRef, {
          name: newBuildingName,
          code: newBuildingCode,
          updatedAt: serverTimestamp()
        })
        handleCloseModals()
        showNotification(`Building "${newBuildingName}" updated successfully.`, 'success', 'Building Updated')
      } else {
        const savedBuildingName = newBuildingName
        const docRef = await addDoc(collection(db, 'buildings'), {
          name: newBuildingName,
          code: newBuildingCode,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })

        // Close building modal first
        setIsBuildingModalOpen(false)
        setEditingBuilding(null)

        // Automatically open room modal for the new building
        handleOpenRoomModal(docRef.id)
        showNotification(`Building "${savedBuildingName}" created successfully. Add rooms to complete setup.`, 'success', 'Building Created')
      }
    } catch (error) {
      console.error("Error saving building: ", error)
      showNotification('Failed to save building. Please try again.', 'error', 'Error Saving Building')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (roomModalStep === 1) {
      if (isMultipleRooms) {
        if (!roomNamePrefix.trim() || !roomCodePrefix.trim() || !roomStartNumber.trim() || !roomEndNumber.trim()) {
          setErrors({
            name: !roomNamePrefix.trim(),
            code: !roomCodePrefix.trim(),
            start: !roomStartNumber.trim(),
            end: !roomEndNumber.trim()
          })
          showNotification('Please fill in all required room fields.', 'error', 'Missing Information')
          return
        }

        // Check for uniqueness in range
        const startNum = parseInt(roomStartNumber) || 0
        const endNum = parseInt(roomEndNumber) || 0
        const count = Math.abs(endNum - startNum) + 1
        const step = startNum <= endNum ? 1 : -1

        for (let i = 0; i < count; i++) {
          const currentNum = startNum + (i * step)
          const targetName = `${roomNamePrefix}${currentNum}`.trim().toLowerCase()
          const targetCode = `${roomCodePrefix}${currentNum}`.trim().toLowerCase()

          const isDuplicateName = rooms.some(r =>
            r.name.trim().toLowerCase() === targetName &&
            (!editingRoom || r.id !== editingRoom.id)
          )
          const isDuplicateCode = rooms.some(r =>
            r.code.trim().toLowerCase() === targetCode &&
            (!editingRoom || r.id !== editingRoom.id)
          )

          if (isDuplicateName || isDuplicateCode) {
            setErrors({ name: isDuplicateName, code: isDuplicateCode, start: false, end: false })
            showNotification(
              isDuplicateName
                ? `Room name "${roomNamePrefix}${currentNum}" already exists.`
                : `Room code "${roomCodePrefix}${currentNum}" already exists.`,
              'warning',
              'Duplicate Room'
            )
            return
          }
        }
      } else {
        if (!newRoomName.trim() || !newRoomCode.trim()) {
          setErrors({ name: !newRoomName.trim(), code: !newRoomCode.trim(), start: false, end: false })
          if (!newRoomName.trim() && !newRoomCode.trim()) {
            showNotification('Room name and code are required.', 'error', 'Missing Information')
          } else if (!newRoomName.trim()) {
            showNotification('Room name is required.', 'error', 'Missing Information')
          } else {
            showNotification('Room code is required.', 'error', 'Missing Information')
          }
          return
        }

        // Check for uniqueness
        const normalizedName = newRoomName.trim().toLowerCase()
        const normalizedCode = newRoomCode.trim().toLowerCase()

        const isDuplicateName = rooms.some(r =>
          r.name.trim().toLowerCase() === normalizedName &&
          (!editingRoom || r.id !== editingRoom.id)
        )
        const isDuplicateCode = rooms.some(r =>
          r.code.trim().toLowerCase() === normalizedCode &&
          (!editingRoom || r.id !== editingRoom.id)
        )

        if (isDuplicateName || isDuplicateCode) {
          setErrors({ name: isDuplicateName, code: isDuplicateCode, start: false, end: false })
          if (isDuplicateName && isDuplicateCode) {
            showNotification('A room with this name and code already exists.', 'warning', 'Duplicate Room')
          } else if (isDuplicateName) {
            showNotification('A room with this name already exists.', 'warning', 'Duplicate Room')
          } else {
            showNotification('A room with this code already exists.', 'warning', 'Duplicate Room')
          }
          return
        }
      }
    }

    if (roomModalStep < 3) {
      setRoomModalStep(prev => prev + 1)
      return
    }

    const min = parseInt(newRoomMinBookingMins) || 0
    const max = parseInt(newRoomMaxBookingMins) || 0

    if (min >= max && max !== 0) {
      showNotification('Maximum booking minutes must be greater than minimum booking minutes.', 'warning', 'Invalid Booking Limits')
      return
    }

    const [startH, startM] = (newRoomStartTime || '07:30').split(':').map(Number)
    const [endH, endM] = (newRoomEndTime || '18:00').split(':').map(Number)
    const startTotalMins = (startH || 0) * 60 + (startM || 0)
    const endTotalMins = (endH || 0) * 60 + (endM || 0)

    if (startTotalMins >= endTotalMins) {
      showNotification('Start time must be earlier than end time.', 'warning', 'Invalid Schedule Time')
      return
    }

    setIsSubmitting(true)
    try {
      let imageBlob: Blob | null = pendingRoomImageBlob;
      const isNewUpload = !!pendingRoomImageBlob || (newRoomImage.startsWith('data:') && newRoomImage !== DEFAULT_ROOM_IMAGE);

      if (!imageBlob && isNewUpload) {
        const response = await fetch(newRoomImage);
        imageBlob = await response.blob();
      }

      const uploadImage = async (roomId: string) => {
        if (!imageBlob) return newRoomImage;
        const storageRef = ref(storage, `rooms/${roomId}/image_${Date.now()}`);
        await uploadBytesResumable(storageRef, imageBlob);
        return await getDownloadURL(storageRef);
      };

      if (editingRoom) {
        const roomRef = doc(db, 'rooms', editingRoom.id)
        const oldImageUrl = editingRoom.image
        const imageUrl = await uploadImage(editingRoom.id)

        // Delete old image if a new one was uploaded and the old one was in storage
        if (isNewUpload && oldImageUrl && oldImageUrl.includes('firebasestorage.googleapis.com')) {
          console.log("Deleting old image from storage:", oldImageUrl)
          await deleteImageFromStorage(oldImageUrl)
        }

        await updateDoc(roomRef, {
          name: newRoomName,
          code: newRoomCode,
          type: newRoomType,
          floor: parseInt(newRoomFloor) || 0,
          capacity: parseInt(newRoomCapacity) || 0,
          status: newRoomStatus,
          image: imageUrl,
          description: newRoomDescription,
          amenities: newRoomAmenities,
          availableDays: newRoomAvailableDays,
          startTime: newRoomStartTime,
          endTime: newRoomEndTime,
          minBookingMins: min,
          maxBookingMins: max,
          updatedAt: serverTimestamp()
        })
        handleCloseModals()
        showNotification(`Room "${newRoomName}" updated successfully.`, 'success', 'Room Updated')
      } else if (isMultipleRooms) {
        const startNum = parseInt(roomStartNumber) || 0
        const endNum = parseInt(roomEndNumber) || 0

        const count = Math.abs(endNum - startNum) + 1
        const step = startNum <= endNum ? 1 : -1

        for (let i = 0; i < count; i++) {
          const currentNum = startNum + (i * step)
          const roomRef = await addDoc(collection(db, 'rooms'), {
            buildingId: activeBuildingId,
            name: `${roomNamePrefix}${currentNum}`,
            code: `${roomCodePrefix}${currentNum}`,
            type: newRoomType,
            floor: parseInt(newRoomFloor) || 0,
            capacity: parseInt(newRoomCapacity) || 0,
            status: newRoomStatus,
            image: newRoomImage,
            description: newRoomDescription,
            amenities: newRoomAmenities,
            availableDays: newRoomAvailableDays,
            startTime: newRoomStartTime,
            endTime: newRoomEndTime,
            minBookingMins: min,
            maxBookingMins: max,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          })

          if (isNewUpload) {
            const imageUrl = await uploadImage(roomRef.id)
            await updateDoc(roomRef, { image: imageUrl })
          }
        }
        handleCloseModals()
        showNotification(`Successfully added ${count} rooms.`, 'success', 'Rooms Added')
      } else {
        const savedRoomName = newRoomName
        const roomRef = await addDoc(collection(db, 'rooms'), {
          buildingId: activeBuildingId,
          name: newRoomName,
          code: newRoomCode,
          type: newRoomType,
          floor: parseInt(newRoomFloor) || 0,
          capacity: parseInt(newRoomCapacity) || 0,
          status: newRoomStatus,
          image: newRoomImage,
          description: newRoomDescription,
          amenities: newRoomAmenities,
          availableDays: newRoomAvailableDays,
          startTime: newRoomStartTime,
          endTime: newRoomEndTime,
          minBookingMins: min,
          maxBookingMins: max,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })

        if (isNewUpload) {
          const imageUrl = await uploadImage(roomRef.id)
          await updateDoc(roomRef, { image: imageUrl })
        }
        handleCloseModals()
        showNotification(`Room "${savedRoomName}" added successfully.`, 'success', 'Room Added')
      }
    } catch (error) {
      console.error("Error saving room: ", error)
      showNotification('Failed to save room. Please try again.', 'error', 'Error Saving Room')
    } finally {
      setIsSubmitting(false)
    }
  }



  return (
    <section
      className="h-screen overflow-y-scroll overflow-x-hidden custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8"
      onClick={() => setOpenMenuId(null)}
    >
      {/* Create/Edit Building Modal */}
      {isBuildingModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-md rounded-3xl border border-gray-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-3xl">
              <h3 className="text-xl font-bold">{editingBuilding ? 'Edit Building' : 'Add Building'}</h3>
              <p className="mt-1 text-sm text-white/80">
                {editingBuilding ? 'Update building information.' : 'Register a new building in the system.'}
              </p>
            </div>

            <form onSubmit={handleBuildingSubmit} className="p-6 space-y-5">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label htmlFor="building-name" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Building Name <span className="text-rose-500">*</span>
                  </label>
                  <TextInput
                    id="building-name"
                    value={newBuildingName}
                    onChange={(val) => {
                      setNewBuildingName(val)
                      if (errors.name) setErrors(prev => ({ ...prev, name: false }))
                    }}
                    placeholder="e.g. Administration Building"
                    error={errors.name}
                    autoFocus
                  />
                </div>

                <div className="col-span-1">
                  <label htmlFor="building-code" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Code <span className="text-rose-500">*</span>
                  </label>
                  <TextInput
                    id="building-code"
                    value={newBuildingCode}
                    onChange={(val) => {
                      setNewBuildingCode(val)
                      if (errors.code) setErrors(prev => ({ ...prev, code: false }))
                    }}
                    placeholder="e.g. ADM"
                    error={errors.code}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseModals}
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
                    ? (editingBuilding ? 'Saving Changes...' : 'Adding Building...')
                    : (editingBuilding ? 'Save Changes' : 'Add Building')}
                </Button>
              </div>
            </form>
          </div>
          <div
            className="absolute inset-0 -z-10"
            onClick={() => {
              if (!isSubmitting) handleCloseModals()
            }}
          />
        </div>
      )}

      {/* Create/Edit Room Modal */}
      {isRoomModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-md rounded-3xl border border-gray-200 bg-white shadow-2xl overflow-visible"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-3xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">{editingRoom ? 'Edit Room' : 'Add Room'}</h3>
                  <p className="mt-1 text-xs text-white/80">
                    Step {roomModalStep} of 3: {roomModalStep === 1 ? 'General Info' : roomModalStep === 2 ? 'Media & Description' : 'Availability & Limits'}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {[1, 2, 3].map((s) => (
                    <div
                      key={s}
                      className={`h-1.5 w-6 rounded-full transition-colors ${s <= roomModalStep ? 'bg-white' : 'bg-white/30'}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <form onSubmit={handleRoomSubmit} className="p-6 space-y-5 overflow-visible">
              {roomModalStep === 1 && (
                <div className="space-y-4 overflow-visible animate-in fade-in slide-in-from-right-4 duration-300">
                  {!editingRoom && (
                    <div className="flex p-1 bg-gray-100 rounded-xl mb-6">
                      <button
                        type="button"
                        onClick={() => setIsMultipleRooms(false)}
                        className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${!isMultipleRooms ? 'bg-white text-[var(--brand-color)] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        Single Room
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsMultipleRooms(true)}
                        className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${isMultipleRooms ? 'bg-white text-[var(--brand-color)] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        Multiple Rooms
                      </button>
                    </div>
                  )}

                  {!isMultipleRooms ? (
                    <div className="grid grid-cols-5 gap-4 overflow-visible">
                      <div className="col-span-3 overflow-visible">
                        <div className="flex justify-between items-end mb-2">
                          <label htmlFor="room-name" className="block text-xs font-bold uppercase tracking-widest text-gray-500">
                            Room Name <span className="text-rose-500">*</span>
                          </label>
                          <span className={`text-[0.625rem] font-bold uppercase tracking-tight ${newRoomName.length >= 24 ? 'text-rose-500' : 'text-gray-400'}`}>
                            {newRoomName.length} / 24
                          </span>
                        </div>
                        <TextInput
                          id="room-name"
                          value={newRoomName}
                          maxLength={24}
                          onChange={(val) => {
                            setNewRoomName(val)
                            if (errors.name) setErrors(prev => ({ ...prev, name: false }))
                          }}
                          placeholder="e.g. Registrar Receiving"
                          error={errors.name}
                          autoFocus
                        />
                      </div>
                      <div className="col-span-2 overflow-visible">
                        <div className="flex justify-between items-end mb-2">
                          <label htmlFor="room-code" className="block text-xs font-bold uppercase tracking-widest text-gray-500">
                            Code <span className="text-rose-500">*</span>
                          </label>
                          <span className={`text-[0.625rem] font-bold uppercase tracking-tight ${newRoomCode.length >= 8 ? 'text-rose-500' : 'text-gray-400'}`}>
                            {newRoomCode.length} / 8
                          </span>
                        </div>
                        <TextInput
                          id="room-code"
                          value={newRoomCode}
                          maxLength={8}
                          onChange={(val) => {
                            setNewRoomCode(val)
                            if (errors.code) setErrors(prev => ({ ...prev, code: false }))
                          }}
                          placeholder="e.g. ADM-101"
                          error={errors.code}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-5 gap-4 overflow-visible">
                        <div className="col-span-3 overflow-visible">
                          <div className="flex justify-between items-end mb-2">
                            <label htmlFor="room-name-prefix" className="block text-xs font-bold uppercase tracking-widest text-gray-500">
                              Name Prefix <span className="text-rose-500">*</span>
                            </label>
                            <span className={`text-[0.625rem] font-bold uppercase tracking-tight ${roomNamePrefix.length >= 24 ? 'text-rose-500' : 'text-gray-400'}`}>
                              {roomNamePrefix.length} / 24
                            </span>
                          </div>
                          <TextInput
                            id="room-name-prefix"
                            value={roomNamePrefix}
                            maxLength={24}
                            onChange={(val) => {
                              setRoomNamePrefix(val)
                              if (errors.name) setErrors(prev => ({ ...prev, name: false }))
                            }}
                            placeholder="e.g. PTC "
                            error={errors.name}
                            autoFocus
                          />
                        </div>
                        <div className="col-span-2 overflow-visible">
                          <div className="flex justify-between items-end mb-2">
                            <label htmlFor="room-code-prefix" className="block text-xs font-bold uppercase tracking-widest text-gray-500">
                              Code Prefix <span className="text-rose-500">*</span>
                            </label>
                            <span className={`text-[0.625rem] font-bold uppercase tracking-tight ${roomCodePrefix.length >= 8 ? 'text-rose-500' : 'text-gray-400'}`}>
                              {roomCodePrefix.length} / 8
                            </span>
                          </div>
                          <TextInput
                            id="room-code-prefix"
                            value={roomCodePrefix}
                            maxLength={8}
                            onChange={(val) => {
                              setRoomCodePrefix(val)
                              if (errors.code) setErrors(prev => ({ ...prev, code: false }))
                            }}
                            placeholder="e.g. PTC-"
                            error={errors.code}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="room-start-number" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                            Start Number <span className="text-rose-500">*</span>
                          </label>
                          <NumberInput
                            id="room-start-number"
                            value={roomStartNumber}
                            onChange={(val) => {
                              setRoomStartNumber(val)
                              if (errors.start) setErrors(prev => ({ ...prev, start: false }))
                            }}
                            onKeyDown={(e) => {
                              if (['e', 'E', '+', '-', '.'].includes(e.key)) {
                                e.preventDefault()
                              }
                            }}
                            placeholder="e.g. 101"
                            error={errors.start}
                          />
                        </div>
                        <div>
                          <label htmlFor="room-end-number" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                            End Number <span className="text-rose-500">*</span>
                          </label>
                          <NumberInput
                            id="room-end-number"
                            value={roomEndNumber}
                            onChange={(val) => {
                              setRoomEndNumber(val)
                              if (errors.end) setErrors(prev => ({ ...prev, end: false }))
                            }}
                            onKeyDown={(e) => {
                              if (['e', 'E', '+', '-', '.'].includes(e.key)) {
                                e.preventDefault()
                              }
                            }}
                            placeholder="e.g. 105"
                            error={errors.end}
                          />
                        </div>
                      </div>
                      <div className="p-3 bg-gray-50 border border-gray-200 rounded-md flex items-center">
                        <p className="text-[0.625rem] font-bold text-gray-500 uppercase tracking-widest shrink-0 mr-1">Preview:</p>
                        <p className="text-xs text-gray-700 truncate">
                          {roomStartNumber && roomEndNumber ? (
                            (() => {
                              const s = parseInt(roomStartNumber)
                              const e = parseInt(roomEndNumber)
                              if (isNaN(s) || isNaN(e)) return "Enter range to see preview"
                              if (s === e) return `${roomNamePrefix}${s}`
                              const diff = Math.abs(e - s)
                              const step = s < e ? 1 : -1
                              const next = s + step
                              if (diff === 1) return `${roomNamePrefix}${s}, ${roomNamePrefix}${e}`
                              return <>{roomNamePrefix}{s}, {roomNamePrefix}{next}, ..., {roomNamePrefix}{e}</>
                            })()
                          ) : (
                            "Enter range to see preview"
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 overflow-visible">
                    <div className="overflow-visible">
                      <label htmlFor="room-floor" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Floor
                      </label>
                      <NumberInput
                        id="room-floor"
                        value={newRoomFloor}
                        onChange={setNewRoomFloor}
                      />
                    </div>
                    <div className="overflow-visible">
                      <label htmlFor="room-capacity" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Capacity
                      </label>
                      <NumberInput
                        id="room-capacity"
                        value={newRoomCapacity}
                        onChange={setNewRoomCapacity}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 overflow-visible">
                    <div className="overflow-visible">
                      <label htmlFor="room-type" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Type
                      </label>
                      <SingleSelectDropdown
                        options={['Lecture', 'Laboratory', 'Meeting Room', 'Studio', 'Administrative']}
                        value={newRoomType}
                        onChange={setNewRoomType}
                        onToggle={handleDropdownToggle}
                        className="w-full"
                      />
                    </div>
                    <div className="overflow-visible">
                      <label htmlFor="room-status" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Status
                      </label>
                      <SingleSelectDropdown
                        options={['Available', 'Occupied', 'Maintenance']}
                        value={newRoomStatus}
                        onChange={(val) => setNewRoomStatus(val as RoomStatus)}
                        onToggle={handleDropdownToggle}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              )}

              {roomModalStep === 2 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="grid grid-cols-3 gap-6">
                    <div className="col-span-1 flex flex-col">
                      <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Room Photo
                      </label>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                        accept="image/*"
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleRoomImageDrop}
                        className={`w-full aspect-square rounded-md border-2 border-dashed flex items-center justify-center overflow-hidden transition-all group relative shadow-sm ${isDraggingRoomImage
                          ? 'border-[var(--brand-color)] bg-[var(--brand-color)]/5 ring-4 ring-[var(--brand-color)]/10 scale-[0.98]'
                          : 'border-gray-200 bg-gray-50 hover:border-[var(--brand-color)]'
                          }`}
                      >
                        {newRoomImage ? (
                          <img
                            src={newRoomImage}
                            alt="Preview"
                            className="h-full w-full object-cover"
                            onError={(e) => { e.currentTarget.src = DEFAULT_ROOM_IMAGE }}
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            <CameraIcon className="h-8 w-8 text-gray-400" />
                            <span className="text-[0.625rem] font-bold text-gray-400 uppercase tracking-tight text-center px-2">Upload Image</span>
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                          <UploadIcon className="h-8 w-8 text-white" />
                        </div>
                      </button>
                    </div>

                    <div className="col-span-2 flex flex-col">
                      <div className="flex justify-between items-end mb-2">
                        <label htmlFor="room-description" className="block text-xs font-bold uppercase tracking-widest text-gray-500">
                          Description
                        </label>
                        <span className={`text-[0.625rem] font-bold uppercase tracking-tight ${newRoomDescription.length >= 200 ? 'text-rose-500' : 'text-gray-400'}`}>
                          {newRoomDescription.length} / 200
                        </span>
                      </div>
                      <TextAreaInput
                        id="room-description"
                        value={newRoomDescription}
                        maxLength={200}
                        onChange={setNewRoomDescription}
                        placeholder="Describe the room, equipment, and other details..."
                        className="flex-1"
                        inputClassName="h-full"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
                      Room Amenities
                    </label>
                    <RoomAmenities
                      amenities={ROOM_AMENITIES_GROUPS.flat()}
                      selectedAmenities={newRoomAmenities}
                      onToggleAmenity={(amenity) => {
                        setNewRoomAmenities(prev =>
                          prev.includes(amenity)
                            ? prev.filter(a => a !== amenity)
                            : [...prev, amenity]
                        )
                      }}
                      maxHeightClass="max-h-[7.8rem]"
                    />
                  </div>
                </div>
              )}

              {roomModalStep === 3 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
                      Available Days
                    </label>
                    <div className="flex gap-1.5">
                      {DAYS_OF_WEEK.map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            setNewRoomAvailableDays(prev =>
                              prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
                            )
                          }}
                          className={`flex-1 flex flex-col items-center justify-center rounded-xl border py-2 text-[0.625rem] font-bold uppercase transition cursor-pointer ${newRoomAvailableDays.includes(day)
                            ? 'border-[var(--brand-color)] bg-[var(--brand-color)] text-white shadow-sm'
                            : 'border-gray-300 bg-white text-gray-500 hover:border-gray-400'
                            }`}
                        >
                          {day.slice(0, 3).split('').map((char, index) => (
                            <span key={index} className="leading-tight">{char}</span>
                          ))}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Start Time
                      </label>
                      <TimePicker
                        value={newRoomStartTime}
                        onChange={(val) => {
                          setNewRoomStartTime(val)
                          if (val && newRoomEndTime) {
                            const [sh, sm] = val.split(':').map(Number)
                            const [eh, em] = newRoomEndTime.split(':').map(Number)
                            const sMins = (sh || 0) * 60 + (sm || 0)
                            const eMins = (eh || 0) * 60 + (em || 0)
                            if (sMins >= eMins) {
                              const nextEndMins = Math.min(1080, sMins + 30)
                              const endHour = Math.floor(nextEndMins / 60).toString().padStart(2, '0')
                              const endMin = (nextEndMins % 60).toString().padStart(2, '0')
                              setNewRoomEndTime(`${endHour}:${endMin}`)
                            }
                          }
                        }}
                        onToggle={handleDropdownToggle}
                        minuteStep={30}
                        hideClear
                        minTime="07:30"
                        maxTime={(() => {
                          if (!newRoomEndTime) return '17:30'
                          const [eh, em] = newRoomEndTime.split(':').map(Number)
                          const maxStartMins = Math.max(450, ((eh || 0) * 60 + (em || 0)) - 30)
                          const h = Math.floor(maxStartMins / 60).toString().padStart(2, '0')
                          const m = (maxStartMins % 60).toString().padStart(2, '0')
                          return `${h}:${m}`
                        })()}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        End Time
                      </label>
                      <TimePicker
                        value={newRoomEndTime}
                        onChange={(val) => {
                          setNewRoomEndTime(val)
                          if (val && newRoomStartTime) {
                            const [sh, sm] = newRoomStartTime.split(':').map(Number)
                            const [eh, em] = val.split(':').map(Number)
                            const sMins = (sh || 0) * 60 + (sm || 0)
                            const eMins = (eh || 0) * 60 + (em || 0)
                            if (eMins <= sMins) {
                              const nextStartMins = Math.max(450, eMins - 30)
                              const startHour = Math.floor(nextStartMins / 60).toString().padStart(2, '0')
                              const startMin = (nextStartMins % 60).toString().padStart(2, '0')
                              setNewRoomStartTime(`${startHour}:${startMin}`)
                            }
                          }
                        }}
                        onToggle={handleDropdownToggle}
                        minuteStep={30}
                        hideClear
                        defaultPlacement="latest"
                        minTime={(() => {
                          if (!newRoomStartTime) return '08:00'
                          const [sh, sm] = newRoomStartTime.split(':').map(Number)
                          const minEndMins = Math.min(1080, ((sh || 0) * 60 + (sm || 0)) + 30)
                          const h = Math.floor(minEndMins / 60).toString().padStart(2, '0')
                          const m = (minEndMins % 60).toString().padStart(2, '0')
                          return `${h}:${m}`
                        })()}
                        maxTime="18:00"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 overflow-visible">
                    <div className="overflow-visible">
                      <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Min Booking (Mins)
                      </label>
                      <SingleSelectDropdown
                        options={BOOKING_MINUTES_OPTIONS}
                        value={newRoomMinBookingMins}
                        onChange={(val) => {
                          setNewRoomMinBookingMins(val)
                          if (parseInt(newRoomMaxBookingMins) < parseInt(val)) {
                            setNewRoomMaxBookingMins(val)
                          }
                        }}
                        onToggle={handleDropdownToggle}
                        className="w-full"
                      />
                    </div>
                    <div className="overflow-visible">
                      <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Max Booking (Mins)
                      </label>
                      <SingleSelectDropdown
                        options={BOOKING_MINUTES_OPTIONS.filter(o => parseInt(o) >= parseInt(newRoomMinBookingMins))}
                        value={newRoomMaxBookingMins}
                        onChange={setNewRoomMaxBookingMins}
                        onToggle={handleDropdownToggle}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                {roomModalStep > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRoomModalStep(prev => prev - 1)}
                    disabled={isSubmitting}
                    className="flex-1"
                  >
                    Back
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseModals}
                    disabled={isSubmitting}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                )}

                <Button
                  type="submit"
                  variant="brand"
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  {roomModalStep < 3
                    ? 'Next Step'
                    : (isSubmitting
                      ? (editingRoom ? 'Saving Changes...' : 'Adding Room...')
                      : (editingRoom ? 'Save Changes' : 'Add Room'))}
                </Button>
              </div>
            </form>
          </div>
          <div
            className="absolute inset-0 -z-10"
            onMouseDown={() => {
              if (activeDropdowns > 0 || isSubmitting) return
              handleCloseModals()
            }}
          />
        </div>
      )}

      {/* Room Information Modal */}
      <RoomInfoModal
        isOpen={isRoomInfoModalOpen}
        room={selectedRoomInfo}
        onClose={handleCloseModals}
        actionButton={
          <Button
            variant="brand"
            icon={<CalendarIcon className="h-4 w-4" />}
            className="flex-1"
            onClick={() => {
              if (!selectedRoomInfo) return
              setSelectedRoomForSchedule(selectedRoomInfo)
              setIsRoomScheduleModalOpen(true)
              setIsRoomInfoModalOpen(false)
            }}
          >
            Room Schedule
          </Button>
        }
      />

      {/* Room Schedule Timetable Modal */}
      <ScheduleModal
        isOpen={isRoomScheduleModalOpen}
        room={selectedRoomForSchedule}
        buildingName={
          buildings.find(b => b.rooms.some(r => r.id === selectedRoomForSchedule?.id))?.name
        }
        forceFullDaySchedule={true}
        onClose={handleCloseModals}
        onBack={() => {
          setIsRoomScheduleModalOpen(false)
          if (selectedRoomForSchedule) {
            setSelectedRoomInfo(selectedRoomForSchedule)
            setIsRoomInfoModalOpen(true)
          }
        }}
      />

      {/* Delete Room Confirmation Modal */}
      {isDeleteRoomModalOpen && roomToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-md rounded-3xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 p-6 text-white rounded-t-3xl">
              <h3 className="text-xl font-bold">Delete Room</h3>
              <p className="mt-1 text-sm text-white/80">Are you sure you want to delete this room from the system?</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 rounded-md border border-gray-100 bg-gray-50 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-400 overflow-hidden shrink-0">
                  <img
                    src={roomToDelete.image}
                    alt=""
                    className="h-full w-full object-cover grayscale-[0.2]"
                    onError={(e) => { e.currentTarget.src = DEFAULT_ROOM_IMAGE }}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{roomToDelete.name}</p>
                  <p className="text-xs font-medium text-gray-500">{roomToDelete.type}</p>
                </div>
              </div>

              <div className="rounded-md bg-rose-50 p-4 border border-rose-100">
                <p className="text-xs leading-relaxed text-rose-700">
                  <span className="font-bold uppercase tracking-wider">Warning:</span> This action will permanently delete this room and all its associated booking history. This action cannot be undone.
                </p>
              </div>

              <form onSubmit={handleDeleteRoomSubmit} className="space-y-4 pt-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCloseDeleteRoomModal}
                    disabled={isDeletingRoom}
                    className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isDeletingRoom}
                    className="flex-1 rounded-md bg-rose-600 py-3 text-sm font-bold text-white shadow-md transition enabled:hover:bg-rose-700 enabled:hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDeletingRoom ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                </div>
              </form>
            </div>
          </div>
          <div
            className="absolute inset-0 -z-10"
            onClick={() => {
              if (!isDeletingRoom) handleCloseDeleteRoomModal()
            }}
          />
        </div>
      )}

      {/* Delete Building Confirmation Modal */}
      {isDeleteBuildingModalOpen && buildingToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-md rounded-3xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 p-6 text-white rounded-t-3xl">
              <h3 className="text-xl font-bold">Delete Building</h3>
              <p className="mt-1 text-sm text-white/80">Are you sure you want to delete this building from the system?</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 rounded-md border border-gray-100 bg-gray-50 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-400 shrink-0">
                  <BuildingIcon className="h-7 w-7 text-gray-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{buildingToDelete.name}</p>
                  <p className="text-xs font-medium text-gray-500">{buildingToDelete.code} • {buildingToDelete.rooms.length} Rooms</p>
                </div>
              </div>

              <div className="rounded-md bg-rose-50 p-4 border border-rose-100">
                <p className="text-xs leading-relaxed text-rose-700">
                  <span className="font-bold uppercase tracking-wider">Warning:</span> This action will permanently delete this building and all rooms associated with it. This action cannot be undone.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <label htmlFor="confirm-building-name" className="block text-xs font-bold uppercase tracking-widest text-gray-500">
                  To confirm, please type: <span className="text-rose-600">"{buildingToDelete.name}"</span>
                </label>
                <input
                  id="confirm-building-name"
                  type="text"
                  value={confirmBuildingName}
                  onChange={(e) => setConfirmBuildingName(e.target.value)}
                  placeholder="Enter building name"
                  className="w-full rounded-md border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-50 shadow-sm"
                  autoFocus
                />
              </div>

              <form onSubmit={handleDeleteBuildingSubmit} className="space-y-4 pt-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCloseDeleteBuildingModal}
                    disabled={isDeletingBuilding}
                    className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isDeletingBuilding || confirmBuildingName !== buildingToDelete.name}
                    className="flex-1 rounded-md bg-rose-600 py-3 text-sm font-bold text-white shadow-md transition enabled:hover:bg-rose-700 enabled:hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDeletingBuilding ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                </div>
              </form>
            </div>
          </div>
          <div
            className="absolute inset-0 -z-10"
            onClick={() => {
              if (!isDeletingBuilding) handleCloseDeleteBuildingModal()
            }}
          />
        </div>
      )}

      <div className="space-y-6">
        <SectionHeader
          title="Buildings & Rooms"
          description="Manage campus facilities, view room capacities, and track utilization."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
          <SummaryCard
            title="Total Buildings"
            icon={<BuildingIcon className="w-5 h-5" />}
            subtitle={mapData?.type === 'freeform' ? 'Interactive campus map updated' : 'Campus map initialized'}
            gradientClasses="from-[var(--brand-color)]/20 to-[var(--brand-color)]/10"
            outlineClasses="bg-[var(--brand-color)]"
            blobClasses="bg-[var(--brand-color)]/5"
          >
            <CampusMap buildings={buildings} mapData={mapData} />
          </SummaryCard>

          <SummaryCard
            title="Total Rooms"
            subtitle={weatherData ? `${weatherData.temp}°C Dagupan Weather${timeOfDayOverride !== 'auto' ? ` (${timeOfDayOverride.toUpperCase()})` : ''}` : "All Managed Spaces"}
            icon={
              <button
                onClick={() => {
                  setShowTestButtons(prev => !prev);
                  setShowFactoryControls(false);
                }}
                className="hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-sm p-0.5 -m-0.5"
                title="Toggle Easter Eggs"
              >
                <DoorIcon className="h-4 w-4 text-emerald-600" />
              </button>
            }
            gradientClasses="from-emerald-200 to-emerald-100"
            outlineClasses="bg-emerald-500"
            blobClasses="bg-emerald-500/5"
          >

            <div className="flex-1 w-full relative aspect-[16/9] rounded-xl overflow-hidden">
              <WeatherOverlay weatherCode={weatherData?.code} timeOfDay={timeOfDayOverride} moonPhaseOverride={moonPhaseOverride} layer="back" />

              <div className="absolute top-3 left-3 z-20 bg-white/90 backdrop-blur px-2 py-1 rounded-md shadow-sm border border-slate-100 flex flex-col items-center pointer-events-none">
                <span className="text-sm font-black text-slate-800 leading-none">{rooms.length}</span>
                <span className="text-[0.5rem] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">Total</span>
              </div>
              <ResponsiveContainer width="100%" height="100%" className="relative z-10 [&_*]:outline-none [&_*]:focus:outline-none">
                <BarChart data={buildings.map(b => ({ code: b.code || b.name, rooms: b.rooms?.length || 0 }))} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <YAxis hide domain={[0, (dataMax: number) => (dataMax > 0 ? Math.ceil(dataMax * 1.35) : 5)]} />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white px-2.5 py-1.5 rounded-lg shadow-md text-xs font-bold text-slate-800 border border-slate-100 relative z-[60]">
                            {payload[0].payload.code}: {payload[0].value} Rooms
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="rooms" shape={(props: any) => <BuildingBarShape {...props} />} activeBar={false} />
                </BarChart>
              </ResponsiveContainer>

              <WeatherOverlay weatherCode={weatherData?.code} timeOfDay={timeOfDayOverride} moonPhaseOverride={moonPhaseOverride} layer="front" supermanKey={supermanKey} />
            </div>
          </SummaryCard>

          <SummaryCard
            title="Total Capacity"
            subtitle="Campus-wide Seats"
            icon={
              <button
                onClick={() => {
                  setShowFactoryControls(prev => !prev);
                  setShowTestButtons(false);
                }}
                className="hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-sm p-0.5 -m-0.5"
                title="Toggle Factory Controls"
              >
                <UsersIcon className="h-4 w-4 text-amber-600" />
              </button>
            }
            gradientClasses="from-amber-200 to-amber-100"
            outlineClasses="bg-amber-500"
            blobClasses="bg-amber-500/5"
          >
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
          </SummaryCard>
        </div>



        <BuildingBrowser
          buildings={buildings}
          buildingOptions={Array.from(new Set(buildings.map(b => b.name))).sort()}
          expandedBuildingIds={expandedBuildingIds}
          onToggleBuilding={toggleBuilding}
          onRoomClick={handleOpenRoomInfoModal}
          isLoading={isInitialLoad.current}
          actionButton={
            <div className="flex gap-2 w-full lg:w-auto">
              {showTestButtons && (
                <>
                  <IconOnlyButton
                    variant="outline"
                    onClick={() => setSupermanKey(prev => prev + 1)}
                    className="shrink-0 text-slate-500 hover:text-blue-600 border-slate-200 shadow-sm bg-white"
                    icon={<span className="text-xl leading-none">🦸‍♂️</span>}
                    label="Test Superman"
                    title="Test Superman"
                  />
                  <IconOnlyButton
                    variant="outline"
                    onClick={cycleWeather}
                    className="shrink-0 text-slate-500 hover:text-amber-500 border-slate-200 shadow-sm bg-white"
                    icon={<span className="text-xl leading-none">🌤️</span>}
                    label="Test Weather"
                    title="Test Weather"
                  />
                  <IconOnlyButton
                    variant="outline"
                    onClick={cycleTimeOfDay}
                    className="shrink-0 text-slate-500 hover:text-indigo-600 border-slate-200 shadow-sm bg-white"
                    icon={<span className="text-xl leading-none">{timeOfDayOverride === 'night' ? '🌙' : timeOfDayOverride === 'sunset' ? '🌇' : timeOfDayOverride === 'dawn' ? '🌅' : timeOfDayOverride === 'day' ? '☀️' : '🕒'}</span>}
                    label={`Time: ${timeOfDayOverride}`}
                    title={`Cycle Time of Day (Current: ${timeOfDayOverride})`}
                  />
                  <IconOnlyButton
                    variant="outline"
                    onClick={cycleMoonPhase}
                    className="shrink-0 text-slate-500 hover:text-amber-500 border-slate-200 shadow-sm bg-white"
                    icon={<span className="text-xl leading-none">{currentMoonInfo.emoji}</span>}
                    label={`Moon: ${currentMoonInfo.name}`}
                    title={`Cycle Moon Phase (Current: ${currentMoonInfo.name}${moonPhaseOverride === 'auto' ? ' [Real Date]' : ''})`}
                  />
                </>
              )}
              {showFactoryControls && (
                <>
                  <IconOnlyButton
                    variant="outline"
                    onClick={() => {
                      const currentIndex = LIQUID_OPTIONS.indexOf(selectedLiquid);
                      const nextIndex = (currentIndex + 1) % LIQUID_OPTIONS.length;
                      setSelectedLiquid(LIQUID_OPTIONS[nextIndex]);
                    }}
                    className="shrink-0 text-slate-500 hover:text-slate-700 border-slate-200 shadow-sm bg-white z-20"
                    icon={<span className="text-xl leading-none">{LIQUID_ICONS[selectedLiquid]}</span>}
                    label={`Liquid: ${selectedLiquid}`}
                    title={`Selected Liquid: ${selectedLiquid}`}
                  />
                  <IconOnlyButton
                    variant={isAutoMode ? "brand" : "outline"}
                    onClick={() => setIsAutoMode(!isAutoMode)}
                    className={`shrink-0 shadow-sm ${isAutoMode ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-white text-slate-500 hover:text-emerald-600'}`}
                    icon={<span className="text-xl leading-none">{isAutoMode ? '⏸️' : '▶️'}</span>}
                    label={isAutoMode ? 'Stop Auto' : 'Auto Fill'}
                    title={isAutoMode ? 'Stop Auto' : 'Auto Fill'}
                  />
                </>
              )}
              <Button
                variant="brand"
                icon={<PlusIcon className="h-4 w-4" />}
                onClick={() => handleOpenBuildingModal()}
                className="w-full lg:w-auto"
              >
                Add Building
              </Button>
            </div>
          }
          renderBuildingActions={(building) => (
            <div className="relative">
              <IconButton
                label="Building options"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenMenuId(openMenuId === building.id ? null : building.id)
                }}
                className="h-10 w-10 shrink-0 rounded-xl border border-gray-100 bg-white text-gray-400 shadow-sm hover:bg-gray-50 hover:text-gray-600 transition-all duration-300"
              >
                <DotsVerticalIcon className="h-6 w-6" />
              </IconButton>

              {openMenuId === building.id && (
                <div
                  className="absolute right-0 top-full z-10 mt-2 w-48 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                    onClick={() => {
                      handleOpenRoomModal(building.id)
                      setOpenMenuId(null)
                    }}
                  >
                    <PlusIcon className="h-4 w-4 text-gray-400" />
                    Add Room
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 border-t border-gray-50 px-4 py-3 text-left text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                    onClick={() => {
                      handleOpenBuildingModal(building)
                      setOpenMenuId(null)
                    }}
                  >
                    <EditIcon className="h-4 w-4 text-gray-400" />
                    Edit Building
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 border-t border-gray-50 px-4 py-3 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50"
                    onClick={() => {
                      handleOpenDeleteBuilding(building)
                      setOpenMenuId(null)
                    }}
                  >
                    <TrashIcon className="h-4 w-4 text-red-400" />
                    Delete Building
                  </button>
                </div>
              )}
            </div>
          )}
          renderRoomActions={(room, buildingId) => (
            <div className="relative">
              <IconButton
                label="Room options"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenMenuId(openMenuId === room.id ? null : room.id)
                }}
                className="h-8 w-8 shrink-0 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all duration-200"
              >
                <DotsVerticalIcon className="h-5 w-5" />
              </IconButton>

              {openMenuId === room.id && (
                <div
                  className="absolute right-0 top-full z-10 mt-2 w-48 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                    onClick={() => {
                      handleOpenRoomModal(buildingId, room)
                      setOpenMenuId(null)
                    }}
                  >
                    <EditIcon className="h-4 w-4 text-gray-400" />
                    Edit Room
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 border-t border-gray-50 px-4 py-3 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50"
                    onClick={() => {
                      handleOpenDeleteRoom(room)
                      setOpenMenuId(null)
                    }}
                  >
                    <TrashIcon className="h-4 w-4 text-red-400" />
                    Delete Room
                  </button>
                </div>
              )}
            </div>
          )}
        />    </div>
      {/* Crop Modal */}
      {cropModalData.isOpen && (
        <CropModal
          imageSrc={cropModalData.imageSrc}
          onCropComplete={handleCropComplete}
          onClose={() => setCropModalData({ isOpen: false, imageSrc: '' })}
          isUploading={false}
          title="Adjust Room Image"
          hideOverlay={true}
          cropShape="rect"
        />
      )}

      <Snackbar
        isOpen={snackbar.isOpen}
        onClose={() => setSnackbar(prev => ({ ...prev, isOpen: false }))}
        title={snackbar.title}
        message={snackbar.message}
        type={snackbar.type}
        position="top-center"
      />
    </section>
  )
}

export default BuildingsRoomsPage