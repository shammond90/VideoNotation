import { useCallback, useRef, useState, useEffect } from 'react';
import { VideoDropZone } from './components/VideoDropZone';
import { VideoPlayer } from './components/VideoPlayer';
import { CueForm } from './components/CueForm';
import { AnnotationPanel } from './components/AnnotationPanel';
import { ToastContainer } from './components/ToastContainer';
import { useVideoPlayer } from './hooks/useVideoPlayer';
import { useAnnotations } from './hooks/useAnnotations';
import { useToast } from './hooks/useToast';
import { formatTime } from './utils/formatTime';
import { exportAnnotationsToCSV, importAnnotationsFromCSV } from './utils/csv';
import type { CueFields } from './types';
import { Film } from 'lucide-react';

export default function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [annotateTimestamp, setAnnotateTimestamp] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const { state: playerState, actions: playerActions } = useVideoPlayer(videoRef, containerRef, videoSrc);
  const {
    annotations,
    activeId,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    replaceAll,
    updateActiveAnnotation,
  } = useAnnotations(videoFile?.name ?? '', videoFile?.size ?? 0);
  const { toasts, addToast, removeToast } = useToast();

  // Update active annotation on time change
  useEffect(() => {
    updateActiveAnnotation(playerState.currentTime);
  }, [playerState.currentTime, updateActiveAnnotation]);

  // Handle file selection
  const handleFileSelected = useCallback(
    (file: File) => {
      // Revoke previous URL
      if (videoSrc) URL.revokeObjectURL(videoSrc);

      const url = URL.createObjectURL(file);
      setVideoFile(file);
      setVideoSrc(url);
      setIsAnnotating(false);

      // Check if there are saved annotations
      const key = `annotations:${file.name}:${file.size}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            addToast(`Restored ${parsed.length} annotation${parsed.length !== 1 ? 's' : ''} from previous session`, 'info');
          }
        } catch {
          // ignore
        }
      }
    },
    [videoSrc, addToast],
  );

  // Handle video error
  const handleVideoError = useCallback(() => {
    addToast('Unable to play this video format. Try MP4 (H.264) or WebM.', 'error', 5000);
  }, [addToast]);

  // Spacebar → pause & annotate
  const handleSpacebar = useCallback(() => {
    if (!videoSrc) return;
    const video = videoRef.current;
    if (!video) return;

    if (!playerState.isPlaying && isAnnotating) {
      // Already annotating, do nothing
      return;
    }

    video.pause();
    setAnnotateTimestamp(video.currentTime);
    setIsAnnotating(true);
  }, [videoSrc, playerState.isPlaying, isAnnotating]);

  // Save cue
  const handleSaveCue = useCallback(
    (cue: CueFields) => {
      addAnnotation(annotateTimestamp, cue);
      setIsAnnotating(false);
      addToast('Cue saved', 'success');
    },
    [annotateTimestamp, addAnnotation, addToast],
  );

  // Cancel note
  const handleCancelNote = useCallback(() => {
    setIsAnnotating(false);
    // Resume playback
    videoRef.current?.play();
  }, []);

  // Seek to annotation timestamp
  const handleSeek = useCallback(
    (time: number) => {
      playerActions.seek(time);
    },
    [playerActions],
  );

  // Export
  const handleExport = useCallback(() => {
    if (annotations.length === 0) return;
    exportAnnotationsToCSV(annotations, videoFile?.name ?? 'video');
    addToast(`Exported ${annotations.length} annotations`, 'success');
  }, [annotations, videoFile, addToast]);

  // Import
  const handleImport = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const imported = await importAnnotationsFromCSV(file);
        replaceAll(imported);
        addToast(`Imported ${imported.length} annotations`, 'success');
      } catch (err) {
        addToast(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
      }

      // Reset input
      if (importInputRef.current) importInputRef.current.value = '';
    },
    [replaceAll, addToast],
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      const isInteractive = isTyping || target.tagName === 'BUTTON';

      if (e.code === 'Space' && !isInteractive) {
        e.preventDefault();
        handleSpacebar();
        return;
      }

      // Only handle shortcuts when not typing
      if (isTyping) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          playerActions.seek(playerState.currentTime - 5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          playerActions.seek(playerState.currentTime + 5);
          break;
        case ',':
          e.preventDefault();
          playerActions.stepFrame(-1);
          break;
        case '.':
          e.preventDefault();
          playerActions.stepFrame(1);
          break;
        case '+':
        case '=':
          e.preventDefault();
          {
            const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
            const idx = speeds.indexOf(playerState.playbackRate);
            if (idx < speeds.length - 1) {
              playerActions.setSpeed(speeds[idx + 1]);
              addToast(`Speed: ${speeds[idx + 1]}x`, 'info', 1500);
            }
          }
          break;
        case '-':
          e.preventDefault();
          {
            const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
            const idx = speeds.indexOf(playerState.playbackRate);
            if (idx > 0) {
              playerActions.setSpeed(speeds[idx - 1]);
              addToast(`Speed: ${speeds[idx - 1]}x`, 'info', 1500);
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSpacebar, playerActions, playerState.currentTime, playerState.playbackRate, addToast]);

  // Cleanup video URL on unmount
  useEffect(() => {
    return () => {
      if (videoSrc) URL.revokeObjectURL(videoSrc);
    };
  }, [videoSrc]);

  return (
    <div className="h-screen bg-slate-900 text-slate-200 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-slate-800/80 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2.5">
          <Film className="w-5 h-5 text-indigo-400" />
          <h1 className="text-base font-semibold tracking-tight">Video Annotation</h1>
        </div>
        {videoFile && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 truncate max-w-[200px]">{videoFile.name}</span>
            <button
              type="button"
              onClick={() => {
                if (videoSrc) URL.revokeObjectURL(videoSrc);
                setVideoFile(null);
                setVideoSrc('');
                setIsAnnotating(false);
              }}
              className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-700 transition-colors"
            >
              Change video
            </button>
          </div>
        )}
      </header>

      {/* Main content */}
      {!videoSrc ? (
        <main className="flex-1 flex items-center justify-center p-8">
          <VideoDropZone onFileSelected={handleFileSelected} />
        </main>
      ) : (
        <main className="flex-1 flex flex-col lg:flex-row gap-4 p-4 overflow-hidden">
          {/* Left: Video + note input */}
          <div ref={containerRef} className="flex-[2] flex flex-col min-w-0">
            <VideoPlayer
              ref={videoRef}
              src={videoSrc}
              state={playerState}
              actions={playerActions}
              onVideoError={handleVideoError}
            />
            {isAnnotating && (
              <CueForm
                timestamp={annotateTimestamp}
                onSave={handleSaveCue}
                onCancel={handleCancelNote}
              />
            )}
            {/* Keyboard shortcuts hint */}
            {!isAnnotating && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-500 font-mono text-[10px]">Space</kbd> Annotate</span>
                <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-500 font-mono text-[10px]">← →</kbd> Seek ±5s</span>
                <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-500 font-mono text-[10px]">, .</kbd> Frame step</span>
                <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-500 font-mono text-[10px]">+ −</kbd> Speed</span>
              </div>
            )}
          </div>

          {/* Right: Annotations panel */}
          <div className="flex-1 min-w-[300px] max-w-md lg:max-w-sm xl:max-w-md overflow-hidden">
            <AnnotationPanel
              annotations={annotations}
              activeId={activeId}
              onSeek={handleSeek}
              onEdit={updateAnnotation}
              onDelete={deleteAnnotation}
              onExport={handleExport}
              onImport={handleImport}
            />
          </div>
        </main>
      )}

      {/* Hidden import input */}
      <input
        ref={importInputRef}
        type="file"
        accept=".csv"
        onChange={handleImportFile}
        className="hidden"
      />

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
