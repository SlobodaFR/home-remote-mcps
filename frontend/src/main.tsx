import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ApiKeySessionProvider } from './presentation/api-keys/ApiKeySessionProvider';
import App from './presentation/App';
import { AuthProvider } from './presentation/auth/AuthProvider';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('#root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ApiKeySessionProvider>
          <App />
        </ApiKeySessionProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
