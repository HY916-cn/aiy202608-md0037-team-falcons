import type { TodaySummary } from '@dolphincloud/experience';
import { AlertCircle, ArrowRight, CalendarDays, RefreshCw } from 'lucide-react-native';
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
      <View style={styles.heading}>
        <View style={styles.headingIcon}>
          <CalendarDays color={theme.color.brand.primary} size={20} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>{summary?.title ?? '今日摘要'}</Text>
          <Text style={styles.caption}>只汇总已发生的事实与待处理事项</Text>
        </View>
        <Pressable accessibilityRole="button" style={styles.allButton}>
          <Text style={styles.allButtonLabel}>查看全部</Text>
          <ArrowRight color={theme.color.brand.primary} size={16} />
        </Pressable>
      </View>
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
  allButton: { alignItems: 'center', flexDirection: 'row', gap: theme.space.xs, minHeight: 36 },
  allButtonLabel: { color: theme.color.brand.primary, fontSize: theme.text.size.xs, fontWeight: '700' },
  caption: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, marginTop: 3 },
  feedback: { gap: theme.space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  heading: { alignItems: 'center', flexDirection: 'row', gap: theme.space.base },
  headingCopy: { flex: 1 },
  headingIcon: { alignItems: 'center', backgroundColor: theme.color.surface.primaryTint, borderRadius: theme.radius.control, height: 40, justifyContent: 'center', width: 40 },
  helper: { color: theme.color.text.secondary, fontSize: theme.text.size.sm },
  item: {
    borderLeftColor: theme.color.border.default,
    borderLeftWidth: 1,
    flexBasis: 150,
    flexGrow: 1,
    minWidth: 132,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
  },
  label: { color: theme.color.text.secondary, fontSize: theme.text.size.sm },
  retryButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.space.sm,
    minHeight: 44,
  },
  retryLabel: { color: theme.color.brand.primary, fontWeight: '600' },
  title: { color: theme.color.text.primary, fontSize: theme.text.size.lg, fontWeight: '800' },
  value: { color: theme.color.brand.primary, fontSize: theme.text.size.xl, fontWeight: '700' },
});
