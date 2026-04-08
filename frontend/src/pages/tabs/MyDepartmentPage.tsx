import { BuildingIcon, PlusIcon } from '../../components/Icons'

function MyDepartmentPage() {
  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="space-y-6">
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-md">
          <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-8 text-white">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              My Department
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/85 sm:text-base">
              Overview of your department's members, rooms, and activity.
            </p>
          </div>

          <div className="p-6 bg-gray-50/50">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-green-50 border border-green-100 shrink-0">
                  <BuildingIcon className="h-9 w-9 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500">Department Members</p>
                  <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">12</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Department Setup Card for Dean */}
        <div className="rounded-lg border border-gray-200 bg-white shadow-md overflow-hidden">
          <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4">
            <h3 className="text-lg font-bold text-gray-900">Setup Department</h3>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mt-0.5">Dean's Configuration</p>
          </div>
          
          <div className="p-6">
            <form className="space-y-6 max-w-2xl">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="dept-name" className="block text-xs font-bold uppercase tracking-widest text-gray-500">
                    Department Name
                  </label>
                  <input
                    id="dept-name"
                    type="text"
                    placeholder="e.g. College of Information Technology"
                    className="w-full rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:ring-4 focus:ring-gray-50 shadow-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="dept-code" className="block text-xs font-bold uppercase tracking-widest text-gray-500">
                    Department Code
                  </label>
                  <input
                    id="dept-code"
                    type="text"
                    placeholder="e.g. CITE"
                    className="w-full rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:ring-4 focus:ring-gray-50 shadow-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="flex items-center justify-center gap-2 rounded-md bg-[var(--brand-color)] px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#526f34] hover:shadow-lg"
                >
                  <PlusIcon className="h-4 w-4" />
                  Save Department Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  )
}

export default MyDepartmentPage
