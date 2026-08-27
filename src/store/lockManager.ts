import { AppState, type AppStateStatus } from 'react-native';
import { create } from 'zustand';
import { hasPin } from './appLock';
import { storage, StorageKeys } from './storage';

/**
 * App-lock enforcement (Section 12: "App lock: PIN + biometric").
 *
 * Before this existed, only *half* of that requirement was met: `ReauthSheet`
 * gated refunds and bank changes, but nothing ever locked the app itself. A valid
 * token in the Keystore put whoever picked the phone up straight onto Home, with
 * the day's takings, the transaction history and the settlement account on screen.
 *
 * ## When it locks
 *
 * On **cold start**, always — a fresh process means the phone has been handed over,
 * rebooted, or left alone long enough for the OS to reclaim the app.
 *
 * On **return from background**, only after `BACKGROUND_GRACE_MS`. This is the
 * decision that makes the feature usable rather than hated: a merchant collecting
 * payments flips to their UPI app, the camera, or WhatsApp dozens of times an hour,
 * and a lock screen on every return would be punishing enough that they would turn
 * the whole thing off — which is strictly worse for their security than a five
 * minute window.
 *
 * ## Why the last-active time is in memory only
 *
 * It is never written to disk. A persisted timestamp would be a tamper surface
 * (edit it, skip the lock) for no benefit, because the cold-start path already
 * locks unconditionally — the only thing the timestamp decides is whether a
 * *still-running* process needs to re-lock, and a still-running process has its
 * memory intact by definition.
 */
const BACKGROUND_GRACE_MS = 5 * 60_000;

interface LockManagerState {
  /** False until the initial decision has been made; the UI shows Splash meanwhile. */
  isReady: boolean;
  isLocked: boolean;
  /** True when a PIN exists *and* the merchant has not opted out. */
  isEnabled: boolean;

  init: () => Promise<void>;
  /** Re-reads the preference and PIN presence, e.g. after a PIN is created. */
  refresh: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  unlock: () => void;
  lockNow: () => void;
}

/** Wall-clock time the app was last backgrounded, or null while foregrounded. */
let backgroundedAt: number | null = null;
let appStateSubscribed = false;

/**
 * Resolves whether locking applies.
 *
 * Defaults to **on** when a PIN exists: a merchant who went to the trouble of
 * setting one has expressed the intent. With no PIN there is nothing to unlock
 * with, so the lock must stay off or the app would be unopenable.
 */
async function resolveEnabled(): Promise<boolean> {
  const [pinExists, preference] = await Promise.all([
    hasPin(),
    storage.getObject<boolean>(StorageKeys.appLockEnabled),
  ]);
  return pinExists && preference !== false;
}

export const useLockManager = create<LockManagerState>((set, get) => ({
  isReady: false,
  isLocked: false,
  isEnabled: false,

  init: async () => {
    const isEnabled = await resolveEnabled();

    // Cold start: locked immediately if enabled.
    set({ isEnabled, isLocked: isEnabled, isReady: true });

    if (!appStateSubscribed) {
      appStateSubscribed = true;

      AppState.addEventListener('change', (state: AppStateStatus) => {
        if (state === 'background' || state === 'inactive') {
          // Only record the first transition — iOS fires 'inactive' then
          // 'background', and overwriting would reset the clock.
          backgroundedAt ??= Date.now();
          return;
        }

        if (state === 'active') {
          const awayFor = backgroundedAt === null ? 0 : Date.now() - backgroundedAt;
          backgroundedAt = null;

          // Re-resolve rather than trusting cached state: the merchant may have
          // created or removed a PIN while the app was in the background.
          void resolveEnabled().then((enabled) => {
            set({ isEnabled: enabled });
            if (enabled && awayFor > BACKGROUND_GRACE_MS) set({ isLocked: true });
          });
        }
      });
    }
  },

  refresh: async () => {
    const isEnabled = await resolveEnabled();
    // Never leave the app locked with no way in: if the PIN was just removed, the
    // lock has to release or the merchant is stranded on an unanswerable screen.
    set(isEnabled ? { isEnabled } : { isEnabled, isLocked: false });
  },

  setEnabled: async (enabled: boolean) => {
    await storage.setObject(StorageKeys.appLockEnabled, enabled);
    const isEnabled = enabled && (await hasPin());
    set({ isEnabled, ...(isEnabled ? {} : { isLocked: false }) });
  },

  unlock: () => {
    backgroundedAt = null;
    set({ isLocked: false });
  },

  lockNow: () => {
    if (get().isEnabled) set({ isLocked: true });
  },
}));

export const LOCK_BACKGROUND_GRACE_MS = BACKGROUND_GRACE_MS;

/** Test seam: resets the module-level AppState bookkeeping. */
export function __resetLockManagerForTests(): void {
  backgroundedAt = null;
  appStateSubscribed = false;
  useLockManager.setState({ isReady: false, isLocked: false, isEnabled: false });
}
