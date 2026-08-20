import { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="px-6 py-16 text-center text-mute">Chargement...</div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
