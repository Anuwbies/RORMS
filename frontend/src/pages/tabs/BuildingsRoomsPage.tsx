import { useState, useRef, useEffect, useCallback } from 'react'
import { SectionHeader } from '../../components/SectionHeader'
import { SummaryCard } from '../../components/SummaryCard'
import { WeatherOverlay } from '../../components/WeatherOverlay'
import { BarChart, Bar, PieChart, Pie, AreaChart, Area, Tooltip, ResponsiveContainer, Cell, YAxis } from 'recharts'
import { BuildingBrowser } from '../../components/BuildingBrowser'
export interface MapBuilding {
  id: string;
  buildingId: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}
export interface MapData {
  type: 'freeform';
  buildings: MapBuilding[];
}
import { RoomInfoModal } from '../../components/RoomInfoModal'
import { Button } from '../../components/Button'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'
import { NumberInput } from '../../components/NumberInput'
import { TextInput } from '../../components/TextInput'
import { TextAreaInput } from '../../components/TextAreaInput'
import { RoomAmenities } from '../../components/RoomAmenities'
import { DoorIcon, DotsVerticalIcon, EditIcon, TrashIcon, UserIcon, SearchIcon, BuildingIcon, LayersIcon, UsersIcon, ChevronDownIcon, PlusIcon, CameraIcon, UploadIcon, CheckIcon, ClockIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { TimePicker } from '../../components/TimePicker'

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

type RoomStatus = 'Available' | 'Occupied' | 'Reserved' | 'Maintenance'

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
  Reserved: 'bg-sky-100 text-sky-700',
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
  const { fill, x, y, width, height: originalHeight } = props;
  
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
      <path d={`M${x+width*0.2},${actualY} L${x+width*0.2},${actualY-4} L${x+width*0.8},${actualY-4} L${x+width*0.8},${actualY} Z`} fill={fill} opacity={0.9} />
      {/* Body */}
      <rect x={x} y={actualY} width={width} height={height} fill={fill} rx={2} />
      {/* Windows */}
      {windows}
    </g>
  );
};

