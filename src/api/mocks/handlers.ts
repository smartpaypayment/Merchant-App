import type {
  CreateTicketPayload,
  DynamicQrPayload,
  DynamicQrResponse,
  InstantSettlementQuoteResponse,
  InstantSettlementResponse,
  ProfileUpdatePayload,
  OtpRequestPayload,
  OtpRequestResponse,
  OtpVerifyPayload,
  OtpVerifyResponse,
  Paginated,
  PaymentLinkPayload,
  PaymentLinkResponse,
  PaymentStatusResponse,
  RefreshPayload,
  RefreshResponse,
  RefundPayload,
  RefundResponse,
  ReportSeriesPoint,
  ReportsResponse,
  StaticQrResponse,
  SupportTicket,
  TransactionFilter,
} from '@models/api';
import type {
  DashboardSummary,
  Merchant,
  MerchantPreferences,
  NotificationItem,
  Paise,
  Settlement,
  Staff,
  Transaction,
} from '@models/index';
import {
  KYC_PAYMENTS_UNLOCKED_AFTER,
  KycStep,
  type KycPatchResponse,
  type KycStepPatch,
  type KycSubmitResponse,
} from '@models/kyc';
import {
  ACCOUNT_NUMBER_REGEX,
  GSTIN_REGEX,
  IFSC_REGEX,
  isValidMobile,
  isValidOtp,
  maskAccountNumber,
} from '@utils/validators';
import {
  checkInstantSettlementEligibility,
  computeInstantSettlementQuote,
} from './instantSettlement';
import {
  EXISTING_MERCHANT_MOBILE,
  initExistingMerchant,
  initNewMerchant,
  iso,
  isToday,
  mockState,
  nextId,
  PROGRESSIVE_KYC_DAILY_LIMIT,
  todayTransactions,
  VALID_OTP,
} from './db';

/** Thrown by handlers to produce a non-2xx response with our standard error body. */
export class MockHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MockHttpError';
  }
}

export interface HandlerContext {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}

export interface MockRoute {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Path template with `:name` placeholders, relative to the API base. */
  path: string;
  handler: (ctx: HandlerContext) => unknown;
  /** Override the default 200. */
  status?: number;
}

const body = <T>(ctx: HandlerContext): T => (ctx.body ?? {}) as T;

/** Guards endpoints that require a bearer token, so the 401→refresh path is testable. */
function requireAuth(ctx: HandlerContext): void {
  const header = ctx.headers['authorization'] ?? ctx.headers['Authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    throw new MockHttpError(401, 'unauthorized', 'Missing or malformed bearer token');
  }
}

const issueTokens = (): { accessToken: string; refreshToken: string } => ({
  accessToken: `mock.access.${nextId('at')}`,
  refreshToken: `mock.refresh.${nextId('rt')}`,
});

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

const authRoutes: MockRoute[] = [
  {
    method: 'POST',
    path: '/auth/otp/request',
    handler: (ctx): OtpRequestResponse => {
      const { mobile } = body<OtpRequestPayload>(ctx);

      if (!mobile || !isValidMobile(mobile)) {
        throw new MockHttpError(400, 'invalid_mobile', 'Mobile number failed validation');
      }

      mockState.otpRequestCount += 1;
      // Exercise the rate-limit UI after a burst of requests.
      if (mockState.otpRequestCount > 6) {
        throw new MockHttpError(429, 'rate_limited', 'Too many OTP requests');
      }

      return { resendAfterSeconds: 30, mobile };
    },
  },
  {
    method: 'POST',
    path: '/auth/otp/verify',
    handler: (ctx): OtpVerifyResponse => {
      const { mobile, otp } = body<OtpVerifyPayload>(ctx);

      if (!otp || !isValidOtp(otp)) {
        throw new MockHttpError(400, 'validation_error', 'OTP must be 6 digits');
      }
      if (otp !== VALID_OTP) {
        throw new MockHttpError(401, 'invalid_otp', 'Incorrect OTP');
      }

      mockState.otpRequestCount = 0;

      const isNewUser = mobile !== EXISTING_MERCHANT_MOBILE;
      if (isNewUser) initNewMerchant(mobile);
      else initExistingMerchant();

      return { ...issueTokens(), isNewUser };
    },
  },
  {
    method: 'POST',
    path: '/auth/refresh',
    handler: (ctx): RefreshResponse => {
      const { refreshToken } = body<RefreshPayload>(ctx);
      if (!refreshToken || !refreshToken.startsWith('mock.refresh.')) {
        throw new MockHttpError(401, 'unauthorized', 'Invalid refresh token');
      }
      return issueTokens();
    },
  },
];

