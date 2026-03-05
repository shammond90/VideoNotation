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
import { saveAnnotations, loadAnnotations, backupAnnotations, popRecoveryEvents } from './utils/storage';
import type { CueFields } from './types';
import { RESERVED_CUE_TYPES } from './types';
import { Film, Settings, X as XIcon } from 'lucide-react';

export default function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [annotationScope, setAnnotationScope] = useState<{ fileName: string; fileSize: number }>({ fileName: '', fileSize: 0 });
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [annotateTimestamp, setAnnotateTimestamp] = useState(0);
  const [isNoVideoMode, setIsNoVideoMode] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  // "Change video" modal state
  const [isChangeVideoOpen, setIsChangeVideoOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const cueFormSaveRef = useRef<(() => void) | null>(null);
  const previousUrlRef = useRef<string>('');
  const cuesDirtyRef = useRef(false);
  const isConfigOpenRef = useRef(false);

  const { state: playerState, actions: playerActions } = useVideoPlayer(videoRef, containerRef, videoSrc);
  const {
    config,
    setCueTypes,
    addCueType,
    removeCueType,
    renameCueType,
    setCueTypeColor,
    setDistanceView,
    setCueTypeAllowStandby,
    setCueTypeAllowWarning,
    toggleColumnVisibility,
    reorderColumns,
    addCueTypeColumns,
    removeCueTypeColumns,
    exportConfig,
    importConfig,
    reloadConfig,
    saveConfigBackup,
    setCueBackupInterval,
    clearAllData,
    clearCurrentVideoCues,
    clearAllCues,
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
  } = useAnnotations(annotationScope.fileName, annotationScope.fileSize, playerState.duration);
  const annotationsRef = useRef(annotations);
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    const events = popRecoveryEvents();
    events.forEach((message) => addToast(message, 'info', 5000));
  }, [annotationScope.fileName, annotationScope.fileSize, addToast]);

  // Keep annotationsRef in sync; mark dirty when annotations change after initial load
  const initialLoadRef = useRef(true);
  useEffect(() => {
    annotationsRef.current = annotations;
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
    } else {
      cuesDirtyRef.current = true;
    }
  }, [annotations]);

  // Reset initialLoadRef when scope changes so initial load of a new video isn't "dirty"
  useEffect(() => {
    initialLoadRef.current = true;
    cuesDirtyRef.current = false;
  }, [annotationScope.fileName, annotationScope.fileSize]);

  // Perform a cue backup: saves to backup ring + shows green toast
  const performCueBackup = useCallback(() => {
    if (!cuesDirtyRef.current) return;
    const currentFileName = annotationScope.fileName || 'no-video';
    const currentFileSize = annotationScope.fileName ? annotationScope.fileSize : 0;
    backupAnnotations(currentFileName, currentFileSize, annotationsRef.current);
    cuesDirtyRef.current = false;
    addToast('The cues have been saved.', 'success', 3000);
  }, [annotationScope, addToast]);

  // Interval-based cue backup (configurable minutes)
  useEffect(() => {
    const ms = config.cueBackupIntervalMinutes * 60 * 1000;
    const id = setInterval(() => {
      performCueBackup();
    }, ms);
    return () => clearInterval(id);
  }, [config.cueBackupIntervalMinutes, performCueBackup]);

  // Lifecycle cue + config backup (visibility change + beforeunload)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (cuesDirtyRef.current) {
          const currentFileName = annotationScope.fileName || 'no-video';
          const currentFileSize = annotationScope.fileName ? annotationScope.fileSize : 0;
          backupAnnotations(currentFileName, currentFileSize, annotationsRef.current);
          cuesDirtyRef.current = false;
        }
        if (isConfigOpenRef.current) saveConfigBackup();
      }
    };
    const handleBeforeUnload = () => {
      if (cuesDirtyRef.current) {
        const currentFileName = annotationScope.fileName || 'no-video';
        const currentFileSize = annotationScope.fileName ? annotationScope.fileSize : 0;
        backupAnnotations(currentFileName, currentFileSize, annotationsRef.current);
        cuesDirtyRef.current = false;
      }
      if (isConfigOpenRef.current) saveConfigBackup();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [annotationScope, saveConfigBackup]);

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

  // Clear data handlers
  const handleClearAllData = useCallback(() => {
    clearAllData();
    replaceAll([]);
    addToast('All data cleared. App reset to defaults.', 'info');
  }, [clearAllData, replaceAll, addToast]);

  const handleClearCurrentVideoCues = useCallback(
    (fileName: string, fileSize: number) => {
      clearCurrentVideoCues(fileName, fileSize);
      replaceAll([]);
      addToast(`Cleared all cues for "${fileName}"`, 'info');
    },
    [clearCurrentVideoCues, replaceAll, addToast],
  );

  const handleClearAllCues = useCallback(() => {
    clearAllCues();
    replaceAll([]);
    addToast('Cleared all cues from all videos', 'info');
  }, [clearAllCues, replaceAll, addToast]);

  const handleRecoverCurrentVideoCues = useCallback(() => {
    const currentFileName = annotationScope.fileName || 'no-video';
    const currentFileSize = annotationScope.fileName ? annotationScope.fileSize : 0;
    const restored = loadAnnotations(currentFileName, currentFileSize);
    replaceAll(restored);
    addToast(`Restored ${restored.length} cue${restored.length !== 1 ? 's' : ''} for current video`, 'success');
  }, [annotationScope, replaceAll, addToast]);

  const handleRecoverConfig = useCallback(() => {
    reloadConfig();
    addToast('Configuration restored from backup', 'success');
  }, [reloadConfig, addToast]);

  // Update active annotation on time change
  useEffect(() => {
    updateActiveAnnotation(playerState.currentTime);
  }, [playerState.currentTime, updateActiveAnnotation]);

  // Handle file selection
  const handleFileSelected = useCallback(
    (file: File) => {
      // Revoke previous video URL
      if (previousUrlRef.current) {
        URL.revokeObjectURL(previousUrlRef.current);
      }

      const url = URL.createObjectURL(file);
      previousUrlRef.current = url;

      setVideoFile(file);
      setVideoSrc(url);
      setAnnotationScope({ fileName: file.name, fileSize: file.size });
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
    [addToast],
  );

  // Handle continue without video
  const handleContinueWithoutVideo = useCallback(() => {
    if (previousUrlRef.current) {
      URL.revokeObjectURL(previousUrlRef.current);
      previousUrlRef.current = '';
    }
    setVideoFile(null);
    setVideoSrc('');
    setAnnotationScope({ fileName: '', fileSize: 0 });
    setIsAnnotating(false);
    setIsNoVideoMode(true);
    addToast('Ready to add annotations. Upload a video anytime.', 'info');
  }, [addToast]);

  // Handle video error
  const handleVideoError = useCallback(() => {
    addToast('Unable to play this video format. Try MP4 (H.264) or WebM.', 'error', 5000);
  }, [addToast]);

  const saveCurrentVideoAnnotations = useCallback(() => {
    const currentFileName = annotationScope.fileName || 'no-video';
    const currentFileSize = annotationScope.fileSize || 0;
    saveAnnotations(currentFileName, currentFileSize, annotations);
  }, [annotationScope, annotations]);

  // Open a file picker for video selection
  const openVideoPicker = useCallback((onPicked: (file: File) => void) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) onPicked(file);
    };
    input.click();
  }, []);

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
      setAnnotateTimestamp(playerState.currentTime);
    } else if (isNoVideoMode) {
      // In no-video mode, use 0:00
      setAnnotateTimestamp(0);
    }
    
    setIsAnnotating(true);
  }, [videoSrc, isNoVideoMode, isAnnotating, playerState.currentTime]);

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

        // Extract unique cue types from imported data and replace non-reserved types
        const importedTypes = new Set<string>();
        imported.forEach((a) => { if (a.cue.type) importedTypes.add(a.cue.type); });
        const reserved = RESERVED_CUE_TYPES as readonly string[];
        const newTypes = [...reserved, ...[...importedTypes].filter((t) => !reserved.includes(t))];
        setCueTypes(newTypes);
        // Ensure colours exist for any new types (setCueTypes handles reserved; new ones get default grey)
        for (const t of importedTypes) {
          if (!config.cueTypeColors[t]) {
            setCueTypeColor(t, '#6b7280');
          }
        }

        addToast(`Imported ${imported.length} annotations`, 'success');
      } catch (err) {
        addToast(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
      }

      // Reset input
      if (importInputRef.current) importInputRef.current.value = '';
    },
    [replaceAll, addToast, setCueTypes, setCueTypeColor, config.cueTypeColors],
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
          handleSeek(playerState.currentTime - 5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleSeek(playerState.currentTime + 5);
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
  }, [handleTogglePlay, handleEnterAnnotate, playerActions, playerState.playbackRate, playerState.currentTime, addToast, isNoVideoMode, isConfigOpen, handleSeek]);

  // Cleanup video URL on unmount
  useEffect(() => {
    return () => {
      if (previousUrlRef.current) URL.revokeObjectURL(previousUrlRef.current);
    };
  }, []);

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
                onClick={() => setIsChangeVideoOpen(true)}
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
            onClick={() => { isConfigOpenRef.current = true; setIsConfigOpen(true); }}
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
          <VideoDropZone
            onFileSelected={handleFileSelected}
            onContinueWithoutVideo={handleContinueWithoutVideo}
          />
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
              <>
                {/* Touch bar: Cancel / Save above the form */}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleCancelNote}
                    className="flex items-center justify-center gap-1.5 flex-1 px-3 py-2 bg-slate-800 text-slate-300 rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors text-sm"
                  >
                    <kbd className="inline-flex items-center justify-center w-7 h-7 text-[11px] font-mono font-bold bg-slate-700 text-slate-400 rounded border border-slate-600">Esc</kbd>
                    <span className="text-xs text-slate-400">Cancel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => cueFormSaveRef.current?.()}
                    className="flex items-center justify-center gap-1.5 flex-1 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors text-sm"
                  >
                    <kbd className="inline-flex items-center justify-center w-7 h-7 text-[11px] font-mono font-bold bg-indigo-700 text-indigo-200 rounded border border-indigo-500">C-↵</kbd>
                    <span className="text-xs">Save Cue</span>
                  </button>
                </div>
                <CueForm
                  mode="create"
                  timestamp={annotateTimestamp}
                  allAnnotations={annotations}
                  cueTypes={config.cueTypes}
                  cueTypeAllowStandby={config.cueTypeAllowStandby}
                  cueTypeAllowWarning={config.cueTypeAllowWarning}
                  onSave={handleSaveCue}
                  onCancel={handleCancelNote}
                  saveRef={cueFormSaveRef}
                />
              </>
            )}
            {/* Clickable keyboard hints */}
            {!isAnnotating && videoSrc && (
              <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-slate-700 active:bg-slate-600 transition-colors"
                  title="Play / Pause"
                >
                  <kbd className="inline-flex items-center justify-center w-7 h-7 text-[11px] font-mono font-bold bg-slate-700 text-slate-400 rounded border border-slate-600">␣</kbd>
                  <span className="text-xs text-slate-500">{playerState.isPlaying ? 'Pause' : 'Play'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleEnterAnnotate}
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-indigo-600/20 hover:bg-indigo-600/40 active:bg-indigo-600/60 transition-colors"
                  title="New Cue"
                >
                  <kbd className="inline-flex items-center justify-center w-7 h-7 text-[11px] font-mono font-bold bg-indigo-700 text-indigo-200 rounded border border-indigo-500">↵</kbd>
                  <span className="text-xs text-indigo-300">Cue</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSeek(playerState.currentTime - 5)}
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-slate-700 active:bg-slate-600 transition-colors"
                  title="Back 5s"
                >
                  <kbd className="inline-flex items-center justify-center w-7 h-7 text-[11px] font-mono font-bold bg-slate-700 text-slate-400 rounded border border-slate-600">←</kbd>
                  <span className="text-xs text-slate-500">−5s</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSeek(playerState.currentTime + 5)}
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-slate-700 active:bg-slate-600 transition-colors"
                  title="Forward 5s"
                >
                  <kbd className="inline-flex items-center justify-center w-7 h-7 text-[11px] font-mono font-bold bg-slate-700 text-slate-400 rounded border border-slate-600">→</kbd>
                  <span className="text-xs text-slate-500">+5s</span>
                </button>
                <button
                  type="button"
                  onClick={() => playerActions.stepFrame(-1)}
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-slate-700 active:bg-slate-600 transition-colors"
                  title="Previous frame"
                >
                  <kbd className="inline-flex items-center justify-center w-7 h-7 text-[11px] font-mono font-bold bg-slate-700 text-slate-400 rounded border border-slate-600">,</kbd>
                  <span className="text-xs text-slate-500">−1f</span>
                </button>
                <button
                  type="button"
                  onClick={() => playerActions.stepFrame(1)}
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-slate-700 active:bg-slate-600 transition-colors"
                  title="Next frame"
                >
                  <kbd className="inline-flex items-center justify-center w-7 h-7 text-[11px] font-mono font-bold bg-slate-700 text-slate-400 rounded border border-slate-600">.</kbd>
                  <span className="text-xs text-slate-500">+1f</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const speeds = [1, 1.5, 2, 4, 8];
                    const idx = speeds.indexOf(playerState.playbackRate);
                    if (idx < speeds.length - 1) {
                      playerActions.setSpeed(speeds[idx + 1]);
                      addToast(`Speed: ${speeds[idx + 1]}x`, 'info', 1500);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-slate-700 active:bg-slate-600 transition-colors"
                  title="Speed up"
                >
                  <kbd className="inline-flex items-center justify-center w-7 h-7 text-[11px] font-mono font-bold bg-slate-700 text-slate-400 rounded border border-slate-600">+</kbd>
                  <span className="text-xs text-slate-500">Fast</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const speeds = [1, 1.5, 2, 4, 8];
                    const idx = speeds.indexOf(playerState.playbackRate);
                    if (idx > 0) {
                      playerActions.setSpeed(speeds[idx - 1]);
                      addToast(`Speed: ${speeds[idx - 1]}x`, 'info', 1500);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-slate-700 active:bg-slate-600 transition-colors"
                  title="Slow down"
                >
                  <kbd className="inline-flex items-center justify-center w-7 h-7 text-[11px] font-mono font-bold bg-slate-700 text-slate-400 rounded border border-slate-600">−</kbd>
                  <span className="text-xs text-slate-500">Slow</span>
                </button>
              </div>
            )}
            {!isAnnotating && isNoVideoMode && (
              <div className="mt-2 flex items-center gap-2 px-1">
                <button
                  type="button"
                  onClick={handleEnterAnnotate}
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-indigo-600/20 hover:bg-indigo-600/40 active:bg-indigo-600/60 transition-colors"
                  title="Add Cue"
                >
                  <kbd className="inline-flex items-center justify-center w-7 h-7 text-[11px] font-mono font-bold bg-indigo-700 text-indigo-200 rounded border border-indigo-500">↵</kbd>
                  <span className="text-xs text-indigo-300">Add Cue</span>
                </button>
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
              distanceView={config.distanceView}
              cueTypeAllowStandby={config.cueTypeAllowStandby}
              cueTypeAllowWarning={config.cueTypeAllowWarning}
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

      {/* Change Video Modal */}
      {isChangeVideoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-100">Change Video</h2>
              <button
                type="button"
                onClick={() => setIsChangeVideoOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-md transition-colors"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-5">
              Select a new video file. Copy cues to the new video, or switch and keep that video's own cues.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  openVideoPicker((file) => {
                    saveCurrentVideoAnnotations();
                    saveAnnotations(file.name, file.size, annotations);
                    handleFileSelected(file);
                    setIsChangeVideoOpen(false);
                    addToast('Switched video and copied current cues', 'success');
                  });
                }}
                className="w-full px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
              >
                Select New Video (Copy Cues)
              </button>
              <button
                type="button"
                onClick={() => {
                  openVideoPicker((file) => {
                    saveCurrentVideoAnnotations();
                    handleFileSelected(file);
                    setIsChangeVideoOpen(false);
                    addToast('Switched video \u2014 loaded its own cues', 'info');
                  });
                }}
                className="w-full px-4 py-2.5 text-sm bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
              >
                Select New Video (Clear Cues)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Configuration Modal */}
      <ConfigurationModal
        isOpen={isConfigOpen}
        onClose={() => {
          saveConfigBackup();
          isConfigOpenRef.current = false;
          setIsConfigOpen(false);
        }}
        cueTypes={config.cueTypes}
        cueTypeColors={config.cueTypeColors}
        cueTypeAllowStandby={config.cueTypeAllowStandby}
        cueTypeAllowWarning={config.cueTypeAllowWarning}
        visibleColumns={config.visibleColumns}
        cueTypeColumns={config.cueTypeColumns}
        usedCueTypes={usedCueTypes}
        distanceView={config.distanceView}
        currentVideoName={videoFile?.name}
        currentVideoSize={videoFile?.size}
        cueBackupIntervalMinutes={config.cueBackupIntervalMinutes}
        onSetCueBackupInterval={setCueBackupInterval}
        onSetDistanceView={setDistanceView}
        onAddCueType={addCueType}
        onRemoveCueType={removeCueType}
        onRenameCueType={handleRenameCueType}
        onSetCueTypeColor={setCueTypeColor}
        onSetCueTypeAllowStandby={setCueTypeAllowStandby}
        onSetCueTypeAllowWarning={setCueTypeAllowWarning}
        onToggleColumn={toggleColumnVisibility}
        onReorderColumns={reorderColumns}
        onAddCueTypeColumns={addCueTypeColumns}
        onRemoveCueTypeColumns={removeCueTypeColumns}
        onExportConfig={exportConfig}
        onImportConfig={importConfig}
        onRecoverCurrentVideoCues={handleRecoverCurrentVideoCues}
        onRecoverConfig={handleRecoverConfig}
        onClearAllData={handleClearAllData}
        onClearCurrentVideoCues={handleClearCurrentVideoCues}
        onClearAllCues={handleClearAllCues}
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
