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
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-surface-2 py-3 last:border-0">
      <div>
        <div className="font-medium text-white">{label}</div>
        {detail && <div className="text-xs text-slate-400">{detail}</div>}
      </div>
      <StatusPill state={state} label={state} />
    </div>
  );
}

export default function Health() {
  const sys = useSystemStatus();
  const mqtt = useMqttStatus();
  const apiDown = sys.isError;
  const apiDownDetail = apiDown ? 'API unreachable' : undefined;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-white">System Health</h1>
      <p className="mt-1 text-sm text-slate-400">Polled every 5 seconds.</p>

      <div className="mt-6 rounded-lg border border-surface-2 bg-surface-1 px-5">
        <ServiceRow
          label="FastAPI"
          state={apiDown ? 'error' : sys.isSuccess ? 'ok' : 'idle'}
          detail={
            apiDown
              ? sys.error?.message
              : sys.isSuccess
                ? `Last response ${new Date(sys.data.timestamp).toLocaleTimeString()}`
                : 'Awaiting first response'
          }
        />
        <ServiceRow
          label="MQTT (browser)"
          state={
            mqtt === 'connected' ? 'ok'
              : mqtt === 'connecting' || mqtt === 'reconnecting' ? 'warn'
                : 'error'
          }
          detail={mqtt}
        />
        <ServiceRow
          label="MQTT (backend)"
          state={pillGated(sys.data?.mosquitto.status, apiDown)}
          detail={apiDownDetail}
        />
        <ServiceRow
          label="PostgreSQL"
          state={pillGated(sys.data?.database.status, apiDown)}
          detail={apiDownDetail}
        />
        <ServiceRow
          label="rosbridge fleet"
          state={pillGated(sys.data?.roslib.status, apiDown)}
          detail={apiDownDetail}
        />
        <ServiceRow
          label="Node-RED"
          state={pillGated(sys.data?.node_red.status, apiDown)}
          detail={apiDownDetail}
        />
      </div>
    </div>
  );
}
