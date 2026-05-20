import ROSLIB from 'roslib';

/**
 * Per-robot rosbridge connections.
 *
 * The fleet definition (from FastAPI's GET /fleet) gives us one
 * `rosbridgeUrl` per robot. The browser opens a `ROSLIB.Ros` per URL lazily —
 * the first time someone calls `getRos(url)`. Connections are cached, so
 * repeat callers share one WebSocket.
 *
 * Status is broadcast per URL so the UI can show e.g. a green dot next to the
 * map for amr001 and a red dot for amr002 — independent of each other and of
 * the backend's own MQTT-derived `roslib` field in /system/status.
 *
 * Phase 2: connection + status only. Topic / publisher / action wrappers
 * land in Phase 3 (useRosTopic / useRosPublisher / useRosService hooks).
 */

export type RosStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

type StatusListener = (s: RosStatus) => void;

interface Connection {
  ros: ROSLIB.Ros;
  status: RosStatus;
  listeners: Set<StatusListener>;
  refCount: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectDelay: number;
}

const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

const cache = new Map<string, Connection>();

function open(url: string): Connection {
  const ros = new ROSLIB.Ros({ url });
  const conn: Connection = {
    ros,
    status: 'connecting',
    listeners: new Set(),
    refCount: 0,
    reconnectTimer: null,
    reconnectDelay: RECONNECT_INITIAL_MS,
  };

  ros.on('connection', () => {
    conn.reconnectDelay = RECONNECT_INITIAL_MS;
    setStatus(conn, 'connected');
  });
  ros.on('close', () => {
    setStatus(conn, 'offline');
    scheduleReconnect(url, conn);
  });
  ros.on('error', () => {
    setStatus(conn, 'offline');
    scheduleReconnect(url, conn);
  });

  return conn;
}

function setStatus(conn: Connection, s: RosStatus) {
  if (conn.status === s) return;
  conn.status = s;
  for (const l of conn.listeners) l(s);
}

function scheduleReconnect(url: string, conn: Connection) {
  if (conn.reconnectTimer || conn.refCount === 0) return;
  setStatus(conn, 'reconnecting');
  const delay = Math.min(conn.reconnectDelay, RECONNECT_MAX_MS);
  conn.reconnectTimer = setTimeout(() => {
    conn.reconnectTimer = null;
    conn.reconnectDelay = Math.min(conn.reconnectDelay * 2, RECONNECT_MAX_MS);
    try {
      conn.ros.connect(url);
    } catch {
      scheduleReconnect(url, conn);
    }
  }, delay);
}

/**
 * Get a `ROSLIB.Ros` instance for a robot. The connection is opened the first
 * time this is called for that URL and is shared by all callers thereafter.
 * Returns a `release()` callback — when the ref-count drops to 0 the
 * connection is closed.
 */
export function acquireRos(url: string): {
  ros: ROSLIB.Ros;
  release: () => void;
} {
  let conn = cache.get(url);
  if (!conn) {
    conn = open(url);
    cache.set(url, conn);
  }
  conn.refCount += 1;
  return {
    ros: conn.ros,
    release: () => releaseRos(url),
  };
}

function releaseRos(url: string) {
  const conn = cache.get(url);
  if (!conn) return;
  conn.refCount = Math.max(0, conn.refCount - 1);
  if (conn.refCount === 0) {
    if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer);
    try { conn.ros.close(); } catch { /* already closed */ }
    cache.delete(url);
  }
}

/**
 * Subscribe to rosbridge connection status for a URL. The connection is
 * opened on first listener if not already open.
 */
export function onRosStatus(url: string, listener: StatusListener): () => void {
  let conn = cache.get(url);
  if (!conn) {
    conn = open(url);
    cache.set(url, conn);
  }
  conn.refCount += 1;
  conn.listeners.add(listener);
  listener(conn.status);
  return () => {
    conn?.listeners.delete(listener);
    releaseRos(url);
  };
}

/** Current status for a URL without subscribing. Returns 'offline' if no
 * connection has ever been opened for that URL. */
export function getRosStatus(url: string): RosStatus {
  return cache.get(url)?.status ?? 'offline';
}
