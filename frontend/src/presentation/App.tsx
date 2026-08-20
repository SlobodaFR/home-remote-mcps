import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { Header } from './components/Header';
import { ApiKeysPage } from './pages/ApiKeysPage';
import { CredentialsPage } from './pages/CredentialsPage';
import { LoginPage } from './pages/LoginPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <div>
              <Header />
              <CredentialsPage />
            </div>
          </RequireAuth>
        }
      />
      <Route
        path="/api-keys"
        element={
          <RequireAuth>
            <div>
              <Header />
              <ApiKeysPage />
            </div>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
