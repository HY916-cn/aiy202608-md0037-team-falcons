import { ROLE_CODES, ROLE_LABELS, type RoleCode } from '@dolphincloud/auth';
import { RoleIcon, theme } from '@dolphincloud/ui';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type MockLoginScreenProps = {
  readonly onLogin: (role: RoleCode) => Promise<void>;
};

export function MockLoginScreen({ onLogin }: MockLoginScreenProps) {
  const [pendingRole, setPendingRole] = useState<RoleCode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (role: RoleCode) => {
    setErrorMessage(null);
    setPendingRole(role);

    try {
      await onLogin(role);
    } catch {
      setErrorMessage('登录没有成功，请重试。');
      setPendingRole(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.content}>
        <View style={styles.heading}>
          <Text style={styles.brand}>海豚云</Text>
          <Text style={styles.title}>Mock 登录</Text>
          <Text style={styles.description}>
            选择一个固定角色进入演示。此入口仅用于开发与黑客松演示，不代表服务端授权。
          </Text>
        </View>

        <View style={styles.roleGrid}>
          {ROLE_CODES.map((role) => {
            const isPending = pendingRole === role;
            const isDisabled = pendingRole !== null;

            return (
              <Pressable
                accessibilityLabel={`以${ROLE_LABELS[role]}登录`}
                accessibilityRole="button"
                accessibilityState={{ busy: isPending, disabled: isDisabled }}
                disabled={isDisabled}
                key={role}
                onPress={() => {
                  void handleLogin(role);
                }}
                style={({ pressed }) => [
                  styles.roleButton,
                  pressed && styles.roleButtonPressed,
                  isDisabled && styles.roleButtonDisabled,
                ]}
              >
                <RoleIcon role={role} size={24} />
                <Text style={styles.roleLabel}>
                  {isPending ? '正在登录……' : ROLE_LABELS[role]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {errorMessage === null ? null : (
          <Text accessibilityRole="alert" style={styles.error}>
            {errorMessage}
          </Text>
        )}
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
  heading: {
    gap: theme.space.sm,
  },
  brand: {
    color: theme.color.brand.primary,
    fontSize: theme.text.size.lg,
    fontWeight: '700',
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
  roleGrid: {
    gap: theme.space.md,
  },
  roleButton: {
    alignItems: 'center',
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.default,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.space.md,
    minHeight: 56,
    paddingHorizontal: theme.space.md,
  },
  roleButtonPressed: {
    backgroundColor: theme.color.surface.muted,
    borderColor: theme.color.brand.primary,
  },
  roleButtonDisabled: {
    opacity: 0.65,
  },
  roleLabel: {
    color: theme.color.text.primary,
    fontSize: theme.text.size.md,
    fontWeight: '600',
  },
  error: {
    color: theme.color.text.primary,
    fontSize: theme.text.size.sm,
    lineHeight: 21,
  },
});
