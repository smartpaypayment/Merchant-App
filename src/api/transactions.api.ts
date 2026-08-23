import type {
  Paginated,
  RefundPayload,
  RefundResponse,
  TransactionQuery,
} from '@models/api';
import type { Transaction } from '@models/index';
import { get, post } from './client';

/** `GET /transactions` — filters + cursor pagination (Section 6.8). */
export function listTransactions(query: TransactionQuery = {}): Promise<Paginated<Transaction>> {
  const params: Record<string, string | number> = {};
  if (query.filter && query.filter !== 'all') params['filter'] = query.filter;
  if (query.search) params['search'] = query.search;
  if (query.from) params['from'] = query.from;
  if (query.to) params['to'] = query.to;
  if (query.cursor) params['cursor'] = query.cursor;
  params['limit'] = query.limit ?? 20;

  return get<Paginated<Transaction>>('/transactions', { params });
}

export const getTransaction = (id: string): Promise<Transaction> => get<Transaction>(`/transactions/${id}`);

/** `POST /transactions/{id}/refund` — amount is integer paise. */
export const refundTransaction = (id: string, payload: RefundPayload): Promise<RefundResponse> =>
  post<RefundResponse>(`/transactions/${id}/refund`, payload);
