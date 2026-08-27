import { AppState, type AppStateStatus } from 'react-native';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { subscribeToNetworkStatus } from '@hooks/useNetworkStatus';

/**
 * Teaches React Query what "online" and "focused" mean on React Native.
 *
 * ## Why this file has to exist
 *
 * React Query's default online detection reads `navigator.onLine` and listens for
 * browser `online`/`offline` events. Neither exists meaningfully in React Native,
 * so out of the box the library believes it is **permanently online**. Two
 * consequences, both of which the app was silently living with:
 *
 *   1. `refetchOnReconnect: true` never fired, because a reconnect was never
 *      observed. A merchant who walked back into signal saw stale figures until
 *      something else happened to invalidate the cache.
 *   2. Retries burned their full backoff schedule against a dead radio instead of
 *      waiting for connectivity to come back.
 *
 * Both are fixed by pointing `onlineManager` at NetInfo — via
 * `subscribeToNetworkStatus`, so this shares the single native listener and the
 * exact `isOnline` definition the `OfflineBanner` uses.
 *
 * ## Focus is observed, but focus-refetching stays off
 *
 * `focusManager` is wired for correctness — without it React Query's notion of
 * focus is also meaningless here. The global `refetchOnWindowFocus` stays
 * `false` on purpose: `usePaymentStatus` already re-polls a live QR the moment
 * the app returns to the foreground, and a second, framework-driven refetch of
 * the same query would race it. Individual queries can now opt in per-query if
 * they want it, which they could not before.
 */
export function installQueryLifecycleBridge(): void {
  onlineManager.setEventListener((setOnline) =>
    subscribeToNetworkStatus((status) => setOnline(status.isOnline)),
  );

  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      handleFocus(state === 'active');
    });
    return () => subscription.remove();
  });
}
