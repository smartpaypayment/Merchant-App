import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@api/errors';

/**
 * Shared React Query client.
 *
 * Section 9: "Retries with backoff for idempotent GETs (via React Query)."
 * The retry predicate below only retries errors that could plausibly succeed on a
 * second attempt. Retrying a 400/422 would waste a round-trip and, worse, delay
 * the validation message the merchant needs to see.
 *
 * ## Why `networkMode: 'offlineFirst'` rather than the default
 *
 * Once `onlineManager` is correctly wired to NetInfo (see `queryLifecycle.ts`),
 * React Query's default `'online'` mode stops a query from firing at all while
 * offline and parks it in `fetchStatus: 'paused'`. That reads as
 * `isLoading === false`, `isError === false`, `data === undefined` — which every
 * list screen in this app interprets as **"empty"**. A merchant offline with a
 * cold cache would be told "No settlements yet" rather than "you are offline":
 * a wrong answer, and a far worse bug than the stale-data one being fixed.
 *
 * `'offlineFirst'` lets the first attempt run regardless, so a genuine failure
 * still lands as `network_error` and `ErrorState` renders its offline-flavoured
 * copy exactly as it does today. What changes is that *retries* now wait for
 * connectivity instead of burning backoff against a dead radio, and a reconnect
 * triggers a refetch.
 *
 * The same mode is set for mutations for a different reason: under `'online'` a
 * write fired while offline is **paused indefinitely**, which is an implicit
 * write queue. Section 11's stance — and the comment at the top of `StaffScreen`
 * — is that writes are blocked offline, never queued, because a queued
 * "remove this staff member" that lands hours later is a security problem. The UI
 * disables writes offline anyway; this makes the fallback fail fast and loudly
 * rather than hang in silence.
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
      // See `queryLifecycle.ts`: focus is now observable, but focus-refetching
      // stays off so it cannot race `usePaymentStatus`'s own foreground re-poll.
      refetchOnWindowFocus: false,
      networkMode: 'offlineFirst',
    },
    mutations: {
      // Writes are not automatically retried: a blind retry on a payment or
      // refund risks a duplicate financial action.
      retry: false,
      networkMode: 'offlineFirst',
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
  settlements: (status: string) => ['settlements', 'list', status] as const,
  settlement: (id: string) => ['settlements', id] as const,
  reports: (from: string, to: string) => ['reports', from, to] as const,
  notifications: ['notifications'] as const,
  staff: ['staff'] as const,
  tickets: ['support', 'tickets'] as const,
  paymentStatus: (ref: string) => ['payments', ref, 'status'] as const,
} as const;
