import { Text, Hr } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';

interface AccountDeletedEmailProps {
  name: string | null;
}

/**
 * Farewell email sent after account deletion.
 * Confirms the action and lets the user know their data has been removed.
 */
export function AccountDeletedEmail({ name }: AccountDeletedEmailProps) {
  const displayName = name || 'there';

  return (
    <EmailLayout preview="Your Cuetation account has been deleted">
      <Text style={heading}>Account Deleted</Text>

      <Text style={paragraph}>Hey {displayName},</Text>

      <Text style={paragraph}>
        Your Cuetation account and all associated data have been permanently
        deleted as requested. This includes all projects, cues, templates, and
        settings.
      </Text>

      <Hr style={divider} />

      <Text style={paragraph}>
        If this was a mistake or you'd like to return in the future, you're
        always welcome to create a new account.
      </Text>

      <Text style={signoff}>
        All the best,
        <br />
        The Cuetation Team
      </Text>
    </EmailLayout>
  );
}

export default AccountDeletedEmail;

// ── Styles ──────────────────────────────────────────────────────────

const heading: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: 600,
  color: '#ede9e3',
  margin: '0 0 16px',
};

const paragraph: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '1.6',
  color: '#b0aca4',
  margin: '0 0 12px',
};

const divider: React.CSSProperties = {
  borderColor: '#2a2a2e',
  margin: '20px 0',
};

const signoff: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '1.6',
  color: '#6b6b6b',
  margin: '0',
};
