import { Button, Card, Input } from '@jojopotato/ui';
import { Image } from 'expo-image';
import { useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MASCOT_IMAGE, PRODUCT_TRIO_IMAGE } from '@/constants/images';
import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Post-auth account onboarding — a single screen with internal step state:
 *   0 = feature previews (advisory, Skip)
 *   1 = promo previews   (advisory, Skip)
 *   2 = required info form (Full name + birthday + address, NO Skip)
 *
 * Skip on a preview jumps to the info form (step 2) — never Home, because the
 * form is required. Account onboarding completes only when the form is submitted
 * (which stamps `onboardedAt` via `completeProfile`); the nav gate in the root
 * `_layout.tsx` then flips to `(tabs)` automatically. The pre-auth welcome flow
 * under `(auth)/` is a separate, untouched layer.
 */
// Same vertical-space breakpoint the pre-auth screens use: shrink the brand
// visual on SE-class (<700pt) devices so the content never gets cramped.
const VISUAL_SIZE = 148;
const VISUAL_SIZE_COMPACT = 112;
const COMPACT_HEIGHT = 700;

/** Accepts a real `YYYY-MM-DD` calendar date (rejects e.g. `2020-13-40`). */
function isValidBirthday(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

type Step = 0 | 1 | 2;

export default function OnboardingRoute() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const { user, completeProfile } = useAuth();

  const { height } = useWindowDimensions();
  const compact = height < COMPACT_HEIGHT;
  const visualSize = compact ? VISUAL_SIZE_COMPACT : VISUAL_SIZE;

  const [step, setStep] = useState<Step>(0);

  // Info-form state (step 2). Full name prefills from the account name.
  const [name, setName] = useState(user?.name ?? '');
  // Birthday captured as three free-form numeric fields (MM / DD / YYYY) and
  // reassembled into the `YYYY-MM-DD` string the profile contract expects.
  const [bMonth, setBMonth] = useState('');
  const [bDay, setBDay] = useState('');
  const [bYear, setBYear] = useState('');
  const [address, setAddress] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  // Refs drive auto-tab: focus advances forward as a field fills, and Backspace
  // on an empty field steps focus back to the previous one.
  const monthRef = useRef<TextInput>(null);
  const dayRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  const birthday =
    bYear.length === 4 && bMonth.length > 0 && bDay.length > 0
      ? `${bYear}-${bMonth.padStart(2, '0')}-${bDay.padStart(2, '0')}`
      : '';

  const canSubmit = useMemo(
    () => name.trim().length > 0 && address.trim().length > 0 && isValidBirthday(birthday),
    [name, address, birthday],
  );

  const onSubmit = async () => {
    if (!canSubmit || pending) return;
    setPending(true);
    setError(undefined);
    const result = await completeProfile({
      name: name.trim(),
      birthday,
      address: address.trim(),
    });
    setPending(false);
    if (!result.ok) {
      // On success the nav gate flips to Home automatically — no manual navigation.
      setError(result.error ?? 'Could not save your details. Please try again.');
    }
  };

  const previewCopy =
    step === 0
      ? { title: 'Order ahead, skip the line', subtitle: 'Browse the menu and order for pickup in a few taps.' }
      : { title: 'Deals & rewards', subtitle: 'Unlock promos and earn stars every time you order.' };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.avoider}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingTop: compact ? Spacing.four : Spacing.five }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {step < 2 ? (
              <>
                <View style={styles.content}>
                  <Image
                    source={step === 0 ? MASCOT_IMAGE : PRODUCT_TRIO_IMAGE}
                    style={{ width: visualSize, height: visualSize }}
                    contentFit="contain"
                    transition={200}
                    accessible={false}
                  />
                  <Text style={[styles.title, { color: theme.text }]}>{previewCopy.title}</Text>
                  <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                    {previewCopy.subtitle}
                  </Text>
                </View>
                <View style={styles.footer}>
                  <Button
                    mode={mode}
                    label="Next"
                    onPress={() => setStep((s) => (s === 0 ? 1 : 2))}
                    variant="primary"
                    style={styles.cta}
                  />
                  {step === 1 ? (
                    <Button
                      mode={mode}
                      label="Back"
                      onPress={() => setStep(0)}
                      variant="outline"
                      style={styles.cta}
                    />
                  ) : null}
                  <Pressable accessibilityRole="button" onPress={() => setStep(2)}>
                    <Text style={[styles.link, { color: theme.accent }]}>Skip</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={styles.header}>
                  <Text style={[styles.title, { color: theme.text }]}>Tell us about you</Text>
                  <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                    We need a few details to finish setting up your account.
                  </Text>
                </View>
                <Card mode={mode}>
                  <View style={styles.form}>
                    <Input
                      mode={mode}
                      label="Full name"
                      placeholder="Juan Dela Cruz"
                      value={name}
                      onChangeText={(v) => {
                        setName(v);
                        setError(undefined);
                      }}
                      editable={!pending}
                    />
                    <View style={styles.dateField}>
                      <Text style={[styles.dateLabel, { color: theme.textSecondary }]}>Birthday</Text>
                      <View style={styles.dateRow}>
                        <Input
                          ref={monthRef}
                          mode={mode}
                          placeholder="MM"
                          value={bMonth}
                          onChangeText={(v) => {
                            const digits = v.replace(/\D/g, '');
                            setBMonth(digits);
                            setError(undefined);
                            if (digits.length === 2) dayRef.current?.focus();
                          }}
                          keyboardType="number-pad"
                          textAlign="center"
                          maxLength={2}
                          editable={!pending}
                          style={styles.dateMonth}
                        />
                        <Input
                          ref={dayRef}
                          mode={mode}
                          placeholder="DD"
                          value={bDay}
                          onChangeText={(v) => {
                            const digits = v.replace(/\D/g, '');
                            setBDay(digits);
                            setError(undefined);
                            if (digits.length === 2) yearRef.current?.focus();
                          }}
                          onKeyPress={(e) => {
                            if (e.nativeEvent.key === 'Backspace' && bDay === '') monthRef.current?.focus();
                          }}
                          keyboardType="number-pad"
                          textAlign="center"
                          maxLength={2}
                          editable={!pending}
                          style={styles.dateDay}
                        />
                        <Input
                          ref={yearRef}
                          mode={mode}
                          placeholder="YYYY"
                          value={bYear}
                          onChangeText={(v) => {
                            setBYear(v.replace(/\D/g, ''));
                            setError(undefined);
                          }}
                          onKeyPress={(e) => {
                            if (e.nativeEvent.key === 'Backspace' && bYear === '') dayRef.current?.focus();
                          }}
                          keyboardType="number-pad"
                          textAlign="center"
                          maxLength={4}
                          editable={!pending}
                          style={styles.dateYear}
                        />
                      </View>
                    </View>
                    <Input
                      mode={mode}
                      label="Address"
                      placeholder="123 Spud Lane, Cebu City"
                      value={address}
                      onChangeText={(v) => {
                        setAddress(v);
                        setError(undefined);
                      }}
                      editable={!pending}
                    />
                    <Button
                      mode={mode}
                      label="Finish"
                      onPress={onSubmit}
                      disabled={!canSubmit || pending}
                      loading={pending}
                    />
                  </View>
                </Card>
                {error ? (
                  <Text accessibilityRole="alert" style={[styles.error, { color: theme.accent }]}>
                    {error}
                  </Text>
                ) : null}
                <View style={styles.footer}>
                  <Button
                    mode={mode}
                    label="Back"
                    onPress={() => setStep(1)}
                    variant="outline"
                    style={styles.cta}
                    disabled={pending}
                  />
                </View>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  avoider: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', gap: Spacing.four, padding: Spacing.four },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  header: { alignItems: 'center', gap: Spacing.one },
  title: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h1, textAlign: 'center' },
  subtitle: { fontFamily: FontFamily.body.medium, fontSize: TypeScale.body, textAlign: 'center' },
  form: { gap: Spacing.three },
  dateField: { gap: Spacing.half },
  dateLabel: { fontFamily: FontFamily.body.medium, fontSize: TypeScale.caption },
  dateRow: { flexDirection: 'row', gap: Spacing.two },
  dateMonth: { flex: 1 },
  dateDay: { flex: 1 },
  dateYear: { flex: 1.6 },
  footer: { gap: Spacing.three, paddingBottom: Spacing.two, alignItems: 'center' },
  cta: { width: '100%' },
  link: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.bodySmall },
  error: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
    textAlign: 'center',
  },
});
