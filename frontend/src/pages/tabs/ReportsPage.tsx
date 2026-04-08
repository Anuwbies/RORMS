function ReportsPage() {
  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="space-y-6">
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-md">
          <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-8 text-white">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Reports
            </h2>
            <p className="mt-4 text-sm leading-7 whitespace-nowrap text-white/85 sm:text-base">
              Generate and view university-wide reports on room utilization, department activity, and resource management
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default ReportsPage
