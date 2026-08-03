import {
  ROLE_LABELS,
  type AuthRoleScope,
  type AuthUser,
  type RoleCode,
} from '@dolphincloud/auth';
import { RoleHomeScreen, RoleIcon, theme } from '@dolphincloud/ui';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuthSession } from '../AuthSessionProvider';

type AuthenticatedRoleHomeScreenProps = {
  readonly role: RoleCode;
};

type SessionControlsProps = {
  readonly availableRoles: readonly RoleCode[];
  readonly currentRole: RoleCode;
  readonly onLogout: () => Promise<void>;
  readonly onSwitchRole: (role: RoleCode) => Promise<void>;
  readonly roleScope: AuthRoleScope;
  readonly user: AuthUser;
};

function SessionControls({
  availableRoles,
  currentRole,
  onLogout,
  onSwitchRole,
  roleScope,
  user,
}: SessionControlsProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    RoleCode | 'logout' | null
  >(null);

  const handleSwitchRole = async (role: RoleCode) => {
    setErrorMessage(null);
    setPendingAction(role);

    try {
      await onSwitchRole(role);
    } catch {
      setErrorMessage('角色切换没有成功，请重试。');
    } finally {
      setPendingAction(null);
    }
  };

  const handleLogout = async () => {
    setErrorMessage(null);
    setPendingAction('logout');

    try {
      await onLogout();
    } catch {
      setErrorMessage('退出没有成功，请重试。');
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>当前会话</Text>
      <Text style={styles.metadata}>用户：{user.displayName}</Text>
      <Text style={styles.metadata}>角色范围：{roleScope.label}</Text>

      <Text style={styles.sectionTitle}>切换角色</Text>
      <View style={styles.roleList}>
        {availableRoles.map((role) => {
          const isCurrent = role === currentRole;

          return (
            <Pressable
              accessibilityLabel={`切换到${ROLE_LABELS[role]}`}
              accessibilityRole="button"
              accessibilityState={{
                busy: pendingAction === role,
                disabled: pendingAction !== null || isCurrent,
                selected: isCurrent,
              }}
              disabled={pendingAction !== null || isCurrent}
              key={role}
              onPress={() => {
                void handleSwitchRole(role);
              }}
              style={({ pressed }) => [
                styles.roleButton,
                isCurrent && styles.roleButtonCurrent,
                pressed && styles.roleButtonPressed,
              ]}
            >
              <RoleIcon role={role} size={20} />
              <Text
                style={[
                  styles.roleLabel,
                  isCurrent && styles.roleLabelCurrent,
                ]}
              >
                {pendingAction === role
                  ? '正在切换……'
                  : ROLE_LABELS[role]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{
          busy: pendingAction === 'logout',
          disabled: pendingAction !== null,
        }}
        disabled={pendingAction !== null}
        onPress={() => {
          void handleLogout();
        }}
        style={({ pressed }) => [
          styles.logoutButton,
          pressed && styles.roleButtonPressed,
        ]}
      >
        <Text style={styles.logoutLabel}>
          {pendingAction === 'logout' ? '正在退出……' : '退出登录'}
        </Text>
      </Pressable>

      {errorMessage === null ? null : (
        <Text accessibilityRole="alert" style={styles.error}>
          {errorMessage}
        </Text>
      )}
    </View>
  );
}

export function AuthenticatedRoleHomeScreen({
  role,
}: AuthenticatedRoleHomeScreenProps) {
  const session = useAuthSession();

  if (
    session.user === null ||
    session.currentRole === null ||
    session.roleScope === null
  ) {
    return null;
  }

  return (
    <RoleHomeScreen role={role}>
      <SessionControls
        availableRoles={session.availableRoles}
        currentRole={session.currentRole}
        onLogout={session.logout}
        onSwitchRole={session.switchRole}
        roleScope={session.roleScope}
        user={session.user}
      />
    </RoleHomeScreen>
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
  title: {
    color: theme.color.text.primary,
    fontSize: theme.text.size.lg,
    fontWeight: '600',
  },
  metadata: {
    color: theme.color.text.secondary,
    fontSize: theme.text.size.sm,
    lineHeight: 21,
  },
  sectionTitle: {
    color: theme.color.text.primary,
    fontSize: theme.text.size.md,
    fontWeight: '600',
    marginTop: theme.space.sm,
  },
  roleList: {
    gap: theme.space.sm,
  },
  roleButton: {
    alignItems: 'center',
    borderColor: theme.color.border.default,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.space.sm,
    minHeight: 44,
    paddingHorizontal: theme.space.md,
  },
  roleButtonCurrent: {
    backgroundColor: theme.color.surface.muted,
    borderColor: theme.color.brand.primary,
  },
  roleButtonPressed: {
    opacity: 0.7,
  },
  roleLabel: {
    color: theme.color.text.primary,
    fontSize: theme.text.size.sm,
    fontWeight: '500',
  },
  roleLabelCurrent: {
    color: theme.color.brand.primary,
  },
  logoutButton: {
    alignItems: 'center',
    borderColor: theme.color.brand.primary,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: theme.space.md,
  },
  logoutLabel: {
    color: theme.color.brand.primary,
    fontSize: theme.text.size.sm,
    fontWeight: '600',
  },
  error: {
    color: theme.color.text.primary,
    fontSize: theme.text.size.sm,
    lineHeight: 21,
  },
});
