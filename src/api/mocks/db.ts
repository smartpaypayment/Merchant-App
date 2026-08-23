import type {
  KycStatus,
  Merchant,
  NotificationItem,
  Paise,
  PaymentMode,
  Settlement,
  Staff,
  Transaction,
  TxnStatus,
} from '@models/index';
import type { SupportTicket } from '@models/api';
import { KycStep, type KycDraft } from '@models/kyc';

/**
 * In-memory mock backend state.
 *
 * Every monetary field is integer paise, matching the Section 8 money rule — the
 * mock is deliberately strict about this so the UI is exercised against
 * realistically-shaped data (e.g. ₹1,234.50 arrives as 123450, never 1234.5).
 *
 * Two demo identities drive the flows:
 *   - `EXISTING_MERCHANT_MOBILE` → approved merchant with history → lands on Home
 *   - any other valid mobile      → new user → runs the KYC wizard
 */

export const EXISTING_MERCHANT_MOBILE = '9876543210';
/** The only OTP the mock accepts. Surfaced in the UI via `auth.otp.hintDev`. */
export const VALID_OTP = '123456';

/** Progressive-KYC daily cap before full approval (Section 6.4). ₹25,000. */
export const PROGRESSIVE_KYC_DAILY_LIMIT: Paise = 25_000_00;

const DAY_MS = 86_400_000;

let idCounter = 1000;
const nextId = (prefix: string): string => `${prefix}_${(idCounter++).toString(36)}${Date.now().toString(36).slice(-4)}`;

const iso = (offsetMs: number): string => new Date(Date.now() + offsetMs).toISOString();

/* -------------------------------------------------------------------------- */
/* Seeded merchant                                                            */
/* -------------------------------------------------------------------------- */

function buildExistingMerchant(): Merchant {
  return {
    id: 'mrc_seed_ramesh',
    businessName: 'Sharma General Store',
    category: '5411',
    mobile: EXISTING_MERCHANT_MOBILE,
    vpa: 'sharmastore@okmerchantone',
    kycStatus: 'approved',
    pan: 'ABCDE1234F',
    gstin: '27ABCDE1234F1Z5',
    address: { line1: 'Shop 12, Gandhi Market', city: 'Nashik', state: 'Maharashtra', pincode: '422001' },
    bankAccount: {
      accountNumberMasked: 'XXXXXXXX4321',
      ifsc: 'HDFC0001234',
      holderName: 'Ramesh Sharma',
      verified: true,
    },
    preferences: {
      language: 'hi',
      audioConfirmation: { enabled: true, language: 'hi', volume: 0.9 },
      notifications: { push: true, sms: true, whatsapp: true },
    },
  };
}

