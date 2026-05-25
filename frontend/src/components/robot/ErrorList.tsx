import type { VdaState } from '@/types/api';

const LEVEL_STYLE: Record<string, string> = {
  FATAL:   'bg-red-500/15 text-red-200',
  ERROR:   'bg-red-500/15 text-red-200',
  WARNING: 'bg-yellow-500/15 text-yellow-200',
  INFO:    'bg-sky-500/15 text-sky-200',
};

export function ErrorList({ state }: { state: VdaState | null }) {
  const errors = state?.errors ?? [];
  if (errors.length === 0) {
    return <p className="text-sm text-slate-500">No errors reported.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {errors.map((e, idx) => (
        <li
          key={idx}
          className={`rounded px-3 py-2 text-xs ${LEVEL_STYLE[e.errorLevel ?? ''] ?? 'bg-slate-500/15 text-slate-300'}`}
        >
          <div className="font-mono">{e.errorType}</div>
          {e.errorDescription && (
            <div className="mt-0.5 text-slate-300/80">{e.errorDescription}</div>
          )}
          {e.errorLevel && (
            <div className="mt-0.5 text-[10px] uppercase tracking-widest opacity-70">
              {e.errorLevel}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
