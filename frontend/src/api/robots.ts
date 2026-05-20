import { apiFetch } from './client';
import type {
  InstantActionResponse,
  OrderRequest,
  OrderResponse,
  Robot,
  VdaState,
} from '@/types/api';

export function getRobots() {
  return apiFetch<{ robots: Robot[] }>('/robots');
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
  return apiFetch<OrderResponse>(
    `/robots/${encodeURIComponent(serial)}/order/named`,
    { method: 'POST', body },
  );
}

type InstantAction = 'cancel' | 'retry' | 'skip';

export function postInstantAction(serial: string, action: InstantAction) {
  return apiFetch<InstantActionResponse>(
    `/robots/${encodeURIComponent(serial)}/instant-actions`,
    { method: 'POST', body: { action } },
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
