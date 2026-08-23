import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { env } from '@/config/env';
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from '@/store/secureStorage';
import type { RefreshResponse } from '@models/api';
import { ApiError, normalizeError } from './errors';
import { mockAdapter } from './mocks/mockAdapter';

/**
 * Axios instance + interceptor chain (App-PRD Section 9, "Networking rules").
 *
 *   - injects `Authorization: Bearer <token>`
 *   - on 401 → tries refresh **once** → else logs out
 *   - normalizes every error into `ApiError`
 *   - 15s default timeout
 *
 * When `env.useMockApi` is true the transport `adapter` is swapped for an
 * in-memory mock. The interceptors above still run unchanged, so auth injection
 * and error normalization are exercised in mock mode exactly as in production.
 */

/** Requests that must not carry a token / must not trigger a refresh loop. */
const AUTH_FREE_PATHS = ['/auth/otp/request', '/auth/otp/verify', '/auth/refresh'];

const isAuthFree = (url?: string): boolean =>
  !!url && AUTH_FREE_PATHS.some((path) => url.startsWith(path));

/** Marks a config that has already been retried after a refresh. */
interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Logout wiring                                                              */
/* -------------------------------------------------------------------------- */

type LogoutHandler = () => void;
let onUnauthorized: LogoutHandler | null = null;

/**
 * Registered by the auth store at startup. Kept as a callback rather than a
 * direct import so `client.ts` has no dependency on the store (which imports the
 * API modules) — that cycle would otherwise break Metro's module init order.
 */
export function setUnauthorizedHandler(handler: LogoutHandler | null): void {
  onUnauthorized = handler;
}

/* -------------------------------------------------------------------------- */
/* Instance                                                                   */
/* -------------------------------------------------------------------------- */

export const apiClient: AxiosInstance = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: env.requestTimeoutMs,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  ...(env.useMockApi ? { adapter: mockAdapter } : {}),
});

/* ------------------------------ Request ----------------------------------- */

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    if (!isAuthFree(config.url)) {
      const token = await getAccessToken();
      if (token) config.headers.set('Authorization', `Bearer ${token}`);
    }
    // Correlation id helps tie an app-side failure to a server trace.
    config.headers.set('X-Request-Id', `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
    return config;
  },
  (error) => Promise.reject(normalizeError(error)),
);

/* ------------------------------ Refresh ----------------------------------- */

/**
 * Single-flight refresh. If several requests 401 at once they all await the same
 * promise instead of firing N refresh calls (which a real backend would treat as
 * refresh-token reuse and reject).
 */
let refreshInFlight: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  try {
    // Bare instance: must not re-enter the interceptor chain.
    const response = await axios.request<RefreshResponse>({
      url: '/auth/refresh',
      method: 'POST',
      baseURL: env.apiBaseUrl,
      timeout: env.requestTimeoutMs,
      headers: { 'Content-Type': 'application/json' },
      data: { refreshToken },
      ...(env.useMockApi ? { adapter: mockAdapter } : {}),
    });

    await saveTokens({
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken,
    });
    return response.data.accessToken;
  } catch {
    return null;
  }
}

function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/* ------------------------------ Response ---------------------------------- */

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const normalized = normalizeError(error);

    if (!axios.isAxiosError(error)) return Promise.reject(normalized);

    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    const shouldAttemptRefresh =
      status === 401 && !!config && !config._retried && !isAuthFree(config.url);

    if (shouldAttemptRefresh) {
      config._retried = true;
      const newToken = await refreshAccessToken();

      if (newToken) {
        config.headers.set('Authorization', `Bearer ${newToken}`);
        return apiClient.request(config);
      }

      // Refresh failed (or no refresh token) → hard logout.
      await clearTokens();
      onUnauthorized?.();
      return Promise.reject(
        new ApiError({ code: 'unauthorized', message: 'Session expired', httpStatus: 401 }),
      );
    }

    return Promise.reject(normalized);
  },
);

/* -------------------------------------------------------------------------- */
/* Typed request helpers                                                      */
/* -------------------------------------------------------------------------- */

export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await apiClient.get<T>(url, config);
  return data;
}

export async function post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await apiClient.post<T>(url, body, config);
  return data;
}

export async function patch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await apiClient.patch<T>(url, body, config);
  return data;
}

export async function del<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await apiClient.delete<T>(url, config);
  return data;
}
