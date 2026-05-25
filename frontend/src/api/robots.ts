import { apiFetch } from './client';
import type {
  InstantActionResponse,
  OrderRequest,
  OrderResponse,
  Robot,
  VdaState,
} from '@/types/api';

export function getRobots(opts: { includeArchived?: boolean } = {}) {
  const q = opts.includeArchived ? '?include_archived=true' : '';
  return apiFetch<{ robots: Robot[] }>(`/robots${q}`);
}

export function getRobot(serial: string) {
  return apiFetch<Robot>(`/robots/${encodeURIComponent(serial)}`);
}

export function getRobotState(serial: string, signal?: AbortSignal) {
  return apiFetch<VdaState>(
    `/robots/${encodeURIComponent(serial)}/state`,
    { signal },
  );
}

export function postOrder(serial: string, body: OrderRequest) {
  return apiFetch<OrderResponse>(
    `/robots/${encodeURIComponent(serial)}/order`,
    { method: 'POST', body },
  );
}

export interface NamedOrderRequest {
  locationIds: number[];
}

export function postNamedOrder(serial: string, body: NamedOrderRequest) {
  // FastAPI's NamedOrderRequest pydantic schema uses snake_case (`location_ids`).
  // The TS interface stays camelCase to match the rest of the codebase; we
  // translate here at the wire boundary.
  return apiFetch<OrderResponse>(
    `/robots/${encodeURIComponent(serial)}/order/named`,
    { method: 'POST', body: { location_ids: body.locationIds } },
  );
}

export type InstantAction = 'cancel' | 'retry' | 'skip';

// FastAPI's `InstantActionRequest` pydantic schema uses snake_case
// (`action_type`) and the full VDA5050 action names (`cancelOrder`,
// `retryNode`, `skipNode`). The TS API surface stays short + camelCase
// for callers; we translate at the wire boundary here (G34 — same
// shape of fix as G22 was for `postNamedOrder`).
const ACTION_TYPE: Record<InstantAction, 'cancelOrder' | 'retryNode' | 'skipNode'> = {
  cancel: 'cancelOrder',
  retry:  'retryNode',
  skip:   'skipNode',
};

export function postInstantAction(serial: string, action: InstantAction) {
  return apiFetch<InstantActionResponse>(
    `/robots/${encodeURIComponent(serial)}/instant-actions`,
    { method: 'POST', body: { action_type: ACTION_TYPE[action] } },
  );
}

// --- Admin CRUD (G15) ------------------------------------------------------

export interface RobotIn {
  serial_number: string;
  rosbridge_url: string;
  map_id: string;
}

export interface RobotUpdate {
  rosbridge_url?: string;
  map_id?: string;
}

export function createRobot(body: RobotIn) {
  return apiFetch<Robot>('/robots', { method: 'POST', body });
}

export function updateRobot(serial: string, body: RobotUpdate) {
  return apiFetch<Robot>(`/robots/${encodeURIComponent(serial)}`, {
    method: 'PUT', body,
  });
}

export function deleteRobot(serial: string) {
  return apiFetch<void>(`/robots/${encodeURIComponent(serial)}`, {
    method: 'DELETE',
  });
}

/** Soft-delete: hide the robot from operator surfaces and cut off ingest.
 * History rows are kept and the serial can be restored later. */
export function archiveRobot(serial: string) {
  return apiFetch<Robot>(`/robots/${encodeURIComponent(serial)}/archive`, {
    method: 'POST',
  });
}

/** Un-archive a previously archived robot. */
export function restoreRobot(serial: string) {
  return apiFetch<Robot>(`/robots/${encodeURIComponent(serial)}/restore`, {
    method: 'POST',
  });
}
