import { Film, Layers, Download, Settings } from 'lucide-react';
import { PublicPageShell } from './PublicPageShell';

const features = [
  {
    icon: Film,
    title: 'Video-Synchronised Cues',
    description: 'Stamp cues directly from video playback with frame-accurate timing. Play, pause, seek, and step through footage while your cue sheet builds itself.',
  },
  {
    icon: Layers,
    title: 'Multi-Project Management',
    description: 'Manage multiple productions with full metadata, configurable cue types, custom colours, and per-type field and column layouts.',
  },
  {
    icon: Download,
    title: 'Flexible Export',
    description: 'Export cue sheets to CSV or build custom XLSX templates with a drag-and-drop column builder. Import cues from CSV with conflict resolution.',
  },
  {
    icon: Settings,
    title: 'Built for the Booth',
    description: 'Theatre mode for dark environments, automatic backups, offline support, and cloud sync so your cue sheets are always available.',
  },
];

export function LandingPage() {
  return (
    <PublicPageShell>
      {/* Hero */}
      <section style={{ padding: '80px 24px 60px', textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
        <h1
          className="font-display"
          style={{
            fontSize: 48,
            lineHeight: 1.1,
            color: 'var(--text)',
            marginBottom: 16,
          }}
        >
          Cue sheets,{' '}
          <em style={{ fontStyle: 'italic', color: 'var(--amber)' }}>synchronised</em>
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--text-mid)', maxWidth: 520, margin: '0 auto 32px' }}>
          Build, organise, and export cue sheets with video-synchronised timing.
          Designed for stage managers and production teams.
        </p>
        <a
          href="/app"
          style={{
            display: 'inline-block',
            fontSize: 15,
            fontWeight: 500,
            color: 'var(--text-inv)',
            background: 'var(--amber)',
            padding: '10px 28px',
            borderRadius: 'var(--r-sm)',
            textDecoration: 'none',
          }}
        >
          Get Started — It's Free
        </a>
      </section>

      {/* Features */}
      <section style={{ padding: '40px 24px 80px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 24,
        }}>
          {features.map((f) => (
            <div
              key={f.title}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-lg)',
                padding: 24,
              }}
            >
              <f.icon size={20} style={{ color: 'var(--amber)', marginBottom: 12 }} />
              <h3 style={{ fontSize: 15, fontWeight: 500, marginBottom: 8, color: 'var(--text)' }}>
                {f.title}
              </h3>
              <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-mid)' }}>
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </PublicPageShell>
  );
}
