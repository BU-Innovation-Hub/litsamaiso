import apiClient from '../lib/api';

// A new key for an authenticator app: scan the QR code (or type the secret), then confirm a code
export interface TotpEnrollment {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  enrollmentToken: string;
  expiresAt: string;
}

export const totpService = {
  // Before an account exists; the token is tied to this email and checked again by /auth/register
  startRegistrationEnrollment: async (email: string): Promise<TotpEnrollment> => {
    const response = await apiClient.post<{ data: TotpEnrollment }>('/auth/totp/enrollment', { email });
    return response.data.data;
  },

  // First setup, or moving to a new device (which needs a code from the current one)
  startProfileEnrollment: async (currentCode?: string): Promise<TotpEnrollment> => {
    const response = await apiClient.post<{ data: TotpEnrollment }>(
      '/profile/totp/enrollment',
      currentCode ? { currentCode } : {}
    );
    return response.data.data;
  },

  // Turns the new app on. The code also unlocks the camera, so the grant comes back here.
  enableProfileTotp: async (enrollmentToken: string, code: string): Promise<string> => {
    const response = await apiClient.post<{ data: { captureGrant: string } }>('/profile/totp/enable', {
      enrollmentToken,
      code,
    });
    return response.data.data.captureGrant;
  },

  // A code from the app unlocks saving one profile photo
  unlockPhotoCapture: async (code: string): Promise<string> => {
    const response = await apiClient.post<{ data: { captureGrant: string } }>('/profile/face/unlock', { code });
    return response.data.data.captureGrant;
  },
};
