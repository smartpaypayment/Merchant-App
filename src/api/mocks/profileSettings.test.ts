import { authApi, merchantApi } from '@api/index';
import { ApiError } from '@api/errors';
import { clearTokens, saveTokens } from '@store/secureStorage';
import { EXISTING_MERCHANT_MOBILE, VALID_OTP, initExistingMerchant } from '@api/mocks/db';

/**
 * Profile edits (Section 6.14) and preference changes (Section 6.16).
 *
 * The bank-account cases are the important ones: `PATCH /merchant/profile` is the
 * endpoint that redirects where every future rupee lands, and the two properties
 * asserted here — that a failed penny drop changes nothing, and that the raw
 * account number never comes back — are the ones a regression would quietly break.
 */

const VALID_BANK = {
  accountNumber: '123456789012',
  ifsc: 'HDFC0001234',
  holderName: 'Ramesh Kumar',
};

beforeEach(async () => {
  await clearTokens();
  const tokens = await authApi.verifyOtp({ mobile: EXISTING_MERCHANT_MOBILE, otp: VALID_OTP });
  await saveTokens(tokens);
  initExistingMerchant();
});

describe('PATCH /merchant/profile — business details', () => {
  it('updates the business name', async () => {
    const updated = await merchantApi.updateProfile({ businessName: 'Sharma Kirana Stores' });
    expect(updated.businessName).toBe('Sharma Kirana Stores');
  });

  it('updates the address as a whole', async () => {
    const updated = await merchantApi.updateProfile({
      address: { line1: '14 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
    });

    expect(updated.address).toEqual({
      line1: '14 MG Road',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
    });
  });

  it('leaves untouched fields alone', async () => {
    const before = await merchantApi.getProfile();
    const updated = await merchantApi.updateProfile({ businessName: 'Renamed' });

    expect(updated.category).toBe(before.category);
    expect(updated.mobile).toBe(before.mobile);
    expect(updated.bankAccount.accountNumberMasked).toBe(before.bankAccount.accountNumberMasked);
  });

  it('accepts a well-formed GSTIN', async () => {
    const updated = await merchantApi.updateProfile({ gstin: '27AAAAA0000A1Z5' });
    expect(updated.gstin).toBe('27AAAAA0000A1Z5');
  });

  it('rejects a malformed GSTIN', async () => {
    const error = await merchantApi.updateProfile({ gstin: '27AAAAA' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('validation_error');
  });

  it('clears the GSTIN on an empty string rather than storing ""', async () => {
    await merchantApi.updateProfile({ gstin: '27AAAAA0000A1Z5' });
    const updated = await merchantApi.updateProfile({ gstin: '' });

    // A merchant who deregisters must be able to remove it, and "" would render
    // as a blank value where the screen expects "Not added".
    expect(updated.gstin).toBeUndefined();
  });

  it('requires authentication', async () => {
    await clearTokens();
    const error = await merchantApi.updateProfile({ businessName: 'X' }).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('unauthorized');
  });
});

describe('PATCH /merchant/profile — settlement account change', () => {
  it('stores only the masked account number', async () => {
    const updated = await merchantApi.updateProfile({ bankAccount: VALID_BANK });

    expect(updated.bankAccount.accountNumberMasked).not.toContain('123456789012');
    expect(updated.bankAccount.accountNumberMasked).toMatch(/\d{4}$/);
    expect(updated.bankAccount.ifsc).toBe('HDFC0001234');
    expect(updated.bankAccount.holderName).toBe('Ramesh Kumar');
  });

  it('marks the new account verified once the penny drop passes', async () => {
    const updated = await merchantApi.updateProfile({ bankAccount: VALID_BANK });
    expect(updated.bankAccount.verified).toBe(true);
  });

  it('never returns the raw account number anywhere on the merchant object', async () => {
    const updated = await merchantApi.updateProfile({ bankAccount: VALID_BANK });
    expect(JSON.stringify(updated)).not.toContain('123456789012');
  });

  it('surfaces a failed penny drop as bank_verification_failed', async () => {
    const error = await merchantApi
      // Accounts ending 0000 are the rigged failure, as in KYC step 3.
      .updateProfile({ bankAccount: { ...VALID_BANK, accountNumber: '123456780000' } })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('bank_verification_failed');
  });

  it('leaves the existing account in place when the penny drop fails', async () => {
    const before = await merchantApi.getProfile();

    await merchantApi
      .updateProfile({ bankAccount: { ...VALID_BANK, accountNumber: '123456780000' } })
      .catch(() => undefined);

    const after = await merchantApi.getProfile();
    // The merchant must not be left with settlements pointed at an unverified
    // account because a verification failed halfway.
    expect(after.bankAccount).toEqual(before.bankAccount);
  });

  it('rejects a malformed IFSC', async () => {
    const error = await merchantApi
      .updateProfile({ bankAccount: { ...VALID_BANK, ifsc: 'HDFC1234' } })
      .catch((e: unknown) => e);

    expect((error as ApiError).code).toBe('validation_error');
  });

  it('rejects an account number that is too short', async () => {
    const error = await merchantApi
      .updateProfile({ bankAccount: { ...VALID_BANK, accountNumber: '12345' } })
      .catch((e: unknown) => e);

    expect((error as ApiError).code).toBe('validation_error');
  });

  it('applies business fields and the bank account in one call', async () => {
    const updated = await merchantApi.updateProfile({
      businessName: 'Combined Update',
      bankAccount: VALID_BANK,
    });

    expect(updated.businessName).toBe('Combined Update');
    expect(updated.bankAccount.verified).toBe(true);
  });
});

describe('PATCH /merchant/preferences (Section 6.16)', () => {
  it('round-trips the app language', async () => {
    const preferences = await merchantApi.updatePreferences({ language: 'ta' });
    expect(preferences.language).toBe('ta');

    const profile = await merchantApi.getProfile();
    expect(profile.preferences.language).toBe('ta');
  });

  it('round-trips the audio confirmation block', async () => {
    const preferences = await merchantApi.updatePreferences({
      audioConfirmation: { enabled: false, language: 'hi', volume: 0.8 },
    });

    expect(preferences.audioConfirmation.enabled).toBe(false);
    expect(preferences.audioConfirmation.language).toBe('hi');
  });

  it('round-trips notification channels', async () => {
    const preferences = await merchantApi.updatePreferences({
      notifications: { push: false, sms: true, whatsapp: true },
    });

    expect(preferences.notifications).toEqual({ push: false, sms: true, whatsapp: true });
  });

  it('leaves other preference groups untouched by a partial patch', async () => {
    const before = await merchantApi.updatePreferences({
      notifications: { push: true, sms: true, whatsapp: false },
    });

    const after = await merchantApi.updatePreferences({ language: 'bn' });

    expect(after.language).toBe('bn');
    expect(after.notifications).toEqual(before.notifications);
  });

  it('requires authentication', async () => {
    await clearTokens();
    const error = await merchantApi.updatePreferences({ language: 'hi' }).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('unauthorized');
  });
});
