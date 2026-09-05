import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState,
} from 'react';
import { apiClient, CreatedApiKey } from '../../infrastructure/api-client';

interface ApiKeySessionContextValue {
  createdKey: CreatedApiKey | null;
  generating: boolean;
  generate: (label?: string) => Promise<CreatedApiKey>;
}

const ApiKeySessionContext = createContext<ApiKeySessionContextValue | null>(
  null,
);

// Held in memory only (never sessionStorage/localStorage) so it disappears
// on reload, matching the backend's "raw key shown once" guarantee - it's
// just shared across pages within the same SPA session instead of being
// confined to the page that triggered creation.
export function ApiKeySessionProvider({ children }: { children: ReactNode }) {
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [generating, setGenerating] = useState(false);

  const generate = useCallback(async (label?: string) => {
    setGenerating(true);
    try {
      const trimmedLabel = label ?? '';
      const result = await apiClient.createApiKey(trimmedLabel || 'Claude');
      setCreatedKey(result);
      return result;
    } finally {
      setGenerating(false);
    }
  }, []);

  return (
    <ApiKeySessionContext.Provider value={{ createdKey, generating, generate }}>
      {children}
    </ApiKeySessionContext.Provider>
  );
}

export function useApiKeySession(): ApiKeySessionContextValue {
  const context = useContext(ApiKeySessionContext);
  if (!context) {
    throw new Error(
      'useApiKeySession must be used within an ApiKeySessionProvider',
    );
  }
  return context;
}
