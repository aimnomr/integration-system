import { StatusPill, type PillState } from '@/components/common/StatusPill';
import { useMqttStatus } from '@/hooks/useMqttStatus';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import type { ServiceStatus } from '@/types/api';

function pill(s: ServiceStatus | undefined): PillState {
  if (!s || s === 'unknown') return 'idle';
  if (s === 'connected') return 'ok';
  return 'error';
}

// G25 — every row whose state is derived from /system/status must collapse
// to idle when the poll itself fails; otherwise sys.data retains its last
// successful body and the rows keep showing green even though we can't tell.
function pillGated(s: ServiceStatus | undefined, apiDown: boolean): PillState {
  return apiDown ? 'idle' : pill(s);
}

function ServiceRow({
  label,
  state,
  detail,
}: {
  label: string;
  state: PillState;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-surface-2 py-3 last:border-0">
      <div>
        <div className="font-medium text-white">{label}</div>
        <div className="text-xs text-slate-400">{detail}</div>
      </div>
      <StatusPill state={state} label={state} />
    </div>
  );
}

export default function Health() {
  const sys = useSystemStatus();
  const mqtt = useMqttStatus();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-white">System Health</h1>
      <p className="mt-1 text-sm text-slate-400">
        Polled every 5 s from <code>GET /system/status</code>. The MQTT row is
        the browser&apos;s own WebSocket; the others are reported by FastAPI.
      </p>

      <div className="mt-6 rounded-lg border border-surface-2 bg-surface-1 px-5">
        <ServiceRow
          label="FastAPI"
          state={sys.isError ? 'error' : sys.isSuccess ? 'ok' : 'idle'}
          detail={
            sys.isError
              ? `Unreachable — ${sys.error?.message ?? 'error'}`
              : sys.isSuccess
                ? `Last response at ${new Date(sys.data.timestamp).toLocaleTimeString()}`
                : 'Awaiting first response…'
          }
        />
        <ServiceRow
          label="MQTT (browser)"
          state={
            mqtt === 'connected' ? 'ok'
              : mqtt === 'connecting' || mqtt === 'reconnecting' ? 'warn'
                : 'error'
          }
          detail={`Browser WS to Mosquitto — ${mqtt}`}
        />
        <ServiceRow
          label="MQTT (backend)"
          state={pillGated(sys.data?.mosquitto.status, sys.isError)}
          detail={
            sys.isError
              ? 'Unknown — API unreachable'
              : "FastAPI's own MQTT client liveness"
          }
        />
        <ServiceRow
          label="PostgreSQL"
          state={pillGated(sys.data?.database.status, sys.isError)}
          detail={
            sys.isError
              ? 'Unknown — API unreachable'
              : "Reported by FastAPI's connection-pool ping"
          }
        />
        <ServiceRow
          label="rosbridge fleet"
          state={pillGated(sys.data?.roslib.status, sys.isError)}
          detail={
            sys.isError
              ? 'Unknown — API unreachable'
              : "Derived from the robots' retained VDA5050 connection topics"
          }
        />
        <ServiceRow
          label="Node-RED"
          state={pillGated(sys.data?.node_red.status, sys.isError)}
          detail={
            sys.isError ? 'Unknown — API unreachable' : 'HTTP probe of NODE_RED_URL'
          }
        />
      </div>
    </div>
  );
}
