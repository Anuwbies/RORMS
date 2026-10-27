import { useState, useMemo } from 'react'
import { SearchInput } from './SearchInput'
import { FilterDropdown } from './FilterDropdown'

import { IconButton } from './IconButton'
import {

  ChevronDownIcon,
  LayersIcon,
  DoorIcon,
  UsersIcon,
  UserIcon,
  SpinnerIcon
} from './Icons'
import type { Building, Facility, Room, RoomStatus } from '../types/room'
import { roomStatusClasses, DEFAULT_ROOM_IMAGE } from '../types/room'

interface BuildingBrowserProps {
  buildings: Building[];
  buildingOptions: string[];
  expandedBuildingIds: string[];
  onToggleBuilding: (id: string) => void;
  onRoomClick: (room: Room) => void;
  actionButton?: React.ReactNode;
  renderBuildingActions?: (building: Building) => React.ReactNode;
  renderBuildingScheduleUsage?: (building: Building) => React.ReactNode;
  renderRoomActions?: (room: Room, buildingId: string) => React.ReactNode;
  renderRoomScheduleUsage?: (room: Room) => React.ReactNode;
  isLoading?: boolean;
  unreadCommentRoomIds?: ReadonlySet<string>;
}

export function BuildingBrowser({
  buildings,
  buildingOptions,
  expandedBuildingIds,
  onToggleBuilding,
  onRoomClick,
  actionButton,
  renderBuildingActions,
  renderBuildingScheduleUsage,
  renderRoomActions,
  renderRoomScheduleUsage,
  isLoading,
  unreadCommentRoomIds
}: BuildingBrowserProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<RoomStatus[]>([])
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([])
  const [selectedBuildings, setSelectedBuildings] = useState<string[]>([])

  const filteredBuildings = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    
    return buildings
      .map((building) => {
        // 1. Filter by building selection
        if (selectedBuildings.length > 0 && !selectedBuildings.includes(building.code)) {
          return null
        }

        // 2. Apply room filters before matching the search term.
        const matchingRooms = building.rooms.filter(room =>
          (selectedStatuses.length === 0 || selectedStatuses.includes(room.status))
          && (selectedRoomTypes.length === 0 || selectedRoomTypes.includes(room.type))
        )
        const matchingFacilities = (building.facilities ?? []).filter(facility =>
          (selectedStatuses.length === 0 || selectedStatuses.includes(facility.status))
          && (selectedRoomTypes.length === 0 || selectedRoomTypes.includes(facility.type))
        )

        // 3. If no search term, return building with filtered rooms
        if (!normalizedSearch) {
          return {
            ...building,
            rooms: matchingRooms,
            facilities: matchingFacilities,
          }
        }

        // 4. Check if building itself matches search
        const buildingMatchesSearch = [
          building.name,
          building.code,
          String(building.floor),
          String(building.rooms.length),
          String(building.facilities?.length ?? 0),
          String(building.capacity),
        ].some((value) => value.toLowerCase().includes(normalizedSearch))

        if (buildingMatchesSearch) {
          return {
            ...building,
            rooms: matchingRooms,
            facilities: matchingFacilities,
          }
        }

        // 5. If building doesn't match, check rooms for search match (within filtered rooms)
        const fullyMatchingRooms = matchingRooms.filter((room) =>
          [
            room.name,
            room.code,
            room.type,
            String(room.capacity),
            room.status,
          ].some((value) => value.toLowerCase().includes(normalizedSearch)),
        )
        const fullyMatchingFacilities = matchingFacilities.filter(facility =>
          [facility.name, facility.code, facility.type, String(facility.capacity), facility.status]
            .some(value => value.toLowerCase().includes(normalizedSearch)),
        )

        if (fullyMatchingRooms.length === 0 && fullyMatchingFacilities.length === 0) {
          return null
        }

        return {
          ...building,
          rooms: fullyMatchingRooms,
          facilities: fullyMatchingFacilities,
        }
      })
      .filter((building): building is NonNullable<typeof building> => building !== null)
  }, [buildings, searchTerm, selectedStatuses, selectedRoomTypes, selectedBuildings])

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-visible flex flex-col w-full animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
      <div className="flex flex-col lg:flex-row items-center justify-between gap-4 w-full relative z-20 p-4 bg-white rounded-t-2xl border-b border-gray-200">
        <div className="flex items-center gap-3 w-full flex-1 flex-col lg:flex-row">
          <div className="relative w-full lg:max-w-xl">
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search by building, room, facility, status, capacity..."
              className="w-full"
            />
          </div>
          <div className="shrink-0 w-full sm:w-auto">
            <FilterDropdown
              label="Filters"
              groups={[
                {
                  id: 'building',
                  title: 'Building',
                  options: buildingOptions,
                  selectedValues: selectedBuildings,
                  onChange: setSelectedBuildings
                },
                {
                  id: 'status',
                  title: 'Status',
                  options: ['Available', 'Unavailable', 'Maintenance'],
                  selectedValues: selectedStatuses,
                  onChange: (newSelected) => setSelectedStatuses(newSelected as RoomStatus[])
                },
                {
                  id: 'roomType',
                  title: 'Type',
                  options: [...new Set(buildings.flatMap(building => [...building.rooms, ...(building.facilities ?? [])].map(space => space.type)))].sort(),
                  selectedValues: selectedRoomTypes,
                  onChange: setSelectedRoomTypes
                }
              ]}
              onClearAll={() => {
                setSelectedBuildings([])
                setSelectedStatuses([])
                setSelectedRoomTypes([])
              }}
              buttonClassName="w-full sm:w-auto"
            />
          </div>
        </div>
        <div className="shrink-0 w-full lg:w-auto">
          {actionButton}
        </div>
      </div>

      <div className="flex flex-col">
        {isLoading ? (
          <div className="p-16 text-center bg-gray-50/50 rounded-b-2xl flex flex-col items-center justify-center gap-3">
            <SpinnerIcon className="h-8 w-8 text-[var(--brand-color)]" />
            <p className="text-base font-bold text-gray-700">Loading data...</p>
            <p className="text-xs text-gray-400">Please wait while information is retrieved.</p>
          </div>
        ) : filteredBuildings.length === 0 ? (
          <div className="p-16 text-center bg-gray-50/50 rounded-b-2xl">
            <p className="text-lg font-semibold text-[var(--brand-color)]">
              No matching buildings, rooms, or facilities
            </p>
            <p className="mt-3 text-sm leading-7 text-gray-500">
              Try a different building or space name, code, status, or capacity.
            </p>
          </div>
        ) : (
          filteredBuildings.map((building, index) => {
            const roomsByFloor = building.rooms.reduce((acc, room) => {
              if (!acc[room.floor]) {
                acc[room.floor] = []
              }
              acc[room.floor].push(room)
              return acc
            }, {} as Record<number, Room[]>)
            const facilitiesByFloor = (building.facilities ?? []).reduce((acc, facility) => {
              if (!acc[facility.floor]) acc[facility.floor] = []
              acc[facility.floor].push(facility)
              return acc
            }, {} as Record<number, Facility[]>)

            const sortedFloors = [...new Set([...Object.keys(roomsByFloor), ...Object.keys(facilitiesByFloor)])]
              .map(Number)
              .sort((a, b) => a - b)

            const isExpanded = expandedBuildingIds.includes(building.id)

            return (
              <article
                key={building.id}
                className={`p-6 sm:p-8 transition-colors ${
                  index !== filteredBuildings.length - 1 ? 'border-b-4 border-[#c6dbb6]' : ''
                } bg-white hover:bg-gray-50/50`}
              >
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                    <div className="max-w-3xl">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-2xl font-bold tracking-tight text-gray-900">
                          {building.name}
                        </h3>
                        <span className="inline-flex h-6 items-center justify-center rounded-full bg-white border border-gray-200 px-3 text-[0.625rem] font-bold uppercase tracking-widest text-gray-600 shadow-sm leading-none">
                          {building.code}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {renderBuildingActions && renderBuildingActions(building)}
                      <IconButton
                        label={isExpanded ? 'Collapse building' : 'Expand building'}
                        onClick={() => onToggleBuilding(building.id)}
                        className="h-10 w-10 shrink-0 rounded-xl border border-gray-100 bg-white text-gray-400 shadow-sm hover:bg-gray-50 hover:text-gray-600 transition-all duration-300"
                      >
                        <ChevronDownIcon
                          className={`h-6 w-6 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </IconButton>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-2xl bg-white border border-gray-200 p-4 flex items-center gap-4 shadow-sm transition-transform hover:scale-[1.02]">
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-50 border border-amber-100 shrink-0">
                        <LayersIcon className="h-9 w-9 text-amber-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 truncate" title="Floor">
                          Floor
                        </p>
                        <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">
                          {building.floor}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white border border-gray-200 p-4 flex items-center gap-4 shadow-sm transition-transform hover:scale-[1.02]">
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-100 shrink-0">
                        <DoorIcon className="h-9 w-9 text-emerald-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 truncate" title="Rooms">
                          Rooms
                        </p>
                        <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">
                          {building.rooms.length}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white border border-gray-200 p-4 flex items-center gap-4 shadow-sm transition-transform hover:scale-[1.02]">
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-rose-50 border border-rose-100 shrink-0">
                        <UsersIcon className="h-9 w-9 text-rose-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 truncate" title="Capacity">
                          Capacity
                        </p>
                        <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">
                          {building.capacity}
                        </p>
                      </div>
                    </div>
                  </div>
                  {renderBuildingScheduleUsage?.(building)}
                </div>

                <div className={`grid transition-all duration-500 ease-in-out ${isExpanded ? 'grid-rows-[1fr] mt-10 opacity-100' : 'grid-rows-[0fr] mt-0 opacity-0'}`}>
                  <div className={`${isExpanded ? 'overflow-visible' : 'overflow-hidden'} px-4 -mx-4`}>
                    <div className="space-y-12 pb-4">
                      {building.rooms.length === 0 && (building.facilities?.length ?? 0) === 0 ? (
                        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-10 text-center">
                          <DoorIcon className="mx-auto h-12 w-12 text-gray-300" />
                          <p className="mt-4 text-sm font-bold uppercase tracking-widest text-gray-400">
                            No rooms or facilities registered yet
                          </p>
                        </div>
                      ) : (
                        sortedFloors.map((floor) => (
                          <div key={floor} className="space-y-6">
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2.5">
                                <span className="h-2 w-2 rounded-full bg-gray-400" />
                                <h4 className="text-sm font-black uppercase tracking-[0.25em] text-gray-500">
                                  Floor {floor}
                                </h4>
                              </div>
                              <div className="h-1 flex-1 bg-gray-200" />
                            </div>

                            <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))]">
                              {roomsByFloor[floor]
                                ?.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                                .map((room) => (
                                <div
                                  key={room.id}
                                  onClick={() => onRoomClick(room)}
                                  className="relative flex flex-wrap rounded-2xl border border-gray-100 bg-white shadow-md transition-transform hover:scale-[1.02] hover:z-50 focus-within:z-50 cursor-pointer"
                                >
                                  <div className="relative shrink-0">
                                    <img
                                      src={room.image}
                                      alt={room.name}
                                      className="aspect-square w-28 h-28 shrink-0 object-cover grayscale-[0.2] rounded-tl-2xl sm:w-32 sm:h-32"
                                      onError={(e) => { e.currentTarget.src = DEFAULT_ROOM_IMAGE }}
                                    />
                                    {unreadCommentRoomIds?.has(room.id) && <span className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[0.625rem] font-bold text-amber-800 shadow-sm" role="status">New comments</span>}
                                  </div>

                                  <div className="flex flex-1 flex-col justify-between p-3.5 min-w-0">
                                    <div>
                                      <div className="flex items-start justify-between gap-2">
                                        <h5 className="text-base font-bold leading-tight text-gray-900 truncate mt-1">
                                          {room.name}
                                        </h5>
                                        <div className="h-8 w-8 shrink-0">
                                          {renderRoomActions && renderRoomActions(room, building.id)}
                                        </div>
                                      </div>
                                      <p className="-mt-1 text-xs font-bold uppercase tracking-wider text-gray-400">
                                        {room.type}
                                      </p>
                                    </div>

                                    <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2">
                                      <div className="flex items-center gap-2">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white border border-gray-200 shrink-0">
                                          <UserIcon className="h-4 w-4 text-gray-500" />
                                        </div>
                                        <span className="text-sm font-bold text-gray-700">
                                          {room.capacity} people
                                        </span>
                                      </div>
                                      <span
                                        className={`rounded-full px-2 py-0.5 text-[0.5625rem] font-black uppercase tracking-widest ${roomStatusClasses[room.status]}`}
                                      >
                                        {room.status}
                                      </span>
                                    </div>
                                  </div>
                                  {renderRoomScheduleUsage?.(room)}
                                </div>
                              ))}
                              {facilitiesByFloor[floor]
                                ?.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                                .map(facility => (
                                  <article key={facility.id} className="relative flex flex-wrap rounded-2xl border border-gray-100 bg-white shadow-md transition-transform hover:scale-[1.02] hover:z-50 focus-within:z-50">
                                    <div className="relative shrink-0">
                                      <img
                                        src={facility.image || DEFAULT_ROOM_IMAGE}
                                        alt={facility.name}
                                        className="aspect-square w-28 h-28 shrink-0 object-cover grayscale-[0.2] rounded-tl-2xl sm:w-32 sm:h-32"
                                        onError={event => { event.currentTarget.src = DEFAULT_ROOM_IMAGE }}
                                      />
                                    </div>
                                    <div className="flex flex-1 flex-col justify-between p-3.5 min-w-0">
                                      <div>
                                        <h5 className="text-base font-bold leading-tight text-gray-900 truncate mt-1" title={facility.name}>
                                          {facility.name}
                                        </h5>
                                        <p className="-mt-1 text-xs font-bold uppercase tracking-wider text-gray-400" title={facility.type}>
                                          {facility.type}
                                        </p>
                                      </div>
                                      <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2">
                                        <div className="flex items-center gap-2">
                                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white border border-gray-200 shrink-0">
                                            <UserIcon className="h-4 w-4 text-gray-500" />
                                          </div>
                                          <span className="text-sm font-bold text-gray-700">
                                            {facility.capacity} people
                                          </span>
                                        </div>
                                        <span className={`rounded-full px-2 py-0.5 text-[0.5625rem] font-black uppercase tracking-widest ${roomStatusClasses[facility.status]}`}>
                                          {facility.status}
                                        </span>
                                      </div>
                                    </div>
                                    <p className="w-full border-t border-gray-200 px-3.5 pb-3.5 pt-2.5 text-xs font-semibold text-gray-500">Facility code: {facility.code}</p>
                                  </article>
                                ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>
    </div>
  )
}
