import type { DealComponent } from '@jojopotato/types';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { FontFamily, Palette, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface DealContentsProps {
  components: DealComponent[];
}

/**
 * "What's inside" panel for a deal-product (ADM-004 deals-as-products). Lists the
 * `deal_components` — each item and its quantity — as read-only composition
 * metadata (never pricing; a deal is priced at its own base price). Renders
 * nothing when the list is empty, so callers can mount it unconditionally.
 */
export function DealContents({ components }: DealContentsProps) {
  const theme = useTheme();

  if (components.length === 0) return null;

  return (
    <View
      style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
    >
      <View style={styles.header}>
        <Ionicons name="fast-food-outline" size={20} color={theme.text} />
        <Text style={[styles.title, { color: theme.text }]}>What&apos;s inside</Text>
      </View>
      <View style={styles.list}>
        {components.map((item) => (
          <View key={item.componentProductId} style={styles.row}>
            <View
              style={[styles.qtyPill, { backgroundColor: theme.tint, borderColor: theme.border }]}
            >
              <Text style={styles.qtyText}>{item.quantity}×</Text>
            </View>
            <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={2}>
              {item.componentName}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 2,
    borderRadius: Radii.lg,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  qtyPill: {
    minWidth: 34,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radii.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    // On the fixed jyellow pill surface regardless of scheme, so ink is correct
    // in both modes (per the theming convention for fixed-surface text).
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.bodySmall,
    color: Palette.ink,
  },
  itemName: {
    flex: 1,
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.body,
  },
});
