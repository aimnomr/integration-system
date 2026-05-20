import { useEffect, useState } from 'react';
import { mqttBus } from '@/realtime/mqttClient';

/**
 * Subscribe to an MQTT topic (with `+`/`#` wildcards) for the life of the
 * component. Returns the most recently received payload, or `null` if none
 * yet. The full topic string is exposed alongside so wildcard subscriptions
 * can demultiplex by robot.
 */
export function useMqttTopic<T = unknown>(
  pattern: string | null,
): { payload: T | null; topic: string | null } {
  const [payload, setPayload] = useState<T | null>(null);
  const [topic, setTopic] = useState<string | null>(null);

  useEffect(() => {
    if (!pattern) return;
    const unsub = mqttBus.subscribe<T>(pattern, (p, t) => {
      setPayload(p);
      setTopic(t);
    });
    return unsub;
  }, [pattern]);

  return { payload, topic };
}
