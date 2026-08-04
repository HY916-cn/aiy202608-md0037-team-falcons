import {
  WriteActionConfirmationController,
  type WriteActionExecutionAdapter,
  type WriteActionPreview,
} from '@dolphincloud/experience';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from './theme';

type WriteActionPreviewCardProps = {
  readonly adapter: WriteActionExecutionAdapter;
  readonly onCancel: () => void;
  readonly onModify: () => void;
  readonly preview: WriteActionPreview;
};

export function WriteActionPreviewCard({
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
      <Text style={styles.title}>写操作确认</Text>
      <Text style={styles.operation}>{preview.operationType}</Text>
      <Text style={styles.metadata}>目标：{preview.targets.join('、')}</Text>
      <Text style={styles.metadata}>影响：{preview.impact.join('；')}</Text>
      <Text style={styles.metadata}>参数：{preview.parameterSummary.join('；')}</Text>
      <Text style={styles.metadata}>当前角色：{preview.role}</Text>
      <Text style={styles.metadata}>权限范围：{preview.permissionScope}</Text>
      {state === 'awaiting_second_confirmation' ? (
        <Text style={styles.warning}>危险操作：请再次确认。</Text>
      ) : null}
      {state === 'error' ? (
        <Text accessibilityRole="alert" style={styles.warning}>
          执行失败，请重试或返回修改。
        </Text>
      ) : null}
      {state === 'success' ? (
        <Text style={styles.success}>操作已成功执行。</Text>
      ) : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" disabled={isPending} onPress={onModify} style={styles.secondaryButton}>
          <Text style={styles.secondaryLabel}>返回修改</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={isPending}
          onPress={() => {
            controller.cancel();
            setState(controller.getState());
            onCancel();
          }}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryLabel}>取消</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={isPending || state === 'success'} onPress={() => void confirm()} style={styles.primaryButton}>
          <Text style={styles.primaryLabel}>
            {isPending ? '正在执行……' : state === 'success' ? '已执行' : '确认执行'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  card: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, gap: theme.space.sm, padding: theme.space.lg },
  metadata: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, lineHeight: 21 },
  operation: { color: theme.color.brand.primary, fontSize: theme.text.size.md, fontWeight: '700' },
  primaryButton: { backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.control, justifyContent: 'center', minHeight: 44, paddingHorizontal: theme.space.md },
  primaryLabel: { color: theme.color.surface.card, fontWeight: '600' },
  secondaryButton: { borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: theme.space.md },
  secondaryLabel: { color: theme.color.text.primary, fontWeight: '600' },
  success: { color: theme.color.brand.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  title: { color: theme.color.text.primary, fontSize: theme.text.size.lg, fontWeight: '700' },
  warning: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
});
