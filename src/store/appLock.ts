import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import { secureStorage, SecureKeys } from './secureStorage';

/**
 * App lock: PIN + biometric re-authentication.
 *
 * App-PRD Section 12: "App lock: PIN + biometric; require re-auth for sensitive
 * actions (bank change, refund)."
 *
 * ## How the PIN is stored
 *
 * Never in plaintext. A 16-byte random salt is generated per PIN, and
 * `SHA-256(salt : pin)` is stored alongside it in the Keystore/Keychain via
 * `expo-secure-store`.
 *
 * The honest limitation: a single SHA-256 pass is **not** a password KDF. For a
 * 4-6 digit PIN the keyspace is only 10^4-10^6, so an attacker who extracts the
 * stored record can brute-force it almost instantly. What actually protects the
 * PIN here is the hardware-backed keystore the record lives in, not the hash —
 * the hash exists so the PIN is not sitting in cleartext and is not readable from
 * a backup or a memory dump of the storage layer.
 *
 * A production build should either
 *   (a) derive with a stretched KDF (scrypt/Argon2, ~100ms target), or
 *   (b) stop verifying locally altogether and make the PIN unwrap a
 *       StrongBox-backed key with hardware-enforced attempt throttling.
 *
 * Attempt throttling is implemented below regardless, because unlimited local
 * guesses would make the keyspace argument moot for anyone holding the phone.
 */

const PIN_MIN_LENGTH = 4;
const PIN_MAX_LENGTH = 6;

/** Section 12 hardening: lock out after repeated failures. */
export const MAX_PIN_ATTEMPTS = 5;

export interface StoredPin {
  salt: string;
  hash: string;
  /** Length, so the PIN pad can render the right number of slots. */
  length: number;
}

export const PIN_LENGTH_BOUNDS = { min: PIN_MIN_LENGTH, max: PIN_MAX_LENGTH } as const;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

export const isValidPinFormat = (pin: string): boolean =>
  new RegExp(`^\\d{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`).test(pin);

/** True once the merchant has set an app PIN. */
export async function hasPin(): Promise<boolean> {
  const raw = await secureStorage.getItem(SecureKeys.appPin);
  return raw !== null;
}

export async function setPin(pin: string): Promise<boolean> {
  if (!isValidPinFormat(pin)) return false;

  const salt = toHex(await Crypto.getRandomBytesAsync(16));
  const hash = await hashPin(pin, salt);

  const record: StoredPin = { salt, hash, length: pin.length };
  await secureStorage.setItem(SecureKeys.appPin, JSON.stringify(record));
  await resetAttempts();
  return true;
}

export async function clearPin(): Promise<void> {
  await secureStorage.deleteItem(SecureKeys.appPin);
  await resetAttempts();
}

export async function getPinLength(): Promise<number | null> {
  const record = await readPin();
  return record?.length ?? null;
}

async function readPin(): Promise<StoredPin | null> {
  const raw = await secureStorage.getItem(SecureKeys.appPin);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredPin;
    if (!parsed.salt || !parsed.hash) return null;
    return parsed;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Attempt throttling                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Held in memory rather than on disk, deliberately: this counter guards a live
 * session, and persisting it would let a merchant who genuinely forgot their PIN
 * be locked out permanently with no reset path. Killing the app clears it, which
 * is an accepted trade-off — the threat model here is a shoulder-surfer at the
 * counter, not a forensic attacker, who is instead handled by the keystore.
 */
let failedAttempts = 0;

export const getRemainingAttempts = (): number => Math.max(0, MAX_PIN_ATTEMPTS - failedAttempts);
export const isLockedOut = (): boolean => failedAttempts >= MAX_PIN_ATTEMPTS;

async function resetAttempts(): Promise<void> {
  failedAttempts = 0;
}

export type PinVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'no_pin' | 'incorrect' | 'locked_out'; remainingAttempts: number };

export async function verifyPin(pin: string): Promise<PinVerifyResult> {
  if (isLockedOut()) return { ok: false, reason: 'locked_out', remainingAttempts: 0 };

  const record = await readPin();
  if (!record) return { ok: false, reason: 'no_pin', remainingAttempts: getRemainingAttempts() };

  const candidate = await hashPin(pin, record.salt);

  // Constant-time-ish comparison. Timing analysis is not a realistic threat for a
  // local PIN check, but short-circuiting on the first differing character is
  // free to avoid.
  let mismatch = candidate.length ^ record.hash.length;
  for (let i = 0; i < candidate.length && i < record.hash.length; i += 1) {
    mismatch |= candidate.charCodeAt(i) ^ record.hash.charCodeAt(i);
  }

  if (mismatch !== 0) {
    failedAttempts += 1;
    return {
      ok: false,
      reason: isLockedOut() ? 'locked_out' : 'incorrect',
      remainingAttempts: getRemainingAttempts(),
    };
  }

  await resetAttempts();
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Biometrics                                                                 */
/* -------------------------------------------------------------------------- */

export interface BiometricCapability {
  available: boolean;
  /** Hardware present but no fingerprint/face enrolled. */
  hardwareOnly: boolean;
  type: 'fingerprint' | 'face' | 'iris' | 'unknown' | 'none';
}

export async function getBiometricCapability(): Promise<BiometricCapability> {
  try {
    const [hasHardware, isEnrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    if (!hasHardware) return { available: false, hardwareOnly: false, type: 'none' };
    if (!isEnrolled) return { available: false, hardwareOnly: true, type: 'none' };

    const type = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
      ? 'face'
      : types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
        ? 'fingerprint'
        : types.includes(LocalAuthentication.AuthenticationType.IRIS)
          ? 'iris'
          : 'unknown';

    return { available: true, hardwareOnly: false, type };
  } catch {
    return { available: false, hardwareOnly: false, type: 'none' };
  }
}

export type BiometricResult = 'success' | 'cancelled' | 'fallback' | 'failed';

/**
 * Prompts for biometric confirmation.
 *
 * `disableDeviceFallback: true` — the OS passcode fallback is suppressed on
 * purpose so the fallback path is *our* PIN pad. Otherwise a merchant could
 * authorise a refund with the device unlock code, which is often shared with
 * family and is not the credential the merchant set for money movement.
 */
export async function authenticateBiometric(promptMessage: string, cancelLabel: string): Promise<BiometricResult> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel,
      disableDeviceFallback: true,
    });

    if (result.success) return 'success';
    if ('error' in result) {
      if (result.error === 'user_cancel' || result.error === 'app_cancel' || result.error === 'system_cancel') {
        return 'cancelled';
      }
      if (result.error === 'user_fallback') return 'fallback';
    }
    return 'failed';
  } catch {
    return 'failed';
  }
}
