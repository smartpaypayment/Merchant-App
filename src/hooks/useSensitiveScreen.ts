import { useEffect } from 'react';
import * as ScreenCapture from 'expo-screen-capture';

/**
 * Blocks screenshots and screen recording while a sensitive surface is on screen
 * (Section 12, sensitive data handling).
 *
 * On Android this sets `FLAG_SECURE`, which has a second effect worth having: the
 * window is excluded from the app-switcher thumbnail, so the OS does not retain a
 * snapshot after the app is backgrounded. That closes the gap where a merchant's
 * PIN pad or bank details sit in the recents list.
 *
 * ## Why this is reference counted
 *
 * `preventScreenCaptureAsync` / `allowScreenCaptureAsync` are a single global
 * switch, not a stack. So the obvious per-screen implementation breaks as soon as
 * two sensitive surfaces overlap — which they do here: the profile bank form is
 * protected, and opening `ReauthSheet` on top of it mounts a second protected
 * surface. When the sheet closed it would call `allow…` and silently strip the
 * protection from the form still underneath it.
 *
 * The counter below means the flag is only released when the *last* sensitive
 * surface goes away.
 *
 * ## Where this is deliberately not used
 *
 * Not on the QR screens. Merchants legitimately screenshot their static QR to
 * print it, put it in a shop-front poster, or send it over WhatsApp — blocking
 * that would break a real workflow to protect a payment address that is meant to
 * be public. The rule applied here is narrower than "anything financial": it
 * covers credentials (the PIN pad) and the identity/banking details that would let
 * someone impersonate the merchant or redirect their settlements.
 */
let activeCount = 0;

function acquire(): void {
  activeCount += 1;
  if (activeCount > 1) return;

  void ScreenCapture.preventScreenCaptureAsync().catch(() => {
    // Throws on unsupported platforms — notably web, where the preview runs. A
    // hardened screen must not become an unopenable one because a best-effort
    // protection is unavailable.
  });
}

function release(): void {
  activeCount = Math.max(0, activeCount - 1);
  if (activeCount > 0) return;

  void ScreenCapture.allowScreenCaptureAsync().catch(() => {
    /* no-op */
  });
}

/**
 * @param active Set false to suspend protection — used by `ReauthSheet`, which is
 *   always mounted but only sensitive while its modal is visible.
 */
export function useSensitiveScreen(active = true): void {
  useEffect(() => {
    if (!active) return;
    acquire();
    return release;
  }, [active]);
}

/** Test seam. */
export const __getSensitiveScreenCount = (): number => activeCount;
