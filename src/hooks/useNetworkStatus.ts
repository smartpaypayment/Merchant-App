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

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(currentStatus);

  useEffect(() => {
    ensureSubscription();
    listeners.add(setStatus);

    // Pull the current value once on mount in case the shared subscription was
    // established before this component existed.
    NetInfo.fetch()
      .then((state) => {
        currentStatus = toStatus(state);
        setStatus(currentStatus);
      })
      .catch(() => {
        /* Keep the optimistic default. */
      });

    return () => {
      listeners.delete(setStatus);
      if (listeners.size === 0) {
        unsubscribeNetInfo?.();
        unsubscribeNetInfo = null;
      }
    };
  }, []);

  return status;
}

/** Non-reactive read, for imperative guards before firing a mutation. */
export const getNetworkStatus = (): NetworkStatus => currentStatus;
