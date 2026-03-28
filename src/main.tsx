import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY environment variable');
}

// Simple client-side routing: /video-window renders the popup view,
// everything else renders the main app.
const isPopup = window.location.pathname === '/video-window';

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
