import { useEffect, useState } from 'react';
import { subscribeRosTopic } from '@/realtime/rosbridgeClient';

/**
 * Subscribe to a rosbridge topic for the life of the component. Returns the
 * latest message or `null` if none yet. Pass a falsy `url` (e.g. while fleet
 * loads) to skip subscribing.
 */
export function useRosTopic<T = unknown>(
  url: string | null | undefined,
  topic: string,
  messageType: string,
): T | null {
  const [msg, setMsg] = useState<T | null>(null);

  useEffect(() => {
    if (!url) return;
    setMsg(null); // clear stale data when URL/topic changes
    return subscribeRosTopic<T>(url, topic, messageType, setMsg);
  }, [url, topic, messageType]);

  return msg;
}
