import { apiFetch } from './client';
import type { OrderDetail, OrdersResponse } from '@/types/api';

export interface ListOrdersQuery {
  serial?: string;
  limit?: number;
  before?: string;
  [key: string]: string | number | undefined;
}

export function listOrders(q: ListOrdersQuery = {}, signal?: AbortSignal) {
  return apiFetch<OrdersResponse>('/orders', { query: q, signal });
}

export function getOrder(orderId: string, signal?: AbortSignal) {
  return apiFetch<OrderDetail>(`/orders/${encodeURIComponent(orderId)}`, { signal });
}
