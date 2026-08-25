import type { Paise } from '@models/index';

/**
 * Instant-settlement fee arithmetic (PRD SET-2: "Instant settlement option
 * (on-demand, fee-based)").
 *
 * This is **server-side logic living in the mock backend**, not client logic. The
 * app never recomputes a fee — it renders whatever the quote endpoint returns, so
 * a pricing change is a backend deploy rather than an app release. It is factored
 * out here purely so the arithmetic is unit-testable.
 *
 * Every value is integer paise. Rounding is applied once per component (fee, then
 * GST on that fee) and the payout is derived by subtraction, so the identity
 * `payout + totalFee === net` always holds exactly — a merchant reconciling their
 * bank credit against this breakdown must never find a stray paisa.
 */

/** Convenience fee, in basis points of the net settlement amount. 20bps = 0.20%. */
export const INSTANT_SETTLEMENT_FEE_BPS = 20;

/** GST on the convenience fee, in basis points. 1800bps = 18%. */
export const GST_ON_FEE_BPS = 1800;

/** Batches below this are not worth settling instantly. ₹100. */
export const INSTANT_SETTLEMENT_MIN_PAISE: Paise = 100_00;

export interface InstantSettlementQuote {
  /** Net amount of the batch before the instant-settlement fee. */
  netAmount: Paise;
  /** Convenience fee, excluding tax. */
  feeAmount: Paise;
  /** GST charged on `feeAmount`. */
  gstAmount: Paise;
  /** `feeAmount + gstAmount`. */
  totalFeeAmount: Paise;
  /** What actually reaches the bank account: `netAmount - totalFeeAmount`. */
  payoutAmount: Paise;
  /** Fee rate in basis points, so the UI can show "0.20%" without hardcoding it. */
  feeBps: number;
}

const applyBps = (amount: Paise, bps: number): Paise => Math.round((amount * bps) / 10_000);

/**
 * Computes the fee breakdown for settling `netAmount` instantly.
 *
 * @param netAmount Net batch amount in integer paise.
 */
export function computeInstantSettlementQuote(netAmount: Paise): InstantSettlementQuote {
  // Guard against a non-integer or negative amount reaching the money math.
  const net = Number.isFinite(netAmount) ? Math.max(0, Math.round(netAmount)) : 0;

  const feeAmount = applyBps(net, INSTANT_SETTLEMENT_FEE_BPS);
  const gstAmount = applyBps(feeAmount, GST_ON_FEE_BPS);
  const totalFeeAmount = feeAmount + gstAmount;

  return {
    netAmount: net,
    feeAmount,
    gstAmount,
    totalFeeAmount,
    // Subtraction rather than a second percentage, so the parts always sum to
    // the whole.
    payoutAmount: net - totalFeeAmount,
    feeBps: INSTANT_SETTLEMENT_FEE_BPS,
  };
}

export type InstantSettlementIneligibleReason = 'already_settled' | 'below_minimum' | 'failed_batch';

export interface InstantSettlementEligibility {
  eligible: boolean;
  reason?: InstantSettlementIneligibleReason;
}

/** Only an in-flight batch above the floor can be pulled forward. */
export function checkInstantSettlementEligibility(
  status: string,
  netAmount: Paise,
): InstantSettlementEligibility {
  if (status === 'settled') return { eligible: false, reason: 'already_settled' };
  if (status === 'failed') return { eligible: false, reason: 'failed_batch' };
  if (netAmount < INSTANT_SETTLEMENT_MIN_PAISE) return { eligible: false, reason: 'below_minimum' };
  return { eligible: true };
}
