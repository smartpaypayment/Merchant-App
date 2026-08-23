import Constants from 'expo-constants';

interface AppExtra {
  apiBaseUrl: string;
  useMockApi: boolean;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Partial<AppExtra>;

/**
 * Runtime configuration.
 *
 * `useMockApi` swaps the Axios transport for an in-memory mock adapter that
 * implements the contracts in App-PRD Section 9. The interceptor chain (auth
 * injection, 401 refresh, error normalization) runs identically either way, so
 * flipping this to `false` is the only change needed to hit a live backend.
 */
export const env = {
  apiBaseUrl: extra.apiBaseUrl ?? 'https://api.merchantone.in/v1',
  useMockApi: extra.useMockApi ?? true,
  /** Section 9: "Timeouts: 15s default." */
  requestTimeoutMs: 15_000,
  /** Section 6.6 / 10: dynamic-QR status poll cadence. */
  paymentPollIntervalMs: 2_500,
  /** Section 6.6: dynamic QR lifetime before it is treated as expired. */
  dynamicQrTtlMs: 5 * 60 * 1000,
} as const;
