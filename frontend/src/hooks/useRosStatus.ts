import { useEffect, useState } from 'react';
import { onRosStatus, type RosStatus } from '@/realtime/rosbridgeClient';

/** Track rosbridge connection status for one robot URL. Returns 'offline' if
 * `url` is null (e.g. fleet not loaded yet). */
export function useRosStatus(url: string | null | undefined): RosStatus {
  const [status, setStatus] = useState<RosStatus>('offline');
  useEffect(() => {
    if (!url) return;
    return onRosStatus(url, setStatus);
  }, [url]);
  return status;
}
