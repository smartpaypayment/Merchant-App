import { en, type TranslationBundle } from './en';
import { hi } from './hi';
import { ta } from './ta';
import { te } from './te';
import { kn } from './kn';
import { mr } from './mr';
import { bn } from './bn';
import { gu } from './gu';

/**
 * Languages shipped at launch — App-PRD Section 5 requires
 * "Hindi, English + regional (Tamil, Telugu, Kannada, Marathi, Bengali, Gujarati)".
 *
 * `nativeName` is intentionally in the language's own script so the picker is
 * readable to a merchant who cannot read the current UI language.
 */
export interface SupportedLanguage {
  code: string;
  nativeName: string;
  englishName: string;
}

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  { code: 'en', nativeName: 'English', englishName: 'English' },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi' },
  { code: 'ta', nativeName: 'தமிழ்', englishName: 'Tamil' },
  { code: 'te', nativeName: 'తెలుగు', englishName: 'Telugu' },
  { code: 'kn', nativeName: 'ಕನ್ನಡ', englishName: 'Kannada' },
  { code: 'mr', nativeName: 'मराठी', englishName: 'Marathi' },
  { code: 'bn', nativeName: 'বাংলা', englishName: 'Bengali' },
  { code: 'gu', nativeName: 'ગુજરાતી', englishName: 'Gujarati' },
] as const;

export const SUPPORTED_LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

export const DEFAULT_LANGUAGE = 'en';
export const FALLBACK_LANGUAGE = 'en';

export const resources = {
  en: { translation: en },
  hi: { translation: hi },
  ta: { translation: ta },
  te: { translation: te },
  kn: { translation: kn },
  mr: { translation: mr },
  bn: { translation: bn },
  gu: { translation: gu },
} as const;

export const isSupportedLanguage = (code: string): boolean => SUPPORTED_LANGUAGE_CODES.includes(code);

export type { TranslationBundle };
