import type { Address, KycStatus } from './index';

/**
 * KYC wizard steps per App-PRD Section 6.4.
 * The numeric values double as the progress indicator position.
 */
export enum KycStep {
  BusinessInfo = 1,
  Identity = 2,
  BankAccount = 3,
  AadhaarEkyc = 4,
  Done = 5,
}

export const KYC_STEP_ORDER: readonly KycStep[] = [
  KycStep.BusinessInfo,
  KycStep.Identity,
  KycStep.BankAccount,
  KycStep.AadhaarEkyc,
  KycStep.Done,
] as const;

/** Total steps shown in the progress indicator (the "Done" screen is not a form step). */
export const KYC_FORM_STEP_COUNT = 4;

/**
 * Section 6.4 progressive KYC: "Allow accepting payments after Step 3 with
 * limits; full features after approval."
 */
export const KYC_PAYMENTS_UNLOCKED_AFTER = KycStep.BankAccount;

/** Merchant Category Code options for the Step 1 dropdown. */
export interface MccOption {
  /** ISO 18245 merchant category code. */
  code: string;
  /** i18n key for the localized label — no hardcoded display text. */
  labelKey: string;
}

export interface BusinessInfoStepData {
  businessName: string;
  /** MCC code, e.g. '5411'. */
  category: string;
  address: Address;
}

export interface IdentityStepData {
  pan: string;
  gstin?: string;
}

export interface BankAccountStepData {
  accountNumber: string;
  ifsc: string;
  holderName: string;
}

export interface AadhaarEkycStepData {
  /** Section 6.4: "Consent checkbox mandatory". */
  consentGiven: boolean;
  aadhaarLast4?: string;
  verified: boolean;
}

/**
 * Locally persisted, resumable wizard state.
 * Section 6.4: "Each step savable/resumable."
 */
export interface KycDraft {
  currentStep: KycStep;
  /** Highest step the merchant has successfully completed. */
  completedThrough: KycStep | 0;
  businessInfo?: BusinessInfoStepData;
  identity?: IdentityStepData;
  bankAccount?: BankAccountStepData;
  aadhaar?: AadhaarEkycStepData;
  updatedAt?: string;
}

/** Body of `PATCH /merchant/kyc` — one step at a time. */
export type KycStepPatch =
  | { step: KycStep.BusinessInfo; data: BusinessInfoStepData }
  | { step: KycStep.Identity; data: IdentityStepData }
  | { step: KycStep.BankAccount; data: BankAccountStepData }
  | { step: KycStep.AadhaarEkyc; data: AadhaarEkycStepData };

export interface KycPatchResponse {
  step: KycStep;
  kycStatus: KycStatus;
  /** Populated by the Step 3 penny-drop verification. */
  bankVerification?: {
    verified: boolean;
    /** Name returned by the bank, for the merchant to confirm. */
    nameAtBank?: string;
  };
  /** True once payments are permitted under progressive-KYC limits. */
  paymentsEnabled: boolean;
}

export interface KycSubmitResponse {
  kycStatus: KycStatus;
  /** Present when `kycStatus === 'rejected'` (Section 6.4 rejected state). */
  rejectionReason?: string;
  /** Merchant VPA, issued once basic KYC passes (Section 4.1 ON-6). */
  vpa?: string;
}

/** Aadhaar eKYC is a two-call OTP dance, mirroring the UIDAI consent flow. */
export interface AadhaarOtpRequestPayload {
  aadhaarNumber: string;
  consentGiven: boolean;
}

export interface AadhaarOtpVerifyPayload {
  transactionId: string;
  otp: string;
}