/* -------------------------------------------------------------------------- */
/* Merchant + KYC                                                             */
/* -------------------------------------------------------------------------- */

/** Mock PIN-code → city/state lookup, so Step 1 can autofill (fewer fields to type). */
const PINCODE_AREAS: Record<string, { city: string; state: string }> = {
  '4': { city: 'Nashik', state: 'Maharashtra' },
  '1': { city: 'New Delhi', state: 'Delhi' },
  '2': { city: 'Lucknow', state: 'Uttar Pradesh' },
  '3': { city: 'Ahmedabad', state: 'Gujarat' },
  '5': { city: 'Hyderabad', state: 'Telangana' },
  '6': { city: 'Chennai', state: 'Tamil Nadu' },
  '7': { city: 'Kolkata', state: 'West Bengal' },
  '8': { city: 'Patna', state: 'Bihar' },
};

const merchantRoutes: MockRoute[] = [
  {
    method: 'GET',
    path: '/merchant/profile',
    handler: (ctx): Merchant => {
      requireAuth(ctx);
      return mockState.merchant;
    },
  },
  {
    method: 'PATCH',
    path: '/merchant/profile',
    handler: (ctx): Merchant => {
      requireAuth(ctx);
      const patch = body<ProfileUpdatePayload>(ctx);

      /*
       * A settlement-account change is not an ordinary profile edit — it
       * redirects where all future money lands. So it is validated and
       * penny-dropped here exactly as in KYC step 3, and the raw account number
       * is never stored: only the masked form is kept (Section 12).
       *
       * The client sends `bankAccount` with a plain `accountNumber`; the response
       * carries `accountNumberMasked`.
       */
      if (patch.bankAccount) {
        const { accountNumber, ifsc, holderName } = patch.bankAccount;

        if (!ACCOUNT_NUMBER_REGEX.test(accountNumber)) {
          throw new MockHttpError(400, 'validation_error', 'Account number must be 9-18 digits');
        }
        if (!IFSC_REGEX.test(ifsc)) {
          throw new MockHttpError(400, 'validation_error', 'IFSC failed validation');
        }
        // Same rigged failure as KYC step 3, so the error path stays reachable.
        if (accountNumber.endsWith('0000')) {
          throw new MockHttpError(422, 'bank_verification_failed', 'Penny drop was returned by the bank');
        }

        mockState.merchant.bankAccount = {
          accountNumberMasked: maskAccountNumber(accountNumber),
          ifsc,
          holderName,
          verified: true,
        };
      }

      if (patch.businessName !== undefined) mockState.merchant.businessName = patch.businessName;
      if (patch.category !== undefined) mockState.merchant.category = patch.category;
      if (patch.address !== undefined) mockState.merchant.address = patch.address;
      if (patch.gstin !== undefined) {
        if (patch.gstin !== '' && !GSTIN_REGEX.test(patch.gstin)) {
          throw new MockHttpError(400, 'validation_error', 'GSTIN failed validation');
        }
        // An empty string clears it rather than storing "".
        if (patch.gstin === '') delete mockState.merchant.gstin;
        else mockState.merchant.gstin = patch.gstin;
      }

      return mockState.merchant;
    },
  },
  {
    method: 'GET',
    path: '/merchant/pincode/:pincode',
    handler: (ctx): { city: string; state: string; pincode: string } => {
      requireAuth(ctx);
      const pincode = ctx.params['pincode'] ?? '';
      const area = PINCODE_AREAS[pincode.charAt(0)] ?? { city: '', state: '' };
      if (!area.city) throw new MockHttpError(404, 'not_found', 'Unknown pincode');
      return { ...area, pincode };
    },
  },
  {
    method: 'PATCH',
    path: '/merchant/kyc',
    handler: (ctx): KycPatchResponse => {
      requireAuth(ctx);
      const patch = body<KycStepPatch>(ctx);
      const draft = mockState.kycDraft;

      switch (patch.step) {
        case KycStep.BusinessInfo: {
          draft.businessInfo = patch.data;
          mockState.merchant.businessName = patch.data.businessName;
          mockState.merchant.category = patch.data.category;
          mockState.merchant.address = patch.data.address;
          break;
        }
        case KycStep.Identity: {
          // Reject a well-known "bad" PAN so the failure path is reachable.
          if (patch.data.pan === 'AAAAA0000A') {
            throw new MockHttpError(422, 'pan_verification_failed', 'PAN not found at NSDL');
          }
          draft.identity = patch.data;
          mockState.merchant.pan = patch.data.pan;
          if (patch.data.gstin) mockState.merchant.gstin = patch.data.gstin;
          break;
        }
        case KycStep.BankAccount: {
          // Penny-drop simulation: accounts ending 0000 fail verification.
          if (patch.data.accountNumber.endsWith('0000')) {
            throw new MockHttpError(422, 'bank_verification_failed', 'Penny drop was returned by the bank');
          }
          draft.bankAccount = patch.data;
          mockState.merchant.bankAccount = {
            accountNumberMasked: maskAccountNumber(patch.data.accountNumber),
            ifsc: patch.data.ifsc,
            holderName: patch.data.holderName,
            verified: true,
          };
          break;
        }
        case KycStep.AadhaarEkyc: {
          if (!patch.data.consentGiven) {
            throw new MockHttpError(400, 'validation_error', 'Aadhaar consent is mandatory');
          }
          draft.aadhaar = patch.data;
          break;
        }
        default:
          throw new MockHttpError(400, 'validation_error', 'Unknown KYC step');
      }

      draft.completedThrough = Math.max(draft.completedThrough, patch.step) as KycStep;
      draft.updatedAt = iso(0);
      if (mockState.merchant.kycStatus === 'not_started') mockState.merchant.kycStatus = 'in_progress';

      // Progressive KYC: a verified bank account is enough to start collecting.
      const paymentsEnabled = draft.completedThrough >= KYC_PAYMENTS_UNLOCKED_AFTER;
      if (paymentsEnabled && !mockState.merchant.vpa) {
        const slug = (mockState.merchant.businessName || 'merchant')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .slice(0, 16);
        mockState.merchant.vpa = `${slug || 'merchant'}@okmerchantone`;
      }

      const response: KycPatchResponse = {
        step: patch.step,
        kycStatus: mockState.merchant.kycStatus,
        paymentsEnabled,
      };
      if (patch.step === KycStep.BankAccount) {
        response.bankVerification = { verified: true, nameAtBank: patch.data.holderName };
      }
      return response;
    },
  },
  {
    method: 'POST',
    path: '/merchant/kyc/submit',
    handler: (ctx): KycSubmitResponse => {
      requireAuth(ctx);
      const draft = mockState.kycDraft;

      if (draft.completedThrough < KYC_PAYMENTS_UNLOCKED_AFTER) {
        throw new MockHttpError(400, 'kyc_incomplete', 'Complete the bank step before submitting');
      }

      // Aadhaar done → straight-through approval; otherwise manual review queue.
      mockState.merchant.kycStatus = draft.aadhaar?.verified ? 'approved' : 'pending_review';
      draft.currentStep = KycStep.Done;

      mockState.notifications.unshift({
        id: nextId('ntf'),
        type: 'kyc_update',
        title: 'Verification submitted',
        body: 'We have received your details.',
        read: false,
        createdAt: iso(0),
      });

      return { kycStatus: mockState.merchant.kycStatus, vpa: mockState.merchant.vpa };
    },
  },
  {
    method: 'POST',
    path: '/merchant/kyc/aadhaar/otp',
    handler: (ctx): { transactionId: string; resendAfterSeconds: number } => {
      requireAuth(ctx);
      const payload = body<{ aadhaarNumber?: string; consentGiven?: boolean }>(ctx);
      if (!payload.consentGiven) {
        throw new MockHttpError(400, 'validation_error', 'Consent is mandatory');
      }
      if (!payload.aadhaarNumber || !/^\d{12}$/.test(payload.aadhaarNumber)) {
        throw new MockHttpError(400, 'validation_error', 'Aadhaar must be 12 digits');
      }
      mockState.aadhaarTxnId = nextId('aadhaar');
      return { transactionId: mockState.aadhaarTxnId, resendAfterSeconds: 30 };
    },
  },
  {
    method: 'POST',
    path: '/merchant/kyc/aadhaar/verify',
    handler: (ctx): { verified: boolean; aadhaarLast4: string } => {
      requireAuth(ctx);
      const payload = body<{ transactionId?: string; otp?: string }>(ctx);
      if (!payload.otp || payload.otp !== VALID_OTP) {
        throw new MockHttpError(401, 'invalid_otp', 'Incorrect Aadhaar OTP');
      }
      if (!payload.transactionId || payload.transactionId !== mockState.aadhaarTxnId) {
        throw new MockHttpError(400, 'otp_expired', 'Aadhaar OTP session expired');
      }
      return { verified: true, aadhaarLast4: '4321' };
    },
  },
  {
    method: 'GET',
    path: '/merchant/qr/static',
    handler: (ctx): StaticQrResponse => {
      requireAuth(ctx);
      const { vpa, businessName } = mockState.merchant;
      if (!vpa) throw new MockHttpError(409, 'kyc_incomplete', 'No VPA issued yet');
      return {
        vpa,
        merchantName: businessName,
        // NPCI UPI deep-link format; no `am` param makes it a static (any-amount) QR.
        qrPayload: `upi://pay?pa=${vpa}&pn=${encodeURIComponent(businessName)}&cu=INR&mode=01`,
      };
    },
  },
  {
    method: 'PATCH',
    path: '/merchant/preferences',
    handler: (ctx): MerchantPreferences => {
      requireAuth(ctx);
      mockState.merchant.preferences = {
        ...mockState.merchant.preferences,
        ...body<Partial<MerchantPreferences>>(ctx),
      };
      return mockState.merchant.preferences;
    },
  },
];

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

