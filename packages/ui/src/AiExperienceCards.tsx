import type {
  AiExperienceSnapshot,
  AiExperienceState,
} from '@dolphincloud/experience';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Ear,
  Eye,
  LoaderCircle,
  Sparkles,
  Waves,
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
  const isOffline = snapshot.state === 'offline';

  return (
    <View style={styles.mascotCard}>
      <View style={styles.mascot}>
        <Waves
          accessibilityLabel="海豚吉祥物"
          color={theme.color.brand.secondary}
          size={30}
          strokeWidth={2.4}
        />
      </View>
      <View style={styles.copy}>
        <View style={styles.statusHeading}>
          <View style={styles.stateRow}>
            <Icon
              color={isOffline ? theme.color.text.secondary : theme.color.brand.primary}
              size={18}
            />
            <Text style={[styles.state, isOffline && styles.stateOffline]}>
              {STATE_LABELS[snapshot.state]}
            </Text>
          </View>
          <View style={[styles.connectionTag, isOffline && styles.connectionTagOffline]}>
            <View style={[styles.connectionDot, isOffline && styles.connectionDotOffline]} />
            <Text style={styles.connectionLabel}>
              {isOffline ? 'Coze 服务未连接' : '海豚云 AI 网关'}
            </Text>
          </View>
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
      <View style={styles.resultHeading}>
        <Bot color={theme.color.brand.secondary} size={19} />
        <View style={styles.copy}>
          <Text style={styles.resultTitle}>查询结果</Text>
          <Text style={styles.resultMeta}>由海豚云 AI 网关返回，展示前已通过客户端白名单。</Text>
        </View>
      </View>
      {snapshot.structuredResult === null ? (
        <Text style={styles.explanation}>{snapshot.result}</Text>
      ) : (
        <View style={styles.structuredResult}>
          <Text style={styles.structuredKind}>{snapshot.structuredResult.kind}</Text>
          {Object.entries(
            snapshot.structuredResult.payload !== null &&
              typeof snapshot.structuredResult.payload === 'object' &&
              !Array.isArray(snapshot.structuredResult.payload)
              ? snapshot.structuredResult.payload as Record<string, unknown>
              : { result: snapshot.structuredResult.payload },
          ).map(([key, value]) => (
            <View key={key} style={styles.structuredRow}>
              <Text style={styles.structuredLabel}>{key}</Text>
              <Text style={styles.structuredValue}>
                {typeof value === 'string' || typeof value === 'number'
                  ? String(value)
                  : JSON.stringify(value)}
              </Text>
            </View>
          ))}
        </View>
      )}
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
  connectionDot: { backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.pill, height: 7, width: 7 },
  connectionDotOffline: { backgroundColor: theme.color.text.disabled },
  connectionLabel: { color: theme.color.text.secondary, fontSize: 10, fontWeight: '700' },
  connectionTag: { alignItems: 'center', flexDirection: 'row', gap: theme.space.xs, minHeight: 28 },
  connectionTagOffline: { opacity: 0.8 },
  copy: { flex: 1, gap: theme.space.xs },
  explanation: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, lineHeight: 21 },
  mascot: {
    alignItems: 'center',
    backgroundColor: theme.color.surface.primaryTint,
    borderRadius: theme.radius.control,
    height: 48,
    justifyContent: 'center',
    width: 48,
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
    padding: theme.space.lg,
  },
  resultHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: theme.space.sm },
  resultMeta: { color: theme.color.text.disabled, fontSize: theme.text.size.xs, lineHeight: 17 },
  resultTitle: { color: theme.color.text.primary, fontSize: theme.text.size.md, fontWeight: '700' },
  state: { color: theme.color.brand.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  stateOffline: { color: theme.color.text.secondary },
  stateRow: { alignItems: 'center', flexDirection: 'row', gap: theme.space.sm },
  statusHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, justifyContent: 'space-between' },
  structuredKind: { color: theme.color.brand.primary, fontSize: theme.text.size.xs, fontWeight: '800' },
  structuredLabel: { color: theme.color.text.secondary, flexBasis: 130, fontSize: theme.text.size.xs, fontWeight: '700' },
  structuredResult: { borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, overflow: 'hidden' },
  structuredRow: { borderTopColor: theme.color.border.default, borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, padding: theme.space.base },
  structuredValue: { color: theme.color.text.primary, flex: 1, fontSize: theme.text.size.sm, minWidth: 160 },
});
