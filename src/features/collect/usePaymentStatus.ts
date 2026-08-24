import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { paymentsApi } from '@api/index';
import { env } from '@/config/env';
import type { PaymentStatusResponse } from '@models/api';
import type { Transaction } from '@models/index';

export type PaymentWatchState = 'waiting' | 'success' | 'expired' | 'failed' | 'error';

export interface PaymentWatchResult {
  state: PaymentWatchState;
  transaction: Transaction | null;
  /** Consecutive poll failures; surfaced so the UI can warn without giving up. */
  consecutiveErrors: number;
}

/**
 * Watches a pending payment reference until it resolves.
 *
 * Implements the Section 10 strategy:
 *   1. Poll `GET /payments/{ref}/status` every 2-3s while the QR is on screen.
 *   2. Stop on success, expiry, or unmount.
 *   3. Deduplicate terminal events by ref, so a late poll landing after a push
 *      (or a duplicate push) cannot re-fire the success handler.
 *
 * Notes on the choices here:
 *
 * - **Not React Query.** `refetchInterval` would work, but this needs to stop
 *   dead on the first terminal response and must not be revived by a cache
 *   remount or a window-focus refetch. An explicit loop is easier to reason about
 *   for something that triggers an audible announcement exactly once.
 *
 * - **Polling pauses in the background.** Android throttles timers for
 *   backgrounded apps anyway, and the merchant switching away means the QR is not
 *   visible. On return we poll immediately rather than waiting out the interval,
 *   so a payment completed while away is picked up at once.
 *
 * - **Poll errors do not end the watch.** A merchant on flaky 2G will drop
 *   requests; giving up would strand a QR that may already have been paid. The
 *   error count is exposed so the UI can say "still checking" instead.
 *
 * When FCM is wired up, the push handler calls `notifyPaymentEvent(ref)` to
 * short-circuit the wait; the dedupe guard makes the two paths safe together.
 */

/**
 * Refs already resolved, so a duplicate event is ignored (Section 10, item 4).
 *
 * Bounded: a busy merchant can settle hundreds of refs a day and this module
 * lives for the whole app session, so an unbounded set would be a slow leak on
 * the 2GB devices in Section 2. Only recent refs can plausibly receive a
 * duplicate event, so evicting the oldest is safe.
 */
const MAX_TRACKED_REFS = 200;
const settledRefs = new Set<string>();

function markSettled(ref: string): void {
  settledRefs.add(ref);
  if (settledRefs.size > MAX_TRACKED_REFS) {
    // Sets iterate in insertion order, so the first key is the oldest.
    const oldest = settledRefs.values().next().value;
    if (oldest !== undefined) settledRefs.delete(oldest);
  }
}

/** Push-notification bridge: marks a ref as needing an immediate re-poll. */
const pushSignals = new Set<string>();

/**
 * Called by the FCM handler on a `payment_received` push. Causes any active watch
 * on this ref to poll immediately instead of waiting for the next tick.
 */
export function notifyPaymentEvent(ref: string): void {
  pushSignals.add(ref);
}

export function usePaymentStatus(
  ref: string | null,
  options: { expiresAt?: string; enabled?: boolean } = {},
): PaymentWatchResult {
  const { expiresAt, enabled = true } = options;

  const [state, setState] = useState<PaymentWatchState>('waiting');
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);

  // Held in a ref so the polling loop reads the current value without being
  // torn down and rebuilt on every state change.
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!ref || !enabled) return;

    // A remount for an already-settled ref must not re-announce.
    if (settledRefs.has(ref)) return;

    stoppedRef.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let appStateSub: { remove: () => void } | null = null;
    let isForeground = AppState.currentState === 'active';

    const settle = (next: Exclude<PaymentWatchState, 'waiting'>, txn?: Transaction) => {
      if (stoppedRef.current) return;
      stoppedRef.current = true;
      markSettled(ref);
      pushSignals.delete(ref);
      if (txn) setTransaction(txn);
      setState(next);
    };

    const applyResponse = (response: PaymentStatusResponse) => {
      setConsecutiveErrors(0);

      switch (response.status) {
        case 'success':
          settle('success', response.transaction);
          return true;
        case 'failed':
          settle('failed');
          return true;
        case 'expired':
          settle('expired');
          return true;
        default:
          return false;
      }
    };

    const poll = async (): Promise<void> => {
      if (stoppedRef.current) return;

      // Client-side expiry guard: if the deadline has passed, stop without
      // spending another request.
      if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
        settle('expired');
        return;
      }

      try {
        const response = await paymentsApi.getPaymentStatus(ref);
        if (applyResponse(response)) return;
      } catch {
        setConsecutiveErrors((count) => count + 1);
      }

      schedule();
    };

    const schedule = () => {
      if (stoppedRef.current) return;
      // Skip ticks while backgrounded; the AppState listener resumes us.
      const delay = isForeground ? env.paymentPollIntervalMs : env.paymentPollIntervalMs * 4;
      timer = setTimeout(() => void poll(), delay);
    };

    const handleAppStateChange = (status: AppStateStatus) => {
      const wasForeground = isForeground;
      isForeground = status === 'active';

      // Returning to the app is the most likely moment for a completed payment,
      // so poll straight away rather than waiting out the interval.
      if (!wasForeground && isForeground && !stoppedRef.current) {
        if (timer) clearTimeout(timer);
        void poll();
      }
    };

    appStateSub = AppState.addEventListener('change', handleAppStateChange);

    // Watch for a push arriving for this ref.
    const pushWatcher = setInterval(() => {
      if (pushSignals.has(ref) && !stoppedRef.current) {
        pushSignals.delete(ref);
        if (timer) clearTimeout(timer);
        void poll();
      }
    }, 500);

    void poll();

    return () => {
      // Section 10: "stop on success/expiry/screen exit".
      stoppedRef.current = true;
      if (timer) clearTimeout(timer);
      clearInterval(pushWatcher);
      appStateSub?.remove();
    };
  }, [ref, enabled, expiresAt]);

  return { state, transaction, consecutiveErrors };
}

/** Test/dev helper: clears the dedupe set so a ref can be watched again. */
export function resetPaymentWatchCache(): void {
  settledRefs.clear();
  pushSignals.clear();
}
