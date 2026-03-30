import { useEffect } from 'react';
import { UserButton } from '@clerk/clerk-react';
import { Cloud, CloudOff, Loader2, Check, RefreshCw } from 'lucide-react';
import type { Project } from '../types/index';
import { useProject } from '../hooks/useProject';
import type { CloudSaveStatus } from '../hooks/useCloudSync';

interface HomeScreenProps {
  onProjectSelected: (projectId: string) => void;
  onCreateProject: () => void;
  onImportProject: () => void;
  isRestoring?: boolean;
  cloudSaveStatus?: CloudSaveStatus;
}

/**
 * Home screen — project list matching the Cuetation design system.
 */
export function HomeScreen({
  onProjectSelected,
  onCreateProject,
  onImportProject,
  isRestoring = false,
  cloudSaveStatus = 'idle',
}: HomeScreenProps) {
  const { projects, isLoading, error, loadAllProjects } = useProject();

  // Reload projects on mount and after cloud restore finishes
  useEffect(() => {
    loadAllProjects();
  }, [loadAllProjects, isRestoring]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg)', color: 'var(--text-mid)' }}>
        <span className="font-mono text-sm tracking-widest uppercase opacity-60">Loadingâ€¦</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg)', color: 'var(--text-mid)' }}>
        <div className="text-center">
          <p style={{ color: 'var(--red)' }} className="mb-2 text-sm">Error loading projects</p>
          <p className="font-mono text-xs" style={{ color: 'var(--text-dim)' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Top bar — matches cue-sheet header */}
      <header style={{
        height: 44,
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        flexShrink: 0,
      }}>
        <div className="font-display" style={{
          fontSize: 17,
          color: 'var(--text)',
          letterSpacing: '-0.01em',
          display: 'flex',
          alignItems: 'center',
        }}>
          Cue<em style={{ fontStyle: 'italic', color: 'var(--amber)' }}>tation</em>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <HomeCloudIndicator cloudSaveStatus={cloudSaveStatus} projects={projects} />
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      {/* Page header */}
      <div className="flex items-flex-end justify-between" style={{ padding: '24px 40px 0' }}>
        <div>
          <h1 className="font-display" style={{ fontSize: 28, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            Your productions
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onImportProject}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              color: 'var(--text-mid)',
              border: '1px solid var(--border-hi)',
              borderRadius: 'var(--r-sm)',
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--text-dim)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-hi)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-mid)'; }}
          >
            Import
          </button>
          <button
            onClick={onCreateProject}
            style={{
              padding: '8px 16px',
              background: 'var(--amber)',
              color: 'var(--text-inv)',
              border: 'none',
              borderRadius: 'var(--r-sm)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--amber-hi)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px var(--amber-glow)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--amber)'; (e.currentTarget as HTMLButtonElement).style.transform = ''; (e.currentTarget as HTMLButtonElement).style.boxShadow = ''; }}
          >
            + New Project
          </button>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border)', margin: '24px 40px 0' }} />

      {/* Sort bar */}
      <div className="font-mono" style={{ padding: '14px 40px', fontSize: 12, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 8 }}>
        {projects.length} project{projects.length !== 1 ? 's' : ''}
        {isRestoring && (
          <span style={{ color: 'var(--amber)', fontSize: 11 }}>· Restoring from cloud…</span>
        )}
      </div>

      {/* Empty state */}
      {projects.length === 0 && (
        <div className="flex flex-col items-center justify-center" style={{ padding: '80px 40px', color: 'var(--text-dim)' }}>
          <p className="font-mono text-center" style={{ fontSize: 12, letterSpacing: '0.05em', marginBottom: 24 }}>
            No projects yet. Create your first production.
          </p>
          <button
            onClick={onCreateProject}
            style={{
              padding: '10px 20px',
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
            + New Project
          </button>
        </div>
      )}

      {/* Projects grid */}
      {projects.length > 0 && (
        <div style={{
          padding: '0 40px 40px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
        }}>
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onSelect={() => onProjectSelected(project.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Individual project card.
 */
function ProjectCard({ project, onSelect }: { project: Project; onSelect: () => void }) {
  const lastModified = formatRelativeTime(project.updated_at);
  const prodLine = [project.production_name, project.venue, project.year].filter(Boolean).join(' \u00B7 ');

  return (
    <div
      onClick={onSelect}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        padding: 20,
        cursor: 'pointer',
        transition: 'all 0.2s',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = 'var(--border-hi)';
        el.style.background = 'var(--bg-hover)';
        el.style.transform = 'translateY(-1px)';
        el.style.boxShadow = 'var(--shadow-md)';
        const bar = el.querySelector('.card-top-bar') as HTMLDivElement | null;
        if (bar) bar.style.opacity = '1';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = 'var(--border)';
        el.style.background = 'var(--bg-card)';
        el.style.transform = '';
        el.style.boxShadow = '';
        const bar = el.querySelector('.card-top-bar') as HTMLDivElement | null;
        if (bar) bar.style.opacity = '0';
      }}
    >
      {/* Amber top accent bar on hover */}
      <div
        className="card-top-bar"
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 2,
          background: 'var(--amber)',
          opacity: 0,
          transition: 'opacity 0.2s',
        }}
      />

      {/* Card header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          {project.name}
        </div>
        {prodLine ? (
          <div style={{ fontSize: 11, color: 'var(--text-mid)', marginTop: 2 }}>{prodLine}</div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, fontStyle: 'italic' }}>No production details</div>
        )}
      </div>

      {/* Meta */}
      <div style={{
        paddingTop: 12,
        borderTop: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
      }}>
        <div className="flex items-center justify-between">
          <span className="font-mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            Modified <span style={{ color: 'var(--text-mid)' }}>{lastModified}</span>
          </span>
          <SyncBadge project={project} />
        </div>
        <div className="font-mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
          {project.video_filename ? (
            <span>{'\uD83D\uDCF9'} <span style={{ color: 'var(--text-mid)' }}>{truncate(project.video_filename, 36)}</span></span>
          ) : (
            <span style={{ fontStyle: 'italic' }}>No video assigned</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Sync state badge for a project card.
 */
function SyncBadge({ project }: { project: Project }) {
  if (project.sync_deferred) {
    return (
      <span title="Sync deferred — conflict unresolved" style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--red)' }}>
        <CloudOff className="w-3 h-3" />
        <span className="font-mono" style={{ fontSize: 9 }}>Deferred</span>
      </span>
    );
  }
  if (project.local_base_version === 0) {
    return (
      <span title="Local only — not yet synced" style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--text-dim)' }}>
        <span className="font-mono" style={{ fontSize: 9 }}>Local</span>
      </span>
    );
  }
  if (project.has_local_changes) {
    return (
      <span title="Local changes not yet synced" style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--amber)' }}>
        <RefreshCw className="w-3 h-3" />
        <span className="font-mono" style={{ fontSize: 9 }}>Unsynced</span>
      </span>
    );
  }
  return (
    <span title="Synced with cloud" style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--green, #22c55e)' }}>
      <Cloud className="w-3 h-3" />
      <span className="font-mono" style={{ fontSize: 9 }}>Synced</span>
    </span>
  );
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
}

/**
 * Global cloud indicator for the HomeScreen top bar.
 * Green = all synced, Yellow = some projects have unsynced changes, Red = error or deferred.
 */
function HomeCloudIndicator({ cloudSaveStatus, projects }: { cloudSaveStatus: CloudSaveStatus; projects: Project[] }) {
  const hasDeferred = projects.some(p => p.sync_deferred);
  const hasUnsynced = projects.some(p => p.has_local_changes && !p.sync_deferred);

  // Transient states override static badges
  if (cloudSaveStatus === 'saving') {
    return (
      <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }} title="Syncing…">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }
  if (cloudSaveStatus === 'saved') {
    return (
      <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green, #22c55e)' }} title="Saved to cloud">
        <Check className="w-4 h-4" />
      </div>
    );
  }
  if (cloudSaveStatus === 'error' || hasDeferred) {
    return (
      <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red)' }}
        title={hasDeferred ? 'Sync blocked — unresolved conflict' : 'Cloud sync error'}>
        <CloudOff className="w-4 h-4" />
      </div>
    );
  }
  if (hasUnsynced) {
    return (
      <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--yellow, #eab308)' }} title="Some projects have unsynced changes">
        <Cloud className="w-4 h-4" />
      </div>
    );
  }
  return (
    <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green, #22c55e)' }} title="All projects synced">
      <Cloud className="w-4 h-4" />
    </div>
  );
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
