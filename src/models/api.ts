import type {
  Address,
  ISODate,
  Paise,
  PaymentMode,
  SettlementStatus,
  Transaction,
  TxnStatus,
  UUID,
} from './index';

/* -------------------------------------------------------------------------- */
/* Errors — Section 9: "Standard error shape: { code, message, details? }"     */
/* -------------------------------------------------------------------------- */

/**
 * Machine-readable error codes. Each maps to an i18n key under `errors.*` so the
 * user never sees a raw server string (Section 9 + Section 13).
 */
export type ApiErrorCode =
  | 'network_error'
  | 'timeout'
  | 'offline'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation_error'
  | 'rate_limited'
  | 'invalid_otp'
  | 'otp_expired'
  | 'invalid_mobile'
  | 'kyc_incomplete'
  | 'kyc_rejected'
  | 'bank_verification_failed'
  | 'pan_verification_failed'
  | 'already_refunded'
  | 'refund_limit_exceeded'
  | 'payment_expired'
  | 'server_error'
  | 'unknown';

export interface ApiErrorShape {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/* Auth — POST /auth/otp/request, /auth/otp/verify, /auth/refresh             */
/* -------------------------------------------------------------------------- */

export interface OtpRequestPayload {
  mobile: string;
}

export interface OtpRequestResponse {
  /** Server-declared resend window; the UI counts down from this. */
  resendAfterSeconds: number;
  /** Echoed back so the OTP screen can display the masked target. */
  mobile: string;
}

export interface OtpVerifyPayload {
  mobile: string;
  otp: string;
}

export interface OtpVerifyResponse {
  accessToken: string;
  refreshToken: string;
  isNewUser: boolean;
}

export interface RefreshPayload {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

/* -------------------------------------------------------------------------- */
/* Payments                                                                   */
/* -------------------------------------------------------------------------- */

export interface StaticQrResponse {
  /** Raw UPI intent string to encode into the QR image. */
  qrPayload: string;
  vpa: string;
  merchantName: string;
}

export interface DynamicQrPayload {
  /** paise */
  amount: Paise;
  note?: string;
}

export interface DynamicQrResponse {
  ref: string;
  qrPayload: string;
  expiresAt: ISODate;
}

export interface PaymentStatusResponse {
  ref: string;
  status: TxnStatus | 'expired';
  /** Present once the payment lands. */
  transaction?: Transaction;
}

export interface PaymentLinkPayload {
  /** paise */
  amount: Paise;
  note?: string;
}

export interface PaymentLinkResponse {
  url: string;
  ref: string;
  expiresAt: ISODate;
}

/* -------------------------------------------------------------------------- */
/* Transactions — cursor pagination per Section 6.8                           */
/* -------------------------------------------------------------------------- */

export type TransactionFilter = 'all' | 'success' | 'pending' | 'failed' | 'refunded';

export interface TransactionQuery {
  filter?: TransactionFilter;
  search?: string;
  from?: ISODate;
  to?: ISODate;
  cursor?: string | null;
  limit?: number;
}

export interface Paginated<T> {
  items: T[];
  /** `null` when there are no further pages. */
  nextCursor: string | null;
}

export interface RefundPayload {
  /** paise; must be <= original amount minus already-refunded */
  amount: Paise;
  reason?: string;
}

export interface RefundResponse {
  refundId: UUID;
  transactionId: UUID;
  amount: Paise;
  status: 'processing' | 'success' | 'failed';
  createdAt: ISODate;
}

/* -------------------------------------------------------------------------- */
/* Reports — GET /reports?from=&to=                                           */
/* -------------------------------------------------------------------------- */

export interface ReportSeriesPoint {
  date: ISODate;
  /** paise */
  amount: Paise;
  count: number;
}

export interface ReportsResponse {
  from: ISODate;
  to: ISODate;
  totalSales: Paise;
  txnCount: number;
  /** paise */
  avgTicketSize: Paise;
  topPaymentMode: PaymentMode;
  series: ReportSeriesPoint[];
}

/* -------------------------------------------------------------------------- */
/* Support                                                                    */
/* -------------------------------------------------------------------------- */

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface SupportTicket {
  id: UUID;
  subject: string;
  body: string;
  status: TicketStatus;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface CreateTicketPayload {
  subject: string;
  body: string;
  category?: string;
}

/* -------------------------------------------------------------------------- */
/* Settlements — instant settle (Section 6.11 action, PRD SET-2)              */
/* -------------------------------------------------------------------------- */

/**
 * Fee quote for pulling a pending batch forward.
 *
 * All amounts are integer paise, and `payoutAmount + totalFeeAmount === netAmount`
 * exactly — the client renders these values and never recomputes the fee, so
 * pricing stays a server concern (Section 4.4 SET-5 fee transparency).
 */
export interface InstantSettlementQuoteResponse {
  settlementId: UUID;
  eligible: boolean;
  /** Present when `eligible` is false; maps to an `settlements.instant.*` i18n key. */
  ineligibleReason?: 'already_settled' | 'below_minimum' | 'failed_batch';
  netAmount: Paise;
  feeAmount: Paise;
  gstAmount: Paise;
  totalFeeAmount: Paise;
  payoutAmount: Paise;
  /** Fee rate in basis points, so the UI can display the percentage from data. */
  feeBps: number;
}

/* -------------------------------------------------------------------------- */
/* Profile updates (Section 6.14)                                             */
/* -------------------------------------------------------------------------- */

/**
 * Body of `PATCH /merchant/profile`.
 *
 * Note the asymmetry on the bank account: the client sends a plain
 * `accountNumber`, and the server responds with `accountNumberMasked` on the
 * `Merchant`. The raw number is never persisted on device or echoed back
 * (Section 12), so this cannot reuse the `BankAccount` model.
 */
export interface ProfileUpdatePayload {
  businessName?: string;
  /** MCC code. */
  category?: string;
  address?: Address;
  /** Empty string clears the GSTIN. */
  gstin?: string;
  /** Changing this redirects all future settlements, so it requires re-auth. */
  bankAccount?: {
    accountNumber: string;
    ifsc: string;
    holderName: string;
  };
}

export interface InstantSettlementResponse {
  settlementId: UUID;
  status: SettlementStatus;
  utr?: string;
  /** Amount credited after the instant-settlement fee. */
  payoutAmount: Paise;
  totalFeeAmount: Paise;
  settledAt: ISODate;
}
