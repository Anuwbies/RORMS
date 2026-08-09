import type { ReactNode } from 'react';

export interface SummaryCardProps {
  title: string;
  subtitle: string;
  icon: ReactNode;
  gradientClasses: string; // e.g., "from-[var(--brand-color)] to-[#7b9d4f]"
  blobClasses: string; // e.g., "bg-[var(--brand-color)]/8 group-hover:bg-[var(--brand-color)]/14"
  children?: ReactNode;
  className?: string;
}

export function SummaryCard({
  title,
  subtitle,
  icon,
  gradientClasses,
  blobClasses,
  children,
  className = "",
}: SummaryCardProps) {
  return (
    <div className={`group relative bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 overflow-hidden p-4 flex flex-col h-full ${className}`}>

      <div
        className={`absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl bg-gradient-to-r ${gradientClasses}`}
      />

      <div className="flex items-start justify-between">
        <div className="flex flex-col justify-between h-9">
          <p className="text-xs sm:text-sm font-black text-slate-900 leading-none mt-0.5">
            {title}
          </p>
          <p className="text-[0.65rem] text-slate-400 font-medium leading-none mb-0.5">
            {subtitle}
          </p>
        </div>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm shrink-0 ${gradientClasses}`}
        >
          {icon}
        </div>
      </div>

      {children && <div className="flex-1 flex flex-col mt-2">{children}</div>}
    </div>
  );
}
