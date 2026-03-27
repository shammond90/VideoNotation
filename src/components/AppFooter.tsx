import React, { useState } from 'react';
import InfoModal from './InfoModal';
import { featureNotes } from '../content/featureNotes';
import { userGuide } from '../content/userGuide';

const AppFooter: React.FC = () => {
  const [showFeatures, setShowFeatures] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const linkStyle: React.CSSProperties = {
    color: 'var(--text-dim)',
    fontSize: '0.75rem',
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'color 0.2s',
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '16px',
          padding: '6px 16px',
          backgroundColor: 'var(--bg-raised)',
          borderTop: '1px solid var(--border)',
          zIndex: 100,
          fontSize: '0.75rem',
        }}
      >
        <span
          style={linkStyle}
          onClick={() => setShowFeatures(true)}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--amber)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
        >
          Feature Notes
        </span>
        <span style={{ color: 'var(--border)' }}>•</span>
        <span
          style={linkStyle}
          onClick={() => setShowGuide(true)}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--amber)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
        >
          User Guide
        </span>
      </div>

      <InfoModal
        isOpen={showFeatures}
        onClose={() => setShowFeatures(false)}
        title="Feature Notes"
        content={featureNotes}
      />
      <InfoModal
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
        title="User Guide"
        content={userGuide}
      />
    </>
  );
};

export default AppFooter;
