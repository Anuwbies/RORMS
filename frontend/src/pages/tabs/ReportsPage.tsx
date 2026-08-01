import { useState } from 'react'
import { 
  BuildingIcon, DoorIcon, ClipboardIcon, 
  CalendarIcon, CheckCircleIcon 
} from '../../components/Icons'
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer 
} from 'recharts'

const statusData = [
  { name: 'Approved', value: 340 },
  { name: 'Pending', value: 65 },
  { name: 'Rejected', value: 45 },
  { name: 'Cancelled', value: 30 },
]

const COLORS = ['#22c55e', '#eab308', '#ef4444', '#6b7280']

type ReportTab = 'requests' | 'utilization' | 'departments'

const requestsLog = [
  { id: "REQ-2026-001", date: "Aug 01, 2026", time: "09:00 AM", room: "Lab A", cap: "40", requester: "Jane Smith", dept: "CITE", purpose: "Networking Workshop", duration: "3 hrs", status: "Approved", statusColor: "bg-green-100 text-green-800" },
  { id: "REQ-2026-002", date: "Aug 02, 2026", time: "02:00 PM", room: "Room 304", cap: "60", requester: "John Doe", dept: "CEA", purpose: "Department Meeting", duration: "1.5 hrs", status: "Pending", statusColor: "bg-yellow-100 text-yellow-800" },
  { id: "REQ-2026-003", date: "Aug 03, 2026", time: "10:30 AM", room: "Room 102", cap: "50", requester: "Alice Lee", dept: "CMA", purpose: "Guest Lecture", duration: "2 hrs", status: "Approved", statusColor: "bg-green-100 text-green-800" },
  { id: "REQ-2026-004", date: "Aug 04, 2026", time: "08:00 AM", room: "Room 205", cap: "45", requester: "Bob Brown", dept: "CITE", purpose: "Make-up Class", duration: "1.5 hrs", status: "Rejected", statusColor: "bg-red-100 text-red-800" },
  { id: "REQ-2026-005", date: "Aug 05, 2026", time: "01:00 PM", room: "Lab B", cap: "40", requester: "Charlie Davis", dept: "CEA", purpose: "AutoCAD Demo", duration: "4 hrs", status: "Approved", statusColor: "bg-green-100 text-green-800" },
  { id: "REQ-2026-006", date: "Aug 06, 2026", time: "03:00 PM", room: "Auditorium", cap: "300", requester: "Eve White", dept: "Admin", purpose: "Student Assembly", duration: "2 hrs", status: "Pending", statusColor: "bg-yellow-100 text-yellow-800" },
  { id: "REQ-2026-007", date: "Aug 07, 2026", time: "11:00 AM", room: "Room 401", cap: "50", requester: "Frank Green", dept: "CELA", purpose: "Moot Court Practice", duration: "3 hrs", status: "Approved", statusColor: "bg-green-100 text-green-800" },
  { id: "REQ-2026-008", date: "Aug 08, 2026", time: "09:30 AM", room: "Lab C", cap: "35", requester: "Grace Tan", dept: "CNAHS", purpose: "Nursing Simulation", duration: "2.5 hrs", status: "Approved", statusColor: "bg-green-100 text-green-800" },
  { id: "REQ-2026-009", date: "Aug 09, 2026", time: "02:30 PM", room: "Room 302", cap: "60", requester: "Henry Cruz", dept: "CMA", purpose: "Financial Accounting Review", duration: "2 hrs", status: "Cancelled", statusColor: "bg-gray-100 text-gray-800" },
  { id: "REQ-2026-010", date: "Aug 10, 2026", time: "10:00 AM", room: "Room 201", cap: "45", requester: "Ivy Santos", dept: "CITE", purpose: "Software Engineering Lecture", duration: "1.5 hrs", status: "Approved", statusColor: "bg-green-100 text-green-800" },
  { id: "REQ-2026-011", date: "Aug 11, 2026", time: "08:30 AM", room: "Auditorium", cap: "300", requester: "Jack Reyes", dept: "Grad Studies", purpose: "Thesis Defense Panel", duration: "5 hrs", status: "Approved", statusColor: "bg-green-100 text-green-800" },
  { id: "REQ-2026-012", date: "Aug 12, 2026", time: "01:00 PM", room: "Lab A", cap: "40", requester: "Karen Lim", dept: "CEA", purpose: "Structural Analysis Lab", duration: "3 hrs", status: "Pending", statusColor: "bg-yellow-100 text-yellow-800" },
  { id: "REQ-2026-013", date: "Aug 13, 2026", time: "03:30 PM", room: "Room 405", cap: "50", requester: "Leo Mendoza", dept: "CELA", purpose: "Legal Ethics Seminar", duration: "2 hrs", status: "Rejected", statusColor: "bg-red-100 text-red-800" },
  { id: "REQ-2026-014", date: "Aug 14, 2026", time: "09:00 AM", room: "Room 102", cap: "50", requester: "Mia Flores", dept: "CNAHS", purpose: "Health Assessment Practicum", duration: "4 hrs", status: "Approved", statusColor: "bg-green-100 text-green-800" },
  { id: "REQ-2026-015", date: "Aug 15, 2026", time: "11:00 AM", room: "Lab B", cap: "40", requester: "Nathan Ong", dept: "CITE", purpose: "Database Systems Workshop", duration: "3 hrs", status: "Cancelled", statusColor: "bg-gray-100 text-gray-800" },
]

