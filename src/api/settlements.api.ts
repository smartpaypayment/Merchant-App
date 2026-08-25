import type {
  InstantSettlementQuoteResponse,
  InstantSettlementResponse,
  Paginated,
} from '@models/api';
import type { Settlement, SettlementStatus, Transaction } from '@models/index';
import { get, post } from './client';

/** Tab filter on the settlements list (Section 6.11). */
export type SettlementTab = 'pending' | 'settled';

export const listSettlements = (status?: SettlementTab): Promise<Paginated<Settlement>> =>
  get<Paginated<Settlement>>('/settlements', status ? { params: { status } } : undefined);

export type SettlementDetail = Settlement & { transactions: Transaction[]; status: SettlementStatus };

export const getSettlement = (id: string): Promise<SettlementDetail> =>
  get<SettlementDetail>(`/settlements/${id}`);

/**
 * Instant settlement (Section 6.11 action, PRD SET-2).
 *
 * The quote is fetched rather than computed client-side, so the fee shown to the
 * merchant is always the fee the backend will charge.
 */
export const getInstantSettlementQuote = (id: string): Promise<InstantSettlementQuoteResponse> =>
  get<InstantSettlementQuoteResponse>(`/settlements/${id}/instant/quote`);

export const executeInstantSettlement = (id: string): Promise<InstantSettlementResponse> =>
  post<InstantSettlementResponse>(`/settlements/${id}/instant`);
