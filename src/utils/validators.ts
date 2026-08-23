/**
 * Validation primitives. Regexes are taken directly from App-PRD Section 6.2/6.4
 * so the app rejects bad input before spending a network round-trip.
 */

/** Indian mobile: 10 digits, first digit 6-9 (TRAI allocation). */
export const MOBILE_REGEX = /^[6-9]\d{9}$/;

/** Section 6.4 Step 1: "pincode = 6 digits". Cannot start with 0. */
export const PINCODE_REGEX = /^[1-9]\d{5}$/;

/** Section 6.4 Step 2: PAN regex `[A-Z]{5}[0-9]{4}[A-Z]`. */
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/**
 * Section 6.4 Step 2: "GSTIN 15-char format".
 * 2-digit state code + 10-char PAN + entity number + 'Z' + checksum.
 */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Section 6.4 Step 3: IFSC regex `^[A-Z]{4}0[A-Z0-9]{6}$`. */
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Bank account numbers in India run 9-18 digits. */
export const ACCOUNT_NUMBER_REGEX = /^\d{9,18}$/;

export const OTP_REGEX = /^\d{6}$/;

export const AADHAAR_REGEX = /^\d{12}$/;

export const OTP_LENGTH = 6;
export const MOBILE_LENGTH = 10;

export const isValidMobile = (v: string): boolean => MOBILE_REGEX.test(v);
export const isValidPincode = (v: string): boolean => PINCODE_REGEX.test(v);
export const isValidPan = (v: string): boolean => PAN_REGEX.test(v);
export const isValidGstin = (v: string): boolean => GSTIN_REGEX.test(v);
export const isValidIfsc = (v: string): boolean => IFSC_REGEX.test(v);
export const isValidOtp = (v: string): boolean => OTP_REGEX.test(v);

/** Strips everything but digits — for controlled numeric inputs. */
export const digitsOnly = (v: string): string => v.replace(/\D+/g, '');

/**
 * Normalizes identity fields that are case-insensitive on paper but must be
 * uppercase on the wire (PAN, GSTIN, IFSC).
 */
export const toUpperAlnum = (v: string): string => v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

/**
 * Masks an account number for display, per Section 12 ("Mask sensitive data").
 * @example maskAccountNumber('123456789012') // 'XXXXXXXX9012'
 */
export function maskAccountNumber(accountNumber: string): string {
  const digits = digitsOnly(accountNumber);
  if (digits.length <= 4) return digits;
  return `${'X'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

/**
 * Masks a UPI VPA, keeping the handle and the first 2 chars of the identifier.
 * @example maskVpa('ramesh.kumar@okhdfcbank') // 'ra••••••••@okhdfcbank'
 */
export function maskVpa(vpa: string): string {
  const at = vpa.indexOf('@');
  if (at < 0) return vpa;
  const name = vpa.slice(0, at);
  const handle = vpa.slice(at);
  if (name.length <= 2) return `${name}${handle}`;
  return `${name.slice(0, 2)}${'\u2022'.repeat(Math.min(8, name.length - 2))}${handle}`;
}

/** `+91 98765 43210` for display; storage/API keeps the bare 10 digits. */
export function formatMobileForDisplay(mobile: string): string {
  const d = digitsOnly(mobile).slice(-MOBILE_LENGTH);
  if (d.length !== MOBILE_LENGTH) return mobile;
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
}

/** `+91 98765 4••••` — used on the OTP screen. */
export function maskMobileForDisplay(mobile: string): string {
  const d = digitsOnly(mobile).slice(-MOBILE_LENGTH);
  if (d.length !== MOBILE_LENGTH) return mobile;
  return `+91 ${d.slice(0, 5)} ${d.slice(5, 6)}${'\u2022'.repeat(4)}`;
}
