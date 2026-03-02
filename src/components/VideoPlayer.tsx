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
import type { VideoPlayerState, VideoPlayerActions } from '../hooks/useVideoPlayer';

interface VideoPlayerProps {
  src: string;
  state: VideoPlayerState;
  actions: VideoPlayerActions;
  onVideoError: () => void;
}

const SPEEDS = [1, 1.5, 2, 4, 8];

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  ({ src, state, actions, onVideoError }, ref) => {
    const progressRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const seekToPosition = useCallback(
      (clientX: number) => {
        const rect = progressRef.current?.getBoundingClientRect();
        if (!rect || !state.duration) return;
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const ratio = x / rect.width;
        actions.seek(ratio * state.duration);
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

    const handleVolumeChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        actions.setVolume(parseFloat(e.target.value));
      },
      [actions],
    );

    return (
      <div className="flex flex-col bg-black rounded-lg overflow-hidden">
        {/* Loading progress bar */}
        {!state.isReady && state.loadProgress > 0 && (
          <div className="h-1 bg-slate-800 w-full">
            <div
              className="h-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${state.loadProgress}%` }}
            />
          </div>
        )}

        {/* Video element */}
        <div className="relative cursor-pointer" onClick={actions.togglePlay}>
          <video
            ref={ref}
            src={src}
            className="w-full aspect-video bg-black max-h-[60vh] lg:max-h-[calc(100vh-9rem)] object-contain"
            onError={onVideoError}
            playsInline
            preload="auto"
          />

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
        <div className="px-3 py-2 bg-slate-900 space-y-2">
          {/* Progress bar */}
          <div
            ref={progressRef}
            className={`relative h-2 bg-slate-700 rounded-full cursor-pointer group ${isDragging ? 'h-3' : ''}`}
            onMouseDown={handleProgressMouseDown}
          >
            {/* Buffered */}
            <div
              className="absolute top-0 left-0 h-full bg-slate-600 rounded-full"
              style={{ width: `${state.duration ? (state.buffered / state.duration) * 100 : 0}%` }}
            />
            {/* Progress */}
            <div
              className="absolute top-0 left-0 h-full bg-indigo-500 rounded-full transition-[width] duration-75"
              style={{ width: `${state.duration ? (state.currentTime / state.duration) * 100 : 0}%` }}
            />
            {/* Scrubber */}
            <div
              className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-indigo-400 rounded-full transition-opacity shadow-lg ${isDragging ? 'opacity-100 scale-110' : 'opacity-0 group-hover:opacity-100'}`}
              style={{ left: `calc(${state.duration ? (state.currentTime / state.duration) * 100 : 0}% - 8px)` }}
            />
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-between text-slate-300">
            <div className="flex items-center gap-2">
              {/* Play/Pause */}
              <button
                type="button"
                onClick={actions.togglePlay}
                className="p-1.5 hover:bg-slate-700 rounded-md transition-colors"
                title={state.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {state.isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>

              {/* Frame step back */}
              <button
                type="button"
                onClick={() => actions.stepFrame(-1)}
                className="p-1.5 hover:bg-slate-700 rounded-md transition-colors"
                title="Previous frame (,)"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              {/* Frame step forward */}
              <button
                type="button"
                onClick={() => actions.stepFrame(1)}
                className="p-1.5 hover:bg-slate-700 rounded-md transition-colors"
                title="Next frame (.)"
              >
                <SkipForward className="w-4 h-4" />
              </button>

              {/* Time display */}
              <span className="text-sm font-mono ml-2">
                {formatTime(state.currentTime)} / {formatTime(state.duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Speed selector */}
              <select
                value={state.playbackRate}
                onChange={(e) => actions.setSpeed(parseFloat(e.target.value))}
                className="bg-slate-700 text-slate-300 text-xs rounded px-2 py-1 border-none outline-none cursor-pointer"
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
                className="p-1.5 hover:bg-slate-700 rounded-md transition-colors"
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
                className="w-20 h-1 accent-indigo-500 cursor-pointer"
              />

              {/* Fullscreen */}
              <button
                type="button"
                onClick={actions.toggleFullscreen}
                className="p-1.5 hover:bg-slate-700 rounded-md transition-colors"
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
