import type { ProductOption, ProductOptionType } from '@jojopotato/types';
import { AddOnSelector, Badge, FlavorSelector, SizeSelector } from '@jojopotato/ui';
import { StyleSheet, Text, View } from 'react-native';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * One option group ready to render: a type + the options for that type. The
 * backend already returns options grouped by type (a `Record`), so this branch
 * builds `OptionGroup`s inline in `[productId].tsx` rather than via a client-side
 * `groupOptions()` helper — hence this type is defined here, not imported from
 * the un-adopted `lib/group-options.ts`.
 */
export interface OptionGroup {
  type: ProductOptionType;
  options: ProductOption[];
}

export interface OptionGroupSelectorProps {
  group: OptionGroup;
  required: boolean;
  /** Selected option ids for this group (0..1 for single-select, 0..n for add-ons). */
  selectedIds: string[];
  /** Select (single-select groups) or toggle (add_on) the given option id. */
  onChange: (optionId: string) => void;
}

const GROUP_TITLE: Record<ProductOptionType, string> = {
  size: 'Size',
  flavor: 'Flavor',
  add_on: 'Add-ons',
};

/**
 * Renders one option group: a title, a Required/Optional badge (INNOVATE #7 —
 * the convention has no schema backing, so the label makes it visible), and the
 * matching selector. `FlavorSelector`/`SizeSelector` do NOT accept
 * `ProductOption[]` directly — each group's options are mapped into the
 * `{id,name}` / `{id,label}` shapes those components expect before rendering.
 */
export function OptionGroupSelector({
  group,
  required,
  selectedIds,
  onChange,
}: OptionGroupSelectorProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const selectedId = selectedIds[0];

  return (
    <View style={styles.group}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>{GROUP_TITLE[group.type]}</Text>
        <Badge
          label={required ? 'Required' : 'Optional'}
          variant={required ? 'warning' : 'default'}
          mode={mode}
        />
      </View>

      {group.type === 'flavor' ? (
        <FlavorSelector
          flavors={group.options.map((option) => ({
            id: option.optionId,
            name: option.name,
            priceDeltaCents: option.priceDeltaCents,
          }))}
          selectedFlavorId={selectedId}
          onSelect={(flavor) => onChange(flavor.id)}
          mode={mode}
        />
      ) : group.type === 'size' ? (
        <SizeSelector
          sizes={group.options.map((option) => ({
            id: option.optionId,
            label: option.name,
            priceModifierCents: option.priceDeltaCents,
          }))}
          selectedSizeId={selectedId}
          onSelect={(size) => onChange(size.id)}
          mode={mode}
        />
      ) : (
        <AddOnSelector
          options={group.options.map((option) => ({
            id: option.optionId,
            name: option.name,
            priceDeltaCents: option.priceDeltaCents,
          }))}
          selectedIds={selectedIds}
          onToggle={(id) => onChange(id)}
          mode={mode}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: Spacing.two,
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
});
