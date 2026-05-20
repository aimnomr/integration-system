/**
 * Hand-written TypeScript view of the FastAPI responses we actually consume.
 *
 * Generated openapi-typescript output would be more exhaustive, but the
 * backend is at /openapi.json — running that generator requires the backend
 * to be alive. These interfaces are the contract we rely on for now; if a
 * response shape drifts, the offending hook will surface the type error.
 *
 * Naming follows the JSON wire format (camelCase for fleet/state, snake_case
 * for the CRUD bodies that map to columns) rather than re-mapping at the API
 * boundary.
 */

// --- /fleet ----------------------------------------------------------------

export interface FleetRobot {
  serialNumber: string;
  rosbridgeUrl: string;
  mapId: string;
}

export interface FleetResponse {
  interfaceName: string;
  majorVersion: string;
  version: string;
  manufacturer: string;
  robots: FleetRobot[];
}

// --- /robots ---------------------------------------------------------------

export interface Robot {
  serialNumber: string;
  mapId: string;
  rosbridgeUrl: string;
}

export interface OrderRequest {
  nodes: Array<{ x: number; y: number; theta: number }>;
}

export interface OrderResponse {
  status: 'ok';
  orderId: string;
  nodeCount: number;
}

export interface InstantActionResponse {
  status: 'ok';
  actionId?: string;
}

// --- /robots/{serial}/state (VDA5050 state) --------------------------------
// Keep loose — VDA5050 state has many optional fields, we type only what the
// UI actively reads.

export interface VdaState {
  serialNumber: string;
  timestamp: string;
  headerId?: number;
  orderId?: string;
  orderUpdateId?: number;
  driving?: boolean;
  operatingMode?: string;
  agvPosition?: {
    x: number;
    y: number;
    theta: number;
    mapId?: string;
    positionInitialized?: boolean;
  };
  velocity?: { vx?: number; vy?: number; omega?: number };
  nodeStates?: Array<{ nodeId: string; sequenceId: number; released: boolean }>;
  actionStates?: Array<{ actionId: string; actionType: string; actionStatus: string }>;
  errors?: Array<{ errorType: string; errorLevel?: string; errorDescription?: string }>;
  batteryState?: { batteryCharge?: number; charging?: boolean };
}

export interface VdaConnection {
  serialNumber: string;
  timestamp: string;
  headerId?: number;
  connectionState: 'ONLINE' | 'OFFLINE' | 'CONNECTIONBROKEN';
}

// --- /orders ---------------------------------------------------------------

export interface OrderHistoryRow {
  id: number;
  serial_number: string;
  ts: string;
  header_id: number;
  order_id: string;
  order_update_id: number;
  node_count: number;
}

export interface OrdersResponse {
  orders: OrderHistoryRow[];
  count: number;
}

// --- /system/status --------------------------------------------------------

export type ServiceStatus =
  | 'connected'
  | 'disconnected'
  | 'unavailable'
  | 'unknown';

export interface SystemStatus {
  timestamp: string;
  mosquitto: { status: ServiceStatus };
  database: { status: ServiceStatus };
  roslib: { status: ServiceStatus };
  node_red: { status: ServiceStatus };
}

// --- /maps -----------------------------------------------------------------

export interface MapRow {
  map_id: string;
  label: string;
}

// --- /locations ------------------------------------------------------------

export interface NamedLocation {
  id: number;
  map_id: string;
  label: string;
  x: number;
  y: number;
  theta: number;
}

// --- /oee ------------------------------------------------------------------

export interface OeeSummary {
  total_cycles: number;
  succeeded: number;
  failed: number;
  avg_duration_s: number;
}

export interface OeeCycle {
  id: number;
  serial_number: string;
  ts: string;
  order_id: string;
  start_time: string;
  end_time: string;
  duration_s: number;
  result: 'SUCCEEDED' | 'ABORTED';
}

export interface OeeAvailability {
  driving_samples: number;
  total_samples: number;
  availability: number;
}
