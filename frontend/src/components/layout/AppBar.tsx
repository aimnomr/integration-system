import { Tooltip } from '@mui/material';
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
  // G25 — when /system/status fails, sys.data retains its last successful
  // body, which would leave DB / ROS showing green even though we can't
  // actually tell. Degrade them to idle so the operator sees "unknown",
  // not stale green.
  const dbState = sys.isError ? 'idle' : serviceToPill(sys.data?.database.status);
  const rosState = sys.isError ? 'idle' : serviceToPill(sys.data?.roslib.status);

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
        <PillWithTooltip
          state={apiState}
          label="API"
          tooltip={
            sys.isError
              ? `FastAPI unreachable: ${sys.error?.message ?? 'error'}`
              : sys.isSuccess
                ? 'FastAPI responding'
                : 'Awaiting first /system/status response'
          }
        />
        <PillWithTooltip
          state={mqttState}
          label="MQTT"
          tooltip={`Mosquitto WebSocket: ${mqtt}`}
        />
        <PillWithTooltip
          state={dbState}
          label="DB"
          tooltip={
            sys.isError
              ? 'PostgreSQL: unknown (API unreachable)'
              : `PostgreSQL: ${sys.data?.database.status ?? 'unknown'}`
          }
        />
        <PillWithTooltip
          state={rosState}
          label="ROS"
          tooltip={
            sys.isError
              ? 'rosbridge: unknown (API unreachable)'
              : `rosbridge (via backend MQTT): ${sys.data?.roslib.status ?? 'unknown'}`
          }
        />
      </div>
    </header>
  );
}

function PillWithTooltip({
  state, label, tooltip,
}: { state: PillState; label: string; tooltip: string }) {
  return (
    <Tooltip
      title={tooltip}
      enterDelay={150}
      enterNextDelay={0}
      leaveDelay={0}
      arrow
    >
      {/* Tooltip needs a focusable child; the pill is a <span>, so wrap in a span with tabIndex for keyboard reachability. */}
      <span tabIndex={0} className="rounded-full focus:outline-none">
        <StatusPill state={state} label={label} />
      </span>
    </Tooltip>
  );
}
