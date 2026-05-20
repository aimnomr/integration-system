import type { VdaState } from '@/types/api';

const LEVEL_COLOR: Record<string, string> = {
  FATAL:   'border-red-500   text-red-300',
  ERROR:   'border-red-500   text-red-300',
  WARNING: 'border-yellow-500 text-yellow-300',
  INFO:    'border-sky-500    text-sky-300',
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
          className={`rounded border-l-2 bg-surface-2/40 px-3 py-2 text-xs ${LEVEL_COLOR[e.errorLevel ?? ''] ?? 'border-slate-500 text-slate-300'}`}
        >
          <div className="font-mono">{e.errorType}</div>
          {e.errorDescription && (
            <div className="mt-0.5 text-slate-400">{e.errorDescription}</div>
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
