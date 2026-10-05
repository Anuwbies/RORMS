import React from 'react';

interface SectionHeaderProps {
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function SectionHeader({ title, description, action }: SectionHeaderProps) {
  return (
    <div className="mb-8 flex items-center justify-between gap-4 border-b-1 border-gray-400 p-4 -mx-4 sm:-mx-6 lg:-mx-8 bg-[var(--brand-surface)] text-left">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight text-black">
          {title}
        </h1>
        <p className="w-full max-w-4xl truncate whitespace-nowrap text-md leading-relaxed text-gray-600" title={description}>
          {description}
        </p>
      </div>
      {action && <div className="w-48 shrink-0">{action}</div>}
    </div>
  );
}
