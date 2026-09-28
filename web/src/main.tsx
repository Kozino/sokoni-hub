import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Outermost: language and direction are set on <html> and every
        other provider's copy depends on them. */}
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
