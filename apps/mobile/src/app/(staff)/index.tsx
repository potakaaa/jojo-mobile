import { Badge, BrandWordmark, Button, Card, type ThemeMode } from '@jojopotato/ui';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useStaffMe } from '@/features/staff/hooks/use-staff-me';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

// Nav card config. Active Orders navigates to the real STAFF-002 screen; the
// remaining three are inert placeholders (STAFF-003/004). The live active-order
// count is shown inside the Active Orders screen itself, not on this card.
const NAV_CARDS = [
  {
    title: 'Active Orders',
    subtitle: 'View orders',
    navigateTo: '/(staff)/active-orders' as const,
  },
  {
    title: 'Completed Orders',
    subtitle: 'View history',
    navigateTo: '/(staff)/completed-orders' as const,
  },
  {
    title: 'Product Availability',
    subtitle: 'Manage product availability',
    navigateTo: '/(staff)/product-availability' as const,
  },
  {
    title: 'Branch Pickup Settings',
    subtitle: 'Configure pickup settings',
    navigateTo: '/(staff)/branch-pickup-settings' as const,
  },
] as const;

/**
 * Staff dashboard shell (STAFF-001). Proves AC1 (staff lands here) + AC3 (branch
 * name comes from the auth-gated `GET /api/staff/me`). The four nav cards are
 * inert placeholders for STAFF-002/003/004 — no order/product data is fetched.
 */
export default function StaffDashboard() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode: ThemeMode = scheme === 'dark' ? 'dark' : 'light';
  const { signOut } = useAuth();
  const { data, isLoading, error } = useStaffMe();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <BrandWordmark mode={mode} size={TypeScale.h1} />
            <Badge label="Staff" mode={mode} />
          </View>

          <View style={styles.branchBlock}>
            <Text style={[styles.branchLabel, { color: theme.textSecondary }]}>Your branch</Text>
            {isLoading ? (
              <ActivityIndicator color={theme.text} />
            ) : error || !data ? (
              <Text style={[styles.branchName, { color: theme.textSecondary }]}>
                Branch unavailable
              </Text>
            ) : data.assignedBranch ? (
              <Text style={[styles.branchName, { color: theme.text }]}>
                {data.assignedBranch.name}
              </Text>
            ) : (
              <Text style={[styles.branchName, { color: theme.textSecondary }]}>
                No branch assigned
              </Text>
            )}
          </View>

          <View style={styles.cards}>
            {NAV_CARDS.map((card) => (
              <Pressable
                key={card.title}
                onPress={() => router.push(card.navigateTo)}
                accessibilityRole="button"
              >
                <Card mode={mode} style={styles.card}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>{card.title}</Text>
                  <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
                    {card.subtitle}
                  </Text>
                </Card>
              </Pressable>
            ))}
          </View>

          <Button label="Sign out" variant="outline" mode={mode} onPress={() => void signOut()} />
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
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  branchBlock: {
    gap: Spacing.one,
  },
  branchLabel: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
  branchName: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h2,
  },
  cards: {
    gap: Spacing.three,
  },
  card: {
    gap: Spacing.half,
  },
  cardTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  cardSubtitle: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
});
