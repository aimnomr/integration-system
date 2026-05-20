import { apiFetch } from './client';
import type { NamedLocation } from '@/types/api';

export function listLocations() {
  return apiFetch<{ locations: NamedLocation[] }>('/locations');
}

export function getLocation(id: number) {
  return apiFetch<NamedLocation>(`/locations/${id}`);
}

export function createLocation(body: NamedLocation) {
  return apiFetch<NamedLocation>('/locations', { method: 'POST', body });
}

export function updateLocation(id: number, body: Omit<NamedLocation, 'id'>) {
  return apiFetch<NamedLocation>(`/locations/${id}`, {
    method: 'PUT',
    body,
  });
}

export function deleteLocation(id: number) {
  return apiFetch<void>(`/locations/${id}`, { method: 'DELETE' });
}
