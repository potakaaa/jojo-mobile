import { Badge, BrandWordmark, Button, Card, type ThemeMode } from '@jojopotato/ui';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useStaffMe } from '@/features/staff/hooks/use-staff-me';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

// Nav card config. Active Orders navigates to the MOCK preview (STAFF-002);
// the remaining three are inert placeholders (STAFF-003/004).
const NAV_CARDS = [
  // MOCK PREVIEW: subtitle updated to signal tappability — revert to 'Coming soon'
  // when STAFF-002 replaces the mock screen.
  { title: 'Active Orders', subtitle: '5 active (preview)', navigateTo: '/(staff)/active-orders' as const },
  { title: 'Completed Orders', subtitle: 'Coming soon', navigateTo: null },
  { title: 'Product Availability', subtitle: 'Coming soon', navigateTo: null },
  { title: 'Branch Pickup Settings', subtitle: 'Coming soon', navigateTo: null },
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
            {NAV_CARDS.map((card) =>
              card.navigateTo ? (
                // Tappable — navigates to MOCK preview screen
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
              ) : (
                // Inert placeholder — no navigation, no onPress
                <Card key={card.title} mode={mode} style={styles.card}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>{card.title}</Text>
                  <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
                    {card.subtitle}
                  </Text>
                </Card>
              ),
            )}
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
