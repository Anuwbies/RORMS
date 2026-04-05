import { useState } from 'react'
import { DoorIcon } from '../../components/Icons'

type RoomStatus = 'Available' | 'Occupied' | 'Reserved' | 'Maintenance'

function createRoomImage() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <rect width="640" height="360" rx="28" fill="#62853e" />
    </svg>
  `

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

interface Room {
  id: string
  image: string
  code: string
  name: string
  capacity: number
  status: RoomStatus
}

interface Building {
  id: string
  code: string
  name: string
  floor: number
  capacity: number
  rooms: Room[]
}

const buildings: Building[] = [
  {
    id: 'admin',
    code: 'ADM',
    name: 'Administration Building',
    floor: 3,
    capacity: 36,
    rooms: [
      {
        id: 'adm-101',
        image: createRoomImage(),
        code: 'ADM-101',
        name: 'Registrar Receiving',
        capacity: 12,
        status: 'Available',
      },
      {
        id: 'adm-204',
        image: createRoomImage(),
        code: 'ADM-204',
        name: 'Records Archive',
        capacity: 6,
        status: 'Occupied',
      },
      {
        id: 'adm-305',
        image: createRoomImage(),
        code: 'ADM-305',
        name: 'Curriculum Review Room',
        capacity: 18,
        status: 'Reserved',
      },
    ],
  },
  {
    id: 'science',
    code: 'SCI',
    name: 'Science and Innovation Center',
    floor: 4,
    capacity: 86,
    rooms: [
      {
        id: 'sci-110',
        image: createRoomImage(),
        code: 'SCI-110',
        name: 'Chemistry Laboratory',
        capacity: 24,
        status: 'Occupied',
      },
      {
        id: 'sci-212',
        image: createRoomImage(),
        code: 'SCI-212',
        name: 'Physics Demo Room',
        capacity: 32,
        status: 'Available',
      },
      {
        id: 'sci-318',
        image: createRoomImage(),
        code: 'SCI-318',
        name: 'Research Collaboration Hub',
        capacity: 20,
        status: 'Reserved',
      },
      {
        id: 'sci-402',
        image: createRoomImage(),
        code: 'SCI-402',
        name: 'Microscopy Suite',
        capacity: 10,
        status: 'Maintenance',
      },
    ],
  },
  {
    id: 'learning',
    code: 'LLC',
    name: 'Learning Commons',
    floor: 2,
    capacity: 82,
    rooms: [
      {
        id: 'llc-102',
        image: createRoomImage(),
        code: 'LLC-102',
        name: 'Peer Tutoring Room',
        capacity: 14,
        status: 'Available',
      },
      {
        id: 'llc-115',
        image: createRoomImage(),
        code: 'LLC-115',
        name: 'Digital Learning Lab',
        capacity: 28,
        status: 'Occupied',
      },
      {
        id: 'llc-210',
        image: createRoomImage(),
        code: 'LLC-210',
        name: 'Quiet Reading Hall',
        capacity: 40,
        status: 'Available',
      },
    ],
  },
  {
    id: 'engineering',
    code: 'ENG',
    name: 'Engineering Building',
    floor: 5,
    capacity: 80,
    rooms: [
      {
        id: 'eng-120',
        image: createRoomImage(),
        code: 'ENG-120',
        name: 'CAD Drafting Studio',
        capacity: 30,
        status: 'Reserved',
      },
      {
        id: 'eng-233',
        image: createRoomImage(),
        code: 'ENG-233',
        name: 'Materials Testing Lab',
        capacity: 16,
        status: 'Occupied',
      },
      {
        id: 'eng-341',
        image: createRoomImage(),
        code: 'ENG-341',
        name: 'Design Review Room',
        capacity: 12,
        status: 'Available',
      },
      {
        id: 'eng-502',
        image: createRoomImage(),
        code: 'ENG-502',
        name: 'Robotics Workshop',
        capacity: 22,
        status: 'Available',
      },
    ],
  },
]

const roomStatusClasses: Record<RoomStatus, string> = {
  Available: 'bg-emerald-100 text-emerald-700',
  Occupied: 'bg-amber-100 text-amber-700',
  Reserved: 'bg-sky-100 text-sky-700',
  Maintenance: 'bg-rose-100 text-rose-700',
}

function BuildingsRoomsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const allRooms = buildings.flatMap((building) => building.rooms)
  const totalCapacity = buildings.reduce((sum, building) => sum + building.capacity, 0)
  const totalFloors = buildings.reduce((sum, building) => sum + building.floor, 0)
  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredBuildings = buildings
    .map((building) => {
      if (!normalizedSearch) {
        return building
      }

      const buildingMatches = [
        building.name,
        building.code,
        String(building.floor),
        String(building.rooms.length),
        String(building.capacity),
      ].some((value) => value.toLowerCase().includes(normalizedSearch))

      if (buildingMatches) {
        return building
      }

      const matchingRooms = building.rooms.filter((room) =>
        [
          room.name,
          room.code,
          String(room.capacity),
          room.status,
        ].some((value) => value.toLowerCase().includes(normalizedSearch)),
      )

      if (matchingRooms.length === 0) {
        return null
      }

      return {
        ...building,
        rooms: matchingRooms,
      }
    })
    .filter((building): building is Building => building !== null)
  const visibleRoomCount = filteredBuildings.reduce(
    (sum, building) => sum + building.rooms.length,
    0,
  )

  return (
    <section className="min-h-screen bg-[var(--brand-surface)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="overflow-hidden rounded-[28px] border border-[color:var(--brand-color)] bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] shadow-[0_24px_60px_rgba(98,133,62,0.18)]">
          <div className="grid gap-6 p-6 sm:p-8 xl:grid-cols-[1.6fr_0.9fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-white/80">
                Buildings & Rooms
              </p>
              <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Static building directory for room inventory and space visibility
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/85 sm:text-base">
                This tab now shows static building records and their assigned
                room lists. Each building is limited to the fields you specified:
                name, code, floor, rooms, and capacity.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
                  Campus Coverage
                </p>
                <p className="mt-3 text-3xl font-semibold text-white">
                  {buildings.length} buildings
                </p>
                <p className="mt-2 text-sm leading-6 text-white/80">
                  Centralized view of academic, office, laboratory, and study spaces.
                </p>
              </div>

              <div className="rounded-2xl border border-white/20 bg-[rgba(59,79,36,0.28)] p-5 backdrop-blur-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
                  Current Snapshot
                </p>
                <p className="mt-3 text-3xl font-semibold text-white">
                  {allRooms.length} rooms
                </p>
                <p className="mt-2 text-sm leading-6 text-white/80">
                  {buildings.length} buildings, {totalFloors} total floors, and {totalCapacity} total capacity.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[color:rgba(98,133,62,0.12)] bg-[var(--card-surface)] p-5 shadow-[0_18px_45px_rgba(98,133,62,0.08)]">
          <label
            htmlFor="building-room-search"
            className="text-sm font-semibold text-[var(--brand-color)]"
          >
            Search buildings or rooms
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="building-room-search"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by building name, room code, status, capacity..."
              className="w-full rounded-2xl border border-[color:rgba(98,133,62,0.18)] bg-white px-4 py-3 text-sm text-[var(--brand-color)] outline-none transition placeholder:text-[rgba(98,133,62,0.48)] focus:border-[var(--brand-color)] focus:ring-4 focus:ring-[rgba(98,133,62,0.12)]"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="rounded-2xl bg-[var(--brand-color)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-105"
              >
                Clear
              </button>
            )}
          </div>
          <p className="mt-3 text-sm text-[rgba(98,133,62,0.76)]">
            {normalizedSearch
              ? `Showing ${filteredBuildings.length} building${filteredBuildings.length === 1 ? '' : 's'} and ${visibleRoomCount} room${visibleRoomCount === 1 ? '' : 's'} for "${searchTerm}".`
              : `Showing all ${buildings.length} buildings and ${allRooms.length} rooms.`}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-[color:var(--brand-color)] bg-[var(--brand-color)] p-5 shadow-[0_18px_45px_rgba(98,133,62,0.16)]">
            <p className="text-sm font-medium text-white/80">Total buildings</p>
            <p className="mt-3 text-3xl font-semibold text-white">{buildings.length}</p>
          </div>

          <div className="rounded-2xl border border-[color:rgba(98,133,62,0.12)] bg-[var(--card-surface)] p-5 shadow-[0_18px_45px_rgba(98,133,62,0.08)]">
            <p className="text-sm font-medium text-[rgba(98,133,62,0.72)]">Tracked rooms</p>
            <p className="mt-3 text-3xl font-semibold text-[var(--brand-color)]">{allRooms.length}</p>
          </div>

          <div className="rounded-2xl border border-[color:rgba(98,133,62,0.12)] bg-[var(--card-surface)] p-5 shadow-[0_18px_45px_rgba(98,133,62,0.08)]">
            <p className="text-sm font-medium text-[rgba(98,133,62,0.72)]">Total floors</p>
            <p className="mt-3 text-3xl font-semibold text-[var(--brand-color)]">{totalFloors}</p>
          </div>

          <div className="rounded-2xl border border-[color:rgba(98,133,62,0.12)] bg-[var(--card-surface)] p-5 shadow-[0_18px_45px_rgba(98,133,62,0.08)]">
            <p className="text-sm font-medium text-[rgba(98,133,62,0.72)]">Total room capacity</p>
            <p className="mt-3 text-3xl font-semibold text-[var(--brand-color)]">{totalCapacity}</p>
          </div>
        </div>

        <div className="space-y-6">
          {filteredBuildings.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-[color:rgba(98,133,62,0.2)] bg-[var(--card-surface)] p-8 text-center shadow-[0_18px_45px_rgba(98,133,62,0.06)]">
              <p className="text-lg font-semibold text-[var(--brand-color)]">
                No matching buildings or rooms
              </p>
              <p className="mt-3 text-sm leading-7 text-[rgba(98,133,62,0.78)]">
                Try a different building name, room code, status, or capacity.
              </p>
            </div>
          ) : filteredBuildings.map((building) => {
            return (
              <article
                key={building.id}
                className="rounded-[28px] border border-[color:rgba(98,133,62,0.12)] bg-[var(--card-surface)] p-6 shadow-[0_22px_55px_rgba(98,133,62,0.08)] sm:p-8"
              >
                <div className="flex flex-col gap-6 border-b border-[color:rgba(98,133,62,0.1)] pb-6">
                  <div className="max-w-3xl">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-2xl font-semibold tracking-tight text-[var(--brand-color)]">
                          {building.name}
                        </h3>
                        <span className="rounded-full bg-[var(--brand-color)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white shadow-[0_10px_24px_rgba(98,133,62,0.18)]">
                          {building.code}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-2xl bg-[rgba(98,133,62,0.06)] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(98,133,62,0.68)]">
                        Floor
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--brand-color)]">
                        {building.floor}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-[rgba(98,133,62,0.06)] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(98,133,62,0.68)]">
                        Rooms
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--brand-color)]">
                        {building.rooms.length}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-[rgba(98,133,62,0.06)] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(98,133,62,0.68)]">
                        Capacity
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--brand-color)]">
                        {building.capacity}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-[rgba(98,133,62,0.72)]">
                    <DoorIcon className="h-4 w-4" />
                    Room list
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {building.rooms.map((room) => (
                    <div
                      key={room.id}
                      className="overflow-hidden rounded-2xl border border-[color:rgba(98,133,62,0.1)] bg-[linear-gradient(180deg,rgba(252,252,252,1),rgba(248,250,245,0.96))]"
                    >
                      <img
                        src={room.image}
                        alt={room.name}
                        className="h-44 w-full object-cover"
                      />

                      <div className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="text-lg font-semibold text-[var(--brand-color)]">
                              {room.name}
                            </h4>
                            <p className="mt-2 text-sm font-medium text-[rgba(98,133,62,0.72)]">
                              {room.code}
                            </p>
                          </div>

                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${roomStatusClasses[room.status]}`}
                          >
                            {room.status}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl bg-white/80 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(98,133,62,0.58)]">
                              Capacity
                            </p>
                            <p className="mt-2 text-sm font-medium text-[rgba(98,133,62,0.88)]">
                              {room.capacity} people
                            </p>
                          </div>

                          <div className="rounded-xl bg-white/80 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(98,133,62,0.58)]">
                              Status
                            </p>
                            <p className="mt-2 text-sm font-medium text-[rgba(98,133,62,0.88)]">
                              {room.status}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default BuildingsRoomsPage
