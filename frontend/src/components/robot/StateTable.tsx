import type { VdaState } from '@/types/api';

/** Compact key/value table of the VDA5050 fields the UI cares about. */
export function StateTable({ state }: { state: VdaState | null }) {
  if (!state) return <p className="text-sm text-slate-500">No state yet.</p>;
  const pos = state.agvPosition;
  const vel = state.velocity;

  const rows: Array<[string, string]> = [
    ['serialNumber', state.serialNumber],
    ['timestamp', state.timestamp],
    ['operatingMode', state.operatingMode ?? '—'],
    ['driving', state.driving === undefined ? '—' : String(state.driving)],
    ['orderId', state.orderId || '—'],
    ['orderUpdateId', state.orderUpdateId !== undefined ? String(state.orderUpdateId) : '—'],
    ['agvPosition.x', pos ? pos.x.toFixed(3) : '—'],
    ['agvPosition.y', pos ? pos.y.toFixed(3) : '—'],
    ['agvPosition.theta (rad)', pos ? pos.theta.toFixed(3) : '—'],
    ['agvPosition.mapId', pos?.mapId ?? '—'],
    ['velocity.vx', vel?.vx?.toFixed(3) ?? '—'],
    ['velocity.omega', vel?.omega?.toFixed(3) ?? '—'],
    ['battery.charge', state.batteryState?.batteryCharge !== undefined
      ? `${Math.round(state.batteryState.batteryCharge)}%`
      : '—'],
    ['nodeStates', String(state.nodeStates?.length ?? 0) + ' remaining'],
    ['actionStates', String(state.actionStates?.length ?? 0)],
    ['errors', String(state.errors?.length ?? 0)],
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
