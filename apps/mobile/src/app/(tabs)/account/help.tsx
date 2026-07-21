import { Ionicons } from '@expo/vector-icons';
import { Card, ScreenHeader, SettingsRow } from '@jojopotato/ui';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, MinTouchTarget, Spacing, TypeScale } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Help (nested Account screen, reached via `router.push('/(tabs)/account/help')`).
 * This stack runs `headerShown:false` (NAV-003), so the screen renders its own
 * `<ScreenHeader>` for the title + back affordance.
 *
 * Sections, in order: an expandable FAQ, contact channels (email/phone), social
 * links, the marketing site, the two legal documents (Terms and Conditions and
 * Privacy Policy — each a sibling push onto the Tabs navigator, so `router.back()`
 * from either returns here), and a footer with a problem-report shortcut plus the
 * app version.
 *
 * Everything outside the legal rows is presentation only: no backend call, no
 * stored state. The FAQ accordion is a plain conditional render rather than a
 * `LayoutAnimation`/reanimated transition, deliberately — the jest setup stubs
 * reanimated and cannot run a layout animation, and this screen is covered by
 * real render tests.
 */

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

/**
 * Static FAQ copy. Answers describe the app as it actually behaves today:
 * ordering is pickup-only at a selected branch, stars accrue toward rewards that
 * are redeemed as a coupon, and paying at the branch is the live payment path
 * (online payment is gated off behind `EXPO_PUBLIC_ONLINE_PAYMENT_ENABLED`).
 * Keep this in sync with real behavior — a wrong answer here is a support ticket.
 */
const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'place-order',
    question: 'How do I place an order?',
    answer:
      'Open the Order tab and pick the branch you want to collect from, then browse the menu and add what you like to your cart. Review everything on the cart screen and tap Checkout to send the order to that branch.',
  },
  {
    id: 'pickup',
    question: 'How does pickup work?',
    answer:
      'Every order is for pickup — we do not deliver. Once the branch accepts your order you can follow it on the tracking screen as it moves from preparing to ready. When it says Ready, head to the branch and give your order number at the counter.',
  },
  {
    id: 'stars-rewards',
    question: 'How do I earn and use stars?',
    answer:
      'You earn one star each time a pickup order is completed. As your stars add up, rewards unlock in the Rewards tab and land in your wallet as a coupon — apply that coupon to your cart before checking out to claim it.',
  },
  {
    id: 'payment',
    question: 'What payment methods do you accept?',
    answer:
      'You pay at the branch when you collect your order, so nothing is charged inside the app. In-app online payment is not switched on yet — when it is, it will appear as an option on the checkout screen.',
  },
  {
    id: 'account-details',
    question: 'How do I edit my details or change branch?',
    answer:
      'Go to the Account tab and tap Edit profile to update your name, birthday, or address. To order from somewhere else, open the Order tab and pick a different branch from the switcher at the top — your cart is tied to the branch you choose.',
  },
];

const SUPPORT_EMAIL = 'jojopotatoph@gmail.com';
const SUPPORT_PHONE_DISPLAY = '0945 774 1612';
const SUPPORT_PHONE_TEL = '+639457741612';
const FACEBOOK_URL = 'https://www.facebook.com/JojoPotatoph';
const INSTAGRAM_URL = 'https://www.instagram.com/jojopotatoph/';
const WEBSITE_URL = 'https://www.jojopotato.ph/';

/**
 * Hand off a URL to the OS (mail client, dialer, browser).
 *
 * `Linking.openURL` REJECTS when the device has no handler for the scheme — a
 * tablet with no dialer, a simulator with no mail account — so the rejection is
 * swallowed here. Left uncaught it surfaces as an unhandled promise rejection
 * and, in release builds, can take the screen down. Failing quietly is the right
 * trade for these optional convenience links.
 */
async function openExternal(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    console.warn(`help: no handler available to open ${url}`);
  }
}