const dashboardRoutes: MockRoute[] = [
  {
    method: 'GET',
    path: '/dashboard/summary',
    handler: (ctx): DashboardSummary => {
      requireAuth(ctx);
      const today = todayTransactions();
      const successfulToday = today.filter((t) => t.status === 'success');

      const pendingSettlement = mockState.settlements
        .filter((s) => s.status === 'pending' || s.status === 'processing')
        .reduce((sum, s) => sum + s.netAmount, 0);

      return {
        todayCollected: successfulToday.reduce((sum, t) => sum + t.amount, 0),
        todayTxnCount: successfulToday.length,
        pendingSettlement,
        recentTransactions: mockState.transactions.slice(0, 5),
      };
    },
  },
];

/* -------------------------------------------------------------------------- */
/* Payments                                                                   */
/* -------------------------------------------------------------------------- */

/** How long the mock waits before a dynamic QR "receives" money. */
const MOCK_PAYMENT_DELAY_MS = 6_000;

const paymentRoutes: MockRoute[] = [
  {
    method: 'POST',
    path: '/payments/dynamic-qr',
    handler: (ctx): DynamicQrResponse => {
      requireAuth(ctx);
      const { amount, note } = body<DynamicQrPayload>(ctx);

      if (!Number.isInteger(amount) || amount <= 0) {
        throw new MockHttpError(400, 'validation_error', 'Amount must be a positive integer (paise)');
      }
      if (mockState.merchant.kycStatus !== 'approved' && amount > PROGRESSIVE_KYC_DAILY_LIMIT) {
        throw new MockHttpError(403, 'kyc_incomplete', 'Amount exceeds progressive KYC limit', {
          limit: PROGRESSIVE_KYC_DAILY_LIMIT,
        });
      }

      const ref = nextId('pay');
      const expiresAt = iso(5 * 60_000);
      mockState.pendingPayments.set(ref, {
        ref,
        amount,
        ...(note ? { note } : {}),
        expiresAt,
        createdAt: Date.now(),
        status: 'pending',
      });

      const { vpa, businessName } = mockState.merchant;
      return {
        ref,
        expiresAt,
        // `am` present + `tr` transaction ref = dynamic, single-use QR.
        qrPayload: `upi://pay?pa=${vpa}&pn=${encodeURIComponent(businessName)}&am=${(amount / 100).toFixed(2)}&cu=INR&tr=${ref}&mode=02`,
      };
    },
  },
  {
    method: 'GET',
    path: '/payments/:ref/status',
    handler: (ctx): PaymentStatusResponse => {
      requireAuth(ctx);
      const ref = ctx.params['ref'] ?? '';
      const pending = mockState.pendingPayments.get(ref);
      if (!pending) throw new MockHttpError(404, 'not_found', 'Unknown payment reference');

      if (pending.status === 'pending') {
        const age = Date.now() - pending.createdAt;

        if (new Date(pending.expiresAt).getTime() < Date.now()) {
          pending.status = 'expired';
        } else if (age >= MOCK_PAYMENT_DELAY_MS) {
          // Simulate the customer completing the UPI payment.
          const txn: Transaction = {
            id: nextId('txn'),
            amount: pending.amount,
            currency: 'INR',
            status: 'success',
            mode: 'upi_qr',
            fee: 0,
            netAmount: pending.amount,
            payerVpaMasked: 'cu\u2022\u2022\u2022\u2022\u2022\u2022@okaxis',
            utr: `${400000000000 + Math.floor(Math.random() * 99999999)}`,
            createdAt: iso(0),
            ...(pending.note ? { note: pending.note } : {}),
          };
          mockState.transactions.unshift(txn);
          mockState.notifications.unshift({
            id: nextId('ntf'),
            type: 'payment_received',
            title: 'Payment received',
            body: `${pending.amount / 100}`,
            read: false,
            deeplink: `merchantone://transactions/${txn.id}`,
            createdAt: iso(0),
          });
          pending.status = 'success';
          pending.transactionId = txn.id;
        }
      }

      const result: PaymentStatusResponse = { ref, status: pending.status };
      if (pending.transactionId) {
        const txn = mockState.transactions.find((t) => t.id === pending.transactionId);
        if (txn) result.transaction = txn;
      }
      return result;
    },
  },
  {
    method: 'POST',
    path: '/payments/link',
    handler: (ctx): PaymentLinkResponse => {
      requireAuth(ctx);
      const { amount } = body<PaymentLinkPayload>(ctx);
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new MockHttpError(400, 'validation_error', 'Amount must be a positive integer (paise)');
      }
      const ref = nextId('lnk');
      return { ref, url: `https://pay.merchantone.in/l/${ref}`, expiresAt: iso(24 * 3_600_000) };
    },
  },
];

