import { apiFetch } from './client';
import type { OrdersResponse } from '@/types/api';

export interface ListOrdersQuery {
  serial?: string;
  limit?: number;
  before?: string;
  [key: string]: string | number | undefined;
}

export function listOrders(q: ListOrdersQuery = {}, signal?: AbortSignal) {
  return apiFetch<OrdersResponse>('/orders', { query: q, signal });
}
