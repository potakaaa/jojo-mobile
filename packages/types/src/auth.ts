export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phoneNumber?: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}
