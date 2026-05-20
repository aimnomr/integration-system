import { apiFetch } from './client';
import type { MapRow } from '@/types/api';

export function listMaps() {
  return apiFetch<{ maps: MapRow[] }>('/maps');
}

export function getMap(id: string) {
  return apiFetch<MapRow>(`/maps/${encodeURIComponent(id)}`);
}

export function createMap(body: MapRow) {
  return apiFetch<MapRow>('/maps', { method: 'POST', body });
}

export function updateMap(id: string, body: { label: string }) {
  return apiFetch<MapRow>(`/maps/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body,
  });
}

export function deleteMap(id: string) {
  return apiFetch<void>(`/maps/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