function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>('requests')

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="space-y-6">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-md">
          <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-8 text-white relative">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Reports & Analytics
            </h2>
            <p className="mt-4 text-sm leading-7 text-white/85 sm:text-base max-w-2xl">
              Generate and view university-wide reports on room utilization, department activity, and resource management.
            </p>
            
            {/* Tabs Navigation */}
            <div className="absolute bottom-0 left-8 flex gap-6">
              {(['requests', 'utilization', 'departments'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === tab 
                    ? 'border-white text-white' 
                    : 'border-transparent text-white/70 hover:text-white'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6 bg-gray-50/50 space-y-6">
            {/* Top Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5 text-gray-400" />
                  <select className="rounded-lg border-none bg-gray-50 px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--brand-color)] cursor-pointer">
                    <option>Last 30 Days</option>
                    <option>This Week</option>
                    <option>This Semester</option>
                    <option>Academic Year 2026</option>
                    <option>Custom Range</option>
                  </select>
                </div>
                <div className="h-6 w-px bg-gray-200 hidden sm:block"></div>
                <select className="rounded-lg border-none bg-gray-50 px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--brand-color)] cursor-pointer">
                  <option>All Departments</option>
                  <option>CITE</option>
                  <option>CEA</option>
                  <option>CMA</option>
                  <option>CELA</option>
                  <option>CNAHS</option>
                  <option>Admin</option>
                  <option>Grad Studies</option>
                </select>
                <select className="rounded-lg border-none bg-gray-50 px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--brand-color)] cursor-pointer">
                  <option>All Statuses</option>
                  <option>Approved</option>
                  <option>Pending</option>
                  <option>Rejected</option>
                  <option>Cancelled</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <button className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors">
                  Export CSV
                </button>
                <button className="rounded-lg bg-[var(--brand-color)] px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 transition-opacity">
                  Generate PDF
                </button>
              </div>
            </div>

            {/* Scorecards */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Total Requests</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">480</p>
                <p className="text-sm text-gray-500 mt-1">In selected period</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Avg. Approval Time</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">2.4<span className="text-lg text-gray-500 font-medium">hrs</span></p>
                <p className="text-sm text-green-600 mt-1 font-medium">-15% improvement</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm flex items-center">
                <div className="flex-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Status Breakdown</p>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500"></div><span className="text-sm">71% Approved</span></div>
                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-yellow-500"></div><span className="text-sm">14% Pending</span></div>
                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500"></div><span className="text-sm">9% Rejected</span></div>
                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-gray-500"></div><span className="text-sm">6% Cancelled</span></div>
                  </div>
                </div>
                <div className="w-24 h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusData} innerRadius={25} outerRadius={40} paddingAngle={2} dataKey="value" stroke="none">
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '4px 8px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Data Table */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              <div className="border-b border-gray-100 px-6 py-4">
                <h3 className="font-semibold text-gray-900">Detailed Requests Log</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-4 font-semibold text-gray-900">Request ID</th>
                      <th className="px-6 py-4 font-semibold text-gray-900">Date &amp; Time</th>
                      <th className="px-6 py-4 font-semibold text-gray-900">Room / Cap.</th>
                      <th className="px-6 py-4 font-semibold text-gray-900">Requester (Dept)</th>
                      <th className="px-6 py-4 font-semibold text-gray-900">Purpose / Details</th>
                      <th className="px-6 py-4 font-semibold text-gray-900">Duration</th>
                      <th className="px-6 py-4 font-semibold text-gray-900">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {requestsLog.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-[var(--brand-color)]">{row.id}</td>
                        <td className="px-6 py-4">
                          <p className="text-gray-900">{row.date}</p>
                          <p className="text-xs text-gray-500">{row.time}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-gray-900 font-medium">{row.room}</p>
                          <p className="text-xs text-gray-500">Cap: {row.cap}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-gray-900">{row.requester}</p>
                          <p className="text-xs font-semibold text-gray-500">{row.dept}</p>
                        </td>
                        <td className="px-6 py-4 text-gray-700 max-w-[200px] truncate" title={row.purpose}>
                          {row.purpose}
                        </td>
                        <td className="px-6 py-4 text-gray-600 font-medium">{row.duration}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${
                            row.status === 'Approved' ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20' :
                            row.status === 'Pending' ? 'bg-yellow-50 text-yellow-700 ring-1 ring-inset ring-yellow-600/20' :
                            row.status === 'Rejected' ? 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20' :
                            'bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-600/20'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-6 py-4">
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">1</span> to <span className="font-medium">15</span> of <span className="font-medium">480</span> results
                </p>
                <div className="flex items-center gap-2">
                  <button className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                    Previous
                  </button>
                  <div className="hidden sm:flex items-center gap-1">
                    <button className="h-8 w-8 rounded-lg bg-[var(--brand-color)] text-white text-sm font-medium flex items-center justify-center">1</button>
                    <button className="h-8 w-8 rounded-lg text-gray-700 hover:bg-gray-200 text-sm font-medium flex items-center justify-center transition-colors">2</button>
                    <button className="h-8 w-8 rounded-lg text-gray-700 hover:bg-gray-200 text-sm font-medium flex items-center justify-center transition-colors">3</button>
                    <span className="text-gray-500 px-1">...</span>
                    <button className="h-8 w-8 rounded-lg text-gray-700 hover:bg-gray-200 text-sm font-medium flex items-center justify-center transition-colors">32</button>
                  </div>
                  <button className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default ReportsPage
