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

// ── Request persistent storage so the browser won't evict IndexedDB data ──
navigator.storage?.persist?.();

// ── PWA service worker registration ──
// registerSW returns a function to call when the user accepts the update.
// We show a simple DOM-based banner since this runs outside the React tree.
if ('serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      onNeedRefresh() {
        const bar = document.createElement('div');
        bar.setAttribute('role', 'alert');
        Object.assign(bar.style, {
          position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
          zIndex: '99999', display: 'flex', alignItems: 'center', gap: '12px',
          padding: '10px 18px', borderRadius: '8px',
          background: '#232329', color: '#ede9e3', border: '1px solid #BF5700',
          fontFamily: 'system-ui, sans-serif', fontSize: '13px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        });
        bar.innerHTML = `
          <span>A new version is available</span>
          <button id="pwa-update" style="background:#BF5700;color:#fff;border:none;padding:5px 14px;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600">Update</button>
          <button id="pwa-dismiss" style="background:transparent;color:#8a8680;border:none;cursor:pointer;font-size:16px;line-height:1;padding:2px 6px">&times;</button>
        `;
        document.body.appendChild(bar);
        document.getElementById('pwa-update')!.onclick = () => updateSW(true);
        document.getElementById('pwa-dismiss')!.onclick = () => bar.remove();
      },
      onOfflineReady() {
        // App shell cached — silently ready for offline use
      },
    });
  });
}
