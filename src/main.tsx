import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Simple client-side routing:
//   /             → public landing page (no auth)
//   /privacy      → privacy policy (no auth)
//   /terms        → terms of service (no auth)
//   /app          → authenticated SPA (Clerk)
//   /video-window → popup video player
const pathname = window.location.pathname;

async function renderApp() {
  const root = createRoot(document.getElementById('root')!);

  if (pathname === '/video-window') {
    const { VideoPopupWindow } = await import('./components/VideoPopupWindow');
    root.render(
      <StrictMode>
        <VideoPopupWindow />
      </StrictMode>,
    );
  } else if (pathname === '/privacy') {
    const { PrivacyPolicy } = await import('./components/PrivacyPolicy');
    root.render(
      <StrictMode>
        <PrivacyPolicy />
      </StrictMode>,
    );
  } else if (pathname === '/terms') {
    const { TermsOfService } = await import('./components/TermsOfService');
    root.render(
      <StrictMode>
        <TermsOfService />
      </StrictMode>,
    );
  } else if (pathname === '/app') {
    const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;
    if (!CLERK_PUBLISHABLE_KEY) {
      throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY environment variable');
    }
    const [{ ClerkProvider }, { AppShell }] = await Promise.all([
      import('@clerk/clerk-react'),
      import('./AppShell'),
    ]);
    root.render(
      <StrictMode>
        <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
          <AppShell />
        </ClerkProvider>
      </StrictMode>,
    );
  } else {
    // Default: landing page for / and any unknown routes
    const { LandingPage } = await import('./components/LandingPage');
    root.render(
      <StrictMode>
        <LandingPage />
      </StrictMode>,
    );
  }
}

renderApp();
