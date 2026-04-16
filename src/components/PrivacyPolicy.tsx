import { PublicPageShell } from './PublicPageShell';

export function PrivacyPolicy() {
  return (
    <PublicPageShell>
      <article style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 className="font-display" style={{ fontSize: 32, marginBottom: 8, color: 'var(--text)' }}>
          Privacy Policy
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 32 }}>
          Last updated: April 2026
        </p>

        <Section title="1. Introduction">
          <p>
            Cuetation ("we", "us", "our") operates the website at cuetation.com (the "Service").
            This Privacy Policy explains how we collect, use, and protect your information when
            you use our Service.
          </p>
        </Section>

        <Section title="2. Information We Collect">
          <p><strong>Account Information</strong> — When you sign in, we receive basic profile
            information (name and email address) from our authentication provider, Clerk. We do
            not store your password.</p>
          <p><strong>Project &amp; Annotation Data</strong> — The cue sheets, projects, and
            configuration data you create are stored locally in your browser (IndexedDB) and,
            if you enable cloud sync, in our database hosted on Supabase.</p>
          <p><strong>Usage Data</strong> — We may collect anonymous, aggregated usage statistics
            such as page views and feature usage to improve the Service. We do not track
            individual behaviour.</p>
        </Section>

        <Section title="3. How We Use Your Information">
          <p>We use the information we collect to:</p>
          <ul>
            <li>Provide, maintain, and improve the Service</li>
            <li>Authenticate your identity and manage your account</li>
            <li>Synchronise your data across devices when cloud sync is enabled</li>
            <li>Respond to support requests</li>
          </ul>
        </Section>

        <Section title="4. Third-Party Services">
          <p>We use the following third-party services to operate Cuetation:</p>
          <ul>
            <li><strong>Clerk</strong> — authentication and user management</li>
            <li><strong>Supabase</strong> — cloud database for synced project data</li>
            <li><strong>Vercel</strong> — website hosting and delivery</li>
            <li><strong>Google Fonts</strong> — typeface delivery</li>
          </ul>
          <p>These providers may process data in accordance with their own privacy policies.</p>
        </Section>

        <Section title="5. Cookies &amp; Local Storage">
          <p>
            Cuetation uses browser local storage and IndexedDB to persist your projects,
            preferences, and session state. Our authentication provider (Clerk) may set cookies
            to manage your sign-in session. We do not use tracking or advertising cookies.
          </p>
        </Section>

        <Section title="6. Data Retention &amp; Deletion">
          <p>
            Your local data remains in your browser until you clear it. Cloud-synced data is
            retained while your account is active. You may export your data at any time using
            the built-in export features. To request deletion of your cloud data or account,
            please contact us at the address below.
          </p>
        </Section>

        <Section title="7. Security">
          <p>
            We take reasonable measures to protect your data, including encrypted connections
            (HTTPS), row-level security on our database, and secure authentication via Clerk.
            However, no method of transmission over the Internet is 100% secure.
          </p>
        </Section>

        <Section title="8. Your Rights">
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul>
            <li>Access the personal data we hold about you</li>
            <li>Request correction or deletion of your data</li>
            <li>Export your data in a portable format</li>
            <li>Object to or restrict certain processing</li>
          </ul>
          <p>To exercise any of these rights, please contact us below.</p>
        </Section>

        <Section title="9. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. We will notify users of
            material changes by updating the "Last updated" date above. Continued use of the
            Service after changes constitutes acceptance of the revised policy.
          </p>
        </Section>

        <Section title="10. Contact">
          <p>
            If you have questions about this Privacy Policy or your data, please contact us at:{' '}
            <strong>feedback@cuetation.com</strong>
          </p>
        </Section>
      </article>
    </PublicPageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>
        {title}
      </h2>
      <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-mid)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </section>
  );
}
