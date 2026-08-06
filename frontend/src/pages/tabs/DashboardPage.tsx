import { SectionHeader } from '../../components/SectionHeader';
import {
  UsersIcon, BuildingIcon, DoorIcon, ClipboardIcon,
  CalendarIcon, CheckCircleIcon, ArrowRightIcon
} from '../../components/Icons'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

const utilizationData = [
  { name: 'Jul 21', rate: 62 },
  { name: 'Jul 22', rate: 74 },
  { name: 'Jul 23', rate: 80 },
  { name: 'Jul 24', rate: 71 },
  { name: 'Jul 25', rate: 88 },
  { name: 'Jul 26', rate: 35 },
  { name: 'Jul 27', rate: 12 },
  { name: 'Jul 28', rate: 65 },
  { name: 'Jul 29', rate: 78 },
  { name: 'Jul 30', rate: 82 },
  { name: 'Jul 31', rate: 75 },
  { name: 'Aug 01', rate: 85 },
  { name: 'Aug 02', rate: 30 },
  { name: 'Aug 03', rate: 10 },
]

const departmentData = [
  { name: 'CITE', bookings: 120 },
  { name: 'CEA', bookings: 98 },
  { name: 'CMA', bookings: 86 },
  { name: 'CELA', bookings: 45 },
  { name: 'CNAHS', bookings: 72 },
  { name: 'Admin', bookings: 38 },
  { name: 'Grad Studies', bookings: 29 },
  { name: 'Student Orgs', bookings: 54 },
]

const roomStatusCounts = {
  available: 78,
  occupied: 26,
  reserved: 15,
  maintenance: 5,
}
const totalRooms = roomStatusCounts.available + roomStatusCounts.occupied + roomStatusCounts.reserved + roomStatusCounts.maintenance

const topRequestedRooms = [
  { rank: 1, room: 'Auditorium', building: 'Main', bookings: 87, avgHours: 3.2 },
  { rank: 2, room: 'Lab A', building: 'CITE Bldg', bookings: 74, avgHours: 2.8 },
  { rank: 3, room: 'Room 302', building: 'Main', bookings: 68, avgHours: 1.5 },
  { rank: 4, room: 'Lab C', building: 'CITE Bldg', bookings: 61, avgHours: 2.4 },
  { rank: 5, room: 'Room 405', building: 'Annex', bookings: 55, avgHours: 1.8 },
]

const systemAlerts = [
  { id: 1, type: 'warning' as const, message: 'Room 101 projector reported faulty', time: '30 min ago' },
  { id: 2, type: 'error' as const, message: 'Lab B AC unit non-functional — maintenance dispatched', time: '1 hour ago' },
  { id: 3, type: 'info' as const, message: 'Auditorium booking window opens for September', time: '2 hours ago' },
  { id: 4, type: 'warning' as const, message: 'Room 205 whiteboard marker supply low', time: '3 hours ago' },
  { id: 5, type: 'info' as const, message: 'Semester 1 schedule publishing deadline: Aug 15', time: 'Yesterday' },
]

