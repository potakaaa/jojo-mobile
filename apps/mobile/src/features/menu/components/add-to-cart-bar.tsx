import { Button } from '@jojopotato/ui';
import { formatCurrency } from '@jojopotato/utils';
import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, Palette, Spacing, TypeScale } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export interface AddToCartBarProps {
  /** Live unit price in integer cents (base + selected option deltas). */
  unitPriceCents: number;
  /** True once all required option groups have a selection (AC8). */
  canAdd: boolean;
  /** False when the product is unavailable at the selected branch (AC11). */
  isAvailable: boolean;
  onAdd: () => void;
}

/**
 * Sticky bottom bar: live computed unit price + an Add-to-Cart button. The
 * button is dimmed until required options are chosen; tapping it while
 * incomplete surfaces an inline validation message rather than adding (AC9).
 * When the product is unavailable it shows an unavailable state instead (AC11).
 */
export function AddToCartBar({ unitPriceCents, canAdd, isAvailable, onAdd }: AddToCartBarProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();
  const [showHint, setShowHint] = useState(false);

  // The hint only renders while required options are still missing
  // (`showHint && !canAdd` below), so no reset effect is needed once complete.
  const handlePress = () => {
    if (!isAvailable) return;
    if (!canAdd) {
      setShowHint(true);
      return;
    }
    onAdd();
  };

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: theme.backgroundElement, borderTopColor: theme.border },
        Platform.OS !== 'web' && { paddingBottom: getFloatingTabBarClearance(insets.bottom) },
      ]}
    >
      {showHint && !canAdd ? (
        <Text style={[styles.hint, { color: Palette.jred }]}>
          Please choose the required options first.
        </Text>
      ) : null}
      <View style={styles.row}>
        <View>
          <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>Total</Text>
          <Text style={[styles.price, { color: theme.text }]}>
            {formatCurrency(unitPriceCents)}
          </Text>
        </View>
        {isAvailable ? (
          <Button
            label="Add to Cart"
            onPress={handlePress}
            style={StyleSheet.flatten([styles.addButton, !canAdd && styles.addButtonDim])}
            mode={mode}
          />
        ) : (
          <Button
            label="Unavailable"
            onPress={() => {}}
            variant="outline"
            disabled
            style={styles.addButton}
            mode={mode}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: 2,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  hint: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
  priceLabel: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
  price: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  addButton: {
    minWidth: 160,
  },
  addButtonDim: {
    opacity: 0.5,
  },
});
