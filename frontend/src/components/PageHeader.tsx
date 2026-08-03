import React from 'react';

interface PageHeaderProps {
  title: string;
  description: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-8 text-white relative">
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-white/85 sm:text-base">
        {description}
      </p>
      {actions}
    </div>
  );
}
