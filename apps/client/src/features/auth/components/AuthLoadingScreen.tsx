import { theme } from '@dolphincloud/ui';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export function AuthLoadingScreen() {
  return (
    <View style={styles.page}>
      <ActivityIndicator
        accessibilityLabel="正在加载会话"
        color={theme.color.brand.primary}
        size="large"
      />
      <Text style={styles.label}>正在加载会话……</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    alignItems: 'center',
    backgroundColor: theme.color.surface.page,
    flex: 1,
    gap: theme.space.md,
    justifyContent: 'center',
    padding: theme.space.lg,
  },
  label: {
    color: theme.color.text.secondary,
    fontSize: theme.text.size.md,
  },
});
