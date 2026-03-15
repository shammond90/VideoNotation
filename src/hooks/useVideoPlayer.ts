import { useRef, useState, useCallback, useEffect } from 'react';
import { FRAME_DURATION } from '../utils/formatTime';

export interface VideoPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  isFullscreen: boolean;
  buffered: number;
  isLoading: boolean;
  isReady: boolean;
  loadProgress: number; // 0-100
}

export interface VideoPlayerActions {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  setSpeed: (rate: number) => void;
  stepFrame: (direction: 1 | -1) => void;
  toggleFullscreen: () => void;
}

const FRAME_DUR = FRAME_DURATION; // re-alias to keep usage short

export function useVideoPlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  src: string,
) {
  const [state, setState] = useState<VideoPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    playbackRate: 1,
    isFullscreen: false,
    buffered: 0,
    isLoading: false,
    isReady: false,
    loadProgress: 0,
  });

  const animationRef = useRef<number>(0);
  // Playback tracking refs
  const previousTimeRef = useRef<number>(0);
  const wasSeekedRef = useRef<boolean>(false);

  // Reset state when src changes
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      buffered: 0,
      isLoading: !!src,
      isReady: false,
      loadProgress: 0,
    }));
    cancelAnimationFrame(animationRef.current);
    previousTimeRef.current = 0;
    wasSeekedRef.current = false;

    // Force the browser to load the new source — React updates the <video>
    // src attribute, but browsers don't reliably start loading without an
    // explicit .load() call.
    const video = videoRef.current;
    if (video && src) {
      video.load();
    }
  }, [src, videoRef]);

  // Smooth time update via requestAnimationFrame — also handles loop detection
  const updateTime = useCallback(() => {
    const video = videoRef.current;
    if (video && !video.paused) {
      const cur = video.currentTime;
      previousTimeRef.current = cur;
      setState((p) => ({ ...p, currentTime: cur }));

      wasSeekedRef.current = false;
      animationRef.current = requestAnimationFrame(updateTime);
    }
  }, [videoRef]);

  // Attach event listeners — re-run when src changes so we rebind after new media loads
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    const onLoadStart = () => {
      setState((prev) => ({ ...prev, isLoading: true, isReady: false, loadProgress: 0 }));
    };

    const onLoadedMetadata = () => {
      setState((prev) => ({ ...prev, duration: video.duration, loadProgress: 30 }));
    };

    const onCanPlay = () => {
      setState((prev) => ({ ...prev, isLoading: false, isReady: true, loadProgress: 100 }));
    };

    const onCanPlayThrough = () => {
      setState((prev) => ({ ...prev, isLoading: false, isReady: true, loadProgress: 100 }));
    };

    const onWaiting = () => {
      setState((prev) => ({ ...prev, isLoading: true }));
    };

    const onPlaying = () => {
      setState((prev) => ({ ...prev, isLoading: false, isReady: true }));
    };

    const onPlay = () => {
      setState((prev) => ({ ...prev, isPlaying: true }));
      animationRef.current = requestAnimationFrame(updateTime);
    };

    const onPause = () => {
      setState((prev) => ({ ...prev, isPlaying: false, currentTime: video.currentTime }));
      cancelAnimationFrame(animationRef.current);
    };

    const onEnded = () => {
      setState((prev) => ({ ...prev, isPlaying: false, currentTime: video.currentTime }));
      cancelAnimationFrame(animationRef.current);
    };

    const onTimeUpdate = () => {
      setState((prev) => ({ ...prev, currentTime: video.currentTime }));
    };

    const onProgress = () => {
      if (video.buffered.length > 0) {
        const buffered = video.buffered.end(video.buffered.length - 1);
        const pct = video.duration ? Math.round((buffered / video.duration) * 100) : 0;
        setState((prev) => ({
          ...prev,
          buffered,
          loadProgress: prev.isReady ? prev.loadProgress : Math.max(prev.loadProgress, Math.min(pct, 95)),
        }));
      }
    };

    const onVolumeChange = () => {
      setState((prev) => ({
        ...prev,
        volume: video.volume,
        isMuted: video.muted,
      }));
    };

    const onFullscreenChange = () => {
      setState((prev) => ({ ...prev, isFullscreen: !!document.fullscreenElement }));
    };

    video.addEventListener('loadstart', onLoadStart);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('canplaythrough', onCanPlayThrough);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('progress', onProgress);
    video.addEventListener('volumechange', onVolumeChange);
    document.addEventListener('fullscreenchange', onFullscreenChange);

    // If video already has metadata (e.g., cached), sync state immediately
    if (video.readyState >= 1) {
      setState((prev) => ({ ...prev, duration: video.duration, loadProgress: 30 }));
    }
    if (video.readyState >= 3) {
      setState((prev) => ({ ...prev, isLoading: false, isReady: true, loadProgress: 100 }));
    }

    return () => {
      video.removeEventListener('loadstart', onLoadStart);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('canplaythrough', onCanPlayThrough);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('volumechange', onVolumeChange);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      cancelAnimationFrame(animationRef.current);
    };
  }, [videoRef, src, updateTime]);

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.play().catch((err) => {
      console.warn('Play failed:', err.message);
    });
  }, [videoRef]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, [videoRef]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch((err) => {
        console.warn('Play failed:', err.message);
      });
    } else {
      video.pause();
    }
  }, [videoRef]);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (video) {
      wasSeekedRef.current = true;
      video.currentTime = Math.max(0, Math.min(time, video.duration || 0));
      previousTimeRef.current = video.currentTime;
      setState((prev) => ({ ...prev, currentTime: video.currentTime }));
    }
  }, [videoRef]);

  const setVolume = useCallback((vol: number) => {
    const video = videoRef.current;
    if (video) {
      video.volume = Math.max(0, Math.min(1, vol));
      if (vol > 0) video.muted = false;
    }
  }, [videoRef]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = !video.muted;
    }
  }, [videoRef]);

  const setSpeed = useCallback((rate: number) => {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = rate;
      setState((prev) => ({ ...prev, playbackRate: rate }));
    }
  }, [videoRef]);

  const stepFrame = useCallback((direction: 1 | -1) => {
    const video = videoRef.current;
    if (video) {
      wasSeekedRef.current = true;
      video.pause();
      video.currentTime = Math.max(0, Math.min(video.currentTime + direction * FRAME_DUR, video.duration));
      previousTimeRef.current = video.currentTime;
      setState((prev) => ({ ...prev, currentTime: video.currentTime }));
    }
  }, [videoRef]);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  }, [containerRef]);

  const actions: VideoPlayerActions = {
    play,
    pause,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    setSpeed,
    stepFrame,
    toggleFullscreen,
  };

  return { state, actions };
}
