import type { Paise, Transaction } from '@models/index';

/** Smallest refundable amount: ₹1. */
export const MIN_REFUND_PAISE: Paise = 100;

export type RefundBlockedReason = 'not_successful' | 'fully_refunded' | 'below_minimum';

export interface RefundEligibility {
  eligible: boolean;
  /** Integer paise still available to refund. */
  refundable: Paise;
  /** Integer paise already refunded. */
  alreadyRefunded: Paise;
  reason?: RefundBlockedReason;
}

/**
 * Decides whether a transaction can be refunded, and for how much.
 *
 * Single source of truth for this rule: the detail screen uses it to enable the
 * Refund action, and the refund screen uses it to bound the amount. Duplicating
 * the arithmetic in both would be exactly the kind of drift that lets a merchant
 * reach a screen where the only outcome is a server rejection.
 *
 * All arithmetic is on integer paise (Section 8), so a partial refund of a
 * ₹1,234.56 payment can never leave a stray fraction behind.
 */
export function getRefundEligibility(transaction: Transaction): RefundEligibility {
  const alreadyRefunded = transaction.refundedAmount ?? 0;
  const refundable = Math.max(0, transaction.amount - alreadyRefunded);

  // Only settled-successful money can go back. `partially_refunded` is still
  // refundable for the remainder; `pending` is not, because there is nothing
  // confirmed to reverse yet.
  const isRefundableStatus =
    transaction.status === 'success' || transaction.status === 'partially_refunded';

  if (!isRefundableStatus) {
    return { eligible: false, refundable: 0, alreadyRefunded, reason: 'not_successful' };
  }
  if (refundable <= 0) {
    return { eligible: false, refundable: 0, alreadyRefunded, reason: 'fully_refunded' };
  }
  if (refundable < MIN_REFUND_PAISE) {
    // A remainder under ₹1 cannot be sent through the refund rail.
    return { eligible: false, refundable, alreadyRefunded, reason: 'below_minimum' };
  }

  return { eligible: true, refundable, alreadyRefunded };
}

/** Validates a requested partial refund against the eligible window. */
export function validateRefundAmount(
  amount: Paise,
  eligibility: RefundEligibility,
): 'ok' | 'below_minimum' | 'exceeds_refundable' {
  if (!Number.isInteger(amount) || amount < MIN_REFUND_PAISE) return 'below_minimum';
  if (amount > eligibility.refundable) return 'exceeds_refundable';
  return 'ok';
}
