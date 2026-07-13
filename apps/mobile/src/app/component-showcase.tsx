import type {
  CartItem as CartItemData,
  Coupon,
  Deal,
  Flavor,
  MenuItem,
  OrderStatus,
  PickupBranch,
  PickupTime,
  RewardsAccount,
  RewardsTierProgress,
  Size,
} from '@jojopotato/types';
import {
  Badge,
  BranchCard,
  BrandWordmark,
  Button,
  Card,
  CartItem,
  CouponCard,
  DealCard,
  FlavorSelector,
  Input,
  OrderStatusBadge,
  OrderStatusTimeline,
  PickupTimeBadge,
  ProductCard,
  RewardProgressCard,
  SizeSelector,
  StarProgressBar,
} from '@jojopotato/ui';
import { Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, MaxContentWidth, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Dev-only component gallery. Renders every `@jojopotato/ui` component with
 * realistic sample props so the shared UI library can be browsed and verified
 * on-device without wiring up real data. Temporary scaffolding — not shipped UI.
 */

const noop = () => {};
const log = (label: string) => () => console.log(`[showcase] ${label}`);

// --- Sample data (invented, but shaped to each real type) ---

const SAMPLE_PRODUCT: MenuItem = {
  id: 'prod-fries-classic',
  name: 'Classic Fries',
  description: 'Hand-cut potatoes, double-fried until golden, dusted with sea salt.',
  priceCents: 12000,
  categoryId: 'cat-fries',
  isAvailable: true,
};

const SAMPLE_PRODUCT_SOLD_OUT: MenuItem = {
  id: 'prod-loaded-fries',
  name: 'Loaded Cheese Fries',
  description: 'Melted cheese, bacon bits, spring onions.',
  priceCents: 18500,
  categoryId: 'cat-fries',
  isAvailable: false,
};

const SAMPLE_DEAL: Deal = {
  id: 'deal-combo-1',
  title: 'Fry-day Combo',
  description: 'Any large fries + a drink, every Friday.',
  discountLabel: '-25%',
  dealType: 'percentage_discount',
  discountValue: 25,
  minimumOrderAmount: 0,
  startAt: new Date().toISOString(),
  endAt: new Date().toISOString(),
  isActive: true,
  eligibleProductIds: [],
  eligibleBranchIds: [],
};

const SAMPLE_BRANCH: PickupBranch = {
  id: 'branch-sm-north',
  name: 'SM North EDSA',
  address: 'North Ave cor. EDSA, Quezon City',
  latitude: 14.6564,
  longitude: 121.03,
  estimatedPrepMinutes: 20,
  isAcceptingPickup: true,
  isOpen: true,
};

const SAMPLE_BRANCH_CLOSED: PickupBranch = {
  id: 'branch-moa',
  name: 'SM Mall of Asia',
  address: 'Seaside Blvd, Pasay City',
  latitude: 14.535,
  longitude: 120.982,
  estimatedPrepMinutes: 25,
  isAcceptingPickup: false,
  isOpen: false,
};

const SAMPLE_REWARDS: RewardsAccount = {
  userId: 'user-1',
  points: 340,
  tier: 'silver',
};

const SAMPLE_PROGRESS: RewardsTierProgress = {
  currentPoints: 340,
  pointsToNextTier: 160,
  nextTier: 'gold',
};

const SAMPLE_COUPON: Coupon = {
  id: 'coupon-welcome',
  code: 'WELCOME10',
  title: 'Welcome discount',
  discountLabel: '10% off first order',
  isRedeemed: false,
};

const SAMPLE_COUPON_REDEEMED: Coupon = {
  id: 'coupon-used',
  code: 'FREEDIP',
  title: 'Free dip sauce',
  discountLabel: 'Free garlic aioli',
  isRedeemed: true,
};

const SAMPLE_CART_ITEM: CartItemData = {
  lineId: 'line-showcase-1',
  menuItemId: 'prod-fries-classic',
  quantity: 2,
  productNameSnapshot: 'Classic Fries',
  unitPriceCents: 12000,
  selectedOptions: [],
};

const SAMPLE_FLAVORS: Flavor[] = [
  { id: 'flv-salt', name: 'Sea Salt' },
  { id: 'flv-cheese', name: 'Cheese' },
  { id: 'flv-sourcream', name: 'Sour Cream' },
  { id: 'flv-bbq', name: 'Smoky BBQ' },
];

const SAMPLE_SIZES: Size[] = [
  { id: 'sz-regular', label: 'Regular' },
  { id: 'sz-large', label: 'Large', priceModifierCents: 4000 },
  { id: 'sz-jumbo', label: 'Jumbo', priceModifierCents: 8000 },
];

const SAMPLE_PICKUP_TIME: PickupTime = {
  id: 'pt-1',
  label: 'ASAP (15 min)',
  isoTime: '2026-07-09T12:15:00+08:00',
  isAvailable: true,
};

const SAMPLE_PICKUP_TIME_FULL: PickupTime = {
  id: 'pt-2',
  label: '12:30 PM',
  isoTime: '2026-07-09T12:30:00+08:00',
  isAvailable: false,
};

const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'accepted',
  'preparing',
  'flavoring',
  'ready',
  'completed',
  'cancelled',
];

