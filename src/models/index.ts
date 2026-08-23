export type UUID = string;
/** ISO 8601 timestamp string. */
export type ISODate = string;

/**
 * Money is ALWAYS an integer count of paise (App-PRD Section 8 money rule).
 * This alias exists to make the unit explicit at every call site; use the
 * helpers in `@utils/money` to convert to/from rupees and to format for display.
 */
export type Paise = number;

export type KycStatus = 'not_started' | 'in_progress' | 'pending_review' | 'approved' | 'rejected';
export type TxnStatus = 'success' | 'pending' | 'failed' | 'refunded' | 'partially_refunded';
export type PaymentMode = 'upi_qr' | 'upi_intent' | 'payment_link' | 'card' | 'netbanking' | 'wallet';
export type SettlementStatus = 'pending' | 'processing' | 'settled' | 'failed';

export interface Address {
  line1: string;
  city: string;
  state: string;
  pincode: string;
}

export interface BankAccount {
  accountNumberMasked: string;
  ifsc: string;
  holderName: string;
  verified: boolean;
}

export interface MerchantPreferences {
  /** BCP-47-ish language code: 'hi' | 'en' | 'ta' ... */
  language: string;
  audioConfirmation: {
    enabled: boolean;
    language: string;
    /** 0..1 */
    volume: number;
  };
  notifications: {
    push: boolean;
    sms: boolean;
    whatsapp: boolean;
  };
}

export interface Merchant {
  id: UUID;
  businessName: string;
  /** Merchant Category Code label. */
  category: string;
  mobile: string;
  /** Merchant UPI address. */
  vpa: string;
  kycStatus: KycStatus;
  gstin?: string;
  pan?: string;
  address: Address;
  bankAccount: BankAccount;
  preferences: MerchantPreferences;
}

export interface Transaction {
  id: UUID;
  /** paise */
  amount: Paise;
  currency: 'INR';
  status: TxnStatus;
  mode: PaymentMode;
  payerVpaMasked?: string;
  utr?: string;
  /** paise */
  fee: Paise;
  /** paise */
  netAmount: Paise;
  note?: string;
  createdAt: ISODate;
  settlementId?: UUID;
  /** paise */
  refundedAmount?: Paise;
}

export interface Settlement {
  id: UUID;
  status: SettlementStatus;
  grossAmount: Paise;
  feeAmount: Paise;
  netAmount: Paise;
  utr?: string;
  transactionCount: number;
  bankAccountMasked: string;
  createdAt: ISODate;
  settledAt?: ISODate;
}

export interface DashboardSummary {
  todayCollected: Paise;
  todayTxnCount: number;
  pendingSettlement: Paise;
  recentTransactions: Transaction[];
}

export interface Staff {
  id: UUID;
  name: string;
  mobile: string;
  role: 'manager' | 'cashier';
}

export interface NotificationItem {
  id: UUID;
  type: string;
  title: string;
  body: string;
  read: boolean;
  deeplink?: string;
  createdAt: ISODate;
}

export * from './api';
export * from './kyc';
