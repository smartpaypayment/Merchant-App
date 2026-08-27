import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Non-sensitive local storage (App-PRD Section 2: "MMKV / AsyncStorage").
 *
 * Tokens must NOT go here — use `@/store/secureStorage`, which is backed by the
 * Keystore/Keychain as Section 12 requires.
 *
 * AsyncStorage is used rather than MMKV so the project runs in Expo Go and on
 * web without a custom dev client. The interface below is deliberately narrow so
 * swapping in `react-native-mmkv` later is a single-file change.
 */
export const StorageKeys = {
  language: 'pref.language',
  kycDraft: 'kyc.draft',
  merchantCache: 'cache.merchant',
  onboardingSeen: 'flag.onboardingSeen',
  audioPrefs: 'pref.audio',
  queryCache: 'cache.reactQuery',
  pendingMobile: 'auth.pendingMobile',
  /**
   * Whether the app asks for the PIN on open. Only a preference — the PIN itself
   * and the failed-attempt counter live in secure storage.
   */
  appLockEnabled: 'pref.appLock',
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];

async function getString(key: StorageKey): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function setString(key: StorageKey, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Storage failures are non-fatal: the app degrades to in-memory state.
  }
}

async function getObject<T>(key: StorageKey): Promise<T | null> {
  const raw = await getString(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt payload — drop it rather than crashing on every read.
    await remove(key);
    return null;
  }
}

async function setObject(key: StorageKey, value: unknown): Promise<void> {
  await setString(key, JSON.stringify(value));
}

async function remove(key: StorageKey): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    /* no-op */
  }
}

async function clearAll(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(Object.values(StorageKeys));
  } catch {
    /* no-op */
  }
}

export const storage = { getString, setString, getObject, setObject, remove, clearAll };