interface SectionProps {
  title: string;
  children: ReactNode;
}

function Section({ title, children }: SectionProps) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export default function ComponentShowcaseScreen() {
  const theme = useTheme();

  // Local state so the interactive selectors and inputs actually respond.
  const [inputValue, setInputValue] = useState('Juan Dela Cruz');
  const [selectedFlavorId, setSelectedFlavorId] = useState<string | undefined>('flv-cheese');
  const [selectedSizeId, setSelectedSizeId] = useState<string | undefined>('sz-large');
  const [quantity, setQuantity] = useState(SAMPLE_CART_ITEM.quantity);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{ headerShown: true, title: 'Component Showcase', headerBackTitle: 'Back' }}
      />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.note, { color: theme.textSecondary }]}>
            Dev-only gallery of every @jojopotato/ui component. Temporary — not shipped UI.
          </Text>

          <Section title="BrandWordmark">
            <BrandWordmark />
            <BrandWordmark size={22} />
          </Section>

          <Section title="Button">
            <Button label="Primary" onPress={log('Button primary')} />
            <Button label="Accent" variant="accent" onPress={log('Button accent')} />
            <Button label="Ink" variant="ink" onPress={log('Button ink')} />
            <Button label="Outline" variant="outline" onPress={log('Button outline')} />
            <Button label="Disabled" disabled onPress={noop} />
          </Section>

          <Section title="Card">
            <Card>
              <Text style={[styles.cardText, { color: theme.text }]}>
                A plain themed container surface. Compose any content inside it.
              </Text>
            </Card>
          </Section>

          <Section title="Badge">
            <Badge label="Default" />
            <Badge label="Success" variant="success" />
            <Badge label="Warning" variant="warning" />
            <Badge label="Danger" variant="danger" />
          </Section>

          <Section title="Input">
            <Input
              label="Full name"
              value={inputValue}
              onChangeText={setInputValue}
              placeholder="Enter your name"
            />
            <Input
              label="Email"
              value="not-an-email"
              onChangeText={noop}
              placeholder="you@example.com"
              error="Enter a valid email address"
            />
          </Section>

          <Section title="ProductCard">
            <ProductCard product={SAMPLE_PRODUCT} />
            <ProductCard product={SAMPLE_PRODUCT_SOLD_OUT} />
          </Section>

          <Section title="DealCard">
            <DealCard deal={SAMPLE_DEAL} onPress={log('DealCard')} />
          </Section>

          <Section title="BranchCard">
            <BranchCard branch={SAMPLE_BRANCH} onPress={log('BranchCard open')} />
            <BranchCard branch={SAMPLE_BRANCH_CLOSED} onPress={log('BranchCard closed')} />
          </Section>

          <Section title="RewardProgressCard">
            <RewardProgressCard rewards={SAMPLE_REWARDS} onPress={log('RewardProgressCard')} />
          </Section>

          <Section title="StarProgressBar">
            <StarProgressBar progress={SAMPLE_PROGRESS} />
            <StarProgressBar
              progress={{ currentPoints: 900, pointsToNextTier: 0, nextTier: null }}
            />
          </Section>

          <Section title="OrderStatusBadge">
            {ORDER_STATUSES.map((status) => (
              <OrderStatusBadge key={status} status={status} />
            ))}
          </Section>

          <Section title="OrderStatusTimeline">
            <OrderStatusTimeline currentStatus="preparing" />
          </Section>

          <Section title="CouponCard">
            <CouponCard coupon={SAMPLE_COUPON} onPress={log('CouponCard')} />
            <CouponCard coupon={SAMPLE_COUPON_REDEEMED} />
          </Section>

          <Section title="CartItem">
            <CartItem
              item={{ ...SAMPLE_CART_ITEM, quantity }}
              product={SAMPLE_PRODUCT}
              flavor={SAMPLE_FLAVORS.find((f) => f.id === selectedFlavorId)}
              size={SAMPLE_SIZES.find((s) => s.id === selectedSizeId)}
              onIncrement={() => setQuantity((q) => q + 1)}
              onDecrement={() => setQuantity((q) => Math.max(1, q - 1))}
            />
          </Section>

          <Section title="FlavorSelector">
            <FlavorSelector
              flavors={SAMPLE_FLAVORS}
              selectedFlavorId={selectedFlavorId}
              onSelect={(flavor) => setSelectedFlavorId(flavor.id)}
            />
          </Section>

          <Section title="SizeSelector">
            <SizeSelector
              sizes={SAMPLE_SIZES}
              selectedSizeId={selectedSizeId}
              onSelect={(size) => setSelectedSizeId(size.id)}
            />
          </Section>

          <Section title="PickupTimeBadge">
            <PickupTimeBadge pickupTime={SAMPLE_PICKUP_TIME} />
            <PickupTimeBadge pickupTime={SAMPLE_PICKUP_TIME_FULL} />
          </Section>
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  note: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  sectionBody: {
    gap: Spacing.two,
  },
  cardText: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.body,
  },
});
