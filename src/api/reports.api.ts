import type { ReportsResponse } from '@models/api';
import { get } from './client';

/** `GET /reports?from=&to=` — aggregates + daily series (Section 6.13). */
export const getReports = (from: string, to: string): Promise<ReportsResponse> =>
  get<ReportsResponse>('/reports', { params: { from, to } });
