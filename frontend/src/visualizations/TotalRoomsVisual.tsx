import { BarChart, Bar, Tooltip, ResponsiveContainer, YAxis } from 'recharts'
import { WeatherOverlay, type TimeOfDay, type MoonPhaseKey } from './WeatherOverlay'

interface TotalRoomsVisualProps {
  buildings: Array<{ code: string; name: string; rooms: unknown[] }>
  rooms: unknown[]
  weatherData: { temp: number; code: number } | null
  timeOfDayOverride: TimeOfDay
  moonPhaseOverride: MoonPhaseKey
  supermanKey: number
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

export function TotalRoomsVisual({
  buildings,
  rooms,
  weatherData,
  timeOfDayOverride,
  moonPhaseOverride,
  supermanKey,
}: TotalRoomsVisualProps) {
  return (
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
  )
}

