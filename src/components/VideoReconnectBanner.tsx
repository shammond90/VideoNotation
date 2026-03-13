/**
 * VideoReconnectBanner — replaces the video player area when a stored handle
 * exists but the video isn't loaded yet (needs permission, file moved, etc.).
 *
 * Four visual states:
 *  - 'prompt'  → "Click to reconnect your video" (needs user gesture for permission)
 *  - 'denied'  → "Permission denied" — offer to re-prompt or pick a different file
 *  - 'broken'  → "File not found" — offer to relink or load different video
 *  - 'loading' → Resolving handle…
 */
import { Film, RefreshCw, FolderOpen, AlertTriangle, Upload } from 'lucide-react';

export type BannerState = 'prompt' | 'denied' | 'broken' | 'loading';

interface VideoReconnectBannerProps {
  bannerState: BannerState;
  videoFilename: string | null;
  /** Request permission on the existing handle */
  onRequestAccess: () => void;
  /** Re-link: pick the same/different file via FSAA or file input */
  onRelinkVideo: () => void;
  /** Load a completely different video (clears old handle) */
  onLoadDifferentVideo: () => void;
  /** Continue without a video */
  onContinueWithoutVideo: () => void;
}

export function VideoReconnectBanner({
  bannerState,
  videoFilename,
  onRequestAccess,
  onRelinkVideo,
  onLoadDifferentVideo,
  onContinueWithoutVideo,
}: VideoReconnectBannerProps) {
  return (
    <div
      className="w-full flex flex-col items-center justify-center min-h-[300px]"
      style={{ background: 'linear-gradient(135deg, #0f0f12 0%, #141418 100%)' }}
    >
      {bannerState === 'loading' && (
        <div className="text-center">
          <RefreshCw
            className="w-8 h-8 animate-spin mx-auto mb-3"
            style={{ color: 'var(--text-dim)' }}
          />
          <p className="font-mono text-sm" style={{ color: 'var(--text-dim)' }}>
            Reconnecting video…
          </p>
        </div>
      )}

      {bannerState === 'prompt' && (
        <div className="text-center max-w-sm">
          <Film className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--amber)' }} />
          <p className="font-mono text-sm mb-1" style={{ color: 'var(--text)' }}>
            Video ready to reconnect
          </p>
          {videoFilename && (
            <p
              className="font-mono text-xs mb-4 truncate max-w-[280px] mx-auto"
              style={{ color: 'var(--text-dim)' }}
              title={videoFilename}
            >
              {videoFilename}
            </p>
          )}
          <button
            type="button"
            onClick={onRequestAccess}
            className="px-5 py-2.5 text-sm font-medium rounded-lg transition-colors"
            style={{ background: 'var(--amber)', color: 'var(--text-inv)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--amber-hi)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--amber)';
            }}
          >
            Click to Reconnect Video
          </button>
          <div className="mt-4">
            <button
              type="button"
              onClick={onContinueWithoutVideo}
              className="text-xs font-mono underline"
              style={{ color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Continue without video
            </button>
          </div>
        </div>
      )}

      {bannerState === 'denied' && (
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--amber)' }} />
          <p className="font-mono text-sm mb-1" style={{ color: 'var(--text)' }}>
            File access denied
          </p>
          <p className="font-mono text-xs mb-4" style={{ color: 'var(--text-dim)' }}>
            Browser permission was denied for this file.
          </p>
          <div className="flex flex-col gap-2 items-center">
            <button
              type="button"
              onClick={onRequestAccess}
              className="px-4 py-2 text-sm rounded-lg transition-colors w-56"
              style={{ background: 'var(--amber)', color: 'var(--text-inv)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--amber-hi)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--amber)';
              }}
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={onLoadDifferentVideo}
              className="px-4 py-2 text-sm rounded-lg transition-colors w-56"
              style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)', border: '1px solid var(--border)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-panel)';
              }}
            >
              Load Different Video
            </button>
          </div>
        </div>
      )}

      {bannerState === 'broken' && (
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: '#ef4444' }} />
          <p className="font-mono text-sm mb-1" style={{ color: 'var(--text)' }}>
            File not found
          </p>
          {videoFilename && (
            <p
              className="font-mono text-xs mb-1 truncate max-w-[280px] mx-auto"
              style={{ color: 'var(--text-dim)' }}
              title={videoFilename}
            >
              {videoFilename}
            </p>
          )}
          <p className="font-mono text-xs mb-4" style={{ color: 'var(--text-dim)' }}>
            The video file may have been moved or deleted.
          </p>
          <div className="flex flex-col gap-2 items-center">
            <button
              type="button"
              onClick={onRelinkVideo}
              className="flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors w-56"
              style={{ background: 'var(--amber)', color: 'var(--text-inv)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--amber-hi)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--amber)';
              }}
            >
              <FolderOpen className="w-4 h-4" />
              Relink File
            </button>
            <button
              type="button"
              onClick={onLoadDifferentVideo}
              className="flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors w-56"
              style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)', border: '1px solid var(--border)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-panel)';
              }}
            >
              <Upload className="w-4 h-4" />
              Load Different Video
            </button>
          </div>
          <div className="mt-4">
            <button
              type="button"
              onClick={onContinueWithoutVideo}
              className="text-xs font-mono underline"
              style={{ color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Continue without video
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
