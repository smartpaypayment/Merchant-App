import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Secure storage for auth material.
 *
 * App-PRD Section 12: "Store tokens in secure storage (Keychain/Keystore), never
 * in plain AsyncStorage." On device this is backed by the Android Keystore /
 * iOS Keychain via expo-secure-store.
 *
 * Web has no equivalent secure enclave. `expo-secure-store` is a no-op there, so
 * we fall back to AsyncStorage purely to keep the browser preview functional —
 * the fallback is gated on `Platform.OS === 'web'` and must never be reachable on
 * the shipped Android build.
 */
const isWeb = Platform.OS === 'web';

export const SecureKeys = {
  accessToken: 'auth.accessToken',
  refreshToken: 'auth.refreshToken',
  appPin: 'security.appPin',
  /**
   * The PAN and full bank account number from the in-progress KYC draft. These
   * used to sit in plain AsyncStorage alongside the rest of the wizard state; see
   * `kycDraftStorage.ts` for why they were moved here.
   */
  kycSensitive: 'kyc.sensitive',
  /**
   * Failed-PIN counter and cooldown deadline. In secure storage rather than
   * AsyncStorage specifically so it cannot be reset by clearing app data without
   * also destroying the PIN record itself.
   */
  pinAttempts: 'security.pinAttempts',
} as const;

export type SecureKey = (typeof SecureKeys)[keyof typeof SecureKeys];

async function getItem(key: SecureKey): Promise<string | null> {
  try {
    if (isWeb) return await AsyncStorage.getItem(`insecure.${key}`);
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function setItem(key: SecureKey, value: string): Promise<void> {
  try {
    if (isWeb) {
      await AsyncStorage.setItem(`insecure.${key}`, value);
      return;
    }
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    // If the keystore is unavailable the user simply has to log in again.
  }
}

async function deleteItem(key: SecureKey): Promise<void> {
  try {
    if (isWeb) {
      await AsyncStorage.removeItem(`insecure.${key}`);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* no-op */
  }
}

export const secureStorage = { getItem, setItem, deleteItem };

/* -------------------------------------------------------------------------- */
/* Token helpers                                                              */
/* -------------------------------------------------------------------------- */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function saveTokens(tokens: TokenPair): Promise<void> {
  await Promise.all([
    setItem(SecureKeys.accessToken, tokens.accessToken),
    setItem(SecureKeys.refreshToken, tokens.refreshToken),
  ]);
}

export async function getAccessToken(): Promise<string | null> {
  return getItem(SecureKeys.accessToken);
}

export async function getRefreshToken(): Promise<string | null> {
  return getItem(SecureKeys.refreshToken);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([deleteItem(SecureKeys.accessToken), deleteItem(SecureKeys.refreshToken)]);
}
