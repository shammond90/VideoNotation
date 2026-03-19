import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import './index.css'

// Simple client-side routing.
const pathname = window.location.pathname;
const isPopup = pathname === '/video-window';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

async function renderApp() {
  const root = createRoot(document.getElementById('root')!);

  if (isPopup) {
    const { VideoPopupWindow } = await import('./components/VideoPopupWindow');
    root.render(
      <StrictMode>
        <VideoPopupWindow />
      </StrictMode>,
    );
  } else {
    const { AppShell } = await import('./AppShell');
    root.render(
      <StrictMode>
        <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
          <AppShell />
        </ClerkProvider>
      </StrictMode>,
    );
  }
}

renderApp();
