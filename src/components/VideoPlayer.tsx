import { forwardRef, useCallback, useRef, useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  Loader2,
} from 'lucide-react';
import { formatTime } from '../utils/formatTime';
import type { VideoPlayerState, VideoPlayerActions, LoopRegion } from '../hooks/useVideoPlayer';

export interface ScrubberTitleMarker {
  timestamp: number;
  name: string;
}
export interface ScrubberSceneMarker {
  timestamp: number;
  name: string;
  color: string;
}
export interface ScrubberSceneBand {
  startTime: number;
  endTime: number;
  color: string;
  name: string;
}

interface VideoPlayerProps {
  src: string;
  state: VideoPlayerState;
  actions: VideoPlayerActions;
  onVideoError: () => void;
  loopRegion?: LoopRegion | null;
  showVideoTimecode?: boolean;
  videoTimecodePosition?: { x: number; y: number };
  onVideoTimecodePositionChange?: (pos: { x: number; y: number }) => void;
  titleMarkers?: ScrubberTitleMarker[];
  sceneMarkers?: ScrubberSceneMarker[];
  sceneBands?: ScrubberSceneBand[];
}

const SPEEDS = [1, 1.5, 2, 4, 8];

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  ({ src, state, actions, onVideoError, loopRegion, showVideoTimecode, videoTimecodePosition, onVideoTimecodePositionChange, titleMarkers, sceneMarkers, sceneBands }, ref) => {
    const progressRef = useRef<HTMLDivElement>(null);
    const videoContainerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    // ── Timecode overlay drag state ──
    const [isOverlayDragging, setIsOverlayDragging] = useState(false);
    const overlayDragStart = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);

    const seekToPosition = useCallback(
      (clientX: number) => {
        const rect = progressRef.current?.getBoundingClientRect();
        if (!rect || !state.duration) return;
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const ratio = x / rect.width;
        const target = ratio * state.duration;
        actions.seek(target);
      },
      [actions, state.duration],
    );

    const handleProgressMouseDown = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
        seekToPosition(e.clientX);
      },
      [seekToPosition],
    );

    // Drag handling via document events
    useEffect(() => {
      if (!isDragging) return;
      const handleMouseMove = (e: MouseEvent) => {
        e.preventDefault();
        seekToPosition(e.clientX);
      };
      const handleMouseUp = () => setIsDragging(false);
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }, [isDragging, seekToPosition]);

    // ── Timecode overlay drag handling ──
    const handleOverlayMouseDown = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = videoTimecodePosition ?? { x: 2, y: 4 };
      setIsOverlayDragging(true);
      overlayDragStart.current = { mouseX: e.clientX, mouseY: e.clientY, startX: pos.x, startY: pos.y };
    }, [videoTimecodePosition]);

    useEffect(() => {
      if (!isOverlayDragging) return;
      const handleMouseMove = (e: MouseEvent) => {
        e.preventDefault();
        const container = videoContainerRef.current;
        if (!container || !overlayDragStart.current) return;
        const rect = container.getBoundingClientRect();
        const dx = ((e.clientX - overlayDragStart.current.mouseX) / rect.width) * 100;
        const dy = ((e.clientY - overlayDragStart.current.mouseY) / rect.height) * 100;
        const newX = Math.max(0, Math.min(90, overlayDragStart.current.startX + dx));
        const newY = Math.max(0, Math.min(90, overlayDragStart.current.startY + dy));
        onVideoTimecodePositionChange?.({ x: newX, y: newY });
      };
      const handleMouseUp = () => {
        setIsOverlayDragging(false);
        overlayDragStart.current = null;
      };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }, [isOverlayDragging, onVideoTimecodePositionChange]);

    const handleVolumeChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        actions.setVolume(parseFloat(e.target.value));
      },
      [actions],
    );

    return (
      <div className="flex flex-col bg-black rounded-lg overflow-hidden shrink min-h-0">
        {/* Loading progress bar */}
        {!state.isReady && state.loadProgress > 0 && (
          <div className="h-1 w-full" style={{ background: 'var(--bg-raised)' }}>
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${state.loadProgress}%`, background: 'var(--amber)' }}
            />
          </div>
        )}

        {/* Video element */}
        <div ref={videoContainerRef} className="relative cursor-pointer" onClick={actions.togglePlay}>
          <video
            ref={ref}
            src={src}
            className="w-full bg-black max-h-[50vh] lg:max-h-[calc(100vh-16rem)] object-contain"
            onError={onVideoError}
            playsInline
            preload="auto"
          />

          {/* Timecode overlay */}
          {showVideoTimecode && (
            <div
              className={`absolute select-none font-mono text-white bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded text-sm leading-none shadow-lg border border-white/10 ${isOverlayDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
              style={{
                left: `${videoTimecodePosition?.x ?? 2}%`,
                top: `${videoTimecodePosition?.y ?? 4}%`,
                zIndex: 20,
              }}
              onMouseDown={handleOverlayMouseDown}
              onClick={(e) => e.stopPropagation()}
              title="Drag to reposition"
            >
              {formatTime(state.currentTime)}
            </div>
          )}

          {/* Loading spinner overlay */}
          {state.isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 pointer-events-none">
              <Loader2 className="w-12 h-12 text-white animate-spin" />
              <p className="text-white/70 text-sm mt-3">
                {state.isReady ? 'Buffering...' : 'Loading video...'}
              </p>
              {!state.isReady && state.loadProgress > 0 && (
                <p className="text-white/50 text-xs mt-1">{state.loadProgress}%</p>
              )}
            </div>
          )}

          {/* Center play button overlay when paused and ready */}
          {!state.isPlaying && !state.isLoading && state.isReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
              <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Play className="w-8 h-8 text-white ml-1" fill="white" />
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="px-3 py-2 space-y-2" style={{ background: 'var(--bg-raised)' }}>
          {/* Progress bar */}
          <div
            ref={progressRef}
            className={`relative rounded-full cursor-pointer group ${isDragging ? 'h-3' : 'h-2'}`}
            style={{ background: 'var(--bg-panel)' }}
            onMouseDown={handleProgressMouseDown}
          >
            {/* Buffered */}
            <div
              className="absolute top-0 left-0 h-full rounded-full"
              style={{ width: `${state.duration ? (state.buffered / state.duration) * 100 : 0}%`, background: 'var(--bg-hover)' }}
            />
            {/* Loop region overlay */}
            {loopRegion && state.duration > 0 && (
              <div
                className="absolute top-0 h-full"
                style={{
                  background: 'rgba(191,87,0,0.25)',
                  borderLeft: '1px solid rgba(191,87,0,0.6)',
                  borderRight: '1px solid rgba(191,87,0,0.6)',
                  left: `${(loopRegion.toTime / state.duration) * 100}%`,
                  width: `${((loopRegion.fromTime - loopRegion.toTime) / state.duration) * 100}%`,
                }}
                title={`Loop: ${formatTime(loopRegion.toTime)} → ${formatTime(loopRegion.fromTime)}`}
              />
            )}
            {/* Scene bands */}
            {sceneBands && state.duration > 0 && sceneBands.map((band, i) => {
              const start = (band.startTime / state.duration) * 100;
              const end = Math.min(band.endTime, state.duration);
              const width = ((end - band.startTime) / state.duration) * 100;
              return (
                <div
                  key={`band-${i}`}
                  className="absolute top-0 h-full pointer-events-none"
                  style={{
                    left: `${start}%`,
                    width: `${width}%`,
                    background: `${band.color}30`,
                    borderLeft: `2px solid ${band.color}90`,
                  }}
                  title={band.name}
                />
              );
            })}
            {/* Title markers */}
            {titleMarkers && state.duration > 0 && titleMarkers.map((m, i) => (
              <div
                key={`title-${i}`}
                className="absolute top-0 h-full group/marker"
                style={{
                  left: `${(m.timestamp / state.duration) * 100}%`,
                  width: 8,
                  marginLeft: -3,
                  zIndex: 2,
                  pointerEvents: 'auto',
                }}
              >
                <div
                  className="absolute top-0 h-full"
                  style={{
                    left: 3,
                    width: 2,
                    background: '#5c6bc0',
                    opacity: 0.8,
                    pointerEvents: 'none',
                  }}
                />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded text-[10px] whitespace-nowrap opacity-0 group-hover/marker:opacity-100 transition-opacity pointer-events-none"
                  style={{ background: 'var(--bg-card)', color: 'var(--text)', border: '1px solid var(--border)', zIndex: 10 }}
                >
                  {m.name}
                </div>
              </div>
            ))}
            {/* Scene markers */}
            {sceneMarkers && state.duration > 0 && sceneMarkers.map((m, i) => (
              <div
                key={`scene-${i}`}
                className="absolute top-0 h-full group/marker"
                style={{
                  left: `${(m.timestamp / state.duration) * 100}%`,
                  width: 8,
                  marginLeft: -3,
                  zIndex: 2,
                  pointerEvents: 'auto',
                }}
              >
                <div
                  className="absolute top-0 h-full"
                  style={{
                    left: 3,
                    width: 1.5,
                    background: m.color,
                    opacity: 0.7,
                    pointerEvents: 'none',
                  }}
                />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded text-[10px] whitespace-nowrap opacity-0 group-hover/marker:opacity-100 transition-opacity pointer-events-none"
                  style={{ background: 'var(--bg-card)', color: m.color, border: `1px solid ${m.color}40`, zIndex: 10 }}
                >
                  {m.name}
                </div>
              </div>
            ))}
            {/* Progress */}
            <div
              className="absolute top-0 left-0 h-full rounded-full"
              style={{ width: `${state.duration ? (state.currentTime / state.duration) * 100 : 0}%`, background: 'var(--amber)' }}
            />
            {/* Scrubber */}
            <div
              className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full transition-opacity shadow-lg ${isDragging ? 'opacity-100 scale-110' : 'opacity-0 group-hover:opacity-100'}`}
              style={{ background: 'var(--amber)', left: `calc(${state.duration ? (state.currentTime / state.duration) * 100 : 0}% - 8px)` }}
            />
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-between" style={{ color: 'var(--text-mid)' }}>
            <div className="flex items-center gap-2">
              {/* Play/Pause */}
              <button
                type="button"
                onClick={actions.togglePlay}
                className="p-1.5 rounded-md transition-colors"
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
                title={state.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {state.isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>

              {/* Frame step back */}
              <button
                type="button"
                onClick={() => actions.stepFrame(-1)}
                className="p-1.5 rounded-md transition-colors"
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
                title="Previous frame (,)"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              {/* Frame step forward */}
              <button
                type="button"
                onClick={() => actions.stepFrame(1)}
                className="p-1.5 rounded-md transition-colors"
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
                title="Next frame (.)"
              >
                <SkipForward className="w-4 h-4" />
              </button>

              {/* Time display */}
              <span className="text-sm font-mono ml-2" style={{ color: 'var(--text-mid)' }}>
                {formatTime(state.currentTime)} / {formatTime(state.duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Speed selector */}
              <select
                value={state.playbackRate}
                onChange={(e) => actions.setSpeed(parseFloat(e.target.value))}
                className="text-xs rounded px-2 py-1 border-none outline-none cursor-pointer"
                style={{ background: 'var(--bg-input)', color: 'var(--text-mid)' }}
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}x
                  </option>
                ))}
              </select>

              {/* Volume */}
              <button
                type="button"
                onClick={actions.toggleMute}
                className="p-1.5 rounded-md transition-colors"
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                {state.isMuted || state.volume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={state.isMuted ? 0 : state.volume}
                onChange={handleVolumeChange}
                className="w-20 h-1 cursor-pointer"
                style={{ accentColor: 'var(--amber)' }}
              />

              {/* Fullscreen */}
              <button
                type="button"
                onClick={actions.toggleFullscreen}
                className="p-1.5 rounded-md transition-colors"
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                {state.isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

VideoPlayer.displayName = 'VideoPlayer';
