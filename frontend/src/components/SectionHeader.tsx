import React from 'react';

interface SectionHeaderProps {
  title: string;
  description: string;
}

export function SectionHeader({ title, description }: SectionHeaderProps) {
  return (
    <div className="mb-8 border-b-1 border-gray-400 p-4 -mx-4 sm:-mx-6 lg:-mx-8 bg-[var(--brand-surface)] text-left">
      <div className="flex flex-col">
        <h1 className="text-3xl font-bold tracking-tight text-black">
          {title}
        </h1>
        <p className="w-full max-w-4xl truncate whitespace-nowrap text-md leading-relaxed text-gray-600" title={description}>
          {description}
        </p>
      </div>
    </div>
  );
}
