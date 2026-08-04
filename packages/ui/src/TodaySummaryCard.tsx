import type { TodaySummary } from '@dolphincloud/experience';
import { AlertCircle, RefreshCw } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from './theme';

type TodaySummaryCardProps = {
  readonly errorMessage?: string | null;
  readonly isLoading?: boolean;
  readonly onRetry?: () => void;
  readonly summary?: TodaySummary | null;
};

export function TodaySummaryCard({
  errorMessage = null,
  isLoading = false,
  onRetry,
  summary = null,
}: TodaySummaryCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{summary?.title ?? '今日摘要'}</Text>
      {isLoading ? <Text style={styles.helper}>正在加载今日摘要……</Text> : null}
      {!isLoading && errorMessage !== null ? (
        <View style={styles.feedback}>
          <AlertCircle color={theme.color.brand.primary} size={20} />
          <Text style={styles.helper}>{errorMessage}</Text>
          {onRetry === undefined ? null : (
            <Pressable
              accessibilityRole="button"
              onPress={onRetry}
              style={styles.retryButton}
            >
              <RefreshCw color={theme.color.brand.primary} size={18} />
              <Text style={styles.retryLabel}>重试</Text>
            </Pressable>
          )}
        </View>
      ) : null}
      {!isLoading && errorMessage === null && summary?.items.length === 0 ? (
        <Text style={styles.helper}>今天暂无需要处理的内容。</Text>
      ) : null}
      {!isLoading && errorMessage === null && summary !== null ? (
        <View style={styles.grid}>
          {summary.items.map((item) => (
            <View key={item.id} style={styles.item}>
              <Text style={styles.value}>{item.value}</Text>
              <Text style={styles.label}>{item.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.default,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    gap: theme.space.md,
    padding: theme.space.lg,
  },
  feedback: { gap: theme.space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  helper: { color: theme.color.text.secondary, fontSize: theme.text.size.sm },
  item: {
    backgroundColor: theme.color.surface.muted,
    borderRadius: theme.radius.control,
    flexGrow: 1,
    minWidth: 132,
    padding: theme.space.md,
  },
  label: { color: theme.color.text.secondary, fontSize: theme.text.size.sm },
  retryButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.space.sm,
    minHeight: 44,
  },
  retryLabel: { color: theme.color.brand.primary, fontWeight: '600' },
  title: { color: theme.color.text.primary, fontSize: theme.text.size.lg, fontWeight: '700' },
  value: { color: theme.color.brand.primary, fontSize: theme.text.size.xl, fontWeight: '700' },
});
