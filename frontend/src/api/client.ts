import { CONFIG } from '@/config';

/**
 * Minimal fetch wrapper for the FastAPI gateway. Handles:
 *   - Base URL from VITE_API_URL
 *   - Optional X-API-Key from VITE_API_KEY (flip later without changing callers)
 *   - JSON body + parse
 *   - HTTP errors → typed `ApiError`
 *
 * Per-router modules in this folder layer thin async functions on top of
 * `apiFetch` so React Query / components never touch a URL string directly.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Options['query']): string {
  const base = CONFIG.apiUrl.replace(/\/$/, '');
  const url = new URL(path.startsWith('/') ? path : `/${path}`, `${base}/`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.toString();
}

export async function apiFetch<T = unknown>(
  path: string,
  opts: Options = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (CONFIG.apiKey) headers['X-API-Key'] = CONFIG.apiKey;

  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  // 204 / 205 — no body to parse
  if (res.status === 204 || res.status === 205) {
    return undefined as T;
  }

  const contentType = res.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    throw new ApiError(formatErrorMessage(payload, res), res.status, payload);
  }
  return payload as T;
}

/**
 * Pull a human-readable message out of a FastAPI error body.
 *
 * FastAPI's `detail` can be:
 *  - A plain string (raised via `HTTPException(detail="…")`) — use as-is.
 *  - An array of validation errors (422 from a pydantic body) — each entry
 *    has `{loc: [...], msg: "...", type: "..."}`. Stringifying the array
 *    directly produced `"[object Object],[object Object]"` (G34's
 *    `[object Object]` toast). Format each entry as `loc.path: msg`.
 *  - A single validation-error object (rare) — same field shape.
 *  - Anything else — fall back to the HTTP status line.
 */
function formatErrorMessage(payload: unknown, res: Response): string {
  if (typeof payload === 'object' && payload && 'detail' in payload) {
    const detail = (payload as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail.map(formatValidationEntry).filter(Boolean).join('; ')
        || `${res.status} ${res.statusText}`;
    }
    if (typeof detail === 'object' && detail) {
      const single = formatValidationEntry(detail);
      if (single) return single;
    }
  }
  return `${res.status} ${res.statusText}`;
}

function formatValidationEntry(entry: unknown): string {
  if (typeof entry !== 'object' || !entry) return '';
  const e = entry as { loc?: unknown[]; msg?: unknown };
  const path = Array.isArray(e.loc)
    // Drop the leading "body" / "query" / "path" element FastAPI prefixes.
    ? e.loc.slice(1).map(String).join('.')
    : '';
  const msg = typeof e.msg === 'string' ? e.msg : '';
  return path && msg ? `${path}: ${msg}` : (msg || path);
}