function DashboardPage() {
  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <div className="space-y-6">
        <SectionHeader 
          title="Dashboard" 
          description="High-level registrar metrics, room activity, and system summaries." 
        />

        <div className="space-y-8">
            {/* Enhanced Key Metrics */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 border border-blue-100 shrink-0">
                  <BuildingIcon className="h-7 w-7 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-500 truncate" title="Total Rooms">Total Rooms</p>
                  <div className="flex items-baseline gap-2">
                    <p className="mt-1 text-2xl font-bold text-gray-900 leading-none">124</p>
                    <span className="text-xs font-medium text-green-600">+2 this month</span>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-green-50 border border-green-100 shrink-0">
                  <DoorIcon className="h-7 w-7 text-green-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-500 truncate" title="Daily Utilization">Daily Utilization</p>
                  <div className="flex items-baseline gap-2">
                    <p className="mt-1 text-2xl font-bold text-gray-900 leading-none">78%</p>
                    <span className="text-xs font-medium text-green-600">+5% vs last week</span>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-50 border border-amber-100 shrink-0">
                  <CalendarIcon className="h-7 w-7 text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-500 truncate" title="Peak Hours">Peak Hours</p>
                  <p className="mt-1 text-xl font-bold text-gray-900 leading-none">10 AM - 2 PM</p>
                </div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-rose-50 border border-rose-100 shrink-0">
                  <ClipboardIcon className="h-7 w-7 text-rose-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-500 truncate" title="Active Maintenance">Active Maintenance</p>
                  <div className="flex items-baseline gap-2">
                    <p className="mt-1 text-2xl font-bold text-gray-900 leading-none">5</p>
                    <span className="text-xs font-medium text-red-600">Requires attention</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Room Status Overview */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">Room Status Overview</h3>
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="bg-emerald-500 transition-all"
                  style={{ width: `${(roomStatusCounts.available / totalRooms) * 100}%` }}
                  title={`Available: ${roomStatusCounts.available}`}
                />
                <div
                  className="bg-blue-500 transition-all"
                  style={{ width: `${(roomStatusCounts.occupied / totalRooms) * 100}%` }}
                  title={`Occupied: ${roomStatusCounts.occupied}`}
                />
                <div
                  className="bg-amber-500 transition-all"
                  style={{ width: `${(roomStatusCounts.reserved / totalRooms) * 100}%` }}
                  title={`Reserved: ${roomStatusCounts.reserved}`}
                />
                <div
                  className="bg-red-500 transition-all"
                  style={{ width: `${(roomStatusCounts.maintenance / totalRooms) * 100}%` }}
                  title={`Maintenance: ${roomStatusCounts.maintenance}`}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-emerald-500" />
                  <span className="text-gray-700">Available <span className="font-semibold text-gray-900">{roomStatusCounts.available}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-blue-500" />
                  <span className="text-gray-700">Occupied <span className="font-semibold text-gray-900">{roomStatusCounts.occupied}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-amber-500" />
                  <span className="text-gray-700">Reserved <span className="font-semibold text-gray-900">{roomStatusCounts.reserved}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <span className="text-gray-700">Maintenance <span className="font-semibold text-gray-900">{roomStatusCounts.maintenance}</span></span>
                </div>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-4">Room Utilization Over Time</h3>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={utilizationData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Line type="monotone" dataKey="rate" stroke="var(--brand-color)" strokeWidth={3} dot={{ r: 4, fill: "var(--brand-color)" }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-4">Bookings by Department</h3>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={departmentData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="name" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} cursor={{ fill: '#f9fafb' }} />
                      <Bar dataKey="bookings" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Top Requested Rooms + System Alerts */}
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="lg:col-span-3 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
                <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4">
                  <h3 className="font-semibold text-gray-900">Top Requested Rooms</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 font-semibold text-gray-900">#</th>
                        <th className="px-6 py-3 font-semibold text-gray-900">Room</th>
                        <th className="px-6 py-3 font-semibold text-gray-900">Building</th>
                        <th className="px-6 py-3 font-semibold text-gray-900 text-right">Bookings</th>
                        <th className="px-6 py-3 font-semibold text-gray-900 text-right">Avg. Hrs/Day</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {topRequestedRooms.map((r) => (
                        <tr key={r.rank} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-3 font-bold text-[var(--brand-color)]">{r.rank}</td>
                          <td className="px-6 py-3 font-medium text-gray-900">{r.room}</td>
                          <td className="px-6 py-3 text-gray-600">{r.building}</td>
                          <td className="px-6 py-3 text-right font-semibold text-gray-900">{r.bookings}</td>
                          <td className="px-6 py-3 text-right text-gray-600">{r.avgHours}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
                <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4">
                  <h3 className="font-semibold text-gray-900">System Alerts</h3>
                </div>
                <div className="divide-y divide-gray-100 flex-1 overflow-y-auto max-h-[20rem]">
                  {systemAlerts.map((alert) => (
                    <div key={alert.id} className="flex items-start gap-3 px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                        alert.type === 'error' ? 'bg-red-500' :
                        alert.type === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900">{alert.message}</p>
                        <p className="text-xs text-gray-500 mt-1">{alert.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Row */}
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Recent Activity */}
              <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
                <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Recent Activity</h3>
                  <button className="text-sm font-medium text-[var(--brand-color)] hover:underline flex items-center gap-1">
                    View all <ArrowRightIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="divide-y divide-gray-100 flex-1 overflow-y-auto max-h-[25rem]">
                  {[
                    { id: 1, action: "Room 302 booking approved", user: "John Doe", time: "2 hours ago", icon: <CheckCircleIcon className="h-5 w-5 text-green-500" /> },
                    { id: 2, action: "New room request for Lab A", user: "Jane Smith", time: "4 hours ago", icon: <CalendarIcon className="h-5 w-5 text-blue-500" /> },
                    { id: 3, action: "Maintenance completed for Room 101", user: "Admin", time: "Yesterday", icon: <CheckCircleIcon className="h-5 w-5 text-green-500" /> },
                    { id: 4, action: "System update applied", user: "System", time: "Yesterday", icon: <BuildingIcon className="h-5 w-5 text-gray-500" /> },
                    { id: 5, action: "Bulk booking import completed", user: "Registrar", time: "2 days ago", icon: <UsersIcon className="h-5 w-5 text-purple-500" /> },
                    { id: 6, action: "Room 205 booking cancelled by requester", user: "Bob Brown", time: "2 days ago", icon: <ClipboardIcon className="h-5 w-5 text-red-500" /> },
                    { id: 7, action: "Equipment issue reported for Lab B", user: "Charlie Davis", time: "3 days ago", icon: <ClipboardIcon className="h-5 w-5 text-amber-500" /> },
                    { id: 8, action: "Instructor schedule updated for Dr. Reyes", user: "Dean — CITE", time: "3 days ago", icon: <CalendarIcon className="h-5 w-5 text-indigo-500" /> },
                    { id: 9, action: "Room 401 swapped with Room 403", user: "Registrar", time: "4 days ago", icon: <DoorIcon className="h-5 w-5 text-teal-500" /> },
                    { id: 10, action: "New maintenance request for Auditorium AC", user: "Eve White", time: "4 days ago", icon: <ClipboardIcon className="h-5 w-5 text-amber-500" /> },
                    { id: 11, action: "CEA department schedule finalized", user: "Dean — CEA", time: "5 days ago", icon: <CheckCircleIcon className="h-5 w-5 text-green-500" /> },
                    { id: 12, action: "3 new instructor accounts created", user: "Admin", time: "1 week ago", icon: <UsersIcon className="h-5 w-5 text-purple-500" /> },
                  ].map(activity => (
                    <div key={activity.id} className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className="mt-0.5">{activity.icon}</div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{activity.action}</p>
                        <p className="text-xs text-gray-500 mt-1">By {activity.user} &middot; {activity.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Upcoming Schedule */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
                <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4">
                  <h3 className="font-semibold text-gray-900">Upcoming Schedule</h3>
                </div>
                <div className="divide-y divide-gray-100 flex-1 overflow-y-auto max-h-[25rem]">
                  {[
                    { id: 1, room: "Lab C", title: "CITE Networking", time: "10:00 AM - 12:00 PM" },
                    { id: 2, room: "Room 405", title: "Faculty Meeting", time: "01:00 PM - 02:30 PM" },
                    { id: 3, room: "Auditorium", title: "Freshman Orientation", time: "03:00 PM - 05:00 PM" },
                    { id: 4, room: "Room 201", title: "CMA Board Exam Prep", time: "Tomorrow, 08:00 AM" },
                    { id: 5, room: "Lab A", title: "CEA AutoCAD Workshop", time: "Tomorrow, 10:00 AM" },
                    { id: 6, room: "Room 302", title: "CELA Legal Research Seminar", time: "Tomorrow, 01:00 PM" },
                    { id: 7, room: "Lab B", title: "CNAHS Simulation Lab", time: "Aug 03, 09:00 AM" },
                    { id: 8, room: "Room 102", title: "Grad Studies Thesis Defense", time: "Aug 03, 02:00 PM" },
                  ].map(schedule => (
                    <div key={schedule.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-sm font-semibold text-gray-900">{schedule.room}</p>
                        <span className="text-[0.625rem] font-bold tracking-wider uppercase text-[var(--brand-color)] bg-[var(--brand-color)]/10 px-2 py-0.5 rounded-full">
                          Upcoming
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{schedule.title}</p>
                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                        <CalendarIcon className="h-3 w-3" /> {schedule.time}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
        </div>
      </div>
      </div>
    </section>
  )
}

export default DashboardPage
