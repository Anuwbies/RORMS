import type { ReactNode } from 'react';

export interface SummaryCardProps {
  title: string;
  subtitle: string;
  icon: ReactNode;
  gradientClasses: string; // e.g., "from-[var(--brand-color)] to-[#7b9d4f]"
  outlineClasses?: string; // Optional specific classes for the top line (to make it solid/opaque)
  blobClasses: string; // e.g., "bg-[var(--brand-color)]/8 group-hover:bg-[var(--brand-color)]/14"
  children?: ReactNode;
  className?: string;
  contentAspectRatio?: string; // e.g., "aspect-[16/9]"
  onIconClick?: () => void;
}

export function SummaryCard({
  title,
  subtitle,
  icon,
  gradientClasses,
  outlineClasses,
  blobClasses,
  children,
  className = "",
  contentAspectRatio = "aspect-[16/9]",
  onIconClick,
}: SummaryCardProps) {
  return (
    <div className={`group relative z-10 hover:z-50 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 p-4 flex flex-col h-full ${className}`}>

      <div
        className={`absolute top-0 left-[1%] right-[1%] h-[3px] rounded-t-sm ${outlineClasses || `bg-gradient-to-r ${gradientClasses}`}`}
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
          onClick={onIconClick}
        >
          {icon}
        </div>
      </div>

      <div className={`flex-1 flex flex-col mt-4 w-full relative ${contentAspectRatio}`}>
        {children ? (
          children
        ) : (
          <div className="w-full h-full rounded-xl bg-slate-100 animate-pulse" />
        )}
      </div>
    </div>
  );
}
