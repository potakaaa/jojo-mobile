import { useLocalSearchParams } from 'expo-router';

import { ComingSoon } from '@/components/coming-soon';

/**
 * Product Details (nested Order screen). Reads the typed `productId` route
 * param — `experiments.typedRoutes` codegens the param type from the filename.
 */
export default function ProductDetailsScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();

  return <ComingSoon title={`Product ${productId}`} isNestedScreen />;
}
