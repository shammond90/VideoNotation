import { Section, Text, Hr } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { EmailButton } from './components/EmailButton';

interface WelcomeEmailProps {
  name: string | null;
  appUrl?: string;
}

/**
 * Welcome email sent after user.created webhook.
 * Uses the Cuetation design system.
 */
export function WelcomeEmail({
  name,
  appUrl = 'https://cuetation.app',
}: WelcomeEmailProps) {
  const displayName = name || 'there';

  return (
    <EmailLayout preview="Welcome to Cuetation — video cue annotation for stage managers">
      <Text style={heading}>Welcome to Cuetation</Text>

      <Text style={paragraph}>Hey {displayName},</Text>

      <Text style={paragraph}>
        Thanks for signing up. Cuetation is a purpose-built tool for stage
        managers to annotate, track, and export video cues for live
        productions.
      </Text>

      <Hr style={divider} />

      <Text style={subheading}>What you can do right away</Text>

      <Text style={listItem}>
        <strong style={accent}>Create a project</strong> — set up a show with
        custom cue types, fields, and video
      </Text>
      <Text style={listItem}>
        <strong style={accent}>Annotate video</strong> — place cues on a
        timeline with timecodes, statuses, and notes
      </Text>
      <Text style={listItem}>
        <strong style={accent}>Export</strong> — generate PDF, CSV, or XLSX
        reports for your production team
      </Text>

      <Hr style={divider} />

      <Section style={ctaSection}>
        <EmailButton href={appUrl}>Open Cuetation</EmailButton>
      </Section>

      <Text style={signoff}>
        Break a leg,
        <br />
        The Cuetation Team
      </Text>
    </EmailLayout>
  );
}

export default WelcomeEmail;

// ── Styles ──────────────────────────────────────────────────────────

const heading: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: 600,
  color: '#ede9e3',
  margin: '0 0 16px',
};

const subheading: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 600,
  color: '#ede9e3',
  margin: '0 0 12px',
};

const paragraph: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '1.6',
  color: '#b0aca4',
  margin: '0 0 12px',
};

const listItem: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '1.6',
  color: '#b0aca4',
  margin: '0 0 8px',
  paddingLeft: '8px',
};

const accent: React.CSSProperties = {
  color: '#BF5700',
};

const divider: React.CSSProperties = {
  borderColor: '#2a2a2e',
  margin: '20px 0',
};

const ctaSection: React.CSSProperties = {
  textAlign: 'center' as const,
  padding: '8px 0 16px',
};

const signoff: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '1.6',
  color: '#6b6b6b',
  margin: '0',
};
