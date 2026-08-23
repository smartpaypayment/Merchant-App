import type {
  OtpRequestPayload,
  OtpRequestResponse,
  OtpVerifyPayload,
  OtpVerifyResponse,
} from '@models/api';
import { post } from './client';

/** `POST /auth/otp/request` — Section 9. */
export const requestOtp = (payload: OtpRequestPayload): Promise<OtpRequestResponse> =>
  post<OtpRequestResponse>('/auth/otp/request', payload);

/** `POST /auth/otp/verify` — returns tokens and whether onboarding is needed. */
export const verifyOtp = (payload: OtpVerifyPayload): Promise<OtpVerifyResponse> =>
  post<OtpVerifyResponse>('/auth/otp/verify', payload);
