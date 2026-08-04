import {
  EMPTY_AUTH_SESSION,
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

import { useSupabaseServices } from '@/features/supabase';

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

export function AuthSessionProvider({
  adapter,
  children,
}: AuthSessionProviderProps) {
  const { authAdapter } = useSupabaseServices();
  const [sessionAdapter] = useState(() => adapter ?? authAdapter);
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

    const unsubscribe = sessionAdapter.subscribe?.((nextSession) => {
      if (isActive) {
        setSession(nextSession);
        setIsLoading(false);
      }
    });

    return () => {
      isActive = false;
      unsubscribe?.();
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
