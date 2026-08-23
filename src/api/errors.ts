import axios, { AxiosError } from 'axios';
import type { ApiErrorCode, ApiErrorShape } from '@models/api';

/**
 * Normalized error surface.
 *
 * App-PRD Section 9: "Standard error shape: { code, message, details? } → map to
 * user-friendly localized messages."
 *
 * Every rejection that escapes the API layer is an `ApiError`, so UI code never
 * has to inspect `AxiosError` internals or worry about an undefined `response`.
 * The `code` maps 1:1 to an `errors.<code>` i18n key; `message` holds the raw
 * server text and is kept for logging only — never rendered.
 */
export class ApiError extends Error implements ApiErrorShape {
  readonly code: ApiErrorCode;
  readonly details?: Record<string, unknown>;
  readonly httpStatus?: number;
  /** True when retrying the same request could plausibly succeed. */
  readonly retryable: boolean;

  constructor(params: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
    httpStatus?: number;
    retryable?: boolean;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.code = params.code;
    if (params.details !== undefined) this.details = params.details;
    if (params.httpStatus !== undefined) this.httpStatus = params.httpStatus;
    this.retryable = params.retryable ?? false;
  }

  /** i18n key for the message shown to the merchant. */
  get i18nKey(): string {
    return `errors.${this.code}`;
  }
}

/** HTTP status → error code, used when the server sends no `code` of its own. */
function codeFromStatus(status: number): ApiErrorCode {
  if (status === 400 || status === 422) return 'validation_error';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  return 'unknown';
}

const RETRYABLE_CODES: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>([
  'network_error',
  'timeout',
  'offline',
  'server_error',
]);

function isApiErrorShape(value: unknown): value is ApiErrorShape {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiErrorShape).code === 'string' &&
    typeof (value as ApiErrorShape).message === 'string'
  );
}

/**
 * Collapses anything thrown by Axios (or by our mock adapter) into an `ApiError`.
 * Installed as the rejection handler on the response interceptor.
 */
export function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<unknown>;

    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      return new ApiError({ code: 'timeout', message: axiosError.message, retryable: true });
    }

    // No response at all → the request never reached a server.
    if (!axiosError.response) {
      return new ApiError({ code: 'network_error', message: axiosError.message, retryable: true });
    }

    const status = axiosError.response.status;
    const body = axiosError.response.data;

    // Preferred path: the backend already speaks our error shape.
    if (isApiErrorShape(body)) {
      return new ApiError({
        code: body.code,
        message: body.message,
        ...(body.details ? { details: body.details } : {}),
        httpStatus: status,
        retryable: RETRYABLE_CODES.has(body.code),
      });
    }

    const code = codeFromStatus(status);
    return new ApiError({
      code,
      message: typeof body === 'string' && body ? body : axiosError.message,
      httpStatus: status,
      retryable: RETRYABLE_CODES.has(code),
    });
  }

  if (error instanceof Error) {
    return new ApiError({ code: 'unknown', message: error.message });
  }

  return new ApiError({ code: 'unknown', message: String(error) });
}

/** Convenience factory for client-side failures (e.g. offline pre-check). */
export function apiError(code: ApiErrorCode, message = code): ApiError {
  return new ApiError({ code, message, retryable: RETRYABLE_CODES.has(code) });
}
