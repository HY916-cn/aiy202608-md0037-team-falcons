import {
  EMPTY_AUTH_SESSION,
  MockAuthSessionAdapter,
  createSupabaseAuthSessionAdapter,
  parseMockRole,
  type AuthLoginInput,
  type AuthSession,
  type AuthSessionAdapter,
  type RoleCode,
} from '@dolphincloud/auth';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type AuthSessionContextValue = AuthSession & {
  readonly isLoading: boolean;
  login(input: AuthLoginInput): Promise<void>;
  logout(): Promise<void>;
  switchRole(role: RoleCode): Promise<void>;
};

type AuthSessionProviderProps = {
  readonly adapter?: AuthSessionAdapter;
  readonly children: ReactNode;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

function createDefaultAdapter(): AuthSessionAdapter {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl !== undefined && supabaseAnonKey !== undefined) {
    return createSupabaseAuthSessionAdapter({
      anonKey: supabaseAnonKey,
      url: supabaseUrl,
    });
  }

  const initialRole = parseMockRole(process.env.EXPO_PUBLIC_MOCK_ROLE);

  return initialRole === null
    ? new MockAuthSessionAdapter()
    : new MockAuthSessionAdapter({ initialRole });
}

export function AuthSessionProvider({
  adapter,
  children,
}: AuthSessionProviderProps) {
  const [sessionAdapter] = useState(() => adapter ?? createDefaultAdapter());
  const [session, setSession] = useState<AuthSession>(EMPTY_AUTH_SESSION);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    sessionAdapter
      .getSession()
      .then((nextSession) => {
        if (isActive) {
          setSession(nextSession);
        }
      })
      .catch(() => {
        if (isActive) {
          setSession(EMPTY_AUTH_SESSION);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [sessionAdapter]);

  const runSessionAction = useCallback(
    async (action: () => Promise<AuthSession>) => {
      setSession(await action());
    },
    [],
  );

  const login = useCallback(
    (input: AuthLoginInput) =>
      runSessionAction(() => sessionAdapter.login(input)),
    [runSessionAction, sessionAdapter],
  );

  const logout = useCallback(
    () => runSessionAction(() => sessionAdapter.logout()),
    [runSessionAction, sessionAdapter],
  );

  const switchRole = useCallback(
    (role: RoleCode) =>
      runSessionAction(() => sessionAdapter.switchRole(role)),
    [runSessionAction, sessionAdapter],
  );

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      ...session,
      isLoading,
      login,
      logout,
      switchRole,
    }),
    [isLoading, login, logout, session, switchRole],
  );

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession(): AuthSessionContextValue {
  const context = useContext(AuthSessionContext);

  if (context === null) {
    throw new Error('useAuthSession must be used within AuthSessionProvider');
  }

  return context;
}
