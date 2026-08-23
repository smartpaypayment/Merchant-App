import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { storage, StorageKeys } from '@/store/storage';
import {
  DEFAULT_LANGUAGE,
  FALLBACK_LANGUAGE,
  isSupportedLanguage,
  resources,
  SUPPORTED_LANGUAGE_CODES,
} from './resources';

/**
 * i18n bootstrap (App-PRD Section 5 / 13).
 *
 * Resolution order for the initial language:
 *   1. Explicit merchant choice persisted locally (survives reinstall of state).
 *   2. Device locale, if we ship that language.
 *   3. English.
 *
 * `compatibilityJSON: 'v4'` keeps plural handling consistent with the
 * `_plural` suffixed keys used in the bundles.
 */

function detectDeviceLanguage(): string {
  try {
    const locales = getLocales();
    for (const locale of locales) {
      const code = locale.languageCode;
      if (code && isSupportedLanguage(code)) return code;
    }
  } catch {
    // getLocales can throw on some Android builds; fall through to the default.
  }
  return DEFAULT_LANGUAGE;
}

let initialized = false;

export async function initI18n(): Promise<typeof i18n> {
  if (initialized) return i18n;

  const saved = await storage.getString(StorageKeys.language);
  const lng = saved && isSupportedLanguage(saved) ? saved : detectDeviceLanguage();

  await i18n.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGE_CODES,
    defaultNS: 'translation',
    interpolation: {
      // RN has no XSS surface for text nodes; escaping would mangle ₹ and
      // Indic conjuncts in interpolated values.
      escapeValue: false,
    },
    returnNull: false,
    compatibilityJSON: 'v4',
    react: { useSuspense: false },
  });

  initialized = true;
  return i18n;
}

/** Switches language and persists the choice for the next cold start. */
export async function setLanguage(code: string): Promise<void> {
  if (!isSupportedLanguage(code)) return;
  await i18n.changeLanguage(code);
  await storage.setString(StorageKeys.language, code);
}

export const getCurrentLanguage = (): string => i18n.language ?? DEFAULT_LANGUAGE;

export default i18n;
