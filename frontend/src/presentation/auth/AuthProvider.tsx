import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { apiClient, CurrentUser } from '../../infrastructure/api-client';

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Top-level navigation (never fetch): home-auth's logout needs its SSO cookie. */
function navigateTo(url: string): void {
  window.location.assign(url);
}

export function AuthProvider({
  children,
  navigate = navigateTo,
}: {
  children: ReactNode;
  navigate?: (url: string) => void;
}) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiClient
      .fetchCurrentUser()
      .then(setUser)
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const logout = useCallback(async () => {
    const { redirectTo } = await apiClient.logout();
    if (redirectTo) {
      // The page leaves for home-auth, which sends the browser back to /login.
      navigate(redirectTo);
      return;
    }
    setUser(null);
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
