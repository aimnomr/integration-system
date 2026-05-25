import { Link } from 'react-router-dom';
import { StatusPill, type PillState } from '@/components/common/StatusPill';
import { useNow } from '@/hooks/useNow';
import { useRobotState } from '@/hooks/useRobotState';
import type { FleetResponse, FleetRobot, VdaConnection } from '@/types/api';

function connToPill(c: VdaConnection | null): PillState {
  if (!c) return 'idle';
  if (c.connectionState === 'ONLINE') return 'ok';
  if (c.connectionState === 'OFFLINE') return 'warn';
  return 'error';
}

function agoLabel(ts: number | null, now: number): string {
  if (ts === null) return '—';
  const sec = Math.max(0, Math.round((now - ts) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  return `${Math.round(sec / 3600)}h ago`;
}

export function RobotTile({
  fleet,
  robot,
}: {
  fleet: FleetResponse;
  robot: FleetRobot;
}) {
  const { state, connection, lastSeen } = useRobotState(fleet, robot.serialNumber);
  // G26 — keep the "Xs ago" label live between MQTT messages. A single shared
  // ticker subscription (see `useNow`) replaces the per-tile setInterval.
  const now = useNow();

  const battery = state?.batteryState?.batteryCharge;
  const orderId = state?.orderId || '—';
  const mode = state?.operatingMode || '—';

  return (
    <Link
      to={`/robots/${encodeURIComponent(robot.serialNumber)}`}
      className="block rounded-lg border border-surface-2 bg-surface-1 p-4 will-change-transform hover:border-brand-primary active:scale-[0.99]"
      style={{
        transition:
          'border-color var(--dur-hover) var(--ease-out),' +
          'transform var(--dur-press) var(--ease-out)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold text-white">{robot.serialNumber}</div>
        <StatusPill
          state={connToPill(connection)}
          label={connection?.connectionState ?? 'idle'}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <Field label="Mode"      value={mode} />
        <Field label="Battery"   value={battery !== undefined ? `${Math.round(battery)}%` : '—'} />
        <Field label="Order"     value={orderId} mono />
        <Field label="Last seen" value={agoLabel(lastSeen, now)} />
      </div>
    </Link>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <span className="text-slate-500">{label}</span>
      <span className={mono ? 'text-right font-mono text-slate-300' : 'text-right text-slate-300'}>
        {value}
      </span>
    </>
  );
}
