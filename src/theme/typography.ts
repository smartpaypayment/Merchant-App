import { TextStyle } from 'react-native';

/**
 * Type scale per App-PRD Section 5 ("scalable font sizes").
 *
 * Sizes are unscaled base values. Components pass `allowFontScaling` (RN default
 * `true`) so the OS font-size setting is respected — Section 13 requires dynamic
 * font scaling support. `maxFontSizeMultiplier` is capped on numeric/amount
 * styles only, where runaway scaling would break the layout.
 */
export const fontSize = {
  caption: 12,
  small: 14,
  body: 16,
  bodyLarge: 18,
  title: 20,
  heading: 24,
  display: 32,
  amountHero: 40,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const satisfies Record<string, TextStyle['fontWeight']>;

export const lineHeight = {
  caption: 16,
  small: 20,
  body: 24,
  bodyLarge: 26,
  title: 28,
  heading: 32,
  display: 40,
  amountHero: 48,
} as const;

export const typography = {
  caption: { fontSize: fontSize.caption, lineHeight: lineHeight.caption, fontWeight: fontWeight.regular },
  captionMedium: { fontSize: fontSize.caption, lineHeight: lineHeight.caption, fontWeight: fontWeight.semibold },
  small: { fontSize: fontSize.small, lineHeight: lineHeight.small, fontWeight: fontWeight.regular },
  smallMedium: { fontSize: fontSize.small, lineHeight: lineHeight.small, fontWeight: fontWeight.semibold },
  body: { fontSize: fontSize.body, lineHeight: lineHeight.body, fontWeight: fontWeight.regular },
  bodyMedium: { fontSize: fontSize.body, lineHeight: lineHeight.body, fontWeight: fontWeight.semibold },
  bodyLarge: { fontSize: fontSize.bodyLarge, lineHeight: lineHeight.bodyLarge, fontWeight: fontWeight.medium },
  title: { fontSize: fontSize.title, lineHeight: lineHeight.title, fontWeight: fontWeight.semibold },
  heading: { fontSize: fontSize.heading, lineHeight: lineHeight.heading, fontWeight: fontWeight.bold },
  display: { fontSize: fontSize.display, lineHeight: lineHeight.display, fontWeight: fontWeight.bold },
} as const satisfies Record<string, TextStyle>;

/** Caps scaling on amount displays so ₹ figures never overflow their container. */
export const MAX_AMOUNT_FONT_SCALE = 1.4;
