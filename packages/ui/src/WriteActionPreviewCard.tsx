import {
  WriteActionConfirmationController,
  type WriteActionExecutionAdapter,
  type WriteActionPreview,
} from '@dolphincloud/experience';
import { ROLE_LABELS } from '@dolphincloud/auth';
import { CheckCircle2, ShieldCheck, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { InteractivePressable } from './InteractivePressable';
import { theme } from './theme';

type WriteActionPreviewCardProps = {
  readonly adapter: WriteActionExecutionAdapter;
  readonly onCancel: () => void;
  readonly onModify: () => void;
  readonly preview: WriteActionPreview;
};

export function WriteActionPreviewCard({
  preview,
  ...props
}: WriteActionPreviewCardProps) {
  return (
    <WriteActionPreviewCardContent
      key={preview.id}
      preview={preview}
      {...props}
    />
  );
}

function WriteActionPreviewCardContent({
  adapter,
  onCancel,
  onModify,
  preview,
}: WriteActionPreviewCardProps) {
  const [controller] = useState(
    () => new WriteActionConfirmationController(preview, adapter),
  );
  const [state, setState] = useState(controller.getState());
  const isPending = state === 'pending';

  const confirm = async () => {
    const action = controller.confirm();
    setState(controller.getState());
    await action;
    setState(controller.getState());
  };

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.headingIcon}>
          <ShieldCheck color={theme.color.brand.primary} size={21} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>海豚云 · 写操作确认</Text>
          <Text style={styles.title}>执行前确认</Text>
          <Text style={styles.headingDescription}>
            确认后由海豚云服务重新鉴权并记录审计；取消或返回修改不会写入数据。
          </Text>
        </View>
      </View>
      <View style={styles.previewGrid}>
        <View style={styles.previewBlock}>
          <Text style={styles.metadataLabel}>操作名称</Text>
          <Text style={styles.operation}>{preview.operationType}</Text>
        </View>
        <View style={styles.previewBlock}>
          <Text style={styles.metadataLabel}>作用对象</Text>
          <Text style={styles.metadata}>{preview.targets.join('、')}</Text>
        </View>
        <View style={styles.previewBlock}>
          <Text style={styles.metadataLabel}>影响说明</Text>
          <Text style={styles.metadata}>{preview.impact.join('；')}</Text>
        </View>
        <View style={styles.previewBlock}>
          <Text style={styles.metadataLabel}>参数摘要</Text>
          <Text style={styles.metadata}>{preview.parameterSummary.join('；')}</Text>
        </View>
      </View>
      <View style={styles.scopeRow}>
        <Text style={styles.scopeText}>当前角色：{ROLE_LABELS[preview.role]}</Text>
        <Text style={styles.scopeText}>权限范围：{preview.permissionScope}</Text>
      </View>
      {state === 'awaiting_second_confirmation' ? (
        <View style={styles.warningBox}>
          <TriangleAlert color={theme.color.text.primary} size={18} />
          <Text style={styles.warning}>这是高风险写操作，请再次核对对象、数值与影响。</Text>
        </View>
      ) : null}
      {state === 'error' ? (
        <View accessibilityRole="alert" style={styles.warningBox}>
          <TriangleAlert color={theme.color.text.primary} size={18} />
          <Text style={styles.warning}>没有成功，原数据没有改变。请重试或返回修改。</Text>
        </View>
      ) : null}
      {state === 'success' ? (
        <View style={styles.successBox}>
          <CheckCircle2 color={theme.color.brand.primary} size={18} />
          <Text style={styles.success}>完成了，操作记录已经保存。</Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        <InteractivePressable
          accessibilityRole="button"
          disabled={isPending || state === 'success'}
          onPress={onModify}
          style={({ focused, hovered, pressed }) => [
            styles.secondaryButton,
            hovered && styles.secondaryButtonHover,
            focused && styles.focused,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.secondaryLabel}>返回修改</Text>
        </InteractivePressable>
        <InteractivePressable
          accessibilityRole="button"
          disabled={isPending || state === 'success'}
          onPress={() => {
            controller.cancel();
            setState(controller.getState());
            onCancel();
          }}
          style={({ focused, hovered, pressed }) => [
            styles.secondaryButton,
            hovered && styles.secondaryButtonHover,
            focused && styles.focused,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.secondaryLabel}>取消</Text>
        </InteractivePressable>
        <InteractivePressable
          accessibilityRole="button"
          disabled={isPending || state === 'success'}
          onPress={() => void confirm()}
          style={({ focused, hovered, pressed }) => [
            styles.primaryButton,
            (isPending || state === 'success') && styles.disabled,
            hovered && !isPending && styles.primaryButtonHover,
            focused && styles.focused,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.primaryLabel}>
            {isPending ? '正在执行……' : state === 'success' ? '已执行' : '确认执行'}
          </Text>
        </InteractivePressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { borderTopColor: theme.color.border.default, borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, paddingTop: theme.space.md },
  card: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, gap: theme.space.sm, padding: theme.space.lg },
  disabled: { opacity: 0.5 },
  eyebrow: { color: theme.color.brand.primary, fontSize: theme.text.size.xs, fontWeight: '800', letterSpacing: 0.6 },
  focused: { borderColor: theme.color.brand.primary, borderWidth: 1, boxShadow: '0 0 0 3px rgba(22, 119, 254, 0.18)' },
  heading: { alignItems: 'flex-start', flexDirection: 'row', gap: theme.space.base },
  headingCopy: { flex: 1, gap: theme.space.xs },
  headingDescription: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 18 },
  headingIcon: { alignItems: 'center', backgroundColor: theme.color.surface.primaryTint, borderRadius: theme.radius.control, height: 42, justifyContent: 'center', width: 42 },
  metadata: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, lineHeight: 21 },
  metadataLabel: { color: theme.color.text.disabled, fontSize: theme.text.size.xs, fontWeight: '700' },
  operation: { color: theme.color.brand.primary, fontSize: theme.text.size.md, fontWeight: '700' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  previewBlock: { flex: 1, gap: theme.space.xs, minWidth: 190 },
  previewGrid: { backgroundColor: theme.color.surface.page, flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.base, padding: theme.space.md },
  primaryButton: { backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.control, justifyContent: 'center', minHeight: 44, paddingHorizontal: theme.space.md },
  primaryButtonHover: { opacity: 0.88, transform: [{ translateY: -1 }] },
  primaryLabel: { color: theme.color.surface.card, fontWeight: '600' },
  secondaryButton: { borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: theme.space.md },
  secondaryButtonHover: { backgroundColor: theme.color.surface.primaryTint, borderColor: theme.color.brand.primary },
  secondaryLabel: { color: theme.color.text.primary, fontWeight: '600' },
  scopeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.md },
  scopeText: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, fontWeight: '700' },
  success: { color: theme.color.brand.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  successBox: { alignItems: 'center', backgroundColor: theme.color.surface.primaryTint, flexDirection: 'row', gap: theme.space.sm, padding: theme.space.base },
  title: { color: theme.color.text.primary, fontSize: theme.text.size.lg, fontWeight: '700' },
  warning: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  warningBox: { alignItems: 'center', backgroundColor: theme.color.surface.muted, borderColor: theme.color.border.default, borderWidth: 1, flexDirection: 'row', gap: theme.space.sm, padding: theme.space.base },
});
