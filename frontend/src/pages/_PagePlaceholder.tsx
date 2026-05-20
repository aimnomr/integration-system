import type { ReactNode } from 'react';

export function PagePlaceholder({
  title,
  description,
  phase,
}: {
  title: string;
  description: ReactNode;
  phase: string;
}) {
  return (
    <div className="max-w-2xl">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        {phase}
      </div>
      <h1 className="text-2xl font-semibold text-white">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-400">{description}</p>
    </div>
  );
}
