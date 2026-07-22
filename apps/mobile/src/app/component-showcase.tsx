import type {
  CartItem as CartItemData,
  Coupon,
  Deal,
  Flavor,
  MenuItem,
  OrderStatus,
  PickupBranch,
  PickupTime,
  Size,
} from '@jojopotato/types';
import type { RewardProgress, StarProgress, ThemeMode } from '@jojopotato/ui';
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
  Toggle,
} from '@jojopotato/ui';
import { Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, FontFamily, MaxContentWidth, Spacing, TypeScale } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

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
  slug: 'sm-north-edsa',
  address: 'North Ave cor. EDSA, Quezon City',
  latitude: 14.6564,
  longitude: 121.03,
  phone: '+63 2 8888 0002',
  openingHours: JSON.stringify({ mon: { open: '10:00', close: '22:00' } }),
  isActive: true,
  isAcceptingPickup: true,
  estimatedPrepMinutes: 15,
  priority: 1,
  isOpen: true,
};

const SAMPLE_BRANCH_CLOSED: PickupBranch = {
  id: 'branch-moa',
  name: 'SM Mall of Asia',
  slug: 'sm-mall-of-asia',
  address: 'Seaside Blvd, Pasay City',
  latitude: 14.535,
  longitude: 120.982,
  phone: '+63 2 8888 0003',
  openingHours: JSON.stringify({ mon: { open: '10:00', close: '22:00' } }),
  isActive: true,
  isAcceptingPickup: false,
  estimatedPrepMinutes: 20,
  priority: 2,
  isOpen: false,
};

const SAMPLE_REWARDS: RewardProgress = {
  currentStars: 3,
  requiredStars: 5,
};

