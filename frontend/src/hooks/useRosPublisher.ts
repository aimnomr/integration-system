import { useCallback, useEffect, useRef } from 'react';
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

  // Stable identity across renders — otherwise consumers that depend on
  // `publish` (e.g. KeyboardPad's repeat interval) tear down on every render,
  // killing the held-key command stream after a single tick.
  return useCallback((msg: T) => publishRef.current?.(msg), []);
}
