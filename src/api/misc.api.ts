import type { CreateTicketPayload, Paginated, SupportTicket } from '@models/api';
import type { NotificationItem, Staff } from '@models/index';
import { del, get, patch, post } from './client';

/* Staff (Section 6.15) */
export const listStaff = (): Promise<Staff[]> => get<Staff[]>('/staff');
export const addStaff = (body: Omit<Staff, 'id'>): Promise<Staff> => post<Staff>('/staff', body);

/**
 * `PATCH /staff/{id}` — role or name change (Section 6.15 "edit role").
 *
 * Not in the Section 9 endpoint table, which lists only GET/POST/DELETE. Added
 * because remove-and-re-add would churn the member's id and detach any activity
 * attributed to them.
 */
export const updateStaff = (
  id: string,
  body: Partial<Pick<Staff, 'role' | 'name'>>,
): Promise<Staff> => patch<Staff>(`/staff/${id}`, body);

export const removeStaff = (id: string): Promise<{ deleted: boolean }> => del(`/staff/${id}`);

/* Notifications (Section 6.18) */
export const listNotifications = (): Promise<Paginated<NotificationItem>> =>
  get<Paginated<NotificationItem>>('/notifications');

/* Support (Section 6.17) */
export const listTickets = (): Promise<Paginated<SupportTicket>> =>
  get<Paginated<SupportTicket>>('/support/tickets');

export const createTicket = (body: CreateTicketPayload): Promise<SupportTicket> =>
  post<SupportTicket>('/support/tickets', body);