/* -------------------------------------------------------------------------- */
/* Transactions                                                               */
/* -------------------------------------------------------------------------- */

const FILTER_MATCHERS: Record<TransactionFilter, (t: Transaction) => boolean> = {
  all: () => true,
  success: (t) => t.status === 'success',
  pending: (t) => t.status === 'pending',
  failed: (t) => t.status === 'failed',
  refunded: (t) => t.status === 'refunded' || t.status === 'partially_refunded',
};

const transactionRoutes: MockRoute[] = [
  {
    method: 'GET',
    path: '/transactions',
    handler: (ctx): Paginated<Transaction> => {
      requireAuth(ctx);
      const filter = (ctx.query['filter'] ?? 'all') as TransactionFilter;
      const search = (ctx.query['search'] ?? '').trim().toLowerCase();
      const limit = Number(ctx.query['limit'] ?? 20);
      const cursor = ctx.query['cursor'];
      const from = ctx.query['from'];
      const to = ctx.query['to'];

      let items = mockState.transactions.filter(FILTER_MATCHERS[filter] ?? FILTER_MATCHERS.all);

      if (search) {
        items = items.filter(
          (t) =>
            t.id.toLowerCase().includes(search) ||
            (t.utr ?? '').toLowerCase().includes(search) ||
            (t.payerVpaMasked ?? '').toLowerCase().includes(search) ||
            // Let the merchant search by the rupee amount they remember.
            String(t.amount / 100).includes(search),
        );
      }
      if (from) items = items.filter((t) => t.createdAt >= from);
      if (to) items = items.filter((t) => t.createdAt <= to);

      // Cursor is the index of the next item — opaque to the client.
      const start = cursor ? Number(cursor) : 0;
      const page = items.slice(start, start + limit);
      const nextIndex = start + limit;

      return { items: page, nextCursor: nextIndex < items.length ? String(nextIndex) : null };
    },
  },
  {
    method: 'GET',
    path: '/transactions/:id',
    handler: (ctx): Transaction => {
      requireAuth(ctx);
      const txn = mockState.transactions.find((t) => t.id === ctx.params['id']);
      if (!txn) throw new MockHttpError(404, 'not_found', 'Transaction not found');
      return txn;
    },
  },
  {
    method: 'POST',
    path: '/transactions/:id/refund',
    handler: (ctx): RefundResponse => {
      requireAuth(ctx);
      const txn = mockState.transactions.find((t) => t.id === ctx.params['id']);
      if (!txn) throw new MockHttpError(404, 'not_found', 'Transaction not found');

      const { amount, reason } = body<RefundPayload>(ctx);
      if (txn.status !== 'success' && txn.status !== 'partially_refunded') {
        throw new MockHttpError(409, 'already_refunded', 'Transaction is not refundable');
      }

      const alreadyRefunded = txn.refundedAmount ?? 0;
      const refundable = txn.amount - alreadyRefunded;
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new MockHttpError(400, 'validation_error', 'Refund amount must be positive paise');
      }
      if (amount > refundable) {
        throw new MockHttpError(422, 'refund_limit_exceeded', 'Refund exceeds refundable balance', {
          refundable,
        });
      }

      const total = alreadyRefunded + amount;
      txn.refundedAmount = total;
      txn.status = total >= txn.amount ? 'refunded' : 'partially_refunded';
      if (reason) txn.note = reason;

      return {
        refundId: nextId('rfd'),
        transactionId: txn.id,
        amount,
        status: 'processing',
        createdAt: iso(0),
      };
    },
  },
];

