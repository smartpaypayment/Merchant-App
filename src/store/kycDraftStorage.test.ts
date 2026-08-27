import AsyncStorage from '@react-native-async-storage/async-storage';
import { KycStep, type KycDraft } from '@models/kyc';
import { clearKycDraft, loadKycDraft, saveKycDraft } from './kycDraftStorage';
import { secureStorage, SecureKeys } from './secureStorage';
import { StorageKeys } from './storage';

/**
 * The property under test is a leak, not a feature: the PAN and the full bank
 * account number must never reach plain AsyncStorage, while the draft must still
 * round-trip so the merchant does not have to retype them.
 */

const PAN = 'ABCDE1234F';
const ACCOUNT = '123456789012345';

const DRAFT: KycDraft = {
  currentStep: KycStep.AadhaarEkyc,
  completedThrough: KycStep.BankAccount,
  businessInfo: {
    businessName: 'Sharma Kirana',
    category: '5411',
    address: { line1: '14 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
  },
  identity: { pan: PAN, gstin: '27AAAAA0000A1Z5' },
  bankAccount: { accountNumber: ACCOUNT, ifsc: 'HDFC0001234', holderName: 'Ramesh Kumar' },
};

beforeEach(async () => {
  await clearKycDraft();
});

describe('sensitive fields never reach AsyncStorage', () => {
  it('keeps the PAN out of the plain-storage copy', async () => {
    await saveKycDraft(DRAFT);

    const raw = await AsyncStorage.getItem(StorageKeys.kycDraft);
    expect(raw).toBeTruthy();
    expect(raw).not.toContain(PAN);
  });

  it('keeps the full account number out of the plain-storage copy', async () => {
    await saveKycDraft(DRAFT);

    const raw = await AsyncStorage.getItem(StorageKeys.kycDraft);
    expect(raw).not.toContain(ACCOUNT);
  });

  it('still stores the non-secret fields in the clear', async () => {
    await saveKycDraft(DRAFT);

    const raw = (await AsyncStorage.getItem(StorageKeys.kycDraft))!;
    // Progress and the fields that are not secrets — IFSC, holder name, GSTIN,
    // business details — stay readable, which is what makes resume cheap.
    expect(raw).toContain('HDFC0001234');
    expect(raw).toContain('Ramesh Kumar');
    expect(raw).toContain('Sharma Kirana');
    expect(raw).toContain('27AAAAA0000A1Z5');
  });

  it('writes the secrets to secure storage instead', async () => {
    await saveKycDraft(DRAFT);

    const raw = await secureStorage.getItem(SecureKeys.kycSensitive);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { pan?: string; accountNumber?: string };
    expect(parsed.pan).toBe(PAN);
    expect(parsed.accountNumber).toBe(ACCOUNT);
  });
});

describe('round-trip', () => {
  it('reassembles the draft exactly as it was saved', async () => {
    await saveKycDraft(DRAFT);
    await expect(loadKycDraft()).resolves.toEqual(DRAFT);
  });

  it('preserves wizard progress', async () => {
    await saveKycDraft(DRAFT);

    const loaded = await loadKycDraft();
    expect(loaded?.currentStep).toBe(KycStep.AadhaarEkyc);
    expect(loaded?.completedThrough).toBe(KycStep.BankAccount);
  });

  it('returns null when nothing has been saved', async () => {
    await expect(loadKycDraft()).resolves.toBeNull();
  });

  it('handles a draft with no sensitive steps completed yet', async () => {
    const early: KycDraft = { currentStep: KycStep.Identity, completedThrough: KycStep.BusinessInfo };

    await saveKycDraft(early);

    // Nothing secret to hold, so no stale secure record should be left behind.
    expect(await secureStorage.getItem(SecureKeys.kycSensitive)).toBeNull();
    await expect(loadKycDraft()).resolves.toEqual(early);
  });

  it('drops the secure record once the sensitive fields are emptied', async () => {
    await saveKycDraft(DRAFT);
    expect(await secureStorage.getItem(SecureKeys.kycSensitive)).toBeTruthy();

    await saveKycDraft({ currentStep: KycStep.Identity, completedThrough: KycStep.BusinessInfo });
    expect(await secureStorage.getItem(SecureKeys.kycSensitive)).toBeNull();
  });

  it('survives a missing secure half without throwing', async () => {
    await saveKycDraft(DRAFT);
    await secureStorage.deleteItem(SecureKeys.kycSensitive);

    // Keystore wiped but the progress copy intact: the merchant should resume with
    // the two fields blank rather than the wizard failing to load at all.
    const loaded = await loadKycDraft();
    expect(loaded?.identity?.pan).toBe('');
    expect(loaded?.bankAccount?.accountNumber).toBe('');
    expect(loaded?.bankAccount?.ifsc).toBe('HDFC0001234');
  });
});

describe('clearing', () => {
  it('removes both halves', async () => {
    await saveKycDraft(DRAFT);

    await clearKycDraft();

    expect(await AsyncStorage.getItem(StorageKeys.kycDraft)).toBeNull();
    // A leftover Keystore record would re-attach this merchant's PAN to the next
    // merchant's fresh draft on a shared device.
    expect(await secureStorage.getItem(SecureKeys.kycSensitive)).toBeNull();
    await expect(loadKycDraft()).resolves.toBeNull();
  });
});
