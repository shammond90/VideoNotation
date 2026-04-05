interface SessionExpiredModalProps {
  onSignOut: () => void;
}

export function SessionExpiredModal({ onSignOut }: SessionExpiredModalProps) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        padding: 32,
        maxWidth: 400,
        width: '90%',
        textAlign: 'center',
      }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'var(--amber-dim)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
          fontSize: 22,
        }}>
          ⚠
        </div>
        <h2 style={{
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--text)',
          marginBottom: 8,
        }}>
          Session Ended
        </h2>
        <p style={{
          fontSize: 13,
          color: 'var(--text-mid)',
          lineHeight: 1.5,
          marginBottom: 24,
        }}>
          You've been signed in on another device. This session has ended. Your local data has been saved.
        </p>
        <button
          onClick={onSignOut}
          style={{
            padding: '10px 24px',
            background: 'var(--amber)',
            color: 'var(--text-inv)',
            border: 'none',
            borderRadius: 'var(--r-sm)',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          OK
        </button>
      </div>
    </div>
  );
}
