/**
 * Product Availability screen (staff) — STAFF-004.
 *
 * Lists all branch products with a toggle per product to enable/disable
 * availability. Toggling calls `PATCH /api/staff/products/:productId/availability`
 * via `useToggleProductAvailability()`.
 */

import { Ionicons } from '@expo/vector-icons';
import { Card, type ThemeMode } from '@jojopotato/ui';
import type { StaffProduct } from '@jojopotato/types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useToggleProductAvailability } from '@/features/staff/hooks/use-toggle-product-availability';
import { useStaffProducts } from '@/features/staff/hooks/use-staff-products';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

interface ProductRowProps {
  product: StaffProduct;
  mode: ThemeMode;
}

// Local state per row so the Switch responds instantly without waiting for
// the cache round-trip. Reverts only if the server returns an error.
function ProductRow({ product, mode }: ProductRowProps) {
  const theme = useTheme();
  const { mutate: toggleAvailability } = useToggleProductAvailability();
  const [value, setValue] = useState(product.isAvailable);
  const [prevIsAvailable, setPrevIsAvailable] = useState(product.isAvailable);

  // Sync from server on background refetch using the "previous render" pattern
  // (React-recommended alternative to useEffect + setState for derived state).
  if (prevIsAvailable !== product.isAvailable) {
    setPrevIsAvailable(product.isAvailable);
    setValue(product.isAvailable);
  }

  function handleChange(newValue: boolean) {
    setValue(newValue);
    toggleAvailability(
      { productId: product.id, isAvailable: newValue },
      { onError: () => setValue(!newValue) },
    );
  }

  return (
    <Card mode={mode} style={styles.row}>
      <View style={styles.rowContent}>
        <View style={styles.rowInfo}>
          <Text style={[styles.productName, { color: theme.text }]}>{product.name}</Text>
          <Text style={[styles.productPrice, { color: theme.textSecondary }]}>
            ₱{product.basePrice}
          </Text>
        </View>
        <Switch
          value={value}
          onValueChange={handleChange}
          accessibilityLabel={`Toggle availability for ${product.name}`}
        />
      </View>
    </Card>
  );
}

export default function ProductAvailabilityScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode: ThemeMode = scheme === 'dark' ? 'dark' : 'light';
  const router = useRouter();
  const { data: products, isLoading, isError } = useStaffProducts();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Product Availability</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {isLoading ? (
            <View style={styles.stateBlock}>
              <ActivityIndicator size="large" color={theme.text} />
            </View>
          ) : isError ? (
            <View style={styles.stateBlock}>
              <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                Could not load products
              </Text>
            </View>
          ) : !products || products.length === 0 ? (
            <View style={styles.stateBlock}>
              <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                No products found
              </Text>
            </View>
          ) : (
            products.map((product) => <ProductRow key={product.id} product={product} mode={mode} />)
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.two,
  },
  headerTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h2,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  stateBlock: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
  },
  stateText: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.body,
    textAlign: 'center',
  },
  row: {
    gap: Spacing.one,
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowInfo: {
    flex: 1,
    gap: Spacing.half,
    marginRight: Spacing.two,
  },
  productName: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
  },
  productPrice: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
});
