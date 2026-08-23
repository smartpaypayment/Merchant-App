import type { AxiosAdapter, AxiosHeaderValue, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { AxiosError } from 'axios';
import { MockHttpError, routes, type HandlerContext, type MockRoute } from './handlers';

/**
 * Axios transport that serves the App-PRD Section 9 contracts from memory.
 *
 * Installed as `adapter` on the shared client, which means the entire interceptor
 * chain (bearer injection, 401 → refresh-once → logout, error normalization) runs
 * against it unchanged. The app therefore exercises the same code path it will
 * use against a live backend; switching over is a config flag, not a refactor.
 *
 * Errors are rejected as real `AxiosError`s carrying our `{ code, message,
 * details }` body, so `normalizeError` handles them identically to server errors.
 */

/** Simulated round-trip latency, so loading states are actually visible. */
const LATENCY_MS = { min: 260, max: 620 } as const;

/** Endpoints that should feel slower (verification calls hit third parties). */
const SLOW_PATHS = ['/merchant/kyc', '/auth/otp/verify', '/merchant/kyc/aadhaar/verify'];

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function latencyFor(url: string): number {
  const base = LATENCY_MS.min + Math.random() * (LATENCY_MS.max - LATENCY_MS.min);
  return SLOW_PATHS.some((p) => url.startsWith(p)) ? base + 900 : base;
}

/* -------------------------------------------------------------------------- */
/* Routing                                                                    */
/* -------------------------------------------------------------------------- */

interface RouteMatch {
  route: MockRoute;
  params: Record<string, string>;
}

/** Matches a concrete path against a `/a/:b/c` template. */
function matchPath(template: string, actual: string): Record<string, string> | null {
  const templateParts = template.split('/').filter(Boolean);
  const actualParts = actual.split('/').filter(Boolean);
  if (templateParts.length !== actualParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < templateParts.length; i += 1) {
    const t = templateParts[i]!;
    const a = actualParts[i]!;
    if (t.startsWith(':')) params[t.slice(1)] = decodeURIComponent(a);
    else if (t !== a) return null;
  }
  return params;
}

function findRoute(method: string, path: string): RouteMatch | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    const params = matchPath(route.path, path);
    if (params) return { route, params };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Request parsing                                                            */
/* -------------------------------------------------------------------------- */

/** Strips the configured baseURL and splits off the query string. */
function extractPathAndQuery(config: InternalAxiosRequestConfig): {
  path: string;
  query: Record<string, string>;
} {
  const raw = config.url ?? '';
  const baseUrl = config.baseURL ?? '';
  let path = raw.startsWith(baseUrl) && baseUrl ? raw.slice(baseUrl.length) : raw;

  const query: Record<string, string> = {};

  const questionMark = path.indexOf('?');
  if (questionMark >= 0) {
    const search = path.slice(questionMark + 1);
    path = path.slice(0, questionMark);
    for (const pair of search.split('&')) {
      if (!pair) continue;
      const [key, value = ''] = pair.split('=');
      if (key) query[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  }

  // Axios `params` are not yet serialized into the URL at adapter time.
  const params = config.params as Record<string, unknown> | undefined;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) query[key] = String(value);
    }
  }

  return { path: path.startsWith('/') ? path : `/${path}`, query };
}

function parseBody(data: unknown): unknown {
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function flattenHeaders(config: InternalAxiosRequestConfig): Record<string, string> {
  const out: Record<string, string> = {};
  const source = config.headers as unknown as Record<string, AxiosHeaderValue> | undefined;
  if (!source) return out;
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== null && typeof value !== 'object') {
      out[key.toLowerCase()] = String(value);
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Adapter                                                                    */
/* -------------------------------------------------------------------------- */

export const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
  const method = (config.method ?? 'get').toUpperCase();
  const { path, query } = extractPathAndQuery(config);

  await delay(latencyFor(path));

  const match = findRoute(method, path);

  const respond = (status: number, data: unknown): AxiosResponse => ({
    data,
    status,
    statusText: status === 200 ? 'OK' : String(status),
    headers: {},
    config,
    request: { mock: true, path, method },
  });

  const fail = (status: number, data: unknown): never => {
    throw new AxiosError(
      `Mock request failed with status ${status}`,
      status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
      config,
      { mock: true },
      respond(status, data),
    );
  };

  if (!match) {
    return fail(404, { code: 'not_found', message: `No mock handler for ${method} ${path}` });
  }

  const context: HandlerContext = {
    params: match.params,
    query,
    body: parseBody(config.data),
    headers: flattenHeaders(config),
  };

  try {
    const data = match.route.handler(context);
    return respond(match.route.status ?? 200, data);
  } catch (error) {
    if (error instanceof MockHttpError) {
      return fail(error.status, {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }
    // A genuine bug inside a handler — surface it as a 500 rather than hanging.
    return fail(500, {
      code: 'server_error',
      message: error instanceof Error ? error.message : 'Mock handler crashed',
    });
  }
};
