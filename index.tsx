import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/shared/styles/index.css';
import App from '@/app/App';
import ErrorBoundary from '@/shared/components/ErrorBoundary';
import { CurrentUserProvider } from '@/shared/auth/CurrentUserContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <CurrentUserProvider>
        <App />
      </CurrentUserProvider>
    </ErrorBoundary>
  </React.StrictMode>
);