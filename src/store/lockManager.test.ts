import { AppState } from 'react-native';
import { clearPin, setPin } from './appLock';
import {
  LOCK_BACKGROUND_GRACE_MS,
  useLockManager,
  __resetLockManagerForTests,
} from './lockManager';
import { storage, StorageKeys } from './storage';

/**
 * App-lock enforcement (Section 12).
 *
 * The behaviours worth pinning are the ones a careless refactor would break in a
 * way nobody notices until it matters: that a cold start locks, that a quick trip
 * to another app does *not*, and that the lock can never be left up with no PIN to
 * answer it.
 */

type AppStateHandler = (state: string) => void;

/**
 * Drains the microtask queue.
 *
 * The foreground handler re-reads the PIN presence and the stored preference
 * before deciding to lock, so the decision lands several promise ticks after the
 * AppState event. A fixed number of `await Promise.resolve()` calls is brittle
 * against that chain's length; a macrotask boundary flushes all of it.
 */
const flushAsync = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

let handler: AppStateHandler | null = null;

beforeEach(async () => {
  jest.restoreAllMocks();
  __resetLockManagerForTests();
  await clearPin();
  await storage.remove(StorageKeys.appLockEnabled);

  handler = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event: string, cb: AppStateHandler) => {
    handler = cb;
    return { remove: jest.fn() };
  }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('whether the lock applies at all', () => {
  it('stays off when no PIN has been set', async () => {
    await useLockManager.getState().init();

    // Nothing to unlock with — locking here would make the app unopenable.
    expect(useLockManager.getState().isEnabled).toBe(false);
    expect(useLockManager.getState().isLocked).toBe(false);
    expect(useLockManager.getState().isReady).toBe(true);
  });

  it('defaults to on once a PIN exists', async () => {
    await setPin('1234');
    await useLockManager.getState().init();

    // Setting a PIN is the merchant expressing the intent; no second opt-in.
    expect(useLockManager.getState().isEnabled).toBe(true);
  });

  it('locks on cold start when enabled', async () => {
    await setPin('1234');
    await useLockManager.getState().init();

    expect(useLockManager.getState().isLocked).toBe(true);
  });

  it('honours an explicit opt-out', async () => {
    await setPin('1234');
    await storage.setObject(StorageKeys.appLockEnabled, false);

    await useLockManager.getState().init();

    expect(useLockManager.getState().isEnabled).toBe(false);
    expect(useLockManager.getState().isLocked).toBe(false);
  });
});

describe('background grace period', () => {
  beforeEach(async () => {
    await setPin('1234');
    await useLockManager.getState().init();
    useLockManager.getState().unlock();
    expect(useLockManager.getState().isLocked).toBe(false);
  });

  it('does not lock on a brief trip to another app', async () => {
    const start = Date.now();
    handler!('background');

    // 30 seconds — a merchant checking their UPI app mid-transaction.
    jest.spyOn(Date, 'now').mockReturnValue(start + 30_000);
    handler!('active');
    await flushAsync();

    // Locking here is the behaviour that would get the whole feature switched off.
    expect(useLockManager.getState().isLocked).toBe(false);
  });

  it('locks after the grace period elapses', async () => {
    const start = Date.now();
    handler!('background');

    jest.spyOn(Date, 'now').mockReturnValue(start + LOCK_BACKGROUND_GRACE_MS + 1_000);
    handler!('active');
    await flushAsync();

    expect(useLockManager.getState().isLocked).toBe(true);
  });

  it('does not lock on foreground when the lock is disabled', async () => {
    await useLockManager.getState().setEnabled(false);

    const start = Date.now();
    handler!('background');
    jest.spyOn(Date, 'now').mockReturnValue(start + LOCK_BACKGROUND_GRACE_MS + 1_000);
    handler!('active');
    await flushAsync();

    expect(useLockManager.getState().isLocked).toBe(false);
  });

  it('measures from the first background transition, not the last', async () => {
    const start = Date.now();

    // iOS emits 'inactive' then 'background'; the clock must start at 'inactive'.
    handler!('inactive');
    jest.spyOn(Date, 'now').mockReturnValue(start + 1_000);
    handler!('background');

    jest.spyOn(Date, 'now').mockReturnValue(start + LOCK_BACKGROUND_GRACE_MS + 500);
    handler!('active');
    await flushAsync();

    expect(useLockManager.getState().isLocked).toBe(true);
  });
});

describe('never strand the merchant', () => {
  it('releases the lock when the PIN is removed', async () => {
    await setPin('1234');
    await useLockManager.getState().init();
    expect(useLockManager.getState().isLocked).toBe(true);

    await clearPin();
    await useLockManager.getState().refresh();

    // Otherwise the merchant faces a lock screen with no PIN that can answer it.
    expect(useLockManager.getState().isEnabled).toBe(false);
    expect(useLockManager.getState().isLocked).toBe(false);
  });

  it('releases the lock when disabled from Settings', async () => {
    await setPin('1234');
    await useLockManager.getState().init();

    await useLockManager.getState().setEnabled(false);

    expect(useLockManager.getState().isLocked).toBe(false);
  });

  it('persists the opt-out across a restart', async () => {
    await setPin('1234');
    await useLockManager.getState().init();
    await useLockManager.getState().setEnabled(false);

    __resetLockManagerForTests();
    await useLockManager.getState().init();

    expect(useLockManager.getState().isEnabled).toBe(false);
  });

  it('cannot be enabled without a PIN', async () => {
    await useLockManager.getState().setEnabled(true);

    expect(useLockManager.getState().isEnabled).toBe(false);
    expect(useLockManager.getState().isLocked).toBe(false);
  });
});

describe('unlock', () => {
  it('clears the lock and resets the away clock', async () => {
    await setPin('1234');
    await useLockManager.getState().init();
    expect(useLockManager.getState().isLocked).toBe(true);

    useLockManager.getState().unlock();
    expect(useLockManager.getState().isLocked).toBe(false);

    // The away timer must not still be running from before the unlock, or the very
    // next foreground event would re-lock immediately.
    handler!('active');
    await flushAsync();
    expect(useLockManager.getState().isLocked).toBe(false);
  });

  it('lockNow only applies when the lock is enabled', async () => {
    await useLockManager.getState().init();
    useLockManager.getState().lockNow();
    expect(useLockManager.getState().isLocked).toBe(false);
  });
});
