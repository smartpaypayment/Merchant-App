import type { DashboardSummary } from '@models/index';
import { get } from './client';

/** `GET /dashboard/summary` — Home screen data (Section 6.5). */
export const getDashboardSummary = (): Promise<DashboardSummary> =>
  get<DashboardSummary>('/dashboard/summary');
