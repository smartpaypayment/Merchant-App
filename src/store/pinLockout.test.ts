import {
  clearPin,
  getLockoutRemainingMs,
  isLockedOut,
  loadLockState,
  MAX_PIN_ATTEMPTS,
  setPin,
  verifyPin,
} from './appLock';
import { secureStorage, SecureKeys } from './secureStorage';

/**
 * The persisted, escalating PIN cooldown (Section 12).
 *
 * The old counter lived in a module-level variable, so force-quitting the app
 * reset it — which made the five-attempt limit decorative against exactly the
 * threat it exists to stop: someone holding the phone, typing guesses. These tests
 * pin the two properties that fix: the lockout outlives the process, and it lets
 * the merchant back in on its own so a forgotten PIN is not a bricked app.
 */

/** Exhausts the attempt limit and returns the final result. */
async function exhaustAttempts(wrong = '9999') {
  let last = await verifyPin(wrong);
  for (let i = 1; i < MAX_PIN_ATTEMPTS; i += 1) last = await verifyPin(wrong);
  return last;
}

beforeEach(async () => {
  jest.restoreAllMocks();
  await clearPin();
  await secureStorage.deleteItem(SecureKeys.pinAttempts);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('lockout persistence', () => {
  it('writes the lockout to secure storage, not just memory', async () => {
    await setPin('1111');
    await exhaustAttempts();

    const raw = await secureStorage.getItem(SecureKeys.pinAttempts);
    expect(raw).toBeTruthy();

    const record = JSON.parse(raw!) as { failedAttempts: number; lockedUntil: number | null };
    expect(record.failedAttempts).toBeGreaterThanOrEqual(MAX_PIN_ATTEMPTS);
    expect(typeof record.lockedUntil).toBe('number');
  });

  it('records each failed attempt as it happens, not only at the limit', async () => {
    await setPin('1111');
    await verifyPin('9999');

    const record = JSON.parse((await secureStorage.getItem(SecureKeys.pinAttempts))!) as {
      failedAttempts: number;
    };
    // Persisting only on lockout would let an attacker reset the count at attempt 4
    // indefinitely by killing the app.
    expect(record.failedAttempts).toBe(1);
  });

  it('reports the lockout through loadLockState', async () => {
    await setPin('1111');
    await exhaustAttempts();

    const state = await loadLockState();
    expect(state.isLockedOut).toBe(true);
    expect(state.remainingAttempts).toBe(0);
    expect(state.lockoutRemainingMs).toBeGreaterThan(0);
  });

  it('clears the persisted record on a successful entry', async () => {
    await setPin('1111');
    await verifyPin('9999');
    await verifyPin('1111');

    expect(await secureStorage.getItem(SecureKeys.pinAttempts)).toBeNull();
    expect(isLockedOut()).toBe(false);
  });

  it('clears the persisted record when the PIN is replaced', async () => {
    await setPin('1111');
    await exhaustAttempts();
    expect(isLockedOut()).toBe(true);

    await setPin('2222');

    // Setting a new PIN proves control of the app; carrying the lockout over would
    // strand the merchant for no benefit.
    expect(isLockedOut()).toBe(false);
    expect(await secureStorage.getItem(SecureKeys.pinAttempts)).toBeNull();
  });
});

describe('cooldown expiry', () => {
  it('refuses even the correct PIN while the cooldown is running', async () => {
    await setPin('1111');
    await exhaustAttempts();

    const result = await verifyPin('1111');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('locked_out');
  });

  it('reports a remaining time the UI can count down', async () => {
    await setPin('1111');
    const final = await exhaustAttempts();

    expect(final.ok).toBe(false);
    if (!final.ok) {
      expect(final.reason).toBe('locked_out');
      // First rung of the ladder is 30s.
      expect(final.lockoutRemainingMs).toBe(30_000);
    }
    expect(getLockoutRemainingMs()).toBeGreaterThan(0);
  });

  it('lets the merchant back in once the cooldown elapses', async () => {
    await setPin('1111');
    await exhaustAttempts();
    expect(isLockedOut()).toBe(true);

    // Jump past the 30s first rung.
    const realNow = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(realNow + 31_000);

    expect(isLockedOut()).toBe(false);
    await expect(verifyPin('1111')).resolves.toEqual({ ok: true });
  });

  it('hands back a full set of attempts after the cooldown', async () => {
    await setPin('1111');
    await exhaustAttempts();

    const realNow = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(realNow + 31_000);

    const result = await verifyPin('8888');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('incorrect');
      expect(result.remainingAttempts).toBe(MAX_PIN_ATTEMPTS - 1);
    }
  });
});

describe('escalating ladder', () => {
  it('makes the second lockout longer than the first', async () => {
    await setPin('1111');

    const first = await exhaustAttempts();
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.lockoutRemainingMs).toBe(30_000);

    // Wait out the first cooldown, then fail five more times.
    const realNow = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(realNow + 31_000);

    const second = await exhaustAttempts();
    expect(second.ok).toBe(false);
    if (!second.ok) {
      // Repeat exhaustion is what guessing looks like, so the penalty climbs.
      expect(second.lockoutRemainingMs).toBe(2 * 60_000);
    }
  });

  it('resets the ladder after a successful entry', async () => {
    await setPin('1111');
    await exhaustAttempts();

    const realNow = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(realNow + 31_000);
    await expect(verifyPin('1111')).resolves.toEqual({ ok: true });

    // Back to the first rung: the merchant proved it is them, so a later run of
    // fat-fingering should not inherit an escalated penalty.
    const again = await exhaustAttempts();
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.lockoutRemainingMs).toBe(30_000);
  });

  it('caps the ladder rather than growing without bound', async () => {
    await setPin('1111');

    let elapsed = 0;
    const realNow = Date.now();
    const rungs: number[] = [];

    // Six lockouts: the ladder has four rungs, so the last three must be equal.
    for (let round = 0; round < 6; round += 1) {
      jest.spyOn(Date, 'now').mockReturnValue(realNow + elapsed);
      const result = await exhaustAttempts();
      if (!result.ok && result.lockoutRemainingMs !== undefined) {
        rungs.push(result.lockoutRemainingMs);
        elapsed += result.lockoutRemainingMs + 1_000;
      }
    }

    expect(rungs).toEqual([30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000, 30 * 60_000, 30 * 60_000]);
  });
});