/* -------------------------------------------------------------------------- */
/* Settlements                                                                */
/* -------------------------------------------------------------------------- */

const settlementRoutes: MockRoute[] = [
  {
    method: 'GET',
    path: '/settlements',
    handler: (ctx): Paginated<Settlement> => {
      requireAuth(ctx);
      const status = ctx.query['status'];
      let items = mockState.settlements;
      if (status === 'pending') {
        items = items.filter((s) => s.status === 'pending' || s.status === 'processing');
      } else if (status === 'settled') {
        items = items.filter((s) => s.status === 'settled');
      }
      return { items, nextCursor: null };
    },
  },
  {
    method: 'GET',
    path: '/settlements/:id/instant/quote',
    handler: (ctx): InstantSettlementQuoteResponse => {
      requireAuth(ctx);
      const settlement = mockState.settlements.find((s) => s.id === ctx.params['id']);
      if (!settlement) throw new MockHttpError(404, 'not_found', 'Settlement not found');

      const eligibility = checkInstantSettlementEligibility(settlement.status, settlement.netAmount);
      const quote = computeInstantSettlementQuote(settlement.netAmount);

      return {
        settlementId: settlement.id,
        eligible: eligibility.eligible,
        ...(eligibility.reason ? { ineligibleReason: eligibility.reason } : {}),
        ...quote,
      };
    },
  },
  {
    method: 'POST',
    path: '/settlements/:id/instant',
    handler: (ctx): InstantSettlementResponse => {
      requireAuth(ctx);
      const settlement = mockState.settlements.find((s) => s.id === ctx.params['id']);
      if (!settlement) throw new MockHttpError(404, 'not_found', 'Settlement not found');

      const eligibility = checkInstantSettlementEligibility(settlement.status, settlement.netAmount);
      if (!eligibility.eligible) {
        // 409: the batch's state, not the request, is the problem.
        throw new MockHttpError(409, 'validation_error', `Not eligible: ${eligibility.reason}`, {
          reason: eligibility.reason,
        });
      }

      const quote = computeInstantSettlementQuote(settlement.netAmount);
      const settledAt = iso(0);

      // Fold the convenience fee into the batch so the detail screen's breakdown
      // continues to reconcile: gross - fees = net credited.
      settlement.feeAmount += quote.totalFeeAmount;
      settlement.netAmount = quote.payoutAmount;
      settlement.status = 'settled';
      settlement.utr = `HDFCN${800000000 + Math.floor(Math.random() * 9999999)}`;
      settlement.settledAt = settledAt;

      mockState.notifications.unshift({
        id: nextId('ntf'),
        type: 'settlement_credited',
        title: 'Settlement credited',
        body: `${quote.payoutAmount / 100}`,
        read: false,
        deeplink: `merchantone://settlements/${settlement.id}`,
        createdAt: settledAt,
      });

      return {
        settlementId: settlement.id,
        status: settlement.status,
        ...(settlement.utr ? { utr: settlement.utr } : {}),
        payoutAmount: quote.payoutAmount,
        totalFeeAmount: quote.totalFeeAmount,
        settledAt,
      };
    },
  },
  {
    method: 'GET',
    path: '/settlements/:id',
    handler: (ctx): Settlement & { transactions: Transaction[] } => {
      requireAuth(ctx);
      const settlement = mockState.settlements.find((s) => s.id === ctx.params['id']);
      if (!settlement) throw new MockHttpError(404, 'not_found', 'Settlement not found');
      return {
        ...settlement,
        transactions: mockState.transactions.filter((t) => t.settlementId === settlement.id),
      };
    },
  },
];

