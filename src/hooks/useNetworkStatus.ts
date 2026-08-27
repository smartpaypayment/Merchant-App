import { useEffect, useState } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

export interface NetworkStatus {
  isOnline: boolean;
  /** True when connected but the internet is unreachable (captive portal, dead 2G). */
  isInternetUnreachable: boolean;
  type: NetInfoState['type'] | 'unknown';
}

/**
 * Connectivity for the Section 11 offline strategy.
 *
 * `isOnline` intentionally treats `isInternetReachable === null` as online:
 * NetInfo reports `null` while the reachability probe is still in flight, and
 * showing an offline banner during that window produces a false-positive flash
 * on every cold start.
 *
 * A single NetInfo subscription is shared by all consumers via the module-level
 * listener set, so mounting the banner plus several screens does not create
 * multiple native listeners.
 */
let currentStatus: NetworkStatus = { isOnline: true, isInternetUnreachable: false, type: 'unknown' };
const listeners = new Set<(status: NetworkStatus) => void>();
let unsubscribeNetInfo: (() => void) | null = null;

function toStatus(state: NetInfoState): NetworkStatus {
  const reachable = state.isInternetReachable;
  return {
    isOnline: !!state.isConnected && reachable !== false,
    isInternetUnreachable: !!state.isConnected && reachable === false,
    type: state.type,
  };
}

function ensureSubscription(): void {
  if (unsubscribeNetInfo) return;
  unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    currentStatus = toStatus(state);
    listeners.forEach((listener) => listener(currentStatus));
  });
}

/**
 * Imperative subscription to the shared status.
 *
 * Exported so non-React consumers — notably the React Query `onlineManager`
 * bridge in `queryLifecycle.ts` — observe connectivity through the *same*
 * singleton and the same `isOnline` definition as the UI. If the bridge computed
 * "online" differently, React Query could pause a query while `OfflineBanner`
 * insisted the connection was fine, which is the sort of disagreement that is
 * very hard to debug from a bug report.
 *
 * The listener is invoked immediately with the current value, so a subscriber
 * never has to wait for the first change event to learn where it stands.
 */
export function subscribeToNetworkStatus(
  listener: (status: NetworkStatus) => void,
): () => void {
  ensureSubscription();
  listeners.add(listener);
  listener(currentStatus);

  // Pull the current value once in case the shared subscription was established
  // before this subscriber existed.
  NetInfo.fetch()
    .then((state) => {
      currentStatus = toStatus(state);
      listeners.forEach((l) => l(currentStatus));
    })
    .catch(() => {
      /* Keep the optimistic default. */
    });

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      unsubscribeNetInfo?.();
      unsubscribeNetInfo = null;
    }
  };
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(currentStatus);
  useEffect(() => subscribeToNetworkStatus(setStatus), []);
  return status;
}

/** Non-reactive read, for imperative guards before firing a mutation. */
export const getNetworkStatus = (): NetworkStatus => currentStatus;
