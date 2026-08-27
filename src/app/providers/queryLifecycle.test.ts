import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { installQueryLifecycleBridge } from './queryLifecycle';
import { queryClient } from './queryClient';

/**
 * The React Query ↔ NetInfo bridge.
 *
 * Without it React Query reads `navigator.onLine`, which does not exist on React
 * Native, so it believed the app was permanently online — `refetchOnReconnect`
 * never fired and retries burned their backoff against a dead radio. These tests
 * assert the bridge actually moves `onlineManager`, and that it agrees with the
 * definition of "online" the offline banner uses.
 */

type NetListener = (state: NetInfoState) => void;

/**
 * Builds a NetInfo state.
 *
 * Loosely typed on purpose: `NetInfoState` is a discriminated union keyed on
 * `type`, so a `Partial<NetInfoState>` override cannot express "wifi but
 * disconnected" without the narrowing fighting the spread.
 */
const state = (over: Record<string, unknown>): NetInfoState =>
  ({ isConnected: true, isInternetReachable: true, type: 'wifi', ...over }) as unknown as NetInfoState;

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

let emit: NetListener;

beforeEach(async () => {
  (NetInfo.addEventListener as unknown as jest.Mock).mockImplementation((cb: NetListener) => {
    emit = cb;
    return jest.fn();
  });
  (NetInfo.fetch as unknown as jest.Mock).mockResolvedValue(state({}));

  installQueryLifecycleBridge();
  // Let the initial NetInfo.fetch() settle so it cannot race the assertions.
  await flush();
});

describe('onlineManager follows NetInfo', () => {
  it('reports online for a reachable connection', async () => {
    emit(state({ isConnected: true, isInternetReachable: true }));
    await flush();
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('reports offline when disconnected', async () => {
    emit(state({ isConnected: false, isInternetReachable: false, type: 'none' }));
    await flush();
    expect(onlineManager.isOnline()).toBe(false);
  });

  it('reports offline for a connection with no internet (captive portal, dead 2G)', async () => {
    emit(state({ isConnected: true, isInternetReachable: false }));
    await flush();
    expect(onlineManager.isOnline()).toBe(false);
  });

  it('treats an in-flight reachability probe as online, matching the banner', async () => {
    // NetInfo reports null while probing. Calling that "offline" would flash an
    // offline banner on every cold start, so the hook and the bridge both treat it
    // as online — and they must not disagree, or React Query would pause queries
    // while the UI insisted the connection was fine.
    emit(state({ isConnected: true, isInternetReachable: null }));
    await flush();
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('tracks a reconnect after going offline', async () => {
    emit(state({ isConnected: false, isInternetReachable: false, type: 'none' }));
    await flush();
    expect(onlineManager.isOnline()).toBe(false);

    emit(state({ isConnected: true, isInternetReachable: true, type: 'cellular' }));
    await flush();
    // This transition is what makes `refetchOnReconnect` fire at all.
    expect(onlineManager.isOnline()).toBe(true);
  });
});

describe('query client network mode', () => {
  it('uses offlineFirst for queries', () => {
    // Not cosmetic. Under the default 'online' mode a query with no cached data
    // parks in fetchStatus 'paused', which reads as isLoading=false / isError=false
    // / data=undefined — and every list screen in this app renders that as "empty".
    // An offline merchant would be told "No settlements yet".
    expect(queryClient.getDefaultOptions().queries?.networkMode).toBe('offlineFirst');
  });

  it('uses offlineFirst for mutations, so writes fail fast instead of queueing', () => {
    // Under 'online' an offline mutation is paused indefinitely, which is an
    // implicit write queue. A deferred "remove this staff member" landing hours
    // later is a security problem, so writes must fail loudly instead.
    expect(queryClient.getDefaultOptions().mutations?.networkMode).toBe('offlineFirst');
  });

  it('still does not auto-retry mutations', () => {
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false);
  });
});
