import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';

interface EmailLayoutProps {
  preview: string;
  children: ReactNode;
}

/**
 * Shared email layout matching the Cuetation dark design system.
 * Provides header wordmark, container, and footer.
 */
export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Wordmark */}
          <Section style={header}>
            <Text style={wordmark}>
              Cue<span style={wordmarkAccent}>tation</span>
            </Text>
          </Section>

          {/* Content */}
          <Section style={content}>{children}</Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              © {new Date().getFullYear()} Cuetation · Video cue annotation for stage managers
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const body: React.CSSProperties = {
  backgroundColor: '#141416',
  fontFamily:
    'Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  margin: 0,
  padding: 0,
};

const container: React.CSSProperties = {
  maxWidth: '560px',
  margin: '0 auto',
  padding: '40px 20px',
};

const header: React.CSSProperties = {
  textAlign: 'center' as const,
  paddingBottom: '32px',
};

const wordmark: React.CSSProperties = {
  fontSize: '28px',
  fontWeight: 400,
  letterSpacing: '-0.03em',
  color: '#ede9e3',
  margin: 0,
};

const wordmarkAccent: React.CSSProperties = {
  color: '#BF5700',
  fontStyle: 'italic',
};

const content: React.CSSProperties = {
  backgroundColor: '#1c1c1f',
  borderRadius: '8px',
  border: '1px solid #2a2a2e',
  padding: '32px 28px',
};

const footer: React.CSSProperties = {
  textAlign: 'center' as const,
  paddingTop: '24px',
};

const footerText: React.CSSProperties = {
  color: '#6b6b6b',
  fontSize: '12px',
  fontFamily: '"DM Mono", monospace',
  margin: 0,
};
