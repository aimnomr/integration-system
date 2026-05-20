import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getRobotState } from '@/api/robots';
import { mqttBus } from '@/realtime/mqttClient';
import { vdaTopic } from '@/helper/mqttTopics';
import type { FleetResponse, VdaConnection, VdaState } from '@/types/api';

/**
 * Cold-load the most recent VDA5050 state from REST, then live-update from
 * the MQTT `state` topic. Connection state mirrors the retained `connection`
 * topic. `lastSeen` is the timestamp of the latest update (state or
 * connection) so the UI can show an "Nx s ago" pill.
 */
export function useRobotState(
  fleet: FleetResponse | undefined,
  serial: string | undefined,
): {
  state: VdaState | null;
  connection: VdaConnection | null;
  lastSeen: number | null;
  isLoading: boolean;
} {
  const cold = useQuery({
    queryKey: ['robotState', serial],
    queryFn: ({ signal }) => getRobotState(serial!, signal),
    enabled: Boolean(serial),
    retry: 0,
  });

  const [state, setState] = useState<VdaState | null>(null);
  const [connection, setConnection] = useState<VdaConnection | null>(null);
  const [lastSeen, setLastSeen] = useState<number | null>(null);

  // Seed from REST. The MQTT side will overwrite as soon as a fresh message
  // lands, but the cold value avoids an empty UI on first paint.
  useEffect(() => {
    if (cold.data) {
      setState(cold.data);
      setLastSeen(Date.now());
    }
  }, [cold.data]);

  // Subscribe to live state + connection for this robot.
  useEffect(() => {
    if (!fleet || !serial) return;
    const stateTopic = vdaTopic(fleet, serial, 'state');
    const connTopic = vdaTopic(fleet, serial, 'connection');

    const offState = mqttBus.subscribe<VdaState>(stateTopic, (m) => {
      setState(m);
      setLastSeen(Date.now());
    });
    const offConn = mqttBus.subscribe<VdaConnection>(connTopic, (m) => {
      setConnection(m);
      setLastSeen(Date.now());
    });
    return () => { offState(); offConn(); };
  }, [fleet, serial]);

  return { state, connection, lastSeen, isLoading: cold.isLoading };
}
