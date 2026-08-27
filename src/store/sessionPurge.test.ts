import AsyncStorage from '@react-native-async-storage/async-storage';
import { queryClient } from '@app/providers/queryClient';
import { useAuthStore } from './authStore';
import { clearKycDraft, saveKycDraft } from './kycDraftStorage';
import { secureStorage, SecureKeys, saveTokens, getAccessToken } from './secureStorage';
import { storage, StorageKeys } from './storage';
import { setPin, hasPin } from './appLock';
import { KycStep } from '@models/kyc';

/**
 * What logout must leave behind: nothing belonging to the merchant.
 *
 * This exists because it did not hold. `queryClient.clear()` was only wired to the
 * 401 path, so a merchant tapping "Log out" in Settings left their transactions,
 * settlements, dashboard figures and profile in the React Query cache — in memory
 * *and* in AsyncStorage under `cache.reactQuery`, from where the next launch would
 * restore them for whoever signed in next. On a shared counter phone that is a real
 * disclosure, so it gets a regression test rather than a comment.
 */

beforeEach(async () => {
  queryClient.clear();
  await clearKycDraft();
  await AsyncStorage.clear();
  await secureStorage.deleteItem(SecureKeys.appPin);
});

/** Fills every store logout is responsible for emptying. */
async function seedSession(): Promise<void> {
  await saveTokens({ accessToken: 'access-123', refreshToken: 'refresh-456' });

  queryClient.setQueryData(['transactions', 'all', ''], [{ id: 'txn_1', amount: 150000 }]);
  queryClient.setQueryData(['dashboard', 'summary'], { todayCollected: 4500000 });

  await storage.setObject(StorageKeys.merchantCache, {
    id: 'mch_1',
    businessName: 'Sharma Kirana',
  });
  await storage.setString(StorageKeys.queryCache, JSON.stringify({ clientState: 'stale-copy' }));

  await saveKycDraft({
    currentStep: KycStep.BankAccount,
    completedThrough: KycStep.Identity,
    identity: { pan: 'ABCDE1234F' },
  });
}

describe('logout teardown', () => {
  it('clears the in-memory query cache', async () => {
    await seedSession();
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);

    await useAuthStore.getState().logout();

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('removes the persisted query cache from disk', async () => {
    await seedSession();
    expect(await AsyncStorage.getItem(StorageKeys.queryCache)).toBeTruthy();

    await useAuthStore.getState().logout();

    // The gap that mattered: this survived logout for up to 24h and was rehydrated
    // on the next launch, for a potentially different merchant.
    expect(await AsyncStorage.getItem(StorageKeys.queryCache)).toBeNull();
  });

  it('clears the auth tokens', async () => {
    await seedSession();
    await useAuthStore.getState().logout();

    expect(await getAccessToken()).toBeNull();
  });

  it('removes the cached merchant profile', async () => {
    await seedSession();
    await useAuthStore.getState().logout();

    expect(await AsyncStorage.getItem(StorageKeys.merchantCache)).toBeNull();
  });

  it('removes both halves of the KYC draft, including the Keystore record', async () => {
    await seedSession();
    expect(await secureStorage.getItem(SecureKeys.kycSensitive)).toBeTruthy();

    await useAuthStore.getState().logout();

    expect(await AsyncStorage.getItem(StorageKeys.kycDraft)).toBeNull();
    expect(await secureStorage.getItem(SecureKeys.kycSensitive)).toBeNull();
  });

  it('resets the session state', async () => {
    await seedSession();
    useAuthStore.setState({ status: 'authenticated', pendingMobile: '9876543210' });

    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.status).toBe('unauthenticated');
    expect(state.merchant).toBeNull();
    expect(state.pendingMobile).toBeNull();
    expect(state.isStaleProfile).toBe(false);
  });

  it('keeps the app PIN, which belongs to the device rather than the session', async () => {
    await seedSession();
    await setPin('1234');

    await useAuthStore.getState().logout();

    // Wiping it would force the merchant to re-enrol a PIN after every sign-in,
    // which is the kind of friction that gets the protection turned off.
    expect(await hasPin()).toBe(true);
  });

  it('is safe to call twice', async () => {
    await seedSession();

    await useAuthStore.getState().logout();
    await expect(useAuthStore.getState().logout()).resolves.toBeUndefined();

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
