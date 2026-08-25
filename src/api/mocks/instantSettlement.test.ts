import {
  checkInstantSettlementEligibility,
  computeInstantSettlementQuote,
  GST_ON_FEE_BPS,
  INSTANT_SETTLEMENT_FEE_BPS,
  INSTANT_SETTLEMENT_MIN_PAISE,
} from './instantSettlement';

/**
 * Instant-settlement fee arithmetic.
 *
 * This is money the merchant knowingly gives up, shown to them as an itemised
 * breakdown, so the invariant that matters most is that the parts sum exactly to
 * the whole — a single stray paisa makes the breakdown unreconcilable against the
 * bank credit.
 */

describe('computeInstantSettlementQuote', () => {
  it('charges 0.20% plus 18% GST on that fee', () => {
    // ₹10,000.00 → fee ₹20.00 → GST ₹3.60 → payout ₹9,976.40
    const quote = computeInstantSettlementQuote(10_000_00);

    expect(quote.feeAmount).toBe(2000);
    expect(quote.gstAmount).toBe(360);
    expect(quote.totalFeeAmount).toBe(2360);
    expect(quote.payoutAmount).toBe(10_000_00 - 2360);
    expect(quote.feeBps).toBe(INSTANT_SETTLEMENT_FEE_BPS);
  });

  it('returns every amount as an integer paise value', () => {
    // A deliberately awkward amount that does not divide cleanly.
    const quote = computeInstantSettlementQuote(33_333);

    for (const [key, value] of Object.entries(quote)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(`${key}:${value}`).not.toMatch(/\./);
    }
  });

  it('keeps payout + totalFee === net for a wide range of amounts', () => {
    // The invariant the merchant reconciles against. Checked across amounts that
    // exercise rounding in both directions.
    for (let net = 0; net <= 5_000_000; net += 7_919) {
      const quote = computeInstantSettlementQuote(net);
      expect(quote.payoutAmount + quote.totalFeeAmount).toBe(net);
      expect(quote.feeAmount + quote.gstAmount).toBe(quote.totalFeeAmount);
    }
  });

  it('derives GST from the fee, not from the net amount', () => {
    const net = 1_00_000_00; // ₹1,00,000.00
    const quote = computeInstantSettlementQuote(net);

    const expectedFee = Math.round((net * INSTANT_SETTLEMENT_FEE_BPS) / 10_000);
    const expectedGst = Math.round((expectedFee * GST_ON_FEE_BPS) / 10_000);

    expect(quote.feeAmount).toBe(expectedFee);
    expect(quote.gstAmount).toBe(expectedGst);
    // Sanity: GST on the net would be enormously larger.
    expect(quote.gstAmount).toBeLessThan(quote.feeAmount);
  });

  it('never returns a payout greater than the net amount', () => {
    for (const net of [0, 1, 99, 100, 12_345, 99_99_999]) {
      const quote = computeInstantSettlementQuote(net);
      expect(quote.payoutAmount).toBeLessThanOrEqual(net);
    }
  });

  it('coerces a non-integer or negative input rather than propagating it', () => {
    expect(computeInstantSettlementQuote(1234.7).netAmount).toBe(1235);
    expect(computeInstantSettlementQuote(-5000).netAmount).toBe(0);
    expect(computeInstantSettlementQuote(Number.NaN).netAmount).toBe(0);
  });

  it('produces a zero-fee quote for a zero batch', () => {
    const quote = computeInstantSettlementQuote(0);
    expect(quote.totalFeeAmount).toBe(0);
    expect(quote.payoutAmount).toBe(0);
  });
});

describe('checkInstantSettlementEligibility', () => {
  const above = INSTANT_SETTLEMENT_MIN_PAISE + 1;

  it.each(['pending', 'processing'])('allows an in-flight %s batch', (status) => {
    expect(checkInstantSettlementEligibility(status, above)).toEqual({ eligible: true });
  });

  it('refuses a batch that already settled', () => {
    expect(checkInstantSettlementEligibility('settled', above)).toEqual({
      eligible: false,
      reason: 'already_settled',
    });
  });

  it('refuses a failed batch', () => {
    expect(checkInstantSettlementEligibility('failed', above)).toEqual({
      eligible: false,
      reason: 'failed_batch',
    });
  });

  it('refuses a batch below the minimum', () => {
    expect(checkInstantSettlementEligibility('pending', INSTANT_SETTLEMENT_MIN_PAISE - 1)).toEqual({
      eligible: false,
      reason: 'below_minimum',
    });
  });

  it('allows a batch exactly at the minimum', () => {
    expect(checkInstantSettlementEligibility('pending', INSTANT_SETTLEMENT_MIN_PAISE).eligible).toBe(true);
  });

  it('checks state before amount, so a settled small batch reads as settled', () => {
    // Ordering matters for the message the merchant sees.
    expect(checkInstantSettlementEligibility('settled', 1).reason).toBe('already_settled');
  });
});
