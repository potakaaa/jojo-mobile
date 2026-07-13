import { Button } from '@jojopotato/ui';
import { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { FontFamily, Palette, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ScreenMessageProps {
  title: string;
  subtitle?: string;
  /** Optional call-to-action so no state is ever a dead end. */
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}

/** Centered title/subtitle with an optional CTA — used for empty/error states. */
export function ScreenMessage({
  title,
  subtitle,
  actionLabel,
  onAction,
  children,
}: ScreenMessageProps) {
  const theme = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
      ) : null}
      {children}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

/** Centered spinner for loading states. */
export function ScreenLoader() {
  const theme = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: theme.background }]}>
      <ActivityIndicator color={Palette.jorange} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  title: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.body,
    textAlign: 'center',
  },
  action: {
    marginTop: Spacing.two,
  },
});
