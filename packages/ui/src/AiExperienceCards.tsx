import type {
  AiExperienceSnapshot,
  AiExperienceState,
} from '@dolphincloud/experience';
import {
  Bot,
  CheckCircle2,
} from 'lucide-react-native';
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

export function DolphinMascotCard({ snapshot }: { readonly snapshot: AiExperienceSnapshot }) {
  const isOffline = snapshot.state === 'offline';

  return (
    <View style={styles.mascotCard}>
      <View style={styles.mascot}>
        <Bot
          accessibilityLabel="AI 助手状态"
          color={theme.color.brand.secondary}
          size={22}
          strokeWidth={2}
        />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.state, isOffline && styles.stateOffline]}>
          {STATE_LABELS[snapshot.state]}
        </Text>
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
      <View style={styles.resultHeading}>
        <Bot color={theme.color.brand.secondary} size={19} />
        <Text style={styles.resultTitle}>查询结果</Text>
      </View>
      <Text style={styles.explanation}>{snapshot.result}</Text>
      <View style={styles.noticeBox}>
        <Text style={styles.notice}>查询结果不会绕过当前角色范围；写操作会单独进入预览与确认。</Text>
      </View>
    </View>
  );
}

export function AiAuditResultCard({ snapshot }: { readonly snapshot: AiExperienceSnapshot }) {
  if (snapshot.auditResult === null) return null;

  return (
    <View style={styles.auditCard}>
      <CheckCircle2 color={theme.color.brand.primary} size={19} />
      <View style={styles.copy}>
        <Text style={styles.resultTitle}>操作已执行并记录审计</Text>
        <Text style={styles.explanation}>
          {Object.entries(snapshot.auditResult.receipt)
            .map(([key, value]) => `${key}：${String(value)}`)
            .join('；') || '服务端已返回完成状态。'}
        </Text>
        {snapshot.auditResult.requestId === null ? null : (
          <Text style={styles.resultMeta}>请求编号：{snapshot.auditResult.requestId}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  auditCard: { alignItems: 'flex-start', backgroundColor: theme.color.surface.primaryTint, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flexDirection: 'row', gap: theme.space.sm, padding: theme.space.md },
  copy: { flex: 1, gap: theme.space.xs },
  explanation: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, lineHeight: 21 },
  mascot: {
    alignItems: 'center',
    backgroundColor: theme.color.surface.primaryTint,
    borderRadius: theme.radius.control,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  mascotCard: {
    alignItems: 'center',
    backgroundColor: theme.color.surface.card,
    borderBottomColor: theme.color.border.default,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: theme.space.md,
    paddingBottom: theme.space.md,
  },
  notice: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 18 },
  noticeBox: { backgroundColor: theme.color.surface.muted, borderLeftColor: theme.color.brand.primary, borderLeftWidth: 3, padding: theme.space.base },
  resultCard: {
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.default,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    gap: theme.space.sm,
    padding: theme.space.md,
  },
  resultHeading: { alignItems: 'center', flexDirection: 'row', gap: theme.space.sm },
  resultMeta: { color: theme.color.text.disabled, fontSize: theme.text.size.xs, lineHeight: 17 },
  resultTitle: { color: theme.color.text.primary, fontSize: theme.text.size.md, fontWeight: '700' },
  state: { color: theme.color.brand.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  stateOffline: { color: theme.color.text.secondary },
  structuredKind: { color: theme.color.brand.primary, fontSize: theme.text.size.xs, fontWeight: '600' },
  structuredLabel: { color: theme.color.text.secondary, flexBasis: 130, fontSize: theme.text.size.xs, fontWeight: '700' },
  structuredResult: { borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, overflow: 'hidden' },
  structuredRow: { borderTopColor: theme.color.border.default, borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, padding: theme.space.base },
  structuredValue: { color: theme.color.text.primary, flex: 1, fontSize: theme.text.size.sm, minWidth: 160 },
});
