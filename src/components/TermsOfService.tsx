import { PublicPageShell } from './PublicPageShell';

export function TermsOfService() {
  return (
    <PublicPageShell>
      <article style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 className="font-display" style={{ fontSize: 32, marginBottom: 8, color: 'var(--text)' }}>
          Terms of Service
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 32 }}>
          Last updated: April 2026
        </p>

        <Section title="1. Acceptance of Terms">
          <p>
            By accessing or using Cuetation at cuetation.com (the "Service"), you agree to be
            bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do
            not use the Service.
          </p>
        </Section>

        <Section title="2. Description of Service">
          <p>
            Cuetation is a web-based cue sheet management tool designed for live production. It
            allows users to create, organise, and export cue sheets with video-synchronised
            timing. The Service includes local browser storage and optional cloud
            synchronisation features.
          </p>
        </Section>

        <Section title="3. Accounts">
          <p>
            You may need to create an account to access certain features. You are responsible for
            maintaining the confidentiality of your account credentials and for all activity that
            occurs under your account. You agree to provide accurate and complete information
            when creating your account.
          </p>
        </Section>

        <Section title="4. Acceptable Use">
          <p>You agree not to:</p>
          <ul>
            <li>Use the Service for any unlawful purpose</li>
            <li>Attempt to gain unauthorised access to the Service or its systems</li>
            <li>Interfere with or disrupt the integrity or performance of the Service</li>
            <li>Upload or transmit viruses or other harmful code</li>
            <li>Reproduce, duplicate, or resell any part of the Service without permission</li>
          </ul>
        </Section>

        <Section title="5. Your Content">
          <p>
            You retain full ownership of any content you create using the Service, including
            projects, cue sheets, annotations, and configuration data. We do not claim any
            intellectual property rights over your content.
          </p>
          <p>
            By using cloud sync features, you grant us a limited licence to store and transmit
            your content solely for the purpose of providing the Service to you.
          </p>
        </Section>

        <Section title="6. Data &amp; Privacy">
          <p>
            Your use of the Service is also governed by our{' '}
            <a href="/privacy" style={{ color: 'var(--amber)', textDecoration: 'underline' }}>Privacy Policy</a>,
            which describes how we collect, use, and protect your information.
          </p>
        </Section>

        <Section title="7. Availability &amp; Changes">
          <p>
            We strive to keep the Service available and reliable, but we do not guarantee
            uninterrupted or error-free operation. We reserve the right to modify, suspend, or
            discontinue the Service (or any part of it) at any time, with or without notice.
          </p>
        </Section>

        <Section title="8. Limitation of Liability">
          <p>
            To the fullest extent permitted by law, Cuetation and its operators shall not be
            liable for any indirect, incidental, special, consequential, or punitive damages, or
            any loss of data, profits, or revenue, arising from your use of or inability to use
            the Service.
          </p>
          <p>
            The Service is provided "as is" and "as available" without warranties of any kind,
            whether express or implied.
          </p>
        </Section>

        <Section title="9. Use at Your Own Risk">
          <p>
            Cuetation is a productivity tool designed to assist with cue sheet creation. You are 
            responsible for how you use the Service and any decisions or actions taken based on
            the information provided by the Service. We recommend regularly backing up your data and 
            not relying solely on the Service for critical production needs without appropriate safeguards.
          </p>
        </Section>

        <Section title="10. Termination">
          <p>
            We may suspend or terminate your access to the Service at any time for conduct that
            we determine violates these Terms or is harmful to other users, us, or third parties.
            You may stop using the Service at any time. Upon termination, your right to use the
            Service ceases immediately, though you may export your data beforehand.
          </p>
        </Section>

        <Section title="11. Changes to These Terms">
          <p>
            We may update these Terms from time to time. We will notify users of material
            changes by updating the "Last updated" date above. Continued use of the Service
            after changes constitutes acceptance of the revised Terms.
          </p>
        </Section>

        <Section title="12. Contact">
          <p>
            If you have questions about these Terms, please contact us at:{' '}
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
