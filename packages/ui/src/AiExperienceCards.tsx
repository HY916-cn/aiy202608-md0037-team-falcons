import type {
  AiExperienceSnapshot,
  AiExperienceState,
} from '@dolphincloud/experience';
import {
  AlertCircle,
  CheckCircle2,
  Ear,
  Eye,
  LoaderCircle,
  Sparkles,
  WifiOff,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from './theme';

const STATE_LABELS = {
  idle: '待命',
  listening: '正在聆听',
  thinking: '正在思考',
  preview: '结果预览',
  success: '已完成',
  error: '出现问题',
  offline: 'AI 离线',
} as const satisfies Record<AiExperienceState, string>;

const STATE_ICONS = {
  idle: Sparkles,
  listening: Ear,
  thinking: LoaderCircle,
  preview: Eye,
  success: CheckCircle2,
  error: AlertCircle,
  offline: WifiOff,
} as const satisfies Record<AiExperienceState, LucideIcon>;

export function DolphinMascotCard({ snapshot }: { readonly snapshot: AiExperienceSnapshot }) {
  const Icon = STATE_ICONS[snapshot.state];

  return (
    <View style={styles.mascotCard}>
      <View style={styles.mascot}>
        <Text accessibilityLabel="海豚吉祥物" style={styles.dolphin}>🐬</Text>
      </View>
      <View style={styles.copy}>
        <View style={styles.stateRow}>
          <Icon color={theme.color.brand.primary} size={18} />
          <Text style={styles.state}>{STATE_LABELS[snapshot.state]}</Text>
        </View>
        <Text style={styles.explanation}>{snapshot.explanation}</Text>
      </View>
    </View>
  );
}

export function AiResultCard({ snapshot }: { readonly snapshot: AiExperienceSnapshot }) {
  if (snapshot.result === null) {
    return null;
  }

  return (
    <View style={styles.resultCard}>
      <Text style={styles.resultTitle}>AI 结果卡</Text>
      <Text style={styles.explanation}>{snapshot.result}</Text>
      <Text style={styles.notice}>结果仅供确认，不会绕过服务权限直接写入。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  copy: { flex: 1, gap: theme.space.xs },
  dolphin: { fontSize: 34 },
  explanation: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, lineHeight: 21 },
  mascot: {
    alignItems: 'center',
    backgroundColor: theme.color.surface.muted,
    borderRadius: theme.radius.pill,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  mascotCard: {
    alignItems: 'center',
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.default,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.space.md,
    padding: theme.space.lg,
  },
  notice: { color: theme.color.text.disabled, fontSize: theme.text.size.xs },
  resultCard: {
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.brand.secondary,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    gap: theme.space.sm,
    padding: theme.space.lg,
  },
  resultTitle: { color: theme.color.text.primary, fontSize: theme.text.size.md, fontWeight: '700' },
  state: { color: theme.color.brand.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  stateRow: { alignItems: 'center', flexDirection: 'row', gap: theme.space.sm },
});
