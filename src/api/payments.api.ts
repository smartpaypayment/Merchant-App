import type {
  DynamicQrPayload,
  DynamicQrResponse,
  PaymentLinkPayload,
  PaymentLinkResponse,
  PaymentStatusResponse,
} from '@models/api';
import { get, post } from './client';

/** `POST /payments/dynamic-qr` — amount is integer paise. */
export const createDynamicQr = (payload: DynamicQrPayload): Promise<DynamicQrResponse> =>
  post<DynamicQrResponse>('/payments/dynamic-qr', payload);

/** `GET /payments/{ref}/status` — polled every 2-3s while the QR is on screen. */
export const getPaymentStatus = (ref: string): Promise<PaymentStatusResponse> =>
  get<PaymentStatusResponse>(`/payments/${ref}/status`);

/** `POST /payments/link` — shareable payment link. */
export const createPaymentLink = (payload: PaymentLinkPayload): Promise<PaymentLinkResponse> =>
  post<PaymentLinkResponse>('/payments/link', payload);