/** `mailto:` for a problem report, pre-filled with the diagnostics we'd ask for anyway. */
function buildReportUrl(version: string): string {
  const subject = encodeURIComponent('Jojo Potato app — problem report');
  const body = encodeURIComponent(
    [
      'What happened?',
      '',
      '',
      '---',
      'The details below help us investigate:',
      `App version: ${version}`,
      `Platform: ${Platform.OS}`,
      `OS version: ${String(Platform.Version)}`,
    ].join('\n'),
  );
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

export default function HelpScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  // Multiple answers may stay open at once — collapsing a previous answer the
  // moment another opens makes comparing two of them impossible.
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set());
  const version = Constants.expoConfig?.version ?? '0.1.0';

  const toggle = (id: string) =>
    setOpenIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.background }]}
      edges={['top', 'bottom']}
    >
      <ScreenHeader title="Help" onBack={() => router.back()} mode={mode} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* FAQ */}
        <SectionLabel text="Frequently asked" />
        <Card mode={mode} style={styles.listCard}>
          {FAQ_ITEMS.map((item, index) => (
            <View key={item.id}>
              {index > 0 ? <SettingsRow.Divider mode={mode} /> : null}
              <FaqEntry
                item={item}
                expanded={openIds.has(item.id)}
                onToggle={() => toggle(item.id)}
              />
            </View>
          ))}
        </Card>

        {/* Contact */}
        <SectionLabel text="Contact us" />
        <Card mode={mode} style={styles.listCard}>
          <SettingsRow
            mode={mode}
            icon="mail-outline"
            label="Email us"
            value={SUPPORT_EMAIL}
            onPress={() => openExternal(`mailto:${SUPPORT_EMAIL}`)}
          />
          <SettingsRow.Divider mode={mode} />
          <SettingsRow
            mode={mode}
            icon="call-outline"
            label="Call us"
            value={SUPPORT_PHONE_DISPLAY}
            onPress={() => openExternal(`tel:${SUPPORT_PHONE_TEL}`)}
          />
        </Card>

        {/* Social */}
        <SectionLabel text="Follow us" />
        <Card mode={mode} style={styles.listCard}>
          <SettingsRow
            mode={mode}
            icon="logo-facebook"
            label="Facebook"
            value="@JojoPotatoph"
            onPress={() => openExternal(FACEBOOK_URL)}
          />
          <SettingsRow.Divider mode={mode} />
          <SettingsRow
            mode={mode}
            icon="logo-instagram"
            label="Instagram"
            value="@jojopotatoph"
            onPress={() => openExternal(INSTAGRAM_URL)}
          />
        </Card>

        {/* Website */}
        <SectionLabel text="Website" />
        <Card mode={mode} style={styles.listCard}>
          <SettingsRow
            mode={mode}
            icon="globe-outline"
            label="Visit jojopotato.ph"
            onPress={() => openExternal(WEBSITE_URL)}
          />
        </Card>

        {/* Legal */}
        <SectionLabel text="Legal" />
        <Card mode={mode} style={styles.listCard}>
          <SettingsRow
            mode={mode}
            icon="document-text-outline"
            label="Terms and Conditions"
            onPress={() => router.push('/(tabs)/terms')}
          />
          <SettingsRow.Divider mode={mode} />
          <SettingsRow
            mode={mode}
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            onPress={() => router.push('/(tabs)/privacy')}
          />
        </Card>

        {/* Footer */}
        <Card mode={mode} style={styles.listCard}>
          <SettingsRow
            mode={mode}
            icon="bug-outline"
            label="Report a problem"
            onPress={() => openExternal(buildReportUrl(version))}
          />
        </Card>

        <Text style={[styles.version, { color: theme.textSecondary }]}>
          Jojo Potato · v{version}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * One FAQ question: a tappable header with a chevron that flips direction, and
 * the answer body rendered only while expanded. `accessibilityState.expanded` is
 * what tells a screen reader this is a disclosure control rather than a link.
 */
function FaqEntry({
  item,
  expanded,
  onToggle,
}: {
  item: FaqItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={item.question}
        testID={`faq-toggle-${item.id}`}
        onPress={onToggle}
        style={styles.faqHeader}
      >
        <Text style={[styles.faqQuestion, { color: theme.text }]}>{item.question}</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={theme.textSecondary}
        />
      </Pressable>

      {expanded ? (
        <Text style={[styles.faqAnswer, { color: theme.textSecondary }]}>{item.answer}</Text>
      ) : null}
    </View>
  );
}

/** Uppercase caption heading each grouped card — mirrors the Account tab. */
function SectionLabel({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Text style={[styles.sectionLabel, { color: theme.textSecondary }]} accessibilityRole="header">
      {text.toUpperCase()}
    </Text>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.four, gap: Spacing.three },
  listCard: { paddingVertical: Spacing.one },
  sectionLabel: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.caption,
    letterSpacing: 1,
    marginTop: Spacing.one,
    marginLeft: Spacing.one,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: MinTouchTarget,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  faqQuestion: {
    flex: 1,
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.body,
  },
  faqAnswer: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
    lineHeight: 21,
    paddingHorizontal: Spacing.one,
    paddingBottom: Spacing.two,
  },
  version: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
});
