import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { VideoDropZone } from './components/VideoDropZone';
import { VideoPlayer } from './components/VideoPlayer';
import { CueForm } from './components/CueForm';
import { AnnotationPanel } from './components/AnnotationPanel';
import { ConfigurationModal } from './components/ConfigurationModal';
import { ToastContainer } from './components/ToastContainer';
import { useVideoPlayer } from './hooks/useVideoPlayer';
import { useAnnotations } from './hooks/useAnnotations';
import { useConfiguration } from './hooks/useConfiguration';
import { useToast } from './hooks/useToast';
import { exportAnnotationsToCSV, importAnnotationsFromCSV } from './utils/csv';
import type { CueFields } from './types';
import { Film, Settings } from 'lucide-react';

export default function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [annotateTimestamp, setAnnotateTimestamp] = useState(0);
  const [isNoVideoMode, setIsNoVideoMode] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const { state: playerState, actions: playerActions } = useVideoPlayer(videoRef, containerRef, videoSrc);
  const {
    config,
    addCueType,
    removeCueType,
    renameCueType,
    setCueTypeColor,
    toggleColumnVisibility,
    reorderColumns,
    addCueTypeColumns,
    removeCueTypeColumns,
    exportConfig,
    importConfig,
  } = useConfiguration();

  const {
    annotations,
    activeId,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    replaceAll,
    updateActiveAnnotation,
    renameCueType: renameAnnotationCueType,
  } = useAnnotations(videoFile?.name ?? '', videoFile?.size ?? 0, playerState.duration);
  const { toasts, addToast, removeToast } = useToast();

  // Compute which cue types are in use
  const usedCueTypes = useMemo(() => {
    const types = new Set<string>();
    annotations.forEach((a) => { if (a.cue.type) types.add(a.cue.type); });
    return types;
  }, [annotations]);

  // Combined rename handler: updates config + annotations
  const handleRenameCueType = useCallback(
    (oldName: string, newName: string) => {
      renameCueType(oldName, newName);
      renameAnnotationCueType(oldName, newName);
    },
    [renameCueType, renameAnnotationCueType],
  );

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
      setIsNoVideoMode(false);

      // Check for no-video annotations to preserve
      const noVideoKey = `annotations:no-video:0`;
      const noVideoSaved = localStorage.getItem(noVideoKey);
      let hasNoVideoAnnotations = false;
      
      if (noVideoSaved) {
        try {
          const parsed = JSON.parse(noVideoSaved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            hasNoVideoAnnotations = true;
            // Migrate no-video annotations to this video
            const newKey = `annotations:${file.name}:${file.size}`;
            localStorage.setItem(newKey, JSON.stringify(parsed));
            localStorage.removeItem(noVideoKey);
            addToast(`Migrated ${parsed.length} annotation${parsed.length !== 1 ? 's' : ''} to this video`, 'info');
          }
        } catch {
          // ignore
        }
      }

      // If no no-video annotations, check for existing annotations on this video
      if (!hasNoVideoAnnotations) {
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
      }
    },
    [videoSrc, addToast],
  );

  // Handle continue without video
  const handleContinueWithoutVideo = useCallback(() => {
    setVideoFile(null);
    setVideoSrc('');
    setIsAnnotating(false);
    setIsNoVideoMode(true);
    addToast('Ready to add annotations. Upload a video anytime.', 'info');
  }, [addToast]);

  // Handle video error
  const handleVideoError = useCallback(() => {
    addToast('Unable to play this video format. Try MP4 (H.264) or WebM.', 'error', 5000);
  }, [addToast]);

  // Toggle play/pause (Space)
  const handleTogglePlay = useCallback(() => {
    if (!videoSrc) return;
    playerActions.togglePlay();
  }, [videoSrc, playerActions]);

  // Enter → pause & annotate
  const handleEnterAnnotate = useCallback(() => {
    if (!videoSrc && !isNoVideoMode) return;
    if (isAnnotating) return; // Already annotating

    // In video mode, pause and use current time
    if (videoSrc) {
      const video = videoRef.current;
      if (!video) return;
      video.pause();
      setAnnotateTimestamp(video.currentTime);
    } else if (isNoVideoMode) {
      // In no-video mode, use 0:00
      setAnnotateTimestamp(0);
    }
    
    setIsAnnotating(true);
  }, [videoSrc, isNoVideoMode, isAnnotating]);

  // Save cue — close form and resume playback
  const handleSaveCue = useCallback(
    (cue: CueFields) => {
      addAnnotation(annotateTimestamp, cue);
      setIsAnnotating(false);
      addToast('Cue saved', 'success');
      // Resume playback after saving
      try {
        videoRef.current?.play().catch(() => {});
      } catch {
        // ignore
      }
    },
    [annotateTimestamp, addAnnotation, addToast],
  );

  // Cancel note — close form and resume playback
  const handleCancelNote = useCallback(() => {
    setIsAnnotating(false);
    // Resume playback
    try {
      videoRef.current?.play().catch(() => {});
    } catch {
      // ignore
    }
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
      // Don't intercept when config modal is open
      if (isConfigOpen) return;

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
        handleTogglePlay();
        return;
      }

      if (e.key === 'Enter' && !isInteractive) {
        e.preventDefault();
        handleEnterAnnotate();
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
            const speeds = [1, 1.5, 2, 4, 8];
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
            const speeds = [1, 1.5, 2, 4, 8];
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
  }, [handleTogglePlay, handleEnterAnnotate, playerActions, playerState.currentTime, playerState.playbackRate, addToast, isNoVideoMode, isConfigOpen]);

  // Cleanup video URL on unmount
  useEffect(() => {
    return () => {
      if (videoSrc) URL.revokeObjectURL(videoSrc);
    };
  }, [videoSrc]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-slate-800/80 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2.5">
          <Film className="w-5 h-5 text-indigo-400" />
          <h1 className="text-base font-semibold tracking-tight">Video Annotation</h1>
        </div>
        <div className="flex items-center gap-3">
          {videoFile && (
            <>
              <span className="text-xs text-slate-400 truncate max-w-[200px]">{videoFile.name}</span>
              <button
                type="button"
                onClick={() => {
                  if (videoSrc) URL.revokeObjectURL(videoSrc);
                  setVideoFile(null);
                  setVideoSrc('');
                  setIsAnnotating(false);
                  setIsNoVideoMode(false);
                }}
                className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-700 transition-colors"
              >
                Change video
              </button>
            </>
          )}
          {isNoVideoMode && !videoFile && (
            <>
              <span className="text-xs text-slate-400">No video loaded</span>
              <button
                type="button"
                onClick={() => setIsNoVideoMode(false)}
                className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-700 transition-colors"
              >
                Upload video
              </button>
            </>
          )}
          {/* Settings button */}
          <button
            type="button"
            onClick={() => setIsConfigOpen(true)}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-md transition-colors"
            title="Configuration"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main content */}
      {!videoSrc && !isNoVideoMode ? (
        <main className="flex-1 flex items-center justify-center p-8">
          <VideoDropZone onFileSelected={handleFileSelected} onContinueWithoutVideo={handleContinueWithoutVideo} />
        </main>
      ) : (
        <main className="flex-1 flex flex-col lg:flex-row gap-4 p-4 overflow-auto">
          {/* Left: Video + cue form */}
          <div ref={containerRef} className="flex-[2] flex flex-col min-w-0 min-h-0">
            {!isNoVideoMode ? (
              <VideoPlayer
                ref={videoRef}
                src={videoSrc}
                state={playerState}
                actions={playerActions}
                onVideoError={handleVideoError}
              />
            ) : (
              <div className="w-full bg-black rounded-lg overflow-hidden flex flex-col items-center justify-center min-h-[300px] border border-slate-700">
                <div className="text-center text-slate-400">
                  <p className="text-sm font-medium mb-2">No video loaded</p>
                  <p className="text-xs text-slate-500">Annotations will default to 0:00</p>
                </div>
              </div>
            )}
            {isAnnotating && (
              <CueForm
                mode="create"
                timestamp={annotateTimestamp}
                allAnnotations={annotations}
                cueTypes={config.cueTypes}
                onSave={handleSaveCue}
                onCancel={handleCancelNote}
              />
            )}
            {/* Keyboard shortcuts hint */}
            {!isAnnotating && videoSrc && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-500 font-mono text-[10px]">Space</kbd> Play/Pause</span>
                <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-500 font-mono text-[10px]">Enter</kbd> New Cue</span>
                <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-500 font-mono text-[10px]">← →</kbd> Seek ±5s</span>
                <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-500 font-mono text-[10px]">, .</kbd> Frame step</span>
                <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-500 font-mono text-[10px]">+ −</kbd> Speed</span>
              </div>
            )}
            {!isAnnotating && isNoVideoMode && (
              <div className="mt-3 text-xs text-slate-600">
                <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-500 font-mono text-[10px]">Enter</kbd> Add cue</span>
              </div>
            )}
          </div>

          {/* Right: Cue Sheet panel */}
          <div className="flex-1 min-w-[300px] max-w-md lg:max-w-sm xl:max-w-md overflow-auto">
            <AnnotationPanel
              annotations={annotations}
              activeId={activeId}
              currentTime={playerState.currentTime}
              cueTypeColors={config.cueTypeColors}
              onSeek={handleSeek}
              onEdit={updateAnnotation}
              onDelete={deleteAnnotation}
              onExport={handleExport}
              onImport={handleImport}
              isNoVideoMode={isNoVideoMode}
              visibleColumns={config.visibleColumns}
              cueTypeColumns={config.cueTypeColumns}
              cueTypes={config.cueTypes}
            />
          </div>
        </main>
      )}

      {/* Configuration Modal */}
      <ConfigurationModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        cueTypes={config.cueTypes}
        cueTypeColors={config.cueTypeColors}
        visibleColumns={config.visibleColumns}
        cueTypeColumns={config.cueTypeColumns}
        usedCueTypes={usedCueTypes}
        onAddCueType={addCueType}
        onRemoveCueType={removeCueType}
        onRenameCueType={handleRenameCueType}
        onSetCueTypeColor={setCueTypeColor}
        onToggleColumn={toggleColumnVisibility}
        onReorderColumns={reorderColumns}
        onAddCueTypeColumns={addCueTypeColumns}
        onRemoveCueTypeColumns={removeCueTypeColumns}
        onExportConfig={exportConfig}
        onImportConfig={importConfig}
      />

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
