import type { Transaction, TxnStatus } from '@models/index';
import {
  getRefundEligibility,
  MIN_REFUND_PAISE,
  validateRefundAmount,
} from './refundEligibility';

/**
 * Refund eligibility is the gate between a merchant tapping a button and money
 * leaving their account, so the arithmetic and the status rules are pinned here.
 * All amounts are integer paise (Section 8).
 */

function txn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn_test',
    amount: 100_000, // ₹1,000.00
    currency: 'INR',
    status: 'success',
    mode: 'upi_qr',
    fee: 0,
    netAmount: 100_000,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('getRefundEligibility — status rules', () => {
  it('allows a full refund on an untouched successful payment', () => {
    const result = getRefundEligibility(txn());
    expect(result.eligible).toBe(true);
    expect(result.refundable).toBe(100_000);
    expect(result.alreadyRefunded).toBe(0);
  });

  it('allows the remainder on a partially refunded payment', () => {
    const result = getRefundEligibility(
      txn({ status: 'partially_refunded', refundedAmount: 40_000 }),
    );
    expect(result.eligible).toBe(true);
    // ₹1,000 - ₹400 = ₹600 still refundable.
    expect(result.refundable).toBe(60_000);
    expect(result.alreadyRefunded).toBe(40_000);
  });

  it.each<TxnStatus>(['pending', 'failed', 'refunded'])('blocks a %s payment', (status) => {
    const result = getRefundEligibility(
      txn({ status, ...(status === 'refunded' ? { refundedAmount: 100_000 } : {}) }),
    );
    expect(result.eligible).toBe(false);
  });

  it('blocks a pending payment with not_successful, since nothing is confirmed yet', () => {
    const result = getRefundEligibility(txn({ status: 'pending' }));
    expect(result.reason).toBe('not_successful');
  });

  it('blocks when the full amount is already refunded', () => {
    const result = getRefundEligibility(
      txn({ status: 'partially_refunded', refundedAmount: 100_000 }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('fully_refunded');
    expect(result.refundable).toBe(0);
  });

  it('blocks a sub-rupee remainder that the refund rail cannot carry', () => {
    // ₹1,000.00 minus ₹999.50 leaves 50 paise.
    const result = getRefundEligibility(
      txn({ status: 'partially_refunded', refundedAmount: 99_950 }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('below_minimum');
    expect(result.refundable).toBe(50);
  });

  it('never reports a negative refundable amount', () => {
    // Defensive: a server-side over-refund must not produce a negative window.
    const result = getRefundEligibility(
      txn({ status: 'partially_refunded', refundedAmount: 150_000 }),
    );
    expect(result.refundable).toBe(0);
    expect(result.eligible).toBe(false);
  });
});

describe('validateRefundAmount — partial refund bounds', () => {
  const eligibility = getRefundEligibility(txn());

  it('accepts an amount inside the window', () => {
    expect(validateRefundAmount(50_000, eligibility)).toBe('ok');
  });

  it('accepts exactly the refundable amount', () => {
    expect(validateRefundAmount(100_000, eligibility)).toBe('ok');
  });

  it('accepts exactly the minimum', () => {
    expect(validateRefundAmount(MIN_REFUND_PAISE, eligibility)).toBe('ok');
  });

  it('rejects one paisa over the refundable amount', () => {
    expect(validateRefundAmount(100_001, eligibility)).toBe('exceeds_refundable');
  });

  it('rejects below the minimum', () => {
    expect(validateRefundAmount(99, eligibility)).toBe('below_minimum');
    expect(validateRefundAmount(0, eligibility)).toBe('below_minimum');
  });

  it('rejects a negative amount', () => {
    expect(validateRefundAmount(-50_000, eligibility)).toBe('below_minimum');
  });

  it('rejects a non-integer (rupee-shaped) amount', () => {
    // A float here would mean somewhere upstream divided by 100.
    expect(validateRefundAmount(500.5, eligibility)).toBe('below_minimum');
  });

  it('bounds a partial refund against the remainder, not the original amount', () => {
    const partial = getRefundEligibility(
      txn({ status: 'partially_refunded', refundedAmount: 70_000 }),
    );
    // ₹300 remains; ₹400 must be refused even though the original was ₹1,000.
    expect(validateRefundAmount(30_000, partial)).toBe('ok');
    expect(validateRefundAmount(40_000, partial)).toBe('exceeds_refundable');
  });
});