const BUILDING_COLORS = [
  { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-700', top: 'bg-blue-500/20' },
  { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-700', top: 'bg-amber-500/20' },
  { bg: 'bg-rose-100', border: 'border-rose-400', text: 'text-rose-700', top: 'bg-rose-500/20' },
  { bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-700', top: 'bg-purple-500/20' },
  { bg: 'bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-700', top: 'bg-emerald-500/20' },
  { bg: 'bg-cyan-100', border: 'border-cyan-400', text: 'text-cyan-700', top: 'bg-cyan-500/20' },
  { bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-700', top: 'bg-orange-500/20' },
  { bg: 'bg-indigo-100', border: 'border-indigo-400', text: 'text-indigo-700', top: 'bg-indigo-500/20' },
];

const getBuildingColor = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return BUILDING_COLORS[Math.abs(hash) % BUILDING_COLORS.length];
};

const CampusMap = ({ buildings, mapData }: { buildings: Building[], mapData: MapData | null }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeAnchor, setResizeAnchor] = useState({ x: 0, y: 0 });
  
  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 });
  const [hoveredBldgId, setHoveredBldgId] = useState<string | null>(null);
  
  const [localMapBuildings, setLocalMapBuildings] = useState<MapBuilding[]>([]);
  const [travelers, setTravelers] = useState<{ id: number, startBldgId: string, endBldgId: string, duration: number, delay: number, color: string, curveX: number, curveY: number, startWanderX: number, startWanderY: number, endWanderX: number, endWanderY: number }[]>([]);

  useEffect(() => {
    if (localMapBuildings.length < 2) return;
    
    // Generate static travelers that bounce back and forth between two random buildings
    const newTravelers = Array.from({ length: Math.min(15, localMapBuildings.length * 3) }).map((_, i) => {
      const b1 = localMapBuildings[Math.floor(Math.random() * localMapBuildings.length)];
      let b2 = localMapBuildings[Math.floor(Math.random() * localMapBuildings.length)];
      while (b2 === b1) b2 = localMapBuildings[Math.floor(Math.random() * localMapBuildings.length)];
      
      const curveX = (Math.random() - 0.5) * 60;
      const curveY = (Math.random() - 0.5) * 60;
      
      const startWanderX = (Math.random() - 0.5) * 12; // wander up to 6% away from start
      const startWanderY = (Math.random() - 0.5) * 12;
      const endWanderX = (Math.random() - 0.5) * 12; // wander up to 6% away from end
      const endWanderY = (Math.random() - 0.5) * 12;
      
      const midX = (b1.x + b2.x) / 2 + curveX;
      const midY = (b1.y + b2.y) / 2 + curveY;
      
      const dist1 = Math.sqrt(Math.pow(midX - b1.x, 2) + Math.pow(midY - b1.y, 2));
      const dist2 = Math.sqrt(Math.pow(b2.x - midX, 2) + Math.pow(b2.y - midY, 2));
      const totalDist = dist1 + dist2;
      
      return {
        id: i,
        startBldgId: b1.buildingId,
        endBldgId: b2.buildingId,
        duration: Math.max(5, totalDist / 5), // Constant speed based on distance (min 5s to allow for wandering time)
        delay: Math.random() * -15, // negative delay so they start at random points in their journey
        color: ['bg-amber-400', 'bg-emerald-400', 'bg-blue-400', 'bg-rose-400', 'bg-purple-400'][Math.floor(Math.random() * 5)],
        curveX,
        curveY,
        startWanderX,
        startWanderY,
        endWanderX,
        endWanderY
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
      className="relative w-full aspect-[16/9] bg-[#f3f7ee] rounded-xl mt-2 border border-emerald-200 shadow-inner select-none touch-none @container"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <style>{`
        @keyframes campusTravel {
          0% { left: var(--start-x); top: var(--start-y); opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
          15% { left: var(--start-w-x); top: var(--start-w-y); opacity: 1; transform: translate(-50%, -50%) scale(1); }
          50% { left: var(--mid-x); top: var(--mid-y); }
          85% { left: var(--end-w-x); top: var(--end-w-y); opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { left: var(--end-x); top: var(--end-y); opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
        }
      `}</style>
      <div className="absolute inset-0 overflow-hidden rounded-xl">
      
      {/* Travelers (Data Packets / People) */}
      {(!draggingId && !resizingId) && (
        <div className="absolute inset-0 pointer-events-none">
          {travelers.map(t => {
            const startBldg = localMapBuildings.find(b => b.buildingId === t.startBldgId);
            const endBldg = localMapBuildings.find(b => b.buildingId === t.endBldgId);
            if (!startBldg || !endBldg) return null;
            
            // Calculate a dynamic detour midpoint so they avoid going in a straight line
            const midX = (startBldg.x + endBldg.x) / 2 + t.curveX;
            const midY = (startBldg.y + endBldg.y) / 2 + t.curveY;
            
            return (
              <div 
                key={t.id}
                className={`absolute w-1.5 h-1.5 rounded-full ${t.color} z-0 shadow-sm pointer-events-none`}
                style={{
                  '--start-x': `${startBldg.x}%`,
                  '--start-y': `${startBldg.y}%`,
                  '--start-w-x': `${Math.max(2, Math.min(98, startBldg.x + t.startWanderX))}%`,
                  '--start-w-y': `${Math.max(2, Math.min(98, startBldg.y + t.startWanderY))}%`,
                  '--mid-x': `${Math.max(2, Math.min(98, midX))}%`,
                  '--mid-y': `${Math.max(2, Math.min(98, midY))}%`,
                  '--end-w-x': `${Math.max(2, Math.min(98, endBldg.x + t.endWanderX))}%`,
                  '--end-w-y': `${Math.max(2, Math.min(98, endBldg.y + t.endWanderY))}%`,
                  '--end-x': `${endBldg.x}%`,
                  '--end-y': `${endBldg.y}%`,
                  animation: `campusTravel ${t.duration}s ease-in-out infinite alternate`,
                  animationDelay: `${t.delay}s`
                } as React.CSSProperties}
              />
            );
          })}
        </div>
      )}

      {/* Buildings */}
      {localMapBuildings.map(mb => {
        const b = buildings.find(x => x.id === mb.buildingId);
        if (!b) return null;
        
        const w = mb.w || 12;
        const h = mb.h || 15;
        const isDragging = draggingId === mb.buildingId;
        const isResizing = resizingId === mb.buildingId;
        const color = getBuildingColor(b.id);
        
        return (
          <div
            key={mb.buildingId}
            onPointerDown={(e) => handlePointerDown(e, mb.buildingId, false)}
            onPointerEnter={() => setHoveredBldgId(mb.buildingId)}
            onPointerLeave={() => setHoveredBldgId(null)}
            className={`absolute z-10 flex flex-col items-center justify-center ${color.bg} border-2 ${color.border} rounded-lg shadow-sm group/bldg pointer-events-auto transition-all ${isDragging || isResizing ? 'shadow-lg z-50 cursor-grabbing' : 'hover:shadow-md hover:z-50 cursor-grab'}`}
            style={{ 
              top: `${mb.y}%`, 
              left: `${mb.x}%`,
              width: `${w}%`,
              height: `${h}%`,
              transform: 'translate(-50%, -50%)'
            }}
          >
            <div className={`absolute top-0 left-0 w-full h-1/2 ${color.top} rounded-t-sm border-b border-black/5 pointer-events-none`}></div>
            <span 
              className={`relative z-10 font-black ${color.text} uppercase line-clamp-1 break-all px-0.5 text-center pointer-events-none`}
              style={{ fontSize: `max(0.45rem, ${Math.min(w, h * 1.77) * 0.2}cqw)` }}
            >
              {b.code || b.name.substring(0,3)}
            </span>

            {/* Resize Handle */}
            <div 
              className="absolute bottom-0 right-0 w-4 h-4 bg-white/70 cursor-se-resize rounded-tl-md rounded-br-sm border-t border-l border-white opacity-0 group-hover/bldg:opacity-100 z-50 flex items-center justify-center transition-opacity"
              onPointerDown={(e) => handlePointerDown(e, mb.buildingId, true)}
            >
               <svg className="w-2 h-2 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
               </svg>
            </div>
          </div>
        )
      })}
      </div>
      
      {/* Total Badge */}
      <div className="absolute top-3 left-3 z-20 bg-white/90 backdrop-blur px-2 py-1 rounded-md shadow-sm border border-slate-100 flex flex-col items-center pointer-events-none">
        <span className="text-sm font-black text-slate-800 leading-none">{buildings.length}</span>
        <span className="text-[0.5rem] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">Total</span>
      </div>
      {/* Global Cursor-tracking Tooltip */}
      {hoveredBldgId && !draggingId && !resizingId && (
        <div 
           className="absolute z-[60] bg-slate-800 text-white text-xs sm:text-sm font-bold px-3 py-1.5 rounded-md pointer-events-none whitespace-nowrap shadow-lg transition-transform duration-75 ease-out"
           style={{
             left: `${pointerPos.x}%`,
             top: `${pointerPos.y}%`,
             transform: `translate(
               -50%, 
               ${pointerPos.y < 30 ? '15px' : pointerPos.y > 70 ? 'calc(-100% - 15px)' : '-150%'}
             )`
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
  const [jars, setJars] = useState<Array<{id: number, position: number, fillStatus: 'empty'|'filling'|'full'|'labeled', buildingIndex: number}>>(
    Array.from({ length: 20 }).map((_, i) => ({
      id: i + 1,
      position: i,
      fillStatus: 'empty',
      buildingIndex: i + 20
    }))
  )
  const [nextBuildingIndex, setNextBuildingIndex] = useState(40);
  const [isJarsMoving, setIsJarsMoving] = useState(false);
  const [hoveredJarId, setHoveredJarId] = useState<number | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [weatherData, setWeatherData] = useState<{ temp: number; code: number } | null>(null)
  const [supermanKey, setSupermanKey] = useState<number>(0)
  const [showTestButtons, setShowTestButtons] = useState(false)
  const [isAutoMode, setIsAutoMode] = useState(false)

  // Auto Mode Logic
  useEffect(() => {
    if (!isAutoMode || isJarsMoving) return;

    const centerJar = jars.find(j => j.position === 0);
    if (!centerJar) return;

    if (centerJar.fillStatus === 'empty') {
      setJars(prev => prev.map(j => j.id === centerJar.id ? { ...j, fillStatus: 'filling' } : j));
      setWaterKey(prev => prev + 1);
      
      setTimeout(() => {
        setJars(prev => prev.map(j => j.id === centerJar.id ? { ...j, fillStatus: 'full' } : j));
      }, 13500);
    } 
    else if (centerJar.fillStatus === 'full') {
      setJars(prev => prev.map(j => j.id === centerJar.id ? { ...j, fillStatus: 'labeled' } : j));
      
      setTimeout(() => {
        setIsJarsMoving(true);
        setTimeout(() => setIsJarsMoving(false), 2667);
        
        const newId = Date.now();
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
  }, [isAutoMode, jars, isJarsMoving, nextBuildingIndex]);
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
  const [selectedRoomInfo, setSelectedRoomInfo] = useState<Room | null>(null)
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
  const [newRoomType, setNewRoomType] = useState('Lecture Room')
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
      setNewRoomMinBookingMins(String(room.minBookingMins || '30'))
      setNewRoomMaxBookingMins(String(room.maxBookingMins || '90'))
    } else {
      setEditingRoom(null)
      setIsMultipleRooms(false)
      setNewRoomName('')
      setNewRoomCode('')
      setRoomNamePrefix('')
      setRoomCodePrefix('')
      setRoomStartNumber('')
      setRoomEndNumber('')
      setNewRoomType('Lecture Room')
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
    setEditingBuilding(null)
    setEditingRoom(null)
    setSelectedRoomInfo(null)
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
      // Delete image from storage first
      await deleteImageFromStorage(roomToDelete.image)
      
      await deleteDoc(doc(db, 'rooms', roomToDelete.id))
      handleCloseDeleteRoomModal()
    } catch (error) {
      console.error('Error deleting room:', error)
      alert('Failed to delete room. Please try again.')
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
    } catch (error) {
      console.error('Error deleting building:', error)
      alert('Failed to delete building. Please try again.')
    } finally {
      setIsDeletingBuilding(false)
    }
  }

  const handleBuildingSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBuildingName.trim() || !newBuildingCode.trim()) {
      setErrors({ name: !newBuildingName.trim(), code: !newBuildingCode.trim(), start: false, end: false })
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
      } else {
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
      }
    } catch (error) {
      console.error("Error saving building: ", error)
      alert("Error saving building. Please try again.")
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
            return
          }
        }
      } else {
        if (!newRoomName.trim() || !newRoomCode.trim()) {
          setErrors({ name: !newRoomName.trim(), code: !newRoomCode.trim(), start: false, end: false })
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
      alert('Maximum booking minutes must be greater than minimum booking minutes.')
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
      } else {
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
      }
      handleCloseModals()
    } catch (error) {
      console.error("Error saving room: ", error)
      alert("Error saving room. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }



  return (
    <section 
      className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8"
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
                  ) }

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
                        options={['Lecture Room', 'Laboratory', 'Office', 'Meeting Room', 'Studio', 'Administrative']}
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
                        options={['Available', 'Occupied', 'Reserved', 'Maintenance']}
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
                        className={`w-full aspect-square rounded-md border-2 border-dashed flex items-center justify-center overflow-hidden transition-all group relative shadow-sm ${
                          isDraggingRoomImage 
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
                          className={`flex-1 flex flex-col items-center justify-center rounded-xl border py-2 text-[0.625rem] font-bold uppercase transition cursor-pointer ${
                            newRoomAvailableDays.includes(day)
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
                        onChange={setNewRoomStartTime}
                        onToggle={handleDropdownToggle}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        End Time
                      </label>
                      <TimePicker
                        value={newRoomEndTime}
                        onChange={setNewRoomEndTime}
                        onToggle={handleDropdownToggle}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="room-min-mins" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Min Booking (Mins)
                      </label>
                      <NumberInput
                        id="room-min-mins"
                        min="0"
                        step="15"
                        value={newRoomMinBookingMins}
                        onChange={setNewRoomMinBookingMins}
                      />
                    </div>
                    <div>
                      <label htmlFor="room-max-mins" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Max Booking (Mins)
                      </label>
                      <NumberInput
                        id="room-max-mins"
                        min="0"
                        step="15"
                        value={newRoomMaxBookingMins}
                        onChange={setNewRoomMaxBookingMins}
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
            icon={<EditIcon className="h-4 w-4" />}
            className="flex-1"
            onClick={() => {
              if (!selectedRoomInfo) return
              const buildingId = buildings.find(b => b.rooms.some(r => r.id === selectedRoomInfo.id))?.id
              if (buildingId) {
                handleOpenRoomModal(buildingId, selectedRoomInfo)
                setIsRoomInfoModalOpen(false)
              }
            }}
          >
            Edit Details
          </Button>
        }
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
            blobClasses="bg-[var(--brand-color)]/5"
          >
            <CampusMap buildings={buildings} mapData={mapData} />
          </SummaryCard>
          
          <SummaryCard
            title="Total Rooms"
            subtitle={weatherData ? `${weatherData.temp}°C Manila Weather` : "All Managed Spaces"}
            icon={
              <button 
                onClick={() => setShowTestButtons(prev => !prev)} 
                className="hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-sm p-0.5 -m-0.5"
                title="Toggle Easter Eggs"
              >
                <DoorIcon className="h-4 w-4 text-emerald-600" />
              </button>
            }
            gradientClasses="from-emerald-200 to-emerald-100"
            blobClasses="bg-emerald-500/5"
          >

            {rooms.length > 0 && (
              <div className="flex-1 w-full mt-2 relative aspect-[16/9] rounded-md overflow-hidden">
                <WeatherOverlay weatherCode={weatherData?.code} layer="back" />
                
                <div className="absolute top-3 left-3 z-20 bg-white/90 backdrop-blur px-2 py-1 rounded-md shadow-sm border border-slate-100 flex flex-col items-center pointer-events-none">
                   <span className="text-sm font-black text-slate-800 leading-none">{rooms.length}</span>
                   <span className="text-[0.5rem] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">Total</span>
                </div>
                <ResponsiveContainer width="100%" height="100%" className="relative z-10 [&_*]:outline-none [&_*]:focus:outline-none">
                  <BarChart data={buildings.map(b => ({ code: b.code || b.name, rooms: b.rooms?.length || 0 }))} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <YAxis hide domain={[0, 'dataMax']} />
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
                    <Bar dataKey="rooms" shape={<BuildingBarShape />} activeBar={false}>
                      {buildings.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#10b981' : '#34d399'} style={{ outline: 'none' }} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                <WeatherOverlay weatherCode={weatherData?.code} layer="front" supermanKey={supermanKey} />
              </div>
            )}
          </SummaryCard>
          
          <SummaryCard
            title="Total Capacity"
            subtitle="Campus-wide Seats"
            icon={<UsersIcon className="h-4 w-4 text-amber-600" />}
            gradientClasses="from-amber-200 to-amber-100"
            blobClasses="bg-amber-500/5"
          >
            {buildings.length > 0 && (
              <div className="flex-1 w-full mt-2 relative aspect-[16/9] rounded-xl overflow-hidden bg-emerald-500/20">
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
                <div className="absolute bottom-19.5 -left-4 -right-4 h-2 border-b-2 border-slate-700/50 shadow-inner overflow-hidden bg-slate-700/80 flex z-0 opacity-70">
                  <div 
                    className="w-full h-full opacity-60"
                    style={{
                      background: 'repeating-linear-gradient(90deg, #64748b 0rem, #64748b 0.6rem, #334155 0.6rem, #334155 2rem)',
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
                      }}
                      onMouseLeave={() => {
                        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                        hoverTimeoutRef.current = setTimeout(() => {
                          setHoveredJarId(null);
                        }, 1000);
                      }}
                    >
                      <div className="relative w-full h-full">
                        {/* Distant Tooltip */}
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 transition-all duration-300 z-20 whitespace-nowrap bg-slate-700/80 text-white/90 text-[0.55rem] font-medium px-1.5 py-0.5 rounded shadow-sm invisible opacity-0 group-hover/bgjar:visible group-hover/bgjar:opacity-100 backdrop-blur-sm pointer-events-none">
                          {displayCode}: {displayCap}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-[3px] border-transparent border-t-slate-700/80"></div>
                        </div>

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
                <div className="absolute bottom-6 -left-2 -right-2 h-3 border-b-2 border-slate-900 shadow-xl overflow-hidden bg-slate-800 flex">
                  <div 
                    className="w-full h-full"
                    style={{
                      background: 'repeating-linear-gradient(90deg, #94a3b8 0rem, #94a3b8 1rem, #334155 1rem, #334155 3rem)',
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
                    className={`absolute top-0 left-1 right-1 h-10 bg-slate-400 border-x-2 border-b-2 border-slate-600 rounded-b-sm bg-gradient-to-r from-slate-400 via-slate-300 to-slate-500 shadow-md z-10 pointer-events-auto transition-transform origin-top ${
                      jars.some(j => j.position === 0 && j.fillStatus === 'empty') && !isJarsMoving
                        ? 'cursor-pointer hover:scale-110 active:scale-95' 
                        : ''
                    }`}
                    onClick={() => {
                      if (isJarsMoving) return;
                      const centerJar = jars.find(j => j.position === 0);
                      if (!centerJar || centerJar.fillStatus !== 'empty') return;

                      setJars(prev => prev.map(j => j.id === centerJar.id ? { ...j, fillStatus: 'filling' } : j));
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
                    className={`absolute top-8 bottom-0 left-3 right-3 bg-blue-400 blur-[0.5px] z-0 ${waterKey === 0 ? 'hidden' : ''}`}
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
                      className={`group/jar absolute bottom-9 w-16 h-20 z-10 ${
                        (isCenter && isFull) ? 'cursor-pointer transition-transform hover:scale-105 active:scale-95' : ''
                      }`}
                      style={{
                        left: leftVal,
                        transition: 'left 2.667s linear',
                      }}
                      onMouseEnter={() => {
                        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                        setHoveredJarId(jar.id);
                      }}
                      onMouseLeave={() => {
                        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                        hoverTimeoutRef.current = setTimeout(() => {
                          setHoveredJarId(null);
                        }, 1000);
                      }}
                      onClick={() => {
                        if (isCenter && isFull && !isJarsMoving) {
                          setJars(prev => prev.map(j => j.id === jar.id ? { ...j, fillStatus: 'labeled' } : j));
                          
                          setTimeout(() => {
                            setIsJarsMoving(true);
                            setTimeout(() => setIsJarsMoving(false), 2667);
                            
                            const newId = Date.now();
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
                        {/* Custom Tooltip */}
                        <div className={`absolute -top-10 left-1/2 -translate-x-1/2 transition-all duration-200 pointer-events-none z-20 whitespace-nowrap bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded shadow-lg ${
                          hoveredJarId !== null && hoveredJarId !== jar.id ? 'invisible opacity-0' :
                          (isWaitingForAction ? 'visible opacity-100' : 'invisible opacity-0 group-hover/jar:visible group-hover/jar:opacity-100')
                        }`}>
                          {displayCode}: {displayCap} Capacity
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-slate-800"></div>
                        </div>

                        {/* Jar Lid/Rim */}
                        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-10 h-2 bg-white/60 border border-white/80 rounded-t-sm z-10" />
                        {/* Jar Neck */}
                        <div className="absolute top-3.5 left-1/2 -translate-x-1/2 w-8 h-1.5 bg-white/50 border-l border-r border-white/70 z-10" />
                        {/* Jar Body */}
                        <div className="absolute top-[14px] inset-x-0 bottom-0 bg-white/10 border-2 border-white/70 rounded-b-xl rounded-t-lg overflow-hidden shadow-[inset_0_0_16px_rgba(255,255,255,0.9)] backdrop-blur-[1px]">
                          {/* Liquid Fill */}
                          <div 
                            className="absolute bottom-0 left-0 right-0 bg-blue-400"
                            style={{ 
                              animation: jar.fillStatus === 'filling' ? 'jarFill 15s linear forwards' : 'none',
                              height: (jar.fillStatus === 'full' || jar.fillStatus === 'labeled') ? '90%' : (jar.fillStatus === 'empty' ? '0%' : undefined)
                            }}
                          >
                            <div className="absolute top-0 left-0 right-0 h-1 bg-blue-300"></div>
                          </div>
                          
                          {/* Bottle Label */}
                          {jar.fillStatus === 'labeled' && (
                            <div 
                              className="absolute top-[45%] inset-x-0 -translate-y-1/2 h-7 bg-white/95 border-y border-emerald-400/50 shadow-[0_0_8px_rgba(16,185,129,0.2)] flex items-center justify-center overflow-hidden transition-all duration-300 z-10"
                              style={{ animation: 'labelWipe 1s ease-out forwards' }}
                            >
                              <span className="text-xs font-bold text-slate-800 tracking-tighter truncate w-full text-center px-0.5">
                                {displayCode}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
            )}
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
                  <Button
                    variant="outline"
                    onClick={() => setSupermanKey(prev => prev + 1)}
                    className="w-full lg:w-auto text-slate-500 hover:text-blue-600 border-slate-200 shadow-sm bg-white"
                  >
                    🦸‍♂️ Test Superman
                  </Button>
                  <Button
                    variant="outline"
                    onClick={cycleWeather}
                    className="w-full lg:w-auto text-slate-500 hover:text-amber-500 border-slate-200 shadow-sm bg-white"
                  >
                    🌤️ Test Weather
                  </Button>
                </>
              )}
              <Button
                variant={isAutoMode ? "brand" : "outline"}
                onClick={() => setIsAutoMode(!isAutoMode)}
                className={`w-full lg:w-auto shadow-sm ${isAutoMode ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-white text-slate-500 hover:text-emerald-600'}`}
              >
                {isAutoMode ? '⏸️ Stop Auto' : '▶️ Auto Fill'}
              </Button>
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
                  className="absolute right-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-md border border-gray-100 bg-white shadow-2xl"
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
                className="h-8 w-8 shrink-0 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <DotsVerticalIcon className="h-5 w-5" />
              </IconButton>

              {openMenuId === room.id && (
                <div
                  className="absolute right-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-md border border-gray-100 bg-white shadow-2xl"
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

    </section>
  )
}

export default BuildingsRoomsPage