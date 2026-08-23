import { z } from 'zod';
import { MOBILE_REGEX, OTP_REGEX } from '@utils/validators';

/**
 * Auth form schemas (Section 6.2 / 6.3).
 *
 * Validation messages are stored as **i18n keys**, not prose. React Hook Form
 * surfaces `error.message`, and the screen runs it through `t()` before display —
 * which is what keeps Section 5's "no hardcoded text" rule true for validation
 * errors, the place it is most often broken.
 */

export const loginSchema = z.object({
  mobile: z
    .string()
    .min(1, 'auth.login.mobileRequired')
    .regex(MOBILE_REGEX, 'auth.login.mobileInvalid'),
  // Section 6.2: "T&C consent checkbox".
  consent: z.literal(true, { message: 'auth.login.consentRequired' }),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const otpSchema = z.object({
  otp: z.string().min(1, 'auth.otp.otpRequired').regex(OTP_REGEX, 'auth.otp.otpInvalid'),
});

export type OtpFormValues = z.infer<typeof otpSchema>;
