import { useEffect, useRef } from 'react';
import { acquireRosPublisher } from '@/realtime/rosbridgeClient';

/**
 * Acquire a publisher handle for the life of the component. Returns a
 * stable `publish(msg)` function. Returns a no-op if `url` is falsy.
 */
export function useRosPublisher<T = unknown>(
  url: string | null | undefined,
  topic: string,
  messageType: string,
): (msg: T) => void {
  const publishRef = useRef<((msg: T) => void) | null>(null);

  useEffect(() => {
    if (!url) {
      publishRef.current = null;
      return;
    }
    const handle = acquireRosPublisher<T>(url, topic, messageType);
    publishRef.current = handle.publish;
    return () => {
      publishRef.current = null;
      handle.release();
    };
  }, [url, topic, messageType]);

  return (msg) => publishRef.current?.(msg);
}