/* -------------------------------------------------------------------------- */
/* Reports                                                                    */
/* -------------------------------------------------------------------------- */

const reportRoutes: MockRoute[] = [
  {
    method: 'GET',
    path: '/reports',
    handler: (ctx): ReportsResponse => {
      requireAuth(ctx);
      const from = ctx.query['from'] ?? iso(-7 * 86_400_000);
      const to = ctx.query['to'] ?? iso(0);

      const inRange = mockState.transactions.filter(
        (t) => t.status === 'success' && t.createdAt >= from && t.createdAt <= to,
      );

      const byDay = new Map<string, { amount: Paise; count: number }>();
      for (const txn of inRange) {
        const key = txn.createdAt.slice(0, 10);
        const bucket = byDay.get(key) ?? { amount: 0, count: 0 };
        bucket.amount += txn.amount;
        bucket.count += 1;
        byDay.set(key, bucket);
      }

      const series: ReportSeriesPoint[] = [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, amount: v.amount, count: v.count }));

      const totalSales = inRange.reduce((sum, t) => sum + t.amount, 0);

      const modeTally = new Map<string, number>();
      for (const t of inRange) modeTally.set(t.mode, (modeTally.get(t.mode) ?? 0) + 1);
      const topPaymentMode = [...modeTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'upi_qr';

      return {
        from,
        to,
        totalSales,
        txnCount: inRange.length,
        avgTicketSize: inRange.length > 0 ? Math.round(totalSales / inRange.length) : 0,
        topPaymentMode: topPaymentMode as ReportsResponse['topPaymentMode'],
        series,
      };
    },
  },
];

