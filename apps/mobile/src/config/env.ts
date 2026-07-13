export const env = {
  appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://api.jojopotato.ph',
  onlinePaymentEnabled: process.env.EXPO_PUBLIC_ONLINE_PAYMENT_ENABLED === 'true',
} as const;
