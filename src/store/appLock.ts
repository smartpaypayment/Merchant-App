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
 * ## Why there is no JS-side key stretching
 *
 * The obvious hardening is to iterate the digest. It was considered and rejected,
 * because the arithmetic does not support it. `expo-crypto` exposes no KDF, only
 * `digestStringAsync`, so N iterations means N round-trips across the native
 * bridge. At a defensible cost for the Section 2 target device (a 2GB Android
 * phone) you can afford perhaps a few hundred iterations — call it 1000. Against a
 * 4-digit PIN that raises an offline attack from 10^4 hashes to 10^7: still well
 * under a second on a laptop. To reach a genuinely painful cost you need ~10^5
 * iterations, which on this transport would put a visible multi-second stall in
 * front of every refund confirmation.
 *
 * So iterating here would buy latency on the slowest devices in exchange for
 * security that rounds to zero. It would also read as solved to the next person
 * looking at this file, which is worse than leaving the gap legible. The real
 * fixes, both of which need work outside this module:
 *   (a) a native KDF (`react-native-quick-crypto` or similar) to make scrypt or
 *       Argon2 at a ~100ms target actually reachable, or
 *   (b) stop verifying locally altogether — have the PIN unwrap a StrongBox-backed
 *       key and let the hardware enforce the attempt throttling.
 *
 * What *is* implemented below is the defence that pays for itself against the
 * realistic threat here — someone holding the unlocked phone and typing guesses
 * into our own UI: a persisted, escalating cooldown.
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
 * Escalating cooldown, applied each time the attempt limit is exhausted.
 *
 * The first lockout is deliberately short: by far the most common cause of five
 * wrong PINs is a merchant fat-fingering a number pad one-handed at a busy
 * counter, not an attacker. Repeat exhaustion is what looks like guessing, so the
 * penalty climbs and then caps — an unbounded ladder would turn a forgotten PIN
 * into a bricked app with no way back.
 */
const LOCKOUT_LADDER_MS = [30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000] as const;

interface PinAttemptState {
  failedAttempts: number;
  /** How many times the limit has been exhausted; indexes the ladder. */
  lockoutCount: number;
  /** Epoch ms until which entry is refused, or null. */
  lockedUntil: number | null;
}

const FRESH_ATTEMPTS: PinAttemptState = {
  failedAttempts: 0,
  lockoutCount: 0,
  lockedUntil: null,
};

/**
 * In-memory mirror of the persisted counter.
 *
 * Persisted, unlike the original implementation, because an in-memory counter is
 * defeated by force-quitting the app — which is a two-second action for anyone
 * holding the phone, and made the limit decorative against exactly the threat it
 * exists to stop. The objection to persisting it (a merchant who forgets their PIN
 * being locked out forever) is answered by the cooldown expiring on its own rather
 * than by the counter being volatile.
 */
let attemptState: PinAttemptState = { ...FRESH_ATTEMPTS };
let hydration: Promise<void> | null = null;

async function hydrateAttempts(): Promise<void> {
  if (!hydration) {
    hydration = (async () => {
      const raw = await secureStorage.getItem(SecureKeys.pinAttempts);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Partial<PinAttemptState>;
        attemptState = {
          failedAttempts: Number(parsed.failedAttempts) || 0,
          lockoutCount: Number(parsed.lockoutCount) || 0,
          lockedUntil: typeof parsed.lockedUntil === 'number' ? parsed.lockedUntil : null,
        };
      } catch {
        /* Corrupt record — fall back to a clean slate rather than refusing entry. */
      }
    })();
  }
  return hydration;
}

async function persistAttempts(): Promise<void> {
  await secureStorage.setItem(SecureKeys.pinAttempts, JSON.stringify(attemptState));
}

/**
 * Clears an elapsed cooldown.
 *
 * Expiring the lockout also hands back a fresh set of attempts, while leaving
 * `lockoutCount` intact so the *next* lockout is longer.
 */
function expireLockoutIfElapsed(): void {
  if (attemptState.lockedUntil !== null && Date.now() >= attemptState.lockedUntil) {
    attemptState = { ...attemptState, failedAttempts: 0, lockedUntil: null };
  }
}

export const getRemainingAttempts = (): number => {
  expireLockoutIfElapsed();
  return Math.max(0, MAX_PIN_ATTEMPTS - attemptState.failedAttempts);
};

export const isLockedOut = (): boolean => {
  expireLockoutIfElapsed();
  return attemptState.lockedUntil !== null;
};

/** Milliseconds until entry is allowed again, or 0 when not locked out. */
export const getLockoutRemainingMs = (): number => {
  expireLockoutIfElapsed();
  if (attemptState.lockedUntil === null) return 0;
  return Math.max(0, attemptState.lockedUntil - Date.now());
};

/** Hydrates from storage, then reports the lock state. Use before rendering a PIN pad. */
export async function loadLockState(): Promise<{
  isLockedOut: boolean;
  remainingAttempts: number;
  lockoutRemainingMs: number;
}> {
  await hydrateAttempts();
  return {
    isLockedOut: isLockedOut(),
    remainingAttempts: getRemainingAttempts(),
    lockoutRemainingMs: getLockoutRemainingMs(),
  };
}

async function resetAttempts(): Promise<void> {
  attemptState = { ...FRESH_ATTEMPTS };
  // Ensure a later hydrate cannot resurrect the cleared counter.
  hydration = Promise.resolve();
  await secureStorage.deleteItem(SecureKeys.pinAttempts);
}

export type PinVerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'no_pin' | 'incorrect' | 'locked_out';
      remainingAttempts: number;
      /** Set when `reason === 'locked_out'`, so the UI can count down. */
      lockoutRemainingMs?: number;
    };

export async function verifyPin(pin: string): Promise<PinVerifyResult> {
  await hydrateAttempts();

  if (isLockedOut()) {
    return {
      ok: false,
      reason: 'locked_out',
      remainingAttempts: 0,
      lockoutRemainingMs: getLockoutRemainingMs(),
    };
  }

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
    const failedAttempts = attemptState.failedAttempts + 1;

    if (failedAttempts >= MAX_PIN_ATTEMPTS) {
      const ladderIndex = Math.min(attemptState.lockoutCount, LOCKOUT_LADDER_MS.length - 1);
      const cooldown = LOCKOUT_LADDER_MS[ladderIndex]!;

      attemptState = {
        failedAttempts,
        lockoutCount: attemptState.lockoutCount + 1,
        lockedUntil: Date.now() + cooldown,
      };
      await persistAttempts();

      return {
        ok: false,
        reason: 'locked_out',
        remainingAttempts: 0,
        lockoutRemainingMs: cooldown,
      };
    }

    attemptState = { ...attemptState, failedAttempts };
    await persistAttempts();

    return { ok: false, reason: 'incorrect', remainingAttempts: getRemainingAttempts() };
  }

  // A correct entry clears the ladder too — the merchant has proved it is them.
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
