import type { VdaState } from '@/types/api';

/** Compact key/value table of operator-relevant VDA5050 fields. */
export function StateTable({ state }: { state: VdaState | null }) {
  if (!state) return <p className="text-sm text-slate-500">No state yet.</p>;
  const pos = state.agvPosition;
  const vel = state.velocity;

  const rows: Array<[string, string]> = [
    ['mode', state.operatingMode ?? '—'],
    ['driving', state.driving === undefined ? '—' : String(state.driving)],
    ['order', state.orderId || '—'],
    ['position', pos ? `${pos.x.toFixed(2)}, ${pos.y.toFixed(2)} @ ${pos.theta.toFixed(2)} rad` : '—'],
    ['velocity', vel ? `${vel.vx?.toFixed(2) ?? '—'} m/s, ${vel.omega?.toFixed(2) ?? '—'} rad/s` : '—'],
    ['battery', state.batteryState?.batteryCharge !== undefined
      ? `${Math.round(state.batteryState.batteryCharge)}%`
      : '—'],
    ['nodes remaining', String(state.nodeStates?.length ?? 0)],
  ];

  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 font-mono text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-500">{k}</dt>
          <dd className="text-slate-200">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
