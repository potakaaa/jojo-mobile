import type { ProductOptionType } from '@jojopotato/types';
import { AddOnSelector, Badge, FlavorSelector, SizeSelector } from '@jojopotato/ui';
import { StyleSheet, Text, View } from 'react-native';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import type { OptionGroup } from '@/features/menu/lib/group-options';
import { useTheme } from '@/hooks/use-theme';

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
  const selectedId = selectedIds[0];

  return (
    <View style={styles.group}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>{GROUP_TITLE[group.type]}</Text>
        <Badge
          label={required ? 'Required' : 'Optional'}
          variant={required ? 'warning' : 'default'}
        />
      </View>

      {group.type === 'flavor' ? (
        <FlavorSelector
          flavors={group.options.map((option) => ({ id: option.id, name: option.name }))}
          selectedFlavorId={selectedId}
          onSelect={(flavor) => onChange(flavor.id)}
        />
      ) : group.type === 'size' ? (
        <SizeSelector
          sizes={group.options.map((option) => ({ id: option.id, label: option.name }))}
          selectedSizeId={selectedId}
          onSelect={(size) => onChange(size.id)}
        />
      ) : (
        <AddOnSelector
          options={group.options.map((option) => ({ id: option.id, name: option.name }))}
          selectedIds={selectedIds}
          onToggle={(id) => onChange(id)}
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
