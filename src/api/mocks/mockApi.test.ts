import { authApi, dashboardApi, merchantApi, paymentsApi, transactionsApi } from '@api/index';
import { ApiError } from '@api/errors';
import { clearTokens, getAccessToken, saveTokens } from '@store/secureStorage';
import { EXISTING_MERCHANT_MOBILE, PROGRESSIVE_KYC_DAILY_LIMIT, VALID_OTP } from '@api/mocks/db';
import { KycStep } from '@models/kyc';
import type { Paise } from '@models/index';

/**
 * End-to-end exercise of the mock backend through the real Axios client.
 *
 * This is the check that the app can actually run without a live backend: it
 * drives the same `*.api.ts` functions the screens call, so the full interceptor
 * chain (bearer injection, error normalization) is on the path.
 */

/** Fails if a value is not an integer — enforces the Section 8 paise rule. */
function expectPaise(value: unknown, label: string): void {
  expect(typeof value).toBe('number');
  if (!Number.isInteger(value as number)) {
    throw new Error(`${label} must be integer paise, received ${String(value)}`);
  }
}

beforeEach(async () => {
  await clearTokens();
});

describe('auth contract (POST /auth/otp/*)', () => {
  it('rejects a malformed mobile number with a normalized code', async () => {
    await expect(authApi.requestOtp({ mobile: '12345' })).rejects.toMatchObject({
      code: 'invalid_mobile',
    });
  });

  it('returns the resend window for a valid mobile', async () => {
    const result = await authApi.requestOtp({ mobile: EXISTING_MERCHANT_MOBILE });
    expect(result.resendAfterSeconds).toBe(30);
    expect(result.mobile).toBe(EXISTING_MERCHANT_MOBILE);
  });

  it('rejects an incorrect OTP as invalid_otp, not a raw 401', async () => {
    const error = await authApi
      .verifyOtp({ mobile: EXISTING_MERCHANT_MOBILE, otp: '000000' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('invalid_otp');
  });

  it('issues tokens and flags an existing merchant as a returning user', async () => {
    const result = await authApi.verifyOtp({ mobile: EXISTING_MERCHANT_MOBILE, otp: VALID_OTP });
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.isNewUser).toBe(false);
  });

  it('flags an unrecognized mobile as a new user (routes to KYC)', async () => {
    const result = await authApi.verifyOtp({ mobile: '9000000001', otp: VALID_OTP });
    expect(result.isNewUser).toBe(true);
  });
});

describe('authorization enforcement', () => {
  it('rejects an unauthenticated protected call', async () => {
    const error = await merchantApi.getProfile().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('unauthorized');
  });

  it('injects the stored bearer token automatically', async () => {
    const tokens = await authApi.verifyOtp({ mobile: EXISTING_MERCHANT_MOBILE, otp: VALID_OTP });
    await saveTokens(tokens);

    expect(await getAccessToken()).toBe(tokens.accessToken);

    const merchant = await merchantApi.getProfile();
    expect(merchant.mobile).toBe(EXISTING_MERCHANT_MOBILE);
    expect(merchant.kycStatus).toBe('approved');
  });
});

describe('dashboard + transactions money shape', () => {
  beforeEach(async () => {
    const tokens = await authApi.verifyOtp({ mobile: EXISTING_MERCHANT_MOBILE, otp: VALID_OTP });
    await saveTokens(tokens);
  });

  it('returns every dashboard amount as integer paise', async () => {
    const summary = await dashboardApi.getDashboardSummary();

    expectPaise(summary.todayCollected, 'todayCollected');
    expectPaise(summary.pendingSettlement, 'pendingSettlement');
    expect(Number.isInteger(summary.todayTxnCount)).toBe(true);
    expect(summary.recentTransactions.length).toBeLessThanOrEqual(5);

    for (const txn of summary.recentTransactions) {
      expectPaise(txn.amount, 'transaction.amount');
      expectPaise(txn.fee, 'transaction.fee');
      expectPaise(txn.netAmount, 'transaction.netAmount');
      expect(txn.netAmount).toBe(txn.amount - txn.fee);
      expect(txn.currency).toBe('INR');
    }
  });

  it('paginates transactions with an opaque cursor', async () => {
    const first = await transactionsApi.listTransactions({ limit: 10 });
    expect(first.items).toHaveLength(10);
    expect(first.nextCursor).not.toBeNull();

    const second = await transactionsApi.listTransactions({
      limit: 10,
      cursor: first.nextCursor,
    });
    // Pages must not overlap.
    const firstIds = new Set(first.items.map((t) => t.id));
    expect(second.items.some((t) => firstIds.has(t.id))).toBe(false);
  });

  it('filters transactions by status', async () => {
    const failed = await transactionsApi.listTransactions({ filter: 'failed', limit: 50 });
    expect(failed.items.length).toBeGreaterThan(0);
    expect(failed.items.every((t) => t.status === 'failed')).toBe(true);
  });

  it('refuses a refund larger than the refundable balance', async () => {
    const list = await transactionsApi.listTransactions({ filter: 'success', limit: 1 });
    const txn = list.items[0]!;

    const error = await transactionsApi
      .refundTransaction(txn.id, { amount: txn.amount + 100 })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('refund_limit_exceeded');
  });
});

describe('progressive KYC (Section 6.4)', () => {
  beforeEach(async () => {
    // A fresh mobile resets the mock into "new merchant" mode.
    const tokens = await authApi.verifyOtp({ mobile: '9000000002', otp: VALID_OTP });
    await saveTokens(tokens);
  });

  it('does not enable payments until the bank step is verified', async () => {
    const step1 = await merchantApi.saveKycStep({
      step: KycStep.BusinessInfo,
      data: {
        businessName: 'Test Kirana',
        category: '5411',
        address: { line1: 'Shop 1', city: 'Nashik', state: 'Maharashtra', pincode: '422001' },
      },
    });
    expect(step1.paymentsEnabled).toBe(false);
    expect(step1.kycStatus).toBe('in_progress');

    const step2 = await merchantApi.saveKycStep({
      step: KycStep.Identity,
      data: { pan: 'ABCDE1234F' },
    });
    expect(step2.paymentsEnabled).toBe(false);

    const step3 = await merchantApi.saveKycStep({
      step: KycStep.BankAccount,
      data: { accountNumber: '123456789012', ifsc: 'HDFC0001234', holderName: 'Test Owner' },
    });

    // Section 6.4: payments unlock after step 3, with limits.
    expect(step3.paymentsEnabled).toBe(true);
    expect(step3.bankVerification?.verified).toBe(true);

    // A VPA is issued so the merchant can generate a QR immediately (ON-6).
    const merchant = await merchantApi.getProfile();
    expect(merchant.vpa).toMatch(/@okmerchantone$/);
    expect(merchant.bankAccount.accountNumberMasked).toBe('XXXXXXXX9012');
  });

  it('surfaces a penny-drop failure as bank_verification_failed', async () => {
    const error = await merchantApi
      .saveKycStep({
        step: KycStep.BankAccount,
        // Accounts ending 0000 are rigged to fail verification.
        data: { accountNumber: '123456780000', ifsc: 'HDFC0001234', holderName: 'Test Owner' },
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('bank_verification_failed');
  });

  it('blocks submission before the bank step', async () => {
    const error = await merchantApi.submitKyc().catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('kyc_incomplete');
  });

  it('approves straight through when Aadhaar eKYC completes', async () => {
    await merchantApi.saveKycStep({
      step: KycStep.BusinessInfo,
      data: {
        businessName: 'Test Kirana',
        category: '5411',
        address: { line1: 'Shop 1', city: 'Nashik', state: 'Maharashtra', pincode: '422001' },
      },
    });
    await merchantApi.saveKycStep({ step: KycStep.Identity, data: { pan: 'ABCDE1234F' } });
    await merchantApi.saveKycStep({
      step: KycStep.BankAccount,
      data: { accountNumber: '123456789012', ifsc: 'HDFC0001234', holderName: 'Test Owner' },
    });

    const otp = await merchantApi.requestAadhaarOtp({
      aadhaarNumber: '123456789012',
      consentGiven: true,
    });
    const verified = await merchantApi.verifyAadhaarOtp({
      transactionId: otp.transactionId,
      otp: VALID_OTP,
    });
    expect(verified.verified).toBe(true);

    await merchantApi.saveKycStep({
      step: KycStep.AadhaarEkyc,
      data: { consentGiven: true, verified: true, aadhaarLast4: verified.aadhaarLast4 },
    });

    const result = await merchantApi.submitKyc();
    expect(result.kycStatus).toBe('approved');
  });

  it('rejects an Aadhaar OTP request without consent', async () => {
    const error = await merchantApi
      .requestAadhaarOtp({ aadhaarNumber: '123456789012', consentGiven: false })
      .catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('validation_error');
  });

  it('holds for manual review when Aadhaar is skipped', async () => {
    await merchantApi.saveKycStep({
      step: KycStep.BusinessInfo,
      data: {
        businessName: 'Test Kirana',
        category: '5411',
        address: { line1: 'Shop 1', city: 'Nashik', state: 'Maharashtra', pincode: '422001' },
      },
    });
    await merchantApi.saveKycStep({
      step: KycStep.BankAccount,
      data: { accountNumber: '123456789012', ifsc: 'HDFC0001234', holderName: 'Test Owner' },
    });

    const result = await merchantApi.submitKyc();
    expect(result.kycStatus).toBe('pending_review');
  });
});

describe('dynamic QR payment lifecycle (Section 6.6 / 10)', () => {
  beforeEach(async () => {
    const tokens = await authApi.verifyOtp({ mobile: EXISTING_MERCHANT_MOBILE, otp: VALID_OTP });
    await saveTokens(tokens);
  });

  it('rejects a non-integer (rupee-shaped) amount', async () => {
    const error = await paymentsApi.createDynamicQr({ amount: 12.5 as Paise }).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('validation_error');
  });

  it('creates a QR whose payload encodes the amount in rupees', async () => {
    const qr = await paymentsApi.createDynamicQr({ amount: 50_000, note: 'Groceries' });

    expect(qr.ref).toBeTruthy();
    // 50000 paise === ₹500.00 in the UPI deep link.
    expect(qr.qrPayload).toContain('am=500.00');
    expect(qr.qrPayload).toContain(`tr=${qr.ref}`);
    expect(new Date(qr.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const status = await paymentsApi.getPaymentStatus(qr.ref);
    expect(status.status).toBe('pending');
  });

  it('transitions pending -> success and returns the matching transaction', async () => {
    const amount = 75_000; // ₹750.00
    const qr = await paymentsApi.createDynamicQr({ amount });

    // Drive the same poll loop the QR screen runs (Section 10, step 2).
    const deadline = Date.now() + 20_000;
    let status = await paymentsApi.getPaymentStatus(qr.ref);

    while (status.status === 'pending' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      status = await paymentsApi.getPaymentStatus(qr.ref);
    }

    expect(status.status).toBe('success');
    expect(status.transaction).toBeDefined();

    const txn = status.transaction!;
    // The credited amount must match the requested paise exactly.
    expect(txn.amount).toBe(amount);
    expect(Number.isInteger(txn.amount)).toBe(true);
    expect(txn.mode).toBe('upi_qr');
    // Zero-MDR on UPI P2M, so the merchant nets the full amount.
    expect(txn.fee).toBe(0);
    expect(txn.netAmount).toBe(amount);
    expect(txn.utr).toBeTruthy();
  });

  it('reports the same terminal status on repeat polls (idempotent)', async () => {
    const qr = await paymentsApi.createDynamicQr({ amount: 10_000 });

    const deadline = Date.now() + 20_000;
    let status = await paymentsApi.getPaymentStatus(qr.ref);
    while (status.status === 'pending' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      status = await paymentsApi.getPaymentStatus(qr.ref);
    }
    expect(status.status).toBe('success');

    // Section 10 item 4: a duplicate/late event must not create a second payment.
    const again = await paymentsApi.getPaymentStatus(qr.ref);
    expect(again.status).toBe('success');
    expect(again.transaction?.id).toBe(status.transaction?.id);
  });

  it('surfaces the payment received on the dashboard summary', async () => {
    const before = await dashboardApi.getDashboardSummary();

    const amount = 33_300; // ₹333.00
    const qr = await paymentsApi.createDynamicQr({ amount });

    const deadline = Date.now() + 20_000;
    let status = await paymentsApi.getPaymentStatus(qr.ref);
    while (status.status === 'pending' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      status = await paymentsApi.getPaymentStatus(qr.ref);
    }
    expect(status.status).toBe('success');

    const after = await dashboardApi.getDashboardSummary();
    expect(after.todayCollected).toBe(before.todayCollected + amount);
    expect(after.todayTxnCount).toBe(before.todayTxnCount + 1);
    // The new payment should head the recent list.
    expect(after.recentTransactions[0]?.id).toBe(status.transaction?.id);
  });

  it('rejects a dynamic QR above the progressive-KYC cap', async () => {
    // Switch to an unapproved merchant.
    const tokens = await authApi.verifyOtp({ mobile: '9000000003', otp: VALID_OTP });
    await saveTokens(tokens);

    const error = await paymentsApi
      .createDynamicQr({ amount: PROGRESSIVE_KYC_DAILY_LIMIT + 100 })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('kyc_incomplete');
    expect((error as ApiError).details?.['limit']).toBe(PROGRESSIVE_KYC_DAILY_LIMIT);
  });
});

describe('payment link (Section 6.6 mode C)', () => {
  beforeEach(async () => {
    const tokens = await authApi.verifyOtp({ mobile: EXISTING_MERCHANT_MOBILE, otp: VALID_OTP });
    await saveTokens(tokens);
  });

  it('returns a shareable url with a 24h expiry', async () => {
    const link = await paymentsApi.createPaymentLink({ amount: 1_50_000, note: 'Catering' });

    expect(link.url).toMatch(/^https:\/\//);
    expect(link.ref).toBeTruthy();

    const hoursUntilExpiry = (new Date(link.expiresAt).getTime() - Date.now()) / 3_600_000;
    expect(hoursUntilExpiry).toBeGreaterThan(23);
    expect(hoursUntilExpiry).toBeLessThanOrEqual(24);
  });

  it('rejects a zero or negative amount', async () => {
    await expect(paymentsApi.createPaymentLink({ amount: 0 })).rejects.toMatchObject({
      code: 'validation_error',
    });
  });
});

describe('static QR (Section 6.6 mode A)', () => {
  it('returns a payload with no amount, so any sum can be paid', async () => {
    const tokens = await authApi.verifyOtp({ mobile: EXISTING_MERCHANT_MOBILE, otp: VALID_OTP });
    await saveTokens(tokens);

    const qr = await merchantApi.getStaticQr();

    expect(qr.vpa).toBeTruthy();
    expect(qr.qrPayload).toContain(`pa=${qr.vpa}`);
    // A static QR must NOT pin an amount.
    expect(qr.qrPayload).not.toContain('am=');
  });

  it('refuses a static QR before a VPA has been issued', async () => {
    const tokens = await authApi.verifyOtp({ mobile: '9000000004', otp: VALID_OTP });
    await saveTokens(tokens);

    const error = await merchantApi.getStaticQr().catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('kyc_incomplete');
  });
});
