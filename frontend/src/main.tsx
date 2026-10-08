import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './styles/shell.css';
import './styles/components.css';
import { ToastProvider } from './context/ToastContext';
import { LanguageProvider } from './context/LanguageContext';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

// Loaded on demand so visitors without monitoring never download it.
if (SENTRY_DSN) {
  void import('@sentry/react').then((Sentry) => {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,            // "development" | "production"
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Mask all text and block all media by default (GDPR-safe)
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // Capture 10 % of transactions in production, 100 % in development
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    // Capture 10 % of sessions for replays
    replaysSessionSampleRate: 0.1,
    // Capture 100 % of sessions with errors
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: false,
  });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </LanguageProvider>
  </React.StrictMode>
);
