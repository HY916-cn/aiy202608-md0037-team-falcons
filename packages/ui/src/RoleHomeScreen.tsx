import type { RoleCode } from '@dolphincloud/auth';
import { ROLE_LABELS } from '@dolphincloud/auth';
import { CircleCheck } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { RoleIcon } from './RoleIcon';
import { theme } from './theme';

type RoleHomeScreenProps = {
  children?: ReactNode;
  role: RoleCode;
};

export function RoleHomeScreen({ children, role }: RoleHomeScreenProps) {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.content}>
        <View style={styles.brandRow}>
          <View style={styles.iconFrame}>
            <RoleIcon role={role} size={28} />
          </View>
          <View style={styles.brandCopy}>
            <Text style={styles.brand}>海豚云</Text>
            <Text style={styles.role}>{ROLE_LABELS[role]}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>首页</Text>
          <Text style={styles.description}>
            {ROLE_LABELS[role]}基础路由已经就绪，业务功能将在对应 Issue 中逐步接入。
          </Text>
          <View style={styles.statusRow}>
            <CircleCheck
              accessibilityLabel="已完成"
              color={theme.color.brand.primary}
              size={20}
              strokeWidth={2}
            />
            <Text style={styles.status}>角色路由已就绪</Text>
          </View>
        </View>

        {children}

        <Text style={styles.helper}>
          当前页面已由登录会话和角色路由守卫保护。
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    alignItems: 'center',
    backgroundColor: theme.color.surface.page,
    flexGrow: 1,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xl,
  },
  content: {
    gap: theme.space.lg,
    maxWidth: 720,
    width: '100%',
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.space.md,
  },
  iconFrame: {
    alignItems: 'center',
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.default,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  brandCopy: {
    gap: theme.space.xs,
  },
  brand: {
    color: theme.color.text.primary,
    fontSize: theme.text.size.lg,
    fontWeight: '700',
  },
  role: {
    color: theme.color.text.secondary,
    fontSize: theme.text.size.sm,
    fontWeight: '500',
  },
  card: {
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.default,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    gap: theme.space.md,
    padding: theme.space.lg,
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
  statusRow: {
    alignItems: 'center',
    backgroundColor: theme.color.surface.muted,
    borderRadius: theme.radius.control,
    flexDirection: 'row',
    gap: theme.space.sm,
    minHeight: 44,
    paddingHorizontal: theme.space.md,
  },
  status: {
    color: theme.color.text.primary,
    fontSize: theme.text.size.sm,
    fontWeight: '500',
  },
  helper: {
    color: theme.color.text.secondary,
    fontSize: theme.text.size.sm,
    lineHeight: 21,
  },
});
