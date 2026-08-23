import type { NavigatorScreenParams } from '@react-navigation/native';
import type { KycStep } from '@models/kyc';

/**
 * Route params for the navigation map in App-PRD Section 4.
 *
 * Typing these centrally means `navigation.navigate(...)` is checked at compile
 * time, so a renamed route or a missing param is a build error rather than a
 * runtime dead-end.
 */

export type AuthStackParamList = {
  Login: undefined;
  OTPVerify: { mobile: string; resendAfterSeconds: number };
};

export type OnboardingStackParamList = {
  /** The KYC wizard host; `step` resumes a saved draft. */
  KycWizard: { step?: KycStep } | undefined;
  KycDone: undefined;
};

export type CollectStackParamList = {
  CollectPayment: undefined;
  AmountEntry: undefined;
  QRScreen: { ref: string; amount: number; qrPayload: string; expiresAt: string };
  StaticQR: undefined;
  PaymentSuccess: { transactionId: string };
};

export type TransactionsStackParamList = {
  TransactionsList: undefined;
  TransactionDetail: { id: string };
  Refund: { id: string };
};

export type SettlementsStackParamList = {
  SettlementsList: undefined;
  SettlementDetail: { id: string };
};

export type MoreStackParamList = {
  MoreMenu: undefined;
  Reports: undefined;
  Profile: undefined;
  Staff: undefined;
  Support: undefined;
  Settings: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Collect: NavigatorScreenParams<CollectStackParamList>;
  Transactions: NavigatorScreenParams<TransactionsStackParamList>;
  Settlements: NavigatorScreenParams<SettlementsStackParamList>;
  More: NavigatorScreenParams<MoreStackParamList>;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Onboarding: NavigatorScreenParams<OnboardingStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
  /** Presented modally from the Home header bell (Section 6.18). */
  Notifications: undefined;
};

/** Enables `useNavigation()` to infer the root param list without explicit generics. */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
