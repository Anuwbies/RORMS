import {
  UsersIcon, BuildingIcon, DoorIcon, ClipboardIcon,
  CalendarIcon, CheckCircleIcon, ArrowRightIcon
} from '../../components/Icons'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

const utilizationData = [
  { name: 'Mon', rate: 65 },
  { name: 'Tue', rate: 78 },
  { name: 'Wed', rate: 82 },
  { name: 'Thu', rate: 75 },
  { name: 'Fri', rate: 85 },
  { name: 'Sat', rate: 30 },
  { name: 'Sun', rate: 10 },
]

const departmentData = [
  { name: 'CITE', bookings: 120 },
  { name: 'CEA', bookings: 98 },
  { name: 'CMA', bookings: 86 },
  { name: 'CELA', bookings: 45 },
]

function DashboardPage() {
  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="space-y-6">
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-md">
          <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-8 text-white">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Dashboard
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/85 sm:text-base">
              High-level registrar metrics, room activity, and system summaries.
            </p>
          </div>

          <div className="p-6 bg-gray-50/50 space-y-8">
            {/* Enhanced Key Metrics */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 border border-blue-100 shrink-0">
                  <BuildingIcon className="h-7 w-7 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Total Rooms</p>
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
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Daily Utilization</p>
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
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Peak Hours</p>
                  <p className="mt-1 text-xl font-bold text-gray-900 leading-none">10 AM - 2 PM</p>
                </div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-rose-50 border border-rose-100 shrink-0">
                  <ClipboardIcon className="h-7 w-7 text-rose-600" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Active Maintenance</p>
                  <div className="flex items-baseline gap-2">
                    <p className="mt-1 text-2xl font-bold text-gray-900 leading-none">5</p>
                    <span className="text-xs font-medium text-red-600">Requires attention</span>
                  </div>
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
                <div className="divide-y divide-gray-100 flex-1 overflow-y-auto max-h-[400px]">
                  {[
                    { id: 1, action: "Room 302 booking approved", user: "John Doe", time: "2 hours ago", icon: <CheckCircleIcon className="h-5 w-5 text-green-500" /> },
                    { id: 2, action: "New room request for Lab A", user: "Jane Smith", time: "4 hours ago", icon: <CalendarIcon className="h-5 w-5 text-blue-500" /> },
                    { id: 3, action: "Maintenance completed for Room 101", user: "Admin", time: "Yesterday", icon: <CheckCircleIcon className="h-5 w-5 text-green-500" /> },
                    { id: 4, action: "System update applied", user: "System", time: "Yesterday", icon: <BuildingIcon className="h-5 w-5 text-gray-500" /> },
                    { id: 5, action: "Bulk booking import completed", user: "Registrar", time: "2 days ago", icon: <UsersIcon className="h-5 w-5 text-purple-500" /> }
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
                <div className="divide-y divide-gray-100 flex-1 overflow-y-auto max-h-[400px]">
                  {[
                    { id: 1, room: "Lab C", title: "CITE Networking", time: "10:00 AM - 12:00 PM" },
                    { id: 2, room: "Room 405", title: "Faculty Meeting", time: "01:00 PM - 02:30 PM" },
                    { id: 3, room: "Auditorium", title: "Freshman Orientation", time: "03:00 PM - 05:00 PM" },
                    { id: 4, room: "Room 201", title: "CMA Board Exam Prep", time: "Tomorrow, 08:00 AM" },
                  ].map(schedule => (
                    <div key={schedule.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-sm font-semibold text-gray-900">{schedule.room}</p>
                        <span className="text-[10px] font-bold tracking-wider uppercase text-[var(--brand-color)] bg-[var(--brand-color)]/10 px-2 py-0.5 rounded-full">
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
      </div>
    </section>
  )
}

export default DashboardPage
