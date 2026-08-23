import type { Paise } from '@models/index';

export const RUPEE_SYMBOL = '\u20B9';
const PAISE_PER_RUPEE = 100;

/**
 * Money handling per App-PRD Section 8:
 *
 *   "store all money as integer paise; format to ₹ only in the UI layer."
 *
 * Every function here takes or returns integer paise. Nothing in this module
 * produces a float that could later be persisted or sent to the API — the only
 * float-producing function is `paiseToRupeeNumber`, which is explicitly for
 * chart axes and is never round-tripped back into a payload.
 *
 * Grouping is hand-rolled rather than delegated to `Intl.NumberFormat('en-IN')`
 * because Hermes builds ship without full ICU on some Android 8 devices, which
 * would silently fall back to Western 3-digit grouping (1,234,567 instead of
 * 12,34,567) — wrong for the Indian market this app targets.
 */

/** Groups an integer digit string in the Indian style: last 3, then pairs. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const pairs: string[] = [];
  for (let i = rest.length; i > 0; i -= 2) {
    pairs.unshift(rest.slice(Math.max(0, i - 2), i));
  }
  return `${pairs.join(',')},${last3}`;
}

export interface FormatPaiseOptions {
  /** Include the ₹ symbol. Default `true`. */
  symbol?: boolean;
  /**
   * Show the `.00` decimals. Default `true`.
   * Set `false` for dense UI like chart labels.
   */
  decimals?: boolean;
  /** Render a leading `+`/`-`. Default: only `-` for negatives. */
  signDisplay?: 'auto' | 'always' | 'never';
}

/**
 * Formats integer paise as an Indian-grouped rupee string.
 *
 * @example formatPaise(123450)     // '₹1,234.50'
 * @example formatPaise(12345675)   // '₹1,23,456.75'
 * @example formatPaise(100000000)  // '₹10,00,000.00'
 */
export function formatPaise(paise: Paise, options: FormatPaiseOptions = {}): string {
  const { symbol = true, decimals = true, signDisplay = 'auto' } = options;

  // Guard against a non-integer sneaking in from an untyped source.
  const safe = Number.isFinite(paise) ? Math.round(paise) : 0;
  const negative = safe < 0;
  const abs = Math.abs(safe);

  const rupees = Math.floor(abs / PAISE_PER_RUPEE);
  const remainder = abs % PAISE_PER_RUPEE;

  let out = groupIndian(String(rupees));
  if (decimals) out += `.${String(remainder).padStart(2, '0')}`;
  if (symbol) out = `${RUPEE_SYMBOL}${out}`;

  if (negative && signDisplay !== 'never') out = `-${out}`;
  else if (!negative && signDisplay === 'always') out = `+${out}`;

  return out;
}

/**
 * Abbreviates large amounts for compact surfaces (chart axes, summary tiles)
 * using Indian units. Section 5 calls out lakhs/crores explicitly.
 *
 * @example formatPaiseCompact(1234500000) // '₹1.23 Cr'
 * @example formatPaiseCompact(12345000)   // '₹1.23 L'
 */
export function formatPaiseCompact(paise: Paise): string {
  const safe = Number.isFinite(paise) ? Math.round(paise) : 0;
  const negative = safe < 0;
  const rupees = Math.abs(safe) / PAISE_PER_RUPEE;

  let body: string;
  if (rupees >= 1_00_00_000) body = `${(rupees / 1_00_00_000).toFixed(2)} Cr`;
  else if (rupees >= 1_00_000) body = `${(rupees / 1_00_000).toFixed(2)} L`;
  else if (rupees >= 1_000) body = `${(rupees / 1_000).toFixed(1)}K`;
  else body = groupIndian(String(Math.round(rupees)));

  return `${negative ? '-' : ''}${RUPEE_SYMBOL}${body}`;
}

/** Converts a rupee value to integer paise. Rounds to the nearest paisa. */
export function rupeesToPaise(rupees: number): Paise {
  if (!Number.isFinite(rupees)) return 0;
  return Math.round(rupees * PAISE_PER_RUPEE);
}

/**
 * Converts paise to a rupee float. **Display and charting only** — never feed
 * the result back into a stored value or an API payload.
 */
export function paiseToRupeeNumber(paise: Paise): number {
  return paise / PAISE_PER_RUPEE;
}

/**
 * Parses raw keypad/text input into integer paise.
 *
 * Accepts digits with at most one decimal point and at most 2 decimal places.
 * Returns `null` for anything unparseable so callers can surface a validation
 * error rather than silently coercing to 0.
 *
 * @example parseAmountToPaise('1234.5')  // 123450
 * @example parseAmountToPaise('1,234')   // 123400
 * @example parseAmountToPaise('12.345')  // null
 */
export function parseAmountToPaise(input: string): Paise | null {
  const cleaned = input.replace(/[,\s\u20B9]/g, '');
  if (cleaned === '' || cleaned === '.') return null;
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned)) return null;

  const [whole = '0', frac = ''] = cleaned.split('.');
  const rupeePart = whole === '' ? 0 : Number(whole);
  if (!Number.isSafeInteger(rupeePart)) return null;

  const paisePart = Number(frac.padEnd(2, '0') || '0');
  return rupeePart * PAISE_PER_RUPEE + paisePart;
}

/**
 * Formats paise for an editable amount field: grouped, but with decimals only
 * when they are non-zero, so the merchant isn't fighting a trailing `.00`.
 */
export function formatPaiseForInput(paise: Paise): string {
  const rupees = Math.floor(paise / PAISE_PER_RUPEE);
  const remainder = paise % PAISE_PER_RUPEE;
  const grouped = groupIndian(String(rupees));
  return remainder === 0 ? grouped : `${grouped}.${String(remainder).padStart(2, '0')}`;
}

/**
 * Spoken form of an amount, used for the Section 6.7 audio confirmation.
 * Returns the numeric portion only; the surrounding phrase comes from i18n.
 *
 * @example paiseToSpokenAmount(50000) // '500'
 * @example paiseToSpokenAmount(50050) // '500.50'
 */
export function paiseToSpokenAmount(paise: Paise): string {
  const rupees = Math.floor(paise / PAISE_PER_RUPEE);
  const remainder = paise % PAISE_PER_RUPEE;
  return remainder === 0 ? String(rupees) : `${rupees}.${String(remainder).padStart(2, '0')}`;
}
