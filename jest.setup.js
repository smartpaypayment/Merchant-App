/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Jest environment setup.
 *
 * Native modules with no JS implementation under Node are replaced with
 * in-memory equivalents so the API + store layers can be exercised directly.
 */

// expo-secure-store has no Node implementation; back it with a plain Map so the
// token round-trip in the auth flow behaves like the real Keystore.
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
    getItemAsync: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    setItemAsync: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key) => {
      store.delete(key);
    }),
  };
});

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    getItem: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    setItem: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    removeItem: jest.fn(async (key) => {
      store.delete(key);
    }),
    multiRemove: jest.fn(async (keys) => {
      keys.forEach((key) => store.delete(key));
    }),
    clear: jest.fn(async () => store.clear()),
  };
});

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true, type: 'wifi' })),
}));

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en', languageTag: 'en-IN', regionCode: 'IN' }],
}));

// `expo-constants` supplies the runtime config read by src/config/env.ts.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { apiBaseUrl: 'https://api.merchantone.test/v1', useMockApi: true },
    },
  },
}));
