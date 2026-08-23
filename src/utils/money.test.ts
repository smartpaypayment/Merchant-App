import {
  formatPaise,
  formatPaiseCompact,
  formatPaiseForInput,
  paiseToSpokenAmount,
  parseAmountToPaise,
  rupeesToPaise,
} from './money';

/**
 * Guards the App-PRD Section 8 money rule and the Section 5 currency format.
 *
 * Indian digit grouping is the specific risk here: a Western `toLocaleString`
 * would render 1234567 rupees as "1,234,567" instead of the correct "12,34,567",
 * and that mistake is invisible until a merchant crosses one lakh.
 */

describe('formatPaise — Indian numbering (Section 5)', () => {
  it.each([
    [0, '\u20B90.00'],
    [5, '\u20B90.05'],
    [99, '\u20B90.99'],
    [100, '\u20B91.00'],
    [123450, '\u20B91,234.50'],
    // Grouping switches to 2-digit groups above one thousand.
    [12345675, '\u20B91,23,456.75'],
    [10000000, '\u20B91,00,000.00'],
    [100000000, '\u20B910,00,000.00'],
    // One crore rupees.
    [1000000000, '\u20B91,00,00,000.00'],
    [12345678901, '\u20B912,34,56,789.01'],
  ])('formats %i paise as %s', (paise, expected) => {
    expect(formatPaise(paise)).toBe(expected);
  });

  it('renders negatives with a leading minus, symbol inside', () => {
    expect(formatPaise(-50000)).toBe('-\u20B9500.00');
  });

  it('honours signDisplay and decimals options', () => {
    expect(formatPaise(50000, { signDisplay: 'always' })).toBe('+\u20B9500.00');
    expect(formatPaise(50000, { decimals: false })).toBe('\u20B9500');
    expect(formatPaise(50000, { symbol: false })).toBe('500.00');
  });

  it('coerces a non-integer input rather than emitting fractional paise', () => {
    // Defensive: an untyped source should never produce "₹500.005".
    expect(formatPaise(50000.4)).toBe('\u20B9500.00');
  });
});

describe('parseAmountToPaise', () => {
  it.each([
    ['500', 50000],
    ['1234.5', 123450],
    ['0.05', 5],
    ['.5', 50],
    ['1,234', 123400],
    ['\u20B9 1,00,000', 10000000],
  ])('parses %s to %i paise', (input, expected) => {
    expect(parseAmountToPaise(input)).toBe(expected);
  });

  it.each([['12.345'], [''], ['.'], ['abc'], ['1.2.3'], ['-5']])(
    'rejects unparseable input %s',
    (input) => {
      expect(parseAmountToPaise(input)).toBeNull();
    },
  );
});

describe('round-trip integrity', () => {
  it('never drifts across format → parse for a wide range of values', () => {
    // Float arithmetic on rupees is exactly what the paise rule exists to prevent;
    // this asserts the invariant holds rather than assuming it.
    for (let paise = 0; paise <= 200_000; paise += 7) {
      const formatted = formatPaise(paise, { symbol: false });
      expect(parseAmountToPaise(formatted)).toBe(paise);
    }
  });

  it('converts rupees to paise without float error', () => {
    expect(rupeesToPaise(0.1)).toBe(10);
    expect(rupeesToPaise(1.15)).toBe(115);
    // 19.99 * 100 is 1998.9999... in IEEE-754; must land on 1999.
    expect(rupeesToPaise(19.99)).toBe(1999);
  });
});

describe('formatPaiseCompact — lakh/crore abbreviation', () => {
  it.each([
    [45000, '\u20B9450'],
    [550000, '\u20B95.5K'],
    [12345000, '\u20B91.23 L'],
    [1234500000, '\u20B91.23 Cr'],
  ])('abbreviates %i paise as %s', (paise, expected) => {
    expect(formatPaiseCompact(paise)).toBe(expected);
  });
});

describe('input and audio helpers', () => {
  it('omits trailing .00 in editable amount fields', () => {
    expect(formatPaiseForInput(50000)).toBe('500');
    expect(formatPaiseForInput(50050)).toBe('500.50');
    expect(formatPaiseForInput(10000000)).toBe('1,00,000');
  });

  it('produces the spoken form used by audio confirmation (Section 6.7)', () => {
    expect(paiseToSpokenAmount(50000)).toBe('500');
    expect(paiseToSpokenAmount(50050)).toBe('500.50');
  });
});
