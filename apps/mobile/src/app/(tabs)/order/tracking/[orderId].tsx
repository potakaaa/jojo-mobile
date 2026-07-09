import { useLocalSearchParams } from 'expo-router';

import { ComingSoon } from '@/components/coming-soon';

/**
 * Order Tracking (nested Order screen). Reads the typed `orderId` route param.
 */
export default function OrderTrackingScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  return <ComingSoon title={`Tracking Order ${orderId}`} isNestedScreen />;
}