/* -------------------------------------------------------------------------- */
/* Staff, notifications, support                                              */
/* -------------------------------------------------------------------------- */

const miscRoutes: MockRoute[] = [
  {
    method: 'GET',
    path: '/staff',
    handler: (ctx): Staff[] => {
      requireAuth(ctx);
      return mockState.staff;
    },
  },
  {
    method: 'POST',
    path: '/staff',
    status: 201,
    handler: (ctx): Staff => {
      requireAuth(ctx);
      const payload = body<Omit<Staff, 'id'>>(ctx);
      if (!payload.name || !isValidMobile(payload.mobile)) {
        throw new MockHttpError(400, 'validation_error', 'Name and valid mobile are required');
      }
      // A mobile identifies the person who will log in, so it has to be unique.
      if (mockState.staff.some((s) => s.mobile === payload.mobile)) {
        throw new MockHttpError(409, 'validation_error', 'This mobile is already added', {
          field: 'mobile',
        });
      }
      const member: Staff = { id: nextId('stf'), ...payload };
      mockState.staff.push(member);
      return member;
    },
  },
  {
    /*
     * Section 6.15 asks for "edit role", which the Section 9 endpoint table omits.
     * Added here because removing and re-adding a staff member to change their
     * role would churn their id and lose any activity attributed to them.
     */
    method: 'PATCH',
    path: '/staff/:id',
    handler: (ctx): Staff => {
      requireAuth(ctx);
      const member = mockState.staff.find((s) => s.id === ctx.params['id']);
      if (!member) throw new MockHttpError(404, 'not_found', 'Staff member not found');

      const patch = body<Partial<Pick<Staff, 'role' | 'name'>>>(ctx);
      if (patch.role && patch.role !== 'manager' && patch.role !== 'cashier') {
        throw new MockHttpError(400, 'validation_error', 'Unknown role');
      }

      if (patch.role) member.role = patch.role;
      if (patch.name) member.name = patch.name;
      return member;
    },
  },
  {
    method: 'DELETE',
    path: '/staff/:id',
    handler: (ctx): { deleted: boolean } => {
      requireAuth(ctx);
      const before = mockState.staff.length;
      mockState.staff = mockState.staff.filter((s) => s.id !== ctx.params['id']);
      if (mockState.staff.length === before) {
        throw new MockHttpError(404, 'not_found', 'Staff member not found');
      }
      return { deleted: true };
    },
  },
  {
    method: 'GET',
    path: '/notifications',
    handler: (ctx): Paginated<NotificationItem> => {
      requireAuth(ctx);
      return { items: mockState.notifications, nextCursor: null };
    },
  },
  {
    method: 'GET',
    path: '/support/tickets',
    handler: (ctx): Paginated<SupportTicket> => {
      requireAuth(ctx);
      return { items: mockState.tickets, nextCursor: null };
    },
  },
  {
    method: 'POST',
    path: '/support/tickets',
    status: 201,
    handler: (ctx): SupportTicket => {
      requireAuth(ctx);
      const payload = body<CreateTicketPayload>(ctx);
      if (!payload.subject || !payload.body) {
        throw new MockHttpError(400, 'validation_error', 'Subject and body are required');
      }
      const ticket: SupportTicket = {
        id: nextId('tkt'),
        subject: payload.subject,
        body: payload.body,
        status: 'open',
        createdAt: iso(0),
        updatedAt: iso(0),
      };
      mockState.tickets.unshift(ticket);
      return ticket;
    },
  },
];

export const routes: MockRoute[] = [
  ...authRoutes,
  ...merchantRoutes,
  ...dashboardRoutes,
  ...paymentRoutes,
  ...transactionRoutes,
  ...settlementRoutes,
  ...reportRoutes,
  ...miscRoutes,
];

export { isToday };