/** A brand-new signup: no KYC, no VPA yet. */
function buildNewMerchant(mobile: string): Merchant {
  return {
    id: nextId('mrc'),
    businessName: '',
    category: '',
    mobile,
    vpa: '',
    kycStatus: 'not_started',
    address: { line1: '', city: '', state: '', pincode: '' },
    bankAccount: { accountNumberMasked: '', ifsc: '', holderName: '', verified: false },
    preferences: {
      language: 'en',
      audioConfirmation: { enabled: true, language: 'en', volume: 0.9 },
      notifications: { push: true, sms: true, whatsapp: false },
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Seeded transactions                                                        */
/* -------------------------------------------------------------------------- */

/** Deterministic PRNG so the seeded history is stable across reloads. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Typical kirana basket sizes, in paise. */
const TYPICAL_AMOUNTS: Paise[] = [
  1000, 2500, 4000, 5000, 7500, 10_000, 12_000, 15_000, 18_500, 20_000, 25_000, 30_000, 45_000,
  50_000, 68_000, 75_000, 99_900, 1_20_000, 1_50_000, 2_49_900,
];

const MODES: PaymentMode[] = ['upi_qr', 'upi_qr', 'upi_qr', 'upi_intent', 'payment_link', 'card'];

/** UPI P2M is zero-MDR today; cards carry a fee. Section 4.5 SET-5 wants this visible. */
function feeFor(amount: Paise, mode: PaymentMode): Paise {
  if (mode === 'card') return Math.round(amount * 0.0118); // ~1.18% incl. GST
  if (mode === 'payment_link') return Math.round(amount * 0.005);
  return 0;
}

function buildTransactionHistory(): Transaction[] {
  const random = seededRandom(42);
  const transactions: Transaction[] = [];

  // 14 days of history, heavier volume today so the dashboard has something to show.
  for (let dayOffset = 13; dayOffset >= 0; dayOffset -= 1) {
    const perDay = dayOffset === 0 ? 7 : 2 + Math.floor(random() * 4);

    for (let i = 0; i < perDay; i += 1) {
      const amount = TYPICAL_AMOUNTS[Math.floor(random() * TYPICAL_AMOUNTS.length)] ?? 10_000;
      const mode = MODES[Math.floor(random() * MODES.length)] ?? 'upi_qr';

      // Mostly success, with a realistic sprinkle of failures/pending/refunds.
      const roll = random();
      let status: TxnStatus = 'success';
      if (roll > 0.93) status = 'failed';
      else if (roll > 0.89) status = 'pending';
      else if (roll > 0.86) status = 'refunded';
      else if (roll > 0.84) status = 'partially_refunded';

      const fee = feeFor(amount, mode);
      // Spread across business hours (09:00–21:00).
      const hourMs = (9 + Math.floor(random() * 12)) * 3_600_000 + Math.floor(random() * 3_600_000);
      const createdAt = new Date(Date.now() - dayOffset * DAY_MS);
      createdAt.setHours(0, 0, 0, 0);

      const txn: Transaction = {
        id: nextId('txn'),
        amount,
        currency: 'INR',
        status,
        mode,
        fee,
        netAmount: amount - fee,
        createdAt: new Date(createdAt.getTime() + hourMs).toISOString(),
        payerVpaMasked: `cu\u2022\u2022\u2022\u2022\u2022\u2022@${random() > 0.5 ? 'okaxis' : 'oksbi'}`,
      };

      if (status === 'success' || status === 'refunded' || status === 'partially_refunded') {
        txn.utr = `${400000000000 + Math.floor(random() * 99999999)}`;
      }
      if (status === 'refunded') txn.refundedAmount = amount;
      if (status === 'partially_refunded') txn.refundedAmount = Math.round(amount / 2);
      // Anything older than yesterday has been swept into a settlement batch.
      if (dayOffset > 1 && status === 'success') txn.settlementId = `stl_day_${dayOffset}`;

      transactions.push(txn);
    }
  }

  // Newest first — the order every list screen expects.
  return transactions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* -------------------------------------------------------------------------- */
/* Seeded settlements                                                         */
/* -------------------------------------------------------------------------- */

function buildSettlements(transactions: Transaction[]): Settlement[] {
  const settlements: Settlement[] = [];

  for (let dayOffset = 13; dayOffset >= 1; dayOffset -= 1) {
    const id = `stl_day_${dayOffset}`;
    const batch = transactions.filter((t) => t.settlementId === id);
    if (batch.length === 0) continue;

    const grossAmount = batch.reduce((sum, t) => sum + t.amount, 0);
    const feeAmount = batch.reduce((sum, t) => sum + t.fee, 0);

    settlements.push({
      id,
      status: 'settled',
      grossAmount,
      feeAmount,
      netAmount: grossAmount - feeAmount,
      utr: `HDFCN${700000000 + dayOffset * 7919}`,
      transactionCount: batch.length,
      bankAccountMasked: 'XXXXXXXX4321',
      createdAt: iso(-dayOffset * DAY_MS),
      settledAt: iso(-(dayOffset - 1) * DAY_MS),
    });
  }

  // Yesterday's collections are still in flight (T+1), i.e. the "Pending" tab.
  const pendingTxns = transactions.filter(
    (t) => t.status === 'success' && !t.settlementId && !isToday(t.createdAt),
  );
  if (pendingTxns.length > 0) {
    const grossAmount = pendingTxns.reduce((sum, t) => sum + t.amount, 0);
    const feeAmount = pendingTxns.reduce((sum, t) => sum + t.fee, 0);
    settlements.unshift({
      id: 'stl_pending_1',
      status: 'processing',
      grossAmount,
      feeAmount,
      netAmount: grossAmount - feeAmount,
      transactionCount: pendingTxns.length,
      bankAccountMasked: 'XXXXXXXX4321',
      createdAt: iso(-DAY_MS),
    });
  }

  return settlements;
}

function isToday(isoDate: string): boolean {
  const d = new Date(isoDate);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  );
}

/* -------------------------------------------------------------------------- */
/* Mutable store                                                              */
/* -------------------------------------------------------------------------- */

export interface PendingPayment {
  ref: string;
  amount: Paise;
  note?: string;
  expiresAt: string;
  createdAt: number;
  status: TxnStatus | 'expired';
  transactionId?: string;
}

interface MockState {
  merchant: Merchant;
  transactions: Transaction[];
  settlements: Settlement[];
  notifications: NotificationItem[];
  staff: Staff[];
  tickets: SupportTicket[];
  kycDraft: KycDraft;
  pendingPayments: Map<string, PendingPayment>;
  otpRequestCount: number;
  aadhaarTxnId: string | null;
}

function buildNotifications(transactions: Transaction[]): NotificationItem[] {
  const latest = transactions.find((t) => t.status === 'success');
  return [
    {
      id: nextId('ntf'),
      type: 'payment_received',
      title: 'Payment received',
      body: latest ? `You received a payment of ${latest.amount / 100} rupees.` : 'You received a payment.',
      read: false,
      deeplink: latest ? `merchantone://transactions/${latest.id}` : undefined,
      createdAt: iso(-2 * 3_600_000),
    },
    {
      id: nextId('ntf'),
      type: 'settlement_credited',
      title: 'Settlement credited',
      body: 'Your settlement has been credited to your bank account.',
      read: false,
      deeplink: 'merchantone://settlements',
      createdAt: iso(-1 * DAY_MS),
    },
    {
      id: nextId('ntf'),
      type: 'kyc_update',
      title: 'KYC approved',
      body: 'Your business verification is complete. All features are unlocked.',
      read: true,
      createdAt: iso(-5 * DAY_MS),
    },
  ];
}

function freshDraft(): KycDraft {
  return { currentStep: KycStep.BusinessInfo, completedThrough: 0 };
}

function createState(): MockState {
  const transactions = buildTransactionHistory();
  return {
    merchant: buildExistingMerchant(),
    transactions,
    settlements: buildSettlements(transactions),
    notifications: buildNotifications(transactions),
    staff: [
      { id: nextId('stf'), name: 'Priya Deshmukh', mobile: '9812345678', role: 'manager' },
      { id: nextId('stf'), name: 'Amit Patil', mobile: '9823456789', role: 'cashier' },
    ],
    tickets: [],
    kycDraft: freshDraft(),
    pendingPayments: new Map(),
    otpRequestCount: 0,
    aadhaarTxnId: null,
  };
}

export const mockState: MockState = createState();

/* -------------------------------------------------------------------------- */
/* Mutations used by the handlers                                             */
/* -------------------------------------------------------------------------- */

/**
 * Switches the mock into "new merchant" mode. Called on OTP verify when the
 * mobile is not the seeded one, so the KYC wizard runs against an empty profile.
 */
export function initNewMerchant(mobile: string): void {
  mockState.merchant = buildNewMerchant(mobile);
  mockState.transactions = [];
  mockState.settlements = [];
  mockState.notifications = [];
  mockState.staff = [];
  mockState.kycDraft = freshDraft();
  mockState.pendingPayments.clear();
}

/** Restores the seeded merchant with full history. */
export function initExistingMerchant(): void {
  const transactions = buildTransactionHistory();
  mockState.merchant = buildExistingMerchant();
  mockState.transactions = transactions;
  mockState.settlements = buildSettlements(transactions);
  mockState.notifications = buildNotifications(transactions);
  mockState.kycDraft = { currentStep: KycStep.Done, completedThrough: KycStep.AadhaarEkyc };
  mockState.pendingPayments.clear();
}

export function setKycStatus(status: KycStatus): void {
  mockState.merchant.kycStatus = status;
}

export function todayTransactions(): Transaction[] {
  return mockState.transactions.filter((t) => isToday(t.createdAt));
}

export { isToday, nextId, iso };
