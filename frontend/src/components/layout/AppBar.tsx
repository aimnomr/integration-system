import { BRAND } from '@/branding/branding';
import { StatusPill, type PillState } from '@/components/common/StatusPill';
import { useMqttStatus } from '@/hooks/useMqttStatus';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import type { MqttStatus } from '@/realtime/mqttClient';
import type { ServiceStatus } from '@/types/api';

function mqttToPill(s: MqttStatus): PillState {
  if (s === 'connected') return 'ok';
  if (s === 'connecting' || s === 'reconnecting') return 'warn';
  return 'error';
}

function serviceToPill(s: ServiceStatus | undefined): PillState {
  if (!s || s === 'unknown') return 'idle';
  if (s === 'connected') return 'ok';
  return 'error';
}

export function AppBar() {
  const mqtt = useMqttStatus();
  const sys = useSystemStatus();

  const apiState: PillState = sys.isError ? 'error' : sys.isSuccess ? 'ok' : 'idle';
  const mqttState = mqttToPill(mqtt);
  const dbState = serviceToPill(sys.data?.database.status);
  const rosState = serviceToPill(sys.data?.roslib.status);

  return (
    <header
      className="flex items-center gap-3 border-b border-surface-2 bg-surface-1 px-4"
      style={{ height: BRAND.appBarHeight }}
    >
      <img src={BRAND.logoPath} alt="" className="h-7 w-7" />
      <span className="text-base font-semibold tracking-tight">
        {BRAND.appName}
      </span>

      <div className="ml-6 flex items-center gap-2">
        <StatusPill
          state={apiState}
          label="API"
          title={
            sys.isError
              ? `FastAPI unreachable: ${sys.error?.message ?? 'error'}`
              : sys.isSuccess
                ? 'FastAPI responding'
                : 'Awaiting first /system/status response'
          }
        />
        <StatusPill
          state={mqttState}
          label="MQTT"
          title={`Mosquitto WebSocket: ${mqtt}`}
        />
        <StatusPill
          state={dbState}
          label="DB"
          title={`PostgreSQL: ${sys.data?.database.status ?? 'unknown'}`}
        />
        <StatusPill
          state={rosState}
          label="ROS"
          title={`rosbridge (via backend MQTT): ${sys.data?.roslib.status ?? 'unknown'}`}
        />
      </div>

      <div className="ml-auto text-xs text-slate-400">
        {/* Reserved for fleet selector + user menu. */}
      </div>
    </header>
  );
}
