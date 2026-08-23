import { z } from 'zod';
import {
  ACCOUNT_NUMBER_REGEX,
  AADHAAR_REGEX,
  GSTIN_REGEX,
  IFSC_REGEX,
  OTP_REGEX,
  PAN_REGEX,
  PINCODE_REGEX,
} from '@utils/validators';

/**
 * KYC step schemas — validation rules from the Section 6.4 table.
 *
 * As in the auth schemas, every message is an i18n key resolved by the screen.
 */

/* Step 1 — Business info */
export const businessInfoSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, 'kyc.business.nameRequired')
    .min(3, 'kyc.business.nameTooShort'),
  category: z.string().min(1, 'kyc.business.categoryRequired'),
  line1: z.string().trim().min(1, 'kyc.business.addressRequired'),
  pincode: z
    .string()
    .min(1, 'kyc.business.pincodeRequired')
    .regex(PINCODE_REGEX, 'kyc.business.pincodeInvalid'),
  city: z.string().trim().min(1, 'kyc.business.cityRequired'),
  state: z.string().trim().min(1, 'kyc.business.stateRequired'),
});
export type BusinessInfoFormValues = z.infer<typeof businessInfoSchema>;

/* Step 2 — Identity */
export const identitySchema = z.object({
  pan: z.string().min(1, 'kyc.identity.panRequired').regex(PAN_REGEX, 'kyc.identity.panInvalid'),
  // GSTIN is optional (Section 6.4) but must be well-formed when supplied.
  gstin: z
    .string()
    .trim()
    .refine((v) => v === '' || GSTIN_REGEX.test(v), { message: 'kyc.identity.gstinInvalid' }),
});
export type IdentityFormValues = z.infer<typeof identitySchema>;

/* Step 3 — Bank account */
export const bankAccountSchema = z
  .object({
    accountNumber: z
      .string()
      .min(1, 'kyc.bank.accountNumberRequired')
      .regex(ACCOUNT_NUMBER_REGEX, 'kyc.bank.accountNumberInvalid'),
    confirmAccountNumber: z.string().min(1, 'kyc.bank.accountNumberRequired'),
    ifsc: z.string().min(1, 'kyc.bank.ifscRequired').regex(IFSC_REGEX, 'kyc.bank.ifscInvalid'),
    holderName: z.string().trim().min(1, 'kyc.bank.holderNameRequired'),
  })
  // Re-entry guard: a mistyped account number would send every settlement to a
  // stranger, and the penny-drop only proves the account exists, not that it is
  // the one the merchant meant.
  .refine((data) => data.accountNumber === data.confirmAccountNumber, {
    message: 'kyc.bank.accountMismatch',
    path: ['confirmAccountNumber'],
  });
export type BankAccountFormValues = z.infer<typeof bankAccountSchema>;

/* Step 4 — Aadhaar eKYC */
export const aadhaarSchema = z.object({
  aadhaarNumber: z
    .string()
    .min(1, 'kyc.aadhaar.numberRequired')
    .regex(AADHAAR_REGEX, 'kyc.aadhaar.numberInvalid'),
  // Section 6.4: "Consent checkbox mandatory".
  consentGiven: z.literal(true, { message: 'kyc.aadhaar.consentRequired' }),
});
export type AadhaarFormValues = z.infer<typeof aadhaarSchema>;

export const aadhaarOtpSchema = z.object({
  otp: z.string().min(1, 'kyc.aadhaar.otpRequired').regex(OTP_REGEX, 'kyc.aadhaar.otpRequired'),
});
export type AadhaarOtpFormValues = z.infer<typeof aadhaarOtpSchema>;
