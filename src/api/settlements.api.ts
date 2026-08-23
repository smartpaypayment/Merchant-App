import type { Paginated } from '@models/api';
import type { Settlement, SettlementStatus, Transaction } from '@models/index';
import { get } from './client';

/** Tab filter on the settlements list (Section 6.11). */
export type SettlementTab = 'pending' | 'settled';

export const listSettlements = (status?: SettlementTab): Promise<Paginated<Settlement>> =>
  get<Paginated<Settlement>>('/settlements', status ? { params: { status } } : undefined);

export type SettlementDetail = Settlement & { transactions: Transaction[]; status: SettlementStatus };

export const getSettlement = (id: string): Promise<SettlementDetail> =>
  get<SettlementDetail>(`/settlements/${id}`);
