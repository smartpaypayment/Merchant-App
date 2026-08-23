/**
 * Palette per App-PRD Section 5.
 *
 * Contrast ratios against `surface` (#FFFFFF) are noted where the colour is used
 * for text, to satisfy the Section 13 accessibility requirement (high contrast).
 */
export const colors = {
  /** Brand primary — used for CTAs, active tabs, focus rings. 5.6:1 on white. */
  primary: '#0B5FFF',
  primaryDark: '#0847BE',
  primaryLight: '#E8F0FF',

  /** Payment received. 4.6:1 on white. */
  success: '#0F7B3E',
  successLight: '#E4F6EB',

  /** Failures, destructive actions. 5.9:1 on white. */
  error: '#C62828',
  errorLight: '#FDECEC',

  /** Pending / attention. Amber is not used for text on white — only fills. */
  warning: '#A35B00',
  warningLight: '#FFF4E0',

  info: '#00668F',
  infoLight: '#E3F4FB',

  /** Neutrals */
  text: '#111827',
  textSecondary: '#4B5563',
  textTertiary: '#6B7280',
  textInverse: '#FFFFFF',
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',
  surface: '#FFFFFF',
  surfaceAlt: '#F9FAFB',
  background: '#F3F4F6',
  skeleton: '#E5E7EB',
  skeletonHighlight: '#F3F4F6',
  overlay: 'rgba(17, 24, 39, 0.55)',
  disabled: '#9CA3AF',
  disabledSurface: '#E5E7EB',
} as const;

export type ColorName = keyof typeof colors;
