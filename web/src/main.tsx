import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider } from './context/AuthContext';
import { getScheme } from './lib/store';
import './index.css';

// Applied before the first paint so the console never flashes the default
// scheme on its way to the chosen one.
document.documentElement.setAttribute('data-scheme', getScheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      {/* Auth wraps Toast so a sign-out can raise a toast on its way out. */}
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
