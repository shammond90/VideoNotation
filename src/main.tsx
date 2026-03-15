import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

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
        <AppShell />
      </StrictMode>,
    );
  }
}

renderApp();
