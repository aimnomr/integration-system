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
