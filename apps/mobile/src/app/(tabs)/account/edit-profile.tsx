import { Button, Card, Input } from '@jojopotato/ui';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { assembleBirthday, isValidBirthday, splitBirthday } from '@/features/auth/lib/birthday';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Edit the signed-in user's editable profile fields — full name, birthday
 * (MM/DD/YYYY), and address. Saving goes through `useAuth().updateProfile`,
 * which sends exactly these three fields (never any server-owned field, never
 * `onboardedAt`). The form is pre-filled from the current session.
 */
export default function EditProfileScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const { user, updateProfile } = useAuth();

  const initial = splitBirthday(user?.birthday);
  const [name, setName] = useState(user?.name ?? '');
  const [bMonth, setBMonth] = useState(initial.mm);
  const [bDay, setBDay] = useState(initial.dd);
  const [bYear, setBYear] = useState(initial.yyyy);
  const [address, setAddress] = useState(user?.address ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  // Refs drive auto-tab: focus advances forward as a field fills, and Backspace
  // on an empty field steps focus back to the previous one.
  const monthRef = useRef<TextInput>(null);
  const dayRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  const birthday = assembleBirthday({ mm: bMonth, dd: bDay, yyyy: bYear });
  const canSave = useMemo(
    () => name.trim().length > 0 && address.trim().length > 0 && isValidBirthday(birthday),
    [name, address, birthday],
  );

  const onSave = async () => {
    if (!canSave || pending) return;
    setPending(true);
    setError(undefined);
    setSaved(false);
    const result = await updateProfile({
      name: name.trim(),
      birthday,
      address: address.trim(),
    });
    setPending(false);
    if (result.ok) {
      setSaved(true);
    } else {
      setError(result.error ?? 'Could not save your changes. Please try again.');
    }
  };

  const onCancel = () => {
    if (pending) return;
    router.back();
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.avoider}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
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
                  setSaved(false);
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
                      setSaved(false);
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
                      setSaved(false);
                      if (digits.length === 2) yearRef.current?.focus();
                    }}
                    onKeyPress={(e) => {
                      if (e.nativeEvent.key === 'Backspace' && bDay === '')
                        monthRef.current?.focus();
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
                      setSaved(false);
                    }}
                    onKeyPress={(e) => {
                      if (e.nativeEvent.key === 'Backspace' && bYear === '')
                        dayRef.current?.focus();
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
                  setSaved(false);
                }}
                editable={!pending}
              />
            </View>
          </Card>

          {error ? (
            <Text accessibilityRole="alert" style={[styles.error, { color: theme.accent }]}>
              {error}
            </Text>
          ) : null}
          {saved ? (
            <Text style={[styles.saved, { color: theme.textSecondary }]}>Profile updated.</Text>
          ) : null}

          <View style={styles.actions}>
            <Button
              mode={mode}
              label="Save changes"
              onPress={onSave}
              disabled={!canSave || pending}
              loading={pending}
            />
            <Button
              mode={mode}
              variant="outline"
              label="Cancel"
              onPress={onCancel}
              disabled={pending}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  avoider: { flex: 1 },
  scroll: { padding: Spacing.four, gap: Spacing.four },
  form: { gap: Spacing.three },
  dateField: { gap: Spacing.half },
  dateLabel: { fontFamily: FontFamily.body.medium, fontSize: TypeScale.caption },
  dateRow: { flexDirection: 'row', gap: Spacing.two },
  dateMonth: { flex: 1 },
  dateDay: { flex: 1 },
  dateYear: { flex: 1.6 },
  actions: { gap: Spacing.three },
  error: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
    textAlign: 'center',
  },
  saved: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
    textAlign: 'center',
  },
});
