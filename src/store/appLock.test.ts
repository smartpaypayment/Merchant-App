import {
  clearPin,
  getPinLength,
  getRemainingAttempts,
  hasPin,
  isLockedOut,
  isValidPinFormat,
  MAX_PIN_ATTEMPTS,
  setPin,
  verifyPin,
} from './appLock';
import { secureStorage, SecureKeys } from './secureStorage';

/**
 * The app lock guards refunds (Section 12), so these tests pin the two properties
 * that matter: the PIN is never recoverable from what we store, and guessing is
 * rate-limited.
 */

beforeEach(async () => {
  await clearPin();
});

describe('PIN format', () => {
  it.each(['1234', '12345', '123456'])('accepts %s', (pin) => {
    expect(isValidPinFormat(pin)).toBe(true);
  });

  it.each(['123', '1234567', '', 'abcd', '12a4', '12 34'])('rejects %s', (pin) => {
    expect(isValidPinFormat(pin)).toBe(false);
  });
});

describe('PIN storage', () => {
  it('does not persist the PIN in recoverable form', async () => {
    await setPin('1234');

    const raw = await secureStorage.getItem(SecureKeys.appPin);
    expect(raw).toBeTruthy();
    // The literal PIN must not appear anywhere in the stored record.
    expect(raw).not.toContain('1234');

    const record = JSON.parse(raw!) as { salt: string; hash: string; length: number };
    expect(record.salt).toHaveLength(32); // 16 random bytes, hex-encoded
    expect(record.hash).toHaveLength(64); // SHA-256, hex-encoded
    expect(record.length).toBe(4);
  });

  it('salts per PIN, so the same PIN yields a different stored hash', async () => {
    await setPin('1234');
    const first = JSON.parse((await secureStorage.getItem(SecureKeys.appPin))!) as { hash: string; salt: string };

    await clearPin();
    await setPin('1234');
    const second = JSON.parse((await secureStorage.getItem(SecureKeys.appPin))!) as { hash: string; salt: string };

    // Identical PIN, different salt → different digest. Prevents cross-device
    // rainbow-table reuse against a keyspace of only 10^4.
    expect(second.salt).not.toBe(first.salt);
    expect(second.hash).not.toBe(first.hash);
  });

  it('reports whether a PIN exists and its length', async () => {
    expect(await hasPin()).toBe(false);
    expect(await getPinLength()).toBeNull();

    await setPin('123456');

    expect(await hasPin()).toBe(true);
    expect(await getPinLength()).toBe(6);
  });

  it('refuses to store a badly-formatted PIN', async () => {
    expect(await setPin('12')).toBe(false);
    expect(await hasPin()).toBe(false);
  });

  it('clears the PIN', async () => {
    await setPin('1234');
    await clearPin();
    expect(await hasPin()).toBe(false);
  });
});

describe('PIN verification', () => {
  it('accepts the correct PIN', async () => {
    await setPin('4321');
    await expect(verifyPin('4321')).resolves.toEqual({ ok: true });
  });

  it('rejects an incorrect PIN', async () => {
    await setPin('4321');
    const result = await verifyPin('0000');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('incorrect');
  });

  it('reports no_pin when none has been set', async () => {
    const result = await verifyPin('1234');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_pin');
  });

  it('locks out after the attempt limit and stops accepting the right PIN', async () => {
    await setPin('1111');

    for (let i = 1; i < MAX_PIN_ATTEMPTS; i += 1) {
      const result = await verifyPin('9999');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('incorrect');
        expect(result.remainingAttempts).toBe(MAX_PIN_ATTEMPTS - i);
      }
    }

    // The final failure trips the lockout.
    const final = await verifyPin('9999');
    expect(final.ok).toBe(false);
    if (!final.ok) {
      expect(final.reason).toBe('locked_out');
      expect(final.remainingAttempts).toBe(0);
    }
    expect(isLockedOut()).toBe(true);

    // Critically: the correct PIN must also be refused while locked out,
    // otherwise the limit is decorative.
    const correct = await verifyPin('1111');
    expect(correct.ok).toBe(false);
    if (!correct.ok) expect(correct.reason).toBe('locked_out');
  });

  it('resets the attempt counter after a successful entry', async () => {
    await setPin('1111');

    await verifyPin('9999');
    await verifyPin('9999');
    expect(getRemainingAttempts()).toBe(MAX_PIN_ATTEMPTS - 2);

    await verifyPin('1111');
    expect(getRemainingAttempts()).toBe(MAX_PIN_ATTEMPTS);
    expect(isLockedOut()).toBe(false);
  });
});
