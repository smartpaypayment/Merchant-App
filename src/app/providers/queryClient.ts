import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@api/errors';

/**
 * Shared React Query client.
 *
 * Section 9: "Retries with backoff for idempotent GETs (via React Query)."
 * The retry predicate below only retries errors that could plausibly succeed on a
 * second attempt. Retrying a 400/422 would waste a round-trip and, worse, delay
 * the validation message the merchant needs to see.
 */
const MAX_RETRIES = 3;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cached data stays usable for a minute; long enough to make tab switches
      // instant, short enough that a returning merchant sees fresh figures.
      staleTime: 60_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: (failureCount, error) => {
        if (failureCount >= MAX_RETRIES) return false;
        if (error instanceof ApiError) return error.retryable;
        return false;
      },
      // Exponential backoff, capped so a slow 2G connection is not punished
      // with a 30s wait (Section 5.7: works on 2G/3G).
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Writes are not automatically retried: a blind retry on a payment or
      // refund risks a duplicate financial action.
      retry: false,
    },
  },
});

/** Query key factory — keeps cache keys consistent and greppable. */
export const queryKeys = {
  merchant: ['merchant'] as const,
  dashboard: ['dashboard', 'summary'] as const,
  staticQr: ['merchant', 'qr', 'static'] as const,
  transactions: (filter: string, search: string) => ['transactions', filter, search] as const,
  transaction: (id: string) => ['transactions', id] as const,
  settlements: (status: string) => ['settlements', status] as const,
  settlement: (id: string) => ['settlements', id] as const,
  reports: (from: string, to: string) => ['reports', from, to] as const,
  notifications: ['notifications'] as const,
  staff: ['staff'] as const,
  tickets: ['support', 'tickets'] as const,
  paymentStatus: (ref: string) => ['payments', ref, 'status'] as const,
} as const;
