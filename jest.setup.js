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

/**
 * expo-crypto is backed by Node's crypto here.
 *
 * jest-expo's default native stub returns an empty string from
 * `digestStringAsync`, which would make every PIN hash identical and empty —
 * the app-lock tests would then be asserting against a stub rather than against
 * real hashing behaviour (salt sensitivity, digest comparison). Delegating to
 * `node:crypto` keeps the semantics honest.
 */
jest.mock('expo-crypto', () => {
  const nodeCrypto = require('node:crypto');

  return {
    CryptoDigestAlgorithm: {
      SHA1: 'SHA-1',
      SHA256: 'SHA-256',
      SHA384: 'SHA-384',
      SHA512: 'SHA-512',
    },
    CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
    getRandomBytes: (byteCount) => new Uint8Array(nodeCrypto.randomBytes(byteCount)),
    getRandomBytesAsync: async (byteCount) => new Uint8Array(nodeCrypto.randomBytes(byteCount)),
    digestStringAsync: async (algorithm, data, options) => {
      // 'SHA-256' -> 'sha256'
      const algo = String(algorithm).replace(/-/g, '').toLowerCase();
      const encoding = options?.encoding === 'base64' ? 'base64' : 'hex';
      return nodeCrypto.createHash(algo).update(data, 'utf8').digest(encoding);
    },
    randomUUID: () => nodeCrypto.randomUUID(),
  };
});

jest.mock('expo-local-authentication', () => ({
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  hasHardwareAsync: jest.fn(async () => false),
  isEnrolledAsync: jest.fn(async () => false),
  supportedAuthenticationTypesAsync: jest.fn(async () => []),
  getEnrolledLevelAsync: jest.fn(async () => 0),
  authenticateAsync: jest.fn(async () => ({ success: false, error: 'user_cancel' })),
  cancelAuthenticate: jest.fn(async () => undefined),
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
