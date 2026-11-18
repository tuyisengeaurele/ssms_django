import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './styles/toast.css';
import { ToastProvider } from './context/ToastContext';
import { LanguageProvider, loadLocale } from './context/LanguageContext';
import { loadWithin } from './i18n/catalog';
import { savedLocale, saveLocale, syncLocaleCookie } from './i18n/savedLocale';
import { decideStart } from './startup';
import { rememberPrerendered } from './utils/prerendered';

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

const root = document.getElementById('root')!;

/**
 * Start the app. The landing page has an address in each language, and the address says which language it is, so what happens first
 * depends on the address and on the language the person chose before (see startup.ts).
 */
async function start() {
  const begin = decideStart({ pathname: window.location.pathname, search: window.location.search, hash: window.location.hash, saved: savedLocale() });
  // Opening a language address, or typing /en, is a choice. Keep it, so the rest of the app follows.
  if (begin.remember) saveLocale(begin.remember);
  if (begin.redirectTo) {
    window.location.replace(begin.redirectTo);
    return;
  }
  syncLocaleCookie();

  // The build writes the landing page into the page. Keep it, so it stays on screen while the page's code arrives.
  rememberPrerendered(root);
  // That page is already in its language. Wait a moment for the language file, so the first thing React draws is in the same
  // language and nothing flips. A slow or failed download is not waited for.
  if (root.hasAttribute('data-prerendered')) await loadWithin(begin.initialLocale ?? loadLocale(), 400);

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <LanguageProvider initialLocale={begin.initialLocale}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </LanguageProvider>
    </React.StrictMode>,
  );
}

void start();
