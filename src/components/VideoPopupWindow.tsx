/**
 * VideoPopupWindow — purpose-built video-only view for dual-window mode.
 *
 * Rendered at /video-window in a popup opened by the main window.
 * Contains: video element (fills window), draggable timecode overlay,
 * auto-hiding controls bar, and BroadcastChannel sync.
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, Sun } from 'lucide-react';
import { useBroadcastSync, type SyncMessage } from '../hooks/useBroadcastSync';
import { loadVideoHandle } from '../utils/videoHandleStorage';
import { formatTime } from '../utils/formatTime';

// Chromium-specific extensions
interface ChromiumFileSystemFileHandle extends FileSystemFileHandle {
  requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const CONTROLS_HIDE_DELAY = 3000;

export function VideoPopupWindow() {
  // ── State ──
  const [status, setStatus] = useState<'loading' | 'prompt' | 'playing' | 'error'>('loading');
  const [videoSrc, setVideoSrc] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [videoFilename, setVideoFilename] = useState<string | null>(null);
  const [mainWindowClosed, setMainWindowClosed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTimecode, setShowTimecode] = useState(false);
  const [brightness, setBrightness] = useState(1.0);
  const [showBrightness, setShowBrightness] = useState(false);

  // Theme state — read from localStorage initially, then sync via BroadcastChannel
  const [theme, setTheme] = useState<string>(() => {
    try { return localStorage.getItem('cuetation-theme') || 'standard'; } catch { return 'standard'; }
  });

  // Draggable timecode position
  const [tcPos, setTcPos] = useState({ x: 16, y: -1 }); // y=-1 means "bottom-left default"
  const tcDragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const tcOverlayRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const handleRef = useRef<FileSystemFileHandle | null>(null);

  // ── BroadcastChannel ──
  const onMessage = useCallback((msg: SyncMessage) => {
    const video = videoRef.current;
    switch (msg.type) {
      case 'CMD_PLAY':
        video?.play().catch(() => {});
        break;
      case 'CMD_PAUSE':
        video?.pause();
        break;
      case 'CMD_TOGGLE_PLAY':
        if (video) {
          if (video.paused) video.play().catch(() => {});
          else video.pause();
        }
        break;
      case 'CMD_SEEK':
        if (video) {
          video.currentTime = Math.max(0, Math.min(msg.seconds, video.duration || 0));
        }
        break;
      case 'CMD_SPEED':
        if (video) {
          video.playbackRate = msg.speed;
          setSpeed(msg.speed);
        }
        break;
      case 'CMD_LOAD_VIDEO':
        setProjectId(msg.projectId);
        break;
      case 'CONFIG_SHOW_TIMECODE':
        setShowTimecode(msg.show);
        break;
      case 'CONFIG_THEME':
        setTheme(msg.theme);
        try { localStorage.setItem('cuetation-theme', msg.theme); } catch {}
        break;
      case 'CMD_BRIGHTNESS':
        setBrightness(msg.brightness);
        break;
    }
  }, []);

  const { send } = useBroadcastSync(onMessage);

  // Detect main window loss: listen for channel errors / periodic heartbeat
  useEffect(() => {
    // We detect main window close by periodically checking if the opener is gone
    const interval = setInterval(() => {
      if (window.opener && (window.opener as Window).closed) {
        setMainWindowClosed(true);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // On mount: read projectId and showTimecode from URL search params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get('projectId');
    if (pid) setProjectId(pid);
    setShowTimecode(params.get('showTimecode') === '1');
  }, []);

  // When projectId is set, attempt to load the stored handle
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    (async () => {
      try {
        const handle = await loadVideoHandle(projectId);
        if (cancelled) return;
        if (!handle) {
          setStatus('error');
          return;
        }
        handleRef.current = handle;
        setStatus('prompt');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => { cancelled = true; };
  }, [projectId]);

  // ── Load video after user gesture ──
  const handleLoadClick = useCallback(async () => {
    const handle = handleRef.current;
    if (!handle) return;

    try {
      const perm = await (handle as ChromiumFileSystemFileHandle).requestPermission({ mode: 'read' });
      if (perm === 'granted') {
        const file = await handle.getFile();
        setVideoFilename(file.name);
        const url = URL.createObjectURL(file);
        setVideoSrc(url);
        setStatus('playing');
        // Tell main window we're ready
        send({ type: 'POPUP_READY' });
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }, [send]);

  // ── Video event listeners ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    const onPlay = () => {
      setIsPlaying(true);
      send({ type: 'PLAYBACK_STATE', playing: true });
    };
    const onPause = () => {
      setIsPlaying(false);
      send({ type: 'PLAYBACK_STATE', playing: false });
    };
    const onLoadedMetadata = () => {
      setDuration(video.duration);
    };
    const onTimeUpdate = () => {
      // We use rAF for smoother updates, but timeupdate drives the broadcast
      send({ type: 'TIMECODE_UPDATE', seconds: video.currentTime });
    };
    const onVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };
    const onRateChange = () => {
      setSpeed(video.playbackRate);
      send({ type: 'PLAYBACK_SPEED', speed: video.playbackRate });
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('ratechange', onRateChange);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('volumechange', onVolumeChange);
      video.removeEventListener('ratechange', onRateChange);
    };
  }, [videoSrc, send]);

  // Smooth time update via rAF
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    const tick = () => {
      if (!video.paused) {
        setCurrentTime(video.currentTime);
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };

    const onPlay = () => { animFrameRef.current = requestAnimationFrame(tick); };
    const onPause = () => { cancelAnimationFrame(animFrameRef.current); setCurrentTime(video.currentTime); };
    const onSeeked = () => { setCurrentTime(video.currentTime); };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onSeeked);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onSeeked);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [videoSrc]);

  // ── Prevent spacebar on video element (avoid double-play) ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const prevent = (e: KeyboardEvent) => {
      if (e.code === 'Space') e.preventDefault();
    };
    video.addEventListener('keydown', prevent);
    return () => video.removeEventListener('keydown', prevent);
  }, [videoSrc]);

  // ── Controls auto-hide ──
  // Pure React state + inline styles. All logic inlined in one stable effect.
  // The timer ref survives re-renders. setState is stable. videoRef is stable.
  // This effect runs ONCE per videoSrc. No callback deps to go stale.
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    const clearTimer = () => {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = 0;
      }
    };

    const show = () => {
      clearTimer();
      setControlsVisible(true);
    };

    const scheduleHide = () => {
      clearTimer();
      hideTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, CONTROLS_HIDE_DELAY);
    };

    const onPlay = () => {
      show();
      scheduleHide();
    };

    const onPause = () => {
      show();
    };

    let lastMoveTime = 0;
    const onMouseActivity = () => {
      const now = Date.now();
      if (now - lastMoveTime < 80) return;
      lastMoveTime = now;
      show();
      if (!video.paused) {
        scheduleHide();
      }
    };

    // Listen on the video element for play/pause
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);

    // Listen on BOTH document and the container for mouse activity.
    // document-level ensures events reach us even in fullscreen top layer.
    // container-level is a belt-and-suspenders fallback.
    const container = containerRef.current;
    document.addEventListener('mousemove', onMouseActivity, true);
    document.addEventListener('mousedown', onMouseActivity, true);
    document.addEventListener('touchstart', onMouseActivity, true);
    container?.addEventListener('mousemove', onMouseActivity);
    container?.addEventListener('mousedown', onMouseActivity);

    // Also re-show controls on any fullscreenchange event
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      show();
      if (!video.paused) {
        scheduleHide();
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);

    // Set initial state
    if (video.paused) {
      show();
    } else {
      show();
      scheduleHide();
    }

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      document.removeEventListener('mousemove', onMouseActivity, true);
      document.removeEventListener('mousedown', onMouseActivity, true);
      document.removeEventListener('touchstart', onMouseActivity, true);
      container?.removeEventListener('mousemove', onMouseActivity);
      container?.removeEventListener('mousedown', onMouseActivity);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      clearTimer();
    };
  }, [videoSrc]);

  // ── Popup close: notify main window ──
  useEffect(() => {
    const onBeforeUnload = () => {
      send({ type: 'POPUP_CLOSING' });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [send]);

  // ── Controls actions ──
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressRef.current;
    const video = videoRef.current;
    if (!bar || !video) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = ratio * video.duration;
  }, []);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const v = parseFloat(e.target.value);
    video.volume = v;
    if (v > 0) video.muted = false;
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) video.muted = !video.muted;
  }, []);

  const cycleSpeed = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const idx = SPEEDS.indexOf(speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    video.playbackRate = next;
  }, [speed]);

  // ── Fullscreen toggle ──
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  // Track fullscreenchange is now handled inside the auto-hide effect above

  // ── Draggable timecode (clamped to video edges, not container) ──
  // With object-contain the video may be letterboxed. Compute the actual
  // rendered video rect so the timecode stays within the visible picture.
  const getVideoBounds = useCallback(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return { left: 0, top: 0, right: container?.clientWidth ?? 0, bottom: container?.clientHeight ?? 0 };
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const vw = video.videoWidth || cw;
    const vh = video.videoHeight || ch;
    const scale = Math.min(cw / vw, ch / vh);
    const rw = vw * scale;
    const rh = vh * scale;
    return {
      left: (cw - rw) / 2,
      top: (ch - rh) / 2,
      right: (cw + rw) / 2,
      bottom: (ch + rh) / 2,
    };
  }, []);

  const handleTcMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    const container = containerRef.current;
    if (!container) return;
    const resolvedY = tcPos.y === -1 ? container.clientHeight - 60 : tcPos.y;
    tcDragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: tcPos.x, startPosY: resolvedY };

    const onMove = (ev: MouseEvent) => {
      ev.stopImmediatePropagation();
      if (!tcDragRef.current) return;
      const dx = ev.clientX - tcDragRef.current.startX;
      const dy = ev.clientY - tcDragRef.current.startY;
      const bounds = getVideoBounds();
      const overlay = tcOverlayRef.current;
      const ow = overlay?.offsetWidth ?? 160;
      const oh = overlay?.offsetHeight ?? 32;
      setTcPos({
        x: Math.max(bounds.left, Math.min(bounds.right - ow, tcDragRef.current.startPosX + dx)),
        y: Math.max(bounds.top, Math.min(bounds.bottom - oh, tcDragRef.current.startPosY + dy)),
      });
    };
    const onUp = (ev: MouseEvent) => {
      ev.stopImmediatePropagation();
      tcDragRef.current = null;
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
    };
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onUp, true);
  }, [tcPos, getVideoBounds]);

  // Clean up object URL
  useEffect(() => {
    return () => {
      if (videoSrc) URL.revokeObjectURL(videoSrc);
    };
  }, [videoSrc]);

  // ── Progress scrubbing with drag ──
  const scrubbing = useRef(false);
  const handleProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    scrubbing.current = true;
    handleSeek(e);

    const onMove = (ev: MouseEvent) => {
      if (!scrubbing.current) return;
      const bar = progressRef.current;
      const video = videoRef.current;
      if (!bar || !video) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const newTime = ratio * video.duration;
      video.currentTime = newTime;
      // Update state immediately during drag for responsive UI
      setCurrentTime(newTime);
      // Broadcast timecode update during scrubbing
      send({ type: 'TIMECODE_UPDATE', seconds: newTime });
    };
    const onUp = () => {
      scrubbing.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [handleSeek, send]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const themeClass = theme && theme !== 'standard' ? `theme-${theme}` : '';

  // ── Render: Loading ──
  if (status === 'loading') {
    return (
      <div className={`h-screen w-screen flex items-center justify-center ${themeClass}`} style={{ background: 'var(--bg)', color: 'var(--text-dim)' }}>
        <span className="font-mono text-sm tracking-widest uppercase animate-pulse">Loading…</span>
      </div>
    );
  }

  // ── Render: User gesture prompt ──
  if (status === 'prompt') {
    return (
      <div className={`h-screen w-screen flex flex-col items-center justify-center gap-6 ${themeClass}`} style={{ background: 'var(--bg)' }}>
        <div className="text-center">
          <p className="text-sm mb-2" style={{ color: 'var(--text-mid)' }}>
            The video needs permission to load in this window.
          </p>
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
            This is a one-time browser security requirement.
          </p>
        </div>
        <button
          type="button"
          onClick={handleLoadClick}
          className="px-10 py-5 rounded-xl text-lg font-semibold transition-all"
          style={{
            background: 'var(--amber)',
            color: 'var(--text-inv)',
            border: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--amber-hi)'; e.currentTarget.style.transform = 'scale(1.03)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--amber)'; e.currentTarget.style.transform = ''; }}
        >
          ▶ Click to load video
        </button>
      </div>
    );
  }

  // ── Render: Error ──
  if (status === 'error') {
    return (
      <div className={`h-screen w-screen flex flex-col items-center justify-center gap-4 ${themeClass}`} style={{ background: 'var(--bg)' }}>
        <p className="text-sm" style={{ color: 'var(--red)' }}>
          Could not load video. The file may have been moved or access was denied.
        </p>
        <button
          type="button"
          onClick={() => { setStatus('prompt'); }}
          className="px-6 py-3 rounded-lg text-sm font-medium"
          style={{ background: 'var(--bg-panel)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}
        >
          Try again
        </button>
      </div>
    );
  }

  // ── Render: Playing ──
  return (
    <div
      ref={containerRef}
      className={`h-screen w-screen relative select-none ${themeClass}`}
      style={{ background: '#000', cursor: controlsVisible ? 'default' : 'none' }}
    >

      {/* Video fills window */}
      <video
        ref={videoRef}
        src={videoSrc}
        className="absolute inset-0 w-full h-full object-contain"
        autoPlay
        onClick={togglePlay}
        style={brightness !== 1.0 ? { filter: `brightness(${brightness})` } : undefined}
      />

      {/* Timecode overlay — visible when showTimecode enabled, draggable */}
      {showTimecode && (
      <div
        ref={tcOverlayRef}
        className="absolute z-30 px-3 py-1.5 rounded-md cursor-move select-none"
        style={{
          left: tcPos.x,
          top: tcPos.y === -1 ? undefined : tcPos.y,
          bottom: tcPos.y === -1 ? 60 : undefined,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--amber)',
          letterSpacing: '0.04em',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
        onMouseDown={handleTcMouseDown}
      >
        {formatTime(currentTime)}
      </div>
      )}

      {/* Main-window-closed notice */}
      {mainWindowClosed && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-lg text-xs"
          style={{ background: 'rgba(0,0,0,0.8)', color: 'var(--yellow)', border: '1px solid var(--yellow-dim)' }}
        >
          Main window closed. Playback will continue but sync is lost.
        </div>
      )}

      {/* Controls bar — auto-hides after 3s (React state + inline styles) */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20"
        style={{
          background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
          padding: '24px 16px 12px',
          opacity: controlsVisible ? 1 : 0,
          pointerEvents: controlsVisible ? 'auto' : 'none',
          transition: 'opacity 0.2s ease',
        }}
      >
        {/* Seek bar */}
        <div
          ref={progressRef}
          className="w-full h-2 rounded-full cursor-pointer mb-3 group relative"
          style={{ background: 'rgba(255,255,255,0.15)' }}
          onMouseDown={handleProgressMouseDown}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${progress}%`, background: 'var(--amber)' }}
          />
          {/* Scrub handle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2"
            style={{
              left: `calc(${progress}% - 8px)`,
              background: 'white',
              borderColor: 'var(--amber)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
            }}
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-4">
          {/* Play / Pause */}
          <button
            type="button"
            onClick={togglePlay}
            className="w-9 h-9 flex items-center justify-center rounded-full transition-colors"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>

          {/* Timecode readout */}
          <span className="font-mono text-sm tabular-nums" style={{ color: 'rgba(255,255,255,0.8)', minWidth: 100 }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Brightness */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowBrightness(prev => !prev)}
              onDoubleClick={() => { setBrightness(1.0); setShowBrightness(false); send({ type: 'CMD_BRIGHTNESS', brightness: 1.0 }); }}
              className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
              style={{ background: 'transparent', color: brightness !== 1.0 ? 'var(--amber)' : 'rgba(255,255,255,0.7)', border: 'none', cursor: 'pointer' }}
              title={`Brightness ${Math.round(brightness * 100)}% — double-click to reset`}
            >
              <Sun className="w-4 h-4" />
            </button>
            {showBrightness && (
              <input
                type="range"
                min={0.2}
                max={1.8}
                step={0.05}
                value={brightness}
                onChange={(e) => { const v = parseFloat(e.target.value); setBrightness(v); send({ type: 'CMD_BRIGHTNESS', brightness: v }); }}
                className="w-20 accent-amber-500"
                style={{ cursor: 'pointer' }}
              />
            )}
          </div>

          {/* Speed selector */}
          <button
            type="button"
            onClick={cycleSpeed}
            className="px-2.5 py-1 text-xs font-mono rounded transition-colors"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
            title="Playback speed"
          >
            {speed}×
          </button>

          {/* Volume */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
              style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', border: 'none', cursor: 'pointer' }}
            >
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-20 accent-amber-500"
              style={{ cursor: 'pointer' }}
            />
          </div>

          {/* Fullscreen */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="w-9 h-9 flex items-center justify-center rounded-full transition-colors"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
            title={isFullscreen ? 'Exit full screen' : 'Full screen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Filename */}
        {videoFilename && (
          <div className="mt-1.5 text-center">
            <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>{videoFilename}</span>
          </div>
        )}
      </div>
    </div>
  );
}
