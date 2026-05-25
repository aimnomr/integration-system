import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useFleet } from '@/hooks/useFleet';
import { useRobotState } from '@/hooks/useRobotState';
import { Loading } from '@/components/common/Loading';
import { MapCanvas } from '@/components/map/MapCanvas';
import { StateTable } from '@/components/robot/StateTable';
import { ErrorList } from '@/components/robot/ErrorList';
import { StatusPill, type PillState } from '@/components/common/StatusPill';
import { useQuery } from '@tanstack/react-query';
import { listLocations } from '@/api/locations';

type Tab = 'state' | 'errors' | 'actions';

export default function RobotDetail() {
  const { serial } = useParams<{ serial: string }>();
  const fleet = useFleet();
  const robot = useMemo(
    () => fleet.data?.robots.find((r) => r.serialNumber === serial) ?? null,
    [fleet.data, serial],
  );
  const { state, connection } = useRobotState(fleet.data, serial);
  const [tab, setTab] = useState<Tab>('state');

  // Pin the named locations on the robot's current map.
  const locations = useQuery({
    queryKey: ['locations'],
    queryFn: () => listLocations(),
    enabled: Boolean(robot),
  });
  const pins = useMemo(() => {
    const mapId = robot?.mapId;
    return (locations.data?.locations ?? [])
      .filter((l) => l.map_id === mapId)
      .map((l) => ({ x: l.x, y: l.y, label: l.label }));
  }, [locations.data, robot?.mapId]);

  if (fleet.isLoading) return <Loading label="Loading Fleet" />;
  if (!robot) {
    return (
      <div className="text-sm text-red-400">
        Robot <code>{serial}</code> is not in the fleet.
      </div>
    );
  }

  const connState: PillState =
    !connection ? 'idle'
      : connection.connectionState === 'ONLINE' ? 'ok'
        : connection.connectionState === 'OFFLINE' ? 'warn'
          : 'error';

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">{robot.serialNumber}</h1>
          <div className="text-xs text-slate-400">
            map <span className="font-mono">{robot.mapId}</span>
          </div>
        </div>
        <StatusPill state={connState} label={connection?.connectionState ?? 'idle'} />
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="h-[60vh] lg:h-auto">
          <MapCanvas rosbridgeUrl={robot.rosbridgeUrl} pins={pins} />
        </div>

        <aside className="flex h-full flex-col rounded-lg border border-surface-2 bg-surface-1">
          <div className="flex border-b border-surface-2">
            {(['state', 'errors', 'actions'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 px-3 py-2 text-xs uppercase tracking-widest ${
                  tab === t ? 'bg-surface-2/40 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t}
                {t === 'errors' && state?.errors && state.errors.length > 0 && (
                  <span className="ml-1 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-300">
                    {state.errors.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto p-4">
            {tab === 'state'  && <StateTable state={state} />}
            {tab === 'errors' && <ErrorList state={state} />}
            {tab === 'actions' && (
              <ul className="flex flex-col gap-1 font-mono text-xs">
                {(state?.actionStates ?? []).map((a) => (
                  <li key={a.actionId} className="flex justify-between rounded bg-surface-2/40 px-2 py-1">
                    <span className="text-slate-300">{a.actionType}</span>
                    <span className="text-slate-500">{a.actionStatus}</span>
                  </li>
                ))}
                {(state?.actionStates ?? []).length === 0 && (
                  <p className="text-sm text-slate-500">No actions in flight.</p>
                )}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
