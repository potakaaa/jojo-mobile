import { Button } from '@jojopotato/ui';
import { formatPricePHP } from '@jojopotato/utils';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FontFamily, Palette, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface AddToCartBarProps {
  unitPrice: number;
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
export function AddToCartBar({ unitPrice, canAdd, isAvailable, onAdd }: AddToCartBarProps) {
  const theme = useTheme();
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
    <View style={[styles.bar, { backgroundColor: theme.backgroundElement, borderTopColor: theme.border }]}>
      {showHint && !canAdd ? (
        <Text style={[styles.hint, { color: Palette.jred }]}>
          Please choose the required options first.
        </Text>
      ) : null}
      <View style={styles.row}>
        <View>
          <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>Total</Text>
          <Text style={[styles.price, { color: theme.text }]}>{formatPricePHP(unitPrice)}</Text>
        </View>
        {isAvailable ? (
          <Button
            label="Add to Cart"
            onPress={handlePress}
            style={StyleSheet.flatten([styles.addButton, !canAdd && styles.addButtonDim])}
          />
        ) : (
          <Button label="Unavailable" onPress={() => {}} variant="outline" disabled style={styles.addButton} />
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
