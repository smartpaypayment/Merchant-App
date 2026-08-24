import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import i18n from '@localization/i18n';
import type { MerchantPreferences, Paise } from '@models/index';
import { paiseToSpokenAmount } from '@utils/money';

/**
 * Audio + haptic payment confirmation.
 *
 * App-PRD Section 6.6/6.7 and PRD SND-1: announce the received payment out loud
 * in the merchant's chosen language ("₹500 received"), because a shopkeeper
 * cannot watch the screen while serving customers — this is the anti-fraud
 * signal that replaces trusting a customer's screenshot.
 *
 * Implemented with on-device TTS (`expo-speech`) rather than pre-recorded clips.
 * The trade-off, stated plainly:
 *   + handles any amount in 8 languages with no audio assets to ship or maintain
 *   - depends on a TTS voice for that language being installed on the device, and
 *     `expo-speech` exposes no volume control (it follows system media volume),
 *     so `preferences.audioConfirmation.volume` cannot be honoured here.
 *
 * A production soundbox would ship pre-recorded number fragments and concatenate
 * them through `expo-audio`, which is offline-proof and volume-controllable.
 * `announcePayment` is the single seam where that swap happens.
 */

/** App language code → BCP-47 tag for the Indian voice of that language. */
const SPEECH_LOCALE: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
  mr: 'mr-IN',
  bn: 'bn-IN',
  gu: 'gu-IN',
};

export interface AudioConfirmationSettings {
  enabled: boolean;
  /** App language code; falls back to the active UI language. */
  language?: string;
}

/** Reads the announcement settings off the merchant profile. */
export function settingsFromPreferences(
  preferences: MerchantPreferences | undefined,
): AudioConfirmationSettings {
  if (!preferences) return { enabled: true };
  return {
    enabled: preferences.audioConfirmation.enabled,
    language: preferences.audioConfirmation.language || preferences.language,
  };
}

/**
 * Speaks the received amount and fires a success haptic.
 *
 * Fire-and-forget by design: the caller is rendering a success screen and must
 * not await audio. Failures are swallowed — a missing TTS voice should never
 * block the visual confirmation, which is the authoritative one.
 */
export function announcePayment(amount: Paise, settings: AudioConfirmationSettings): void {
  // Haptic first: it is instant and works even with audio disabled or muted.
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

  if (!settings.enabled) return;

  const language = settings.language ?? i18n.language ?? 'en';
  const locale = SPEECH_LOCALE[language] ?? SPEECH_LOCALE['en']!;

  // The phrase itself is localized; only the numeral is interpolated, so word
  // order stays correct in every language ("₹500 मिले" vs "Received ₹500").
  const phrase = i18n.t('collect.audio.received', {
    amount: paiseToSpokenAmount(amount),
    lng: language,
  });

  try {
    // Cancel any in-flight announcement so two quick payments do not overlap
    // into an unintelligible mumble.
    void Speech.stop().catch(() => {});
    Speech.speak(phrase, {
      language: locale,
      // Slightly slower than default: these are numbers, spoken once, often in a
      // noisy shop.
      rate: 0.92,
      pitch: 1.0,
    });
  } catch {
    /* TTS unavailable — the visual confirmation stands on its own. */
  }
}

/** Stops any in-flight announcement, e.g. when leaving the success screen. */
export function stopAnnouncement(): void {
  void Speech.stop().catch(() => {});
}

/** Light tap for QR generation and keypad presses. */
export function tapFeedback(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
