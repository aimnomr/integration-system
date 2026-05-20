/**
 * Typed view of the VITE_* env vars. Vite inlines these at build time, but the
 * shape is opaque to consumers — this module makes the surface explicit and
 * single-import.
 */
function envString(key: string, fallback: string): string {
  const raw = (import.meta.env[key] as string | undefined)?.trim();
  return raw && raw.length > 0 ? raw : fallback;
}

export const CONFIG = {
  apiUrl: envString('VITE_API_URL', 'http://localhost:8000'),
  mqttWsUrl: envString('VITE_MQTT_WS_URL', 'ws://localhost:9001'),
  apiKey: envString('VITE_API_KEY', ''),
} as const;
