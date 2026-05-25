import { BRAND } from '@/branding/branding';

export type PillState = 'ok' | 'warn' | 'error' | 'idle';

const COLOR: Record<PillState, string> = {
  ok: BRAND.status.ok,
  warn: BRAND.status.warn,
  error: BRAND.status.error,
  idle: BRAND.status.idle,
};

export interface StatusPillProps {
  state: PillState;
  label: string;
  title?: string;
}

export function StatusPill({ state, label, title }: StatusPillProps) {
  return (
    <span
      title={title ?? label}
      className="inline-flex items-center gap-1.5 rounded-full bg-surface-2/60 px-2 py-0.5 text-xs"
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{
          backgroundColor: COLOR[state],
          transition: 'background-color var(--dur-pill) var(--ease-out)',
        }}
      />
      {label}
    </span>
  );
}
