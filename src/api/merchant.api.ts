import type { ProfileUpdatePayload, StaticQrResponse } from '@models/api';
import type { Merchant, MerchantPreferences } from '@models/index';
import type {
  AadhaarOtpRequestPayload,
  AadhaarOtpVerifyPayload,
  KycPatchResponse,
  KycStepPatch,
  KycSubmitResponse,
} from '@models/kyc';
import { get, patch, post } from './client';

export const getProfile = (): Promise<Merchant> => get<Merchant>('/merchant/profile');

/**
 * `PATCH /merchant/profile` (Section 6.14).
 *
 * Takes `ProfileUpdatePayload` rather than `Partial<Merchant>`: a bank-account
 * change sends a raw account number, whereas `Merchant` only ever carries the
 * masked form.
 */
export const updateProfile = (body: ProfileUpdatePayload): Promise<Merchant> =>
  patch<Merchant>('/merchant/profile', body);

/** `PATCH /merchant/kyc` — saves a single wizard step (Section 6.4). */
export const saveKycStep = (body: KycStepPatch): Promise<KycPatchResponse> =>
  patch<KycPatchResponse>('/merchant/kyc', body);

/** `POST /merchant/kyc/submit` — submits the completed wizard for review. */
export const submitKyc = (): Promise<KycSubmitResponse> =>
  post<KycSubmitResponse>('/merchant/kyc/submit');

/** Step 4: consent-driven Aadhaar eKYC, OTP requested then verified. */
export const requestAadhaarOtp = (
  body: AadhaarOtpRequestPayload,
): Promise<{ transactionId: string; resendAfterSeconds: number }> =>
  post('/merchant/kyc/aadhaar/otp', body);

export const verifyAadhaarOtp = (
  body: AadhaarOtpVerifyPayload,
): Promise<{ verified: boolean; aadhaarLast4: string }> => post('/merchant/kyc/aadhaar/verify', body);

/** Autofills city/state during Step 1 so the merchant types fewer fields. */
export const lookupPincode = (pincode: string): Promise<{ city: string; state: string; pincode: string }> =>
  get(`/merchant/pincode/${pincode}`);

export const getStaticQr = (): Promise<StaticQrResponse> => get<StaticQrResponse>('/merchant/qr/static');

export const updatePreferences = (body: Partial<MerchantPreferences>): Promise<MerchantPreferences> =>
  patch<MerchantPreferences>('/merchant/preferences', body);