const SAMPLE_PROGRESS: StarProgress = {
  currentStars: 3,
  requiredStars: 5,
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

// Mixed price-delta fixture so the showcase demonstrates all three states of the
// A1 rule: zero/absent delta renders no price text, positive renders with a
// leading "+", negative renders sign-and-colour-distinct from positive.
const SAMPLE_FLAVORS: Flavor[] = [
  { id: 'flv-salt', name: 'Sea Salt' },
  { id: 'flv-cheese', name: 'Cheese', priceDeltaCents: 1200 },
  { id: 'flv-sourcream', name: 'Sour Cream', priceDeltaCents: 0 },
  { id: 'flv-bbq', name: 'Smoky BBQ', priceDeltaCents: -500 },
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
  mode: ThemeMode;
  children: ReactNode;
}

function Section({ title, mode, children }: SectionProps) {
  const theme = Colors[mode];
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export default function ComponentShowcaseScreen() {
  const scheme = useColorScheme();
  const appMode: ThemeMode = scheme === 'dark' ? 'dark' : 'light';

  // Dev-only preview override. Null = follow the app's resolved theme (so the
  // gallery tracks the Account-tab toggle by default); flipping the switch pins
  // the whole gallery to one mode so both themes can be browsed from here
  // without leaving the screen. This is a local preview control only — it never
  // touches the persisted theme preference.
  const [modeOverride, setModeOverride] = useState<ThemeMode | null>(null);
  const mode = modeOverride ?? appMode;
  const theme = Colors[mode];

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

          <Toggle
            label={`Dark preview (${mode})`}
            value={mode === 'dark'}
            onValueChange={(next) => setModeOverride(next ? 'dark' : 'light')}
            mode={mode}
          />

          <Section title="BrandWordmark" mode={mode}>
            <BrandWordmark mode={mode} />
            <BrandWordmark size={22} mode={mode} />
          </Section>

          <Section title="Button" mode={mode}>
            <Button label="Primary" onPress={log('Button primary')} mode={mode} />
            <Button label="Accent" variant="accent" onPress={log('Button accent')} mode={mode} />
            <Button label="Ink" variant="ink" onPress={log('Button ink')} mode={mode} />
            <Button label="Outline" variant="outline" onPress={log('Button outline')} mode={mode} />
            <Button label="Disabled" disabled onPress={noop} mode={mode} />
          </Section>

          <Section title="Card" mode={mode}>
            <Card mode={mode}>
              <Text style={[styles.cardText, { color: theme.text }]}>
                A plain themed container surface. Compose any content inside it.
              </Text>
            </Card>
          </Section>

          <Section title="Badge" mode={mode}>
            <Badge label="Default" mode={mode} />
            <Badge label="Success" variant="success" mode={mode} />
            <Badge label="Warning" variant="warning" mode={mode} />
            <Badge label="Danger" variant="danger" mode={mode} />
          </Section>

          <Section title="Input" mode={mode}>
            <Input
              label="Full name"
              value={inputValue}
              onChangeText={setInputValue}
              placeholder="Enter your name"
              mode={mode}
            />
            <Input
              label="Email"
              value="not-an-email"
              onChangeText={noop}
              placeholder="you@example.com"
              error="Enter a valid email address"
              mode={mode}
            />
          </Section>

          <Section title="ProductCard" mode={mode}>
            <ProductCard product={SAMPLE_PRODUCT} mode={mode} />
            <ProductCard product={SAMPLE_PRODUCT_SOLD_OUT} mode={mode} />
          </Section>

          <Section title="DealCard" mode={mode}>
            <DealCard deal={SAMPLE_DEAL} onPress={log('DealCard')} mode={mode} />
          </Section>

          <Section title="BranchCard" mode={mode}>
            <BranchCard
              branch={SAMPLE_BRANCH}
              isOpen
              onPress={log('BranchCard open')}
              mode={mode}
            />
            <BranchCard
              branch={SAMPLE_BRANCH_CLOSED}
              isOpen={false}
              onPress={log('BranchCard closed')}
              mode={mode}
            />
          </Section>

          <Section title="RewardProgressCard" mode={mode}>
            <RewardProgressCard
              rewards={SAMPLE_REWARDS}
              onPress={log('RewardProgressCard')}
              mode={mode}
            />
          </Section>

          <Section title="StarProgressBar" mode={mode}>
            <StarProgressBar progress={SAMPLE_PROGRESS} mode={mode} />
            <StarProgressBar progress={{ currentStars: 5, requiredStars: 5 }} mode={mode} />
          </Section>

          <Section title="OrderStatusBadge" mode={mode}>
            {ORDER_STATUSES.map((status) => (
              <OrderStatusBadge key={status} status={status} mode={mode} />
            ))}
          </Section>

          <Section title="OrderStatusTimeline" mode={mode}>
            <OrderStatusTimeline currentStatus="preparing" mode={mode} />
          </Section>

          <Section title="CouponCard" mode={mode}>
            <CouponCard coupon={SAMPLE_COUPON} onPress={log('CouponCard')} mode={mode} />
            <CouponCard coupon={SAMPLE_COUPON_REDEEMED} mode={mode} />
          </Section>

          <Section title="CartItem" mode={mode}>
            <CartItem
              item={{ ...SAMPLE_CART_ITEM, quantity }}
              product={SAMPLE_PRODUCT}
              flavor={SAMPLE_FLAVORS.find((f) => f.id === selectedFlavorId)}
              size={SAMPLE_SIZES.find((s) => s.id === selectedSizeId)}
              onIncrement={() => setQuantity((q) => q + 1)}
              onDecrement={() => setQuantity((q) => Math.max(1, q - 1))}
              mode={mode}
            />
          </Section>

          <Section title="FlavorSelector" mode={mode}>
            <FlavorSelector
              flavors={SAMPLE_FLAVORS}
              selectedFlavorId={selectedFlavorId}
              onSelect={(flavor) => setSelectedFlavorId(flavor.id)}
              mode={mode}
            />
          </Section>

          <Section title="SizeSelector" mode={mode}>
            <SizeSelector
              sizes={SAMPLE_SIZES}
              selectedSizeId={selectedSizeId}
              onSelect={(size) => setSelectedSizeId(size.id)}
              mode={mode}
            />
          </Section>

          <Section title="PickupTimeBadge" mode={mode}>
            <PickupTimeBadge pickupTime={SAMPLE_PICKUP_TIME} mode={mode} />
            <PickupTimeBadge pickupTime={SAMPLE_PICKUP_TIME_FULL} mode={mode} />
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
