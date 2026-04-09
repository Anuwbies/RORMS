import { useState } from 'react'
import { ClipboardIcon, SearchIcon, PlusIcon, EditIcon, TrashIcon, CheckIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'

interface Reservation {
  id: string
  requester: {
    name: string
    email: string
    avatar: string
  }
  room: string
  building: string
  date: string
  time: string
  status: 'Pending' | 'Approved' | 'Rejected'
}

const mockReservations: Reservation[] = [
  {
    id: 'res-1',
    requester: {
      name: 'Michael Chen',
      email: 'm.chen@example.com',
      avatar: 'https://i.pravatar.cc/150?u=3',
    },
    room: 'Meeting Room A',
    building: 'Main Building',
    date: 'Apr 12, 2026',
    time: '09:00 AM - 11:00 AM',
    status: 'Pending',
  },
  {
    id: 'res-2',
    requester: {
      name: 'Elena Rodriguez',
      email: 'elena.r@example.com',
      avatar: 'https://i.pravatar.cc/150?u=4',
    },
    room: 'Computer Lab 2',
    building: 'CITE Wing',
    date: 'Apr 13, 2026',
    time: '01:00 PM - 03:00 PM',
    status: 'Approved',
  },
  {
    id: 'res-3',
    requester: {
      name: 'James Wilson',
      email: 'j.wilson@example.com',
      avatar: 'https://i.pravatar.cc/150?u=10',
    },
    room: 'Conference Hall',
    building: 'Admin Block',
    date: 'Apr 14, 2026',
    time: '10:00 AM - 12:00 PM',
    status: 'Pending',
  },
  {
    id: 'res-4',
    requester: {
      name: 'Maria Garcia',
      email: 'm.garcia@example.com',
      avatar: 'https://i.pravatar.cc/150?u=11',
    },
    room: 'Study Room 4',
    building: 'Library',
    date: 'Apr 15, 2026',
    time: '03:00 PM - 05:00 PM',
    status: 'Rejected',
  },
]

const statusClasses: Record<string, string> = {
  Approved: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-rose-100 text-rose-700',
  Pending: 'bg-amber-100 text-amber-700',
}

function ManageReservationsPage() {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredReservations = mockReservations.filter((res) =>
    [res.requester.name, res.requester.email, res.room, res.building, res.status].some((val) =>
      val.toLowerCase().includes(searchTerm.toLowerCase())
    )
  )

  const pendingCount = mockReservations.filter(r => r.status === 'Pending').length

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="space-y-6">
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-md">
          <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-8 text-white">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Manage Reservations
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/85 sm:text-base">
              Track, approve, or modify room reservation requests across the university.
            </p>
          </div>

          <div className="p-6 bg-gray-50/50">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-orange-50 border border-orange-100 shrink-0">
                  <ClipboardIcon className="h-9 w-9 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500">Pending Requests</p>
                  <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">{pendingCount}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-gray-200 bg-gray-50/50 p-5 shadow-md">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                <SearchIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search reservations..."
                className="w-full rounded-md border border-gray-200 bg-white pl-11 pr-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:ring-4 focus:ring-gray-50 shadow-sm"
              />
            </div>

            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded-md bg-[var(--brand-color)] px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#526f34] hover:shadow-lg shrink-0"
            >
              <PlusIcon className="h-5 w-5" />
              Create Reservation
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-md">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[30%]">
                    Requester
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[20%]">
                    Room / Building
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[20%]">
                    Date & Time
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[15%]">
                    Status
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-widest text-gray-500 w-[15%]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredReservations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      No reservations found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredReservations.map((res) => (
                    <tr 
                      key={res.id} 
                      className="transition hover:bg-gray-50/50"
                    >
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex items-center gap-4">
                          <img
                            src={res.requester.avatar}
                            alt={res.requester.name}
                            className="h-10 w-10 rounded-full border border-gray-100 object-cover"
                          />
                          <div>
                            <p className="text-sm font-bold text-gray-900">{res.requester.name}</p>
                            <p className="text-xs font-medium text-gray-500">{res.requester.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <p className="text-sm font-bold text-gray-900">{res.room}</p>
                        <p className="text-xs font-medium text-gray-500">{res.building}</p>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <p className="text-sm font-semibold text-gray-600">{res.date}</p>
                        <p className="text-xs font-medium text-gray-400">{res.time}</p>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${statusClasses[res.status] || 'bg-gray-100 text-gray-700'}`}>
                          {res.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {res.status === 'Pending' && (
                            <IconButton
                              label="Approve reservation"
                              className="h-8 w-8 rounded-md bg-white text-emerald-400 shadow-sm hover:bg-emerald-50 hover:text-emerald-600 transition-all border border-gray-100"
                              onClick={() => console.log('Approve:', res.id)}
                            >
                              <CheckIcon className="h-4.5 w-4.5" />
                            </IconButton>
                          )}
                          <IconButton
                            label="Edit reservation"
                            className="h-8 w-8 rounded-md bg-white text-gray-400 shadow-sm hover:bg-gray-50 hover:text-gray-600 transition-all border border-gray-100"
                            onClick={() => console.log('Edit:', res.id)}
                          >
                            <EditIcon className="h-4.5 w-4.5" />
                          </IconButton>
                          <IconButton
                            label="Reject reservation"
                            className="h-8 w-8 rounded-md bg-white text-rose-400 shadow-sm hover:bg-rose-50 hover:text-rose-600 transition-all border border-gray-100"
                            onClick={() => console.log('Reject:', res.id)}
                          >
                            <TrashIcon className="h-4.5 w-4.5" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}

export default ManageReservationsPage
