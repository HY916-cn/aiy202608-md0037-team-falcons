import type { AuthLoginInput } from '@dolphincloud/auth';
import { DolphinCloudLogo, InteractivePressable, theme } from '@dolphincloud/ui';
import { ArrowRight, CheckCircle2, LockKeyhole, Mail } from 'lucide-react-native';
import { useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

const webInputFocusReset = Platform.select({
  web: { outlineColor: 'transparent', outlineStyle: 'solid' as const, outlineWidth: 0 },
});

type LoginScreenProps = {
  readonly configurationIssue: 'incomplete' | 'missing' | null;
  readonly onLogin: (input: AuthLoginInput) => Promise<void>;
};

export function LoginScreen({ configurationIssue, onLogin }: LoginScreenProps) {
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  const handleLogin = async () => {
    setErrorMessage(null);
    setIsPending(true);

    try {
      await onLogin({ email, password });
    } catch {
      setErrorMessage('登录未完成。请检查账号与密码，或联系系统管理员。');
      setIsPending(false);
    }
  };

  const isUnavailable = configurationIssue !== null;
  const canSubmit =
    !isUnavailable && !isPending && email.trim().length > 0 && password.length > 0;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={[styles.shell, !isWide && styles.shellCompact]}>
        <View style={[styles.introduction, !isWide && styles.introductionCompact]}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <DolphinCloudLogo size={42} />
            </View>
            <View>
              <Text style={styles.brandName}>海豚云</Text>
              <Text style={styles.brandEnglish}>DolphinCloud</Text>
            </View>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>校园协作，一处完成</Text>
            <Text style={[styles.heroTitle, !isWide && styles.heroTitleCompact]}>
              让班级事务更清楚，{isWide ? '\n' : ''}让每次成长有记录。
            </Text>
            <Text style={styles.heroDescription}>
              课件、作业、学生分、班级分与海豚币共用同一套权限和操作记录。
            </Text>
          </View>
          {isWide ? (
            <View style={styles.featureList}>
              {['六端权限边界清晰', '关键写操作先预览再确认', '指定操作可撤销且原记录保留'].map((item) => (
                <View key={item} style={styles.featureRow}>
                  <View style={styles.featureIcon}><CheckCircle2 color={theme.color.brand.secondary} size={17} /></View>
                  <Text style={styles.featureLabel}>{item}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={[styles.loginPanel, !isWide && styles.loginPanelCompact]}>
          <View>
            <Text style={styles.panelEyebrow}>欢迎回来</Text>
            <Text style={styles.panelTitle}>登录海豚云</Text>
            <Text style={styles.panelDescription}>使用学校分配的账号登录，系统将按你的权限进入对应工作台。</Text>
          </View>

          {isUnavailable ? (
            <View accessibilityRole="alert" style={styles.serviceNotice}>
              <Text style={styles.serviceNoticeTitle}>服务尚未配置</Text>
              <Text style={styles.serviceNoticeText}>
                {configurationIssue === 'incomplete'
                  ? '运行环境中的服务地址与访问配置不完整。'
                  : '当前站点尚未连接学校服务。'}
                请联系系统管理员完成配置后再登录。
              </Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <Text style={styles.fieldLabel}>账号</Text>
            <View style={[styles.inputFrame, focusedField === 'email' && styles.inputFrameFocused]}>
              <Mail color={theme.color.text.disabled} size={18} />
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                editable={!isPending && !isUnavailable}
                inputMode="email"
                onChangeText={setEmail}
                onBlur={() => setFocusedField(null)}
                onFocus={() => setFocusedField('email')}
                placeholder="name@school.example"
                placeholderTextColor={theme.color.text.disabled}
                style={[styles.input, webInputFocusReset]}
                value={email}
              />
            </View>
            <Text style={styles.fieldLabel}>密码</Text>
            <View style={[styles.inputFrame, focusedField === 'password' && styles.inputFrameFocused]}>
              <LockKeyhole color={theme.color.text.disabled} size={18} />
              <TextInput
                autoCapitalize="none"
                autoComplete="current-password"
                editable={!isPending && !isUnavailable}
                onChangeText={setPassword}
                onBlur={() => setFocusedField(null)}
                onFocus={() => setFocusedField('password')}
                placeholder="请输入密码"
                placeholderTextColor={theme.color.text.disabled}
                secureTextEntry
                style={[styles.input, webInputFocusReset]}
                value={password}
              />
            </View>
            <InteractivePressable
              accessibilityRole="button"
              accessibilityState={{ busy: isPending, disabled: !canSubmit }}
              disabled={!canSubmit}
              onPress={() => void handleLogin()}
              style={({ focused, hovered, pressed }) => [
                styles.loginButton,
                hovered && canSubmit && styles.loginButtonHover,
                focused && styles.loginButtonFocused,
                pressed && styles.pressed,
                !canSubmit && styles.disabled,
              ]}
            >
              <Text style={styles.loginButtonLabel}>{isPending ? '正在登录…' : '登录'}</Text>
              <ArrowRight color={theme.color.surface.card} size={19} />
            </InteractivePressable>
          </View>

          {errorMessage === null ? null : (
            <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text>
          )}
          <Text style={styles.securityNotice}>身份与数据范围由服务端会话及 RLS 校验，客户端不会保存服务密钥。</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: 'center', backgroundColor: theme.color.surface.page, flexGrow: 1, justifyContent: 'center', padding: theme.space.lg },
  shell: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: 20, borderWidth: 1, elevation: 6, flexDirection: 'row', maxWidth: 1120, minHeight: 660, overflow: 'hidden', width: '100%' },
  shellCompact: { flexDirection: 'column', minHeight: 0 },
  introduction: { backgroundColor: theme.color.brand.primary, justifyContent: 'space-between', padding: 52, width: '46%' },
  introductionCompact: { gap: theme.space.lg, padding: theme.space.lg, width: '100%' },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: theme.space.base },
  brandMark: { alignItems: 'center', backgroundColor: theme.color.surface.card, borderColor: theme.color.brand.onPrimaryBorder, borderRadius: 14, borderWidth: 1, height: 46, justifyContent: 'center', width: 46 },
  brandName: { color: theme.color.surface.card, fontSize: 19, fontWeight: '800' },
  brandEnglish: { color: theme.color.surface.card, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, marginTop: 2, opacity: 0.76 },
  heroCopy: { gap: theme.space.base },
  heroEyebrow: { color: theme.color.surface.card, fontSize: theme.text.size.sm, fontWeight: '700', opacity: 0.78 },
  heroTitle: { color: theme.color.surface.card, fontSize: 38, fontWeight: '800', letterSpacing: -0.8, lineHeight: 54 },
  heroTitleCompact: { fontSize: theme.text.size.xl, lineHeight: 34 },
  heroDescription: { color: theme.color.surface.card, fontSize: theme.text.size.sm, lineHeight: 23, maxWidth: 390, opacity: 0.82 },
  featureList: { gap: theme.space.base },
  featureRow: { alignItems: 'center', flexDirection: 'row', gap: theme.space.base },
  featureIcon: { alignItems: 'center', backgroundColor: theme.color.brand.onPrimaryMuted, borderRadius: theme.radius.pill, height: 30, justifyContent: 'center', width: 30 },
  featureLabel: { color: theme.color.surface.card, fontSize: theme.text.size.sm, fontWeight: '600' },
  loginPanel: { flex: 1, gap: theme.space.lg, justifyContent: 'center', padding: 52 },
  loginPanelCompact: { padding: theme.space.lg },
  panelEyebrow: { color: theme.color.brand.primary, fontSize: theme.text.size.xs, fontWeight: '800', letterSpacing: 1 },
  panelTitle: { color: theme.color.text.primary, fontSize: theme.text.size.display, fontWeight: '800', letterSpacing: -0.5, marginTop: theme.space.xs },
  panelDescription: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, marginTop: theme.space.sm },
  serviceNotice: { backgroundColor: theme.color.surface.primaryTint, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, gap: theme.space.xs, padding: theme.space.md },
  serviceNoticeText: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, lineHeight: 21 },
  serviceNoticeTitle: { color: theme.color.text.primary, fontSize: theme.text.size.md, fontWeight: '800' },
  form: { gap: theme.space.sm },
  fieldLabel: { color: theme.color.text.primary, fontSize: theme.text.size.xs, fontWeight: '700', marginTop: theme.space.xs },
  inputFrame: { alignItems: 'center', borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flexDirection: 'row', gap: theme.space.sm, minHeight: 48, paddingHorizontal: theme.space.base },
  inputFrameFocused: { borderColor: theme.color.brand.primary, borderWidth: 2 },
  input: { color: theme.color.text.primary, flex: 1, fontSize: theme.text.size.sm, minHeight: 46 },
  loginButton: { alignItems: 'center', backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.control, flexDirection: 'row', gap: theme.space.sm, justifyContent: 'center', marginTop: theme.space.sm, minHeight: 50, paddingHorizontal: theme.space.md },
  loginButtonFocused: { borderColor: theme.color.surface.card, borderWidth: 2 },
  loginButtonHover: { opacity: 0.88, transform: [{ translateY: -1 }] },
  loginButtonLabel: { color: theme.color.surface.card, fontSize: theme.text.size.sm, fontWeight: '800' },
  error: { backgroundColor: theme.color.surface.muted, borderRadius: theme.radius.control, color: theme.color.text.primary, fontSize: theme.text.size.sm, lineHeight: 21, padding: theme.space.base },
  securityNotice: { color: theme.color.text.disabled, fontSize: theme.text.size.xs, lineHeight: 18 },
  disabled: { opacity: 0.58 },
  pressed: { opacity: 0.72 },
});
