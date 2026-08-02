import { APP_NAME } from '@dolphincloud/domain';
import { theme } from '@dolphincloud/ui';
import { StyleSheet, Text, View } from 'react-native';

export default function ProjectFoundationScreen() {
  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>PROJECT FOUNDATION</Text>
        <Text style={styles.title}>{APP_NAME}</Text>
        <Text style={styles.description}>
          Expo Router 与共享 workspace 已准备就绪。
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    alignItems: 'center',
    backgroundColor: theme.color.surface.page,
    flex: 1,
    justifyContent: 'center',
    padding: theme.space.lg,
  },
  card: {
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.default,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    gap: theme.space.sm,
    maxWidth: 520,
    padding: theme.space.xl,
    width: '100%',
  },
  eyebrow: {
    color: theme.color.brand.secondary,
    fontSize: theme.text.size.sm,
    fontWeight: '600',
  },
  title: {
    color: theme.color.text.primary,
    fontSize: theme.text.size.xl,
    fontWeight: '700',
  },
  description: {
    color: theme.color.text.secondary,
    fontSize: theme.text.size.md,
    lineHeight: 24,
  },
});
