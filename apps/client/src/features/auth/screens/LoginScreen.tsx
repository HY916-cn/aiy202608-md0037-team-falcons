import {
  ROLE_CODES,
  ROLE_LABELS,
  type AuthLoginInput,
  type RoleCode,
} from '@dolphincloud/auth';
import { RoleIcon, theme } from '@dolphincloud/ui';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type LoginScreenProps = {
  readonly onLogin: (input: AuthLoginInput) => Promise<void>;
};

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('demo_teacher_01@dolphincloud.local');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleCode>('teacher');
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    setErrorMessage(null);
    setIsPending(true);

    try {
      await onLogin({ email, password });
    } catch {
      setErrorMessage('登录没有成功，请检查合成账号和密码。');
      setIsPending(false);
    }
  };

  const handleSelectRole = (role: RoleCode) => {
    const emailPrefix =
      role === 'class_terminal'
        ? 'demo_class'
        : role === 'bank_operator'
          ? 'demo_bank'
          : `demo_${role}`;

    setSelectedRole(role);
    setEmail(`${emailPrefix}_01@dolphincloud.local`);
    setErrorMessage(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.content}>
        <View style={styles.heading}>
          <Text style={styles.brand}>海豚云</Text>
          <Text style={styles.title}>登录</Text>
          <Text style={styles.description}>
            选择合成演示账号并输入本地密码。角色和班级范围由 Supabase
            会话与 RLS 校验，客户端选择不能授予权限。
          </Text>
        </View>

        <View style={styles.roleGrid}>
          {ROLE_CODES.map((role) => {
            const isSelected = selectedRole === role;

            return (
              <Pressable
                accessibilityLabel={`选择${ROLE_LABELS[role]}合成账号`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                disabled={isPending}
                key={role}
                onPress={() => {
                  handleSelectRole(role);
                }}
                style={({ pressed }) => [
                  styles.roleButton,
                  pressed && styles.roleButtonPressed,
                  isSelected && styles.roleButtonSelected,
                  isPending && styles.disabled,
                ]}
              >
                <RoleIcon role={role} size={24} />
                <Text style={styles.roleLabel}>{ROLE_LABELS[role]}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.form}>
          <Text style={styles.fieldLabel}>合成账号</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            editable={!isPending}
            inputMode="email"
            onChangeText={setEmail}
            style={styles.input}
            value={email}
          />
          <Text style={styles.fieldLabel}>密码</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="current-password"
            editable={!isPending}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
            value={password}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: isPending, disabled: isPending }}
            disabled={isPending}
            onPress={() => {
              void handleLogin();
            }}
            style={({ pressed }) => [
              styles.loginButton,
              pressed && styles.loginButtonPressed,
              isPending && styles.disabled,
            ]}
          >
            <Text style={styles.loginButtonLabel}>
              {isPending ? '正在登录……' : '登录'}
            </Text>
          </Pressable>
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
    gap: theme.space.sm,
  },
  roleButton: {
    alignItems: 'center',
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.default,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.space.md,
    minHeight: 52,
    paddingHorizontal: theme.space.md,
  },
  roleButtonPressed: {
    backgroundColor: theme.color.surface.muted,
  },
  roleButtonSelected: {
    borderColor: theme.color.brand.primary,
    borderWidth: 2,
  },
  disabled: {
    opacity: 0.65,
  },
  roleLabel: {
    color: theme.color.text.primary,
    fontSize: theme.text.size.md,
    fontWeight: '600',
  },
  form: {
    gap: theme.space.sm,
  },
  fieldLabel: {
    color: theme.color.text.primary,
    fontSize: theme.text.size.sm,
    fontWeight: '600',
  },
  input: {
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.default,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    color: theme.color.text.primary,
    fontSize: theme.text.size.md,
    minHeight: 48,
    paddingHorizontal: theme.space.md,
  },
  loginButton: {
    alignItems: 'center',
    backgroundColor: theme.color.brand.primary,
    borderRadius: theme.radius.control,
    justifyContent: 'center',
    marginTop: theme.space.sm,
    minHeight: 48,
  },
  loginButtonPressed: {
    opacity: 0.85,
  },
  loginButtonLabel: {
    color: theme.color.surface.card,
    fontSize: theme.text.size.md,
    fontWeight: '600',
  },
  error: {
    color: theme.color.text.primary,
    fontSize: theme.text.size.sm,
    lineHeight: 21,
  },
});
