import { BrandWordmark } from '@jojopotato/ui';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function HomeScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={styles.logo}
          contentFit="contain"
        />
        <BrandWordmark mode={scheme === 'unspecified' ? 'light' : scheme} size={32} />
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{Brand.tagline}</Text>
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    alignSelf: 'center',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 24,
  },
  subtitle: {
    fontSize: 16,
  },
});
