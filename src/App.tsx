import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { VideoDropZone } from './components/VideoDropZone';
import { VideoPlayer } from './components/VideoPlayer';
import type { ScrubberTitleMarker, ScrubberSceneMarker, ScrubberSceneBand } from './components/VideoPlayer';
import { AnnotationPanel } from './components/AnnotationPanel';
import { ConfigurationModal } from './components/ConfigurationModal';
import { ExportDialog } from './components/ExportDialog';
import { ExportTemplateBuilder } from './components/ExportTemplateBuilder';
import { ToastContainer } from './components/ToastContainer';
import { useVideoPlayer } from './hooks/useVideoPlayer';
import { useAnnotations } from './hooks/useAnnotations';
import { SCENE_BAND_COLORS } from './hooks/useCueGrouping';
import { useConfiguration } from './hooks/useConfiguration';
import { useToast } from './hooks/useToast';
import { useVideoHandle } from './hooks/useVideoHandle';
import { useBroadcastSync, supportsDualWindow, type SyncMessage } from './hooks/useBroadcastSync';
import { exportAnnotationsToCSV, importAnnotationsFromCSV } from './utils/csv';
import { saveAnnotations, loadAnnotations, backupAnnotations, popRecoveryEvents, migrateNoVideoAnnotations, hasAnnotationData } from './utils/storage';
import { updateProjectConfig, exportProjectToJSON, loadProjects } from './utils/projectStorage';
import { supportsFileSystemAccess, pickVideoWithHandle } from './utils/videoHandleStorage';
import { VideoReconnectBanner } from './components/VideoReconnectBanner';
import { GoToDialog } from './components/GoToDialog';
import type { CueFields } from './types';
import { RESERVED_CUE_TYPES } from './types';
import { Film, Settings, X as XIcon, ExternalLink } from 'lucide-react';

interface AppProps {
  projectId?: string;
  projectName?: string;
  initialVideoFile?: File;
  videoFilename?: string | null;
  videoFilesize?: number | null;
  onGoHome?: () => void;
  onSwitchProject?: () => void;
  onVideoLoaded?: (file: File, duration: number) => void;
  onVideoHandleStored?: (handle: FileSystemFileHandle) => void;
  onUnsavedChangesChange?: (hasChanges: boolean) => void;
  onDeleteProject?: () => void;
  onDeleteAllProjects?: () => Promise<void>;
  onSave?: () => void;
}

export default function App({
  projectId,
  projectName,
  initialVideoFile,
  videoFilename: projectVideoFilename = null,
  videoFilesize: projectVideoFilesize = null,
  onGoHome,
  onSwitchProject,
  onVideoLoaded,
  onVideoHandleStored,
  onUnsavedChangesChange,
  onDeleteProject,
  onDeleteAllProjects,
  onSave,
}: AppProps = {}) {
  const [videoFile, setVideoFile] = useState<File | null>(initialVideoFile || null);
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [annotationScope, setAnnotationScope] = useState<{ fileName: string; fileSize: number }>({
    fileName: projectId || '',
    fileSize: 0,
  });
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [annotateTimestamp, setAnnotateTimestamp] = useState(0);
  const [isNoVideoMode, setIsNoVideoMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  // "Change video" modal state
  const [isChangeVideoOpen, setIsChangeVideoOpen] = useState(false);
  // Export dialog / XLSX builder state
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isXlsxBuilderOpen, setIsXlsxBuilderOpen] = useState(false);
  const [isGoToOpen, setIsGoToOpen] = useState(false);

  // ── Resizable split panel state ──
  const PANEL_MIN_PX = 260;
  const PANEL_MAX_RATIO = 0.65; // cue sheet never wider than 65% of viewport
  const [panelWidthPx, setPanelWidthPx] = useState<number>(() => {
    const saved = localStorage.getItem(`cuetation:panelWidth:${projectId ?? '__global__'}`);
    return saved ? Number(saved) : 380;
  });
  const splitterDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const cueFormSaveRef = useRef<(() => void) | null>(null);
  const previousUrlRef = useRef<string>('');
  const cuesDirtyRef = useRef(false);
  const isConfigOpenRef = useRef(false);

  // ── Dual-window mode state ──
  const [isDualWindow, setIsDualWindow] = useState(false);
  const [popupTimecode, setPopupTimecode] = useState(0);
  const popupRef = useRef<Window | null>(null);
  const popupTimecodeRef = useRef(0);        // last timecode from popup (non-reactive, for keydown)

  // ── Persistent video handle (File System Access API) ──
  const {
    state: handleState,
    requestAccess: requestVideoAccess,
    pickAndStoreVideo,
    storeHandle: storeVideoHandle,
    clearHandle: clearVideoHandle,
  } = useVideoHandle({
    projectId,
    videoFilename: projectVideoFilename,
    videoFilesize: projectVideoFilesize,
    autoRequest: true, // project was opened via user click (gesture)
  });

  // ── Splitter drag effect ──
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const drag = splitterDragRef.current;
      if (!drag || !mainRef.current) return;
      e.preventDefault();
      const mainRect = mainRef.current.getBoundingClientRect();
      const maxPx = mainRect.width * PANEL_MAX_RATIO;
      // Moving mouse left => panel gets wider (panel is on the right)
      const delta = drag.startX - e.clientX;
      const newWidth = Math.max(PANEL_MIN_PX, Math.min(maxPx, drag.startWidth + delta));
      setPanelWidthPx(newWidth);
    };
    const onMouseUp = () => {
      if (splitterDragRef.current) {
        splitterDragRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // Persist panel width on change
  useEffect(() => {
    localStorage.setItem(`cuetation:panelWidth:${projectId ?? '__global__'}`, String(Math.round(panelWidthPx)));
  }, [panelWidthPx, projectId]);

  const { state: playerState, actions: playerActions } = useVideoPlayer(videoRef, containerRef, videoSrc);
  const {
    config,
    configLoaded,
    setCueTypes,
    addCueType,
    removeCueType,
    renameCueType,
    setCueTypeColor,
    setCueTypeShortCode,
    setCueTypeFontColor,
    setShowShortCodes,
    setExpandedSearchFilter,
    setShowPastCues,
    setShowSkippedCues,
    setShowVideoTimecode,
    setVideoTimecodePosition,
    setCueTypeFields,
    toggleColumnVisibility,
    reorderColumns,
    addCueTypeColumns,
    removeCueTypeColumns,
    exportConfig,
    importConfig,
    reloadConfig,
    saveConfigBackup,
    setCueBackupInterval,
    setCueSheetView,
    setTheatreMode,
    clearAllData,
    clearCurrentVideoCues,
    clearAllCues,
    applyTemplate,
    addFieldDefinition,
    updateFieldDefinition,
    archiveFieldDefinition,
    restoreFieldDefinition,
    setMandatoryField,
    unsetMandatoryField,
  } = useConfiguration();

  const {
    annotations,
    activeId,
    skippedIds,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    replaceAll,
    updateActiveAnnotation,
    renameCueType: renameAnnotationCueType,
    setAnnotationStatus,
    setAnnotationFlag,
    duplicateAnnotation,
    reorderInTieGroup,
  } = useAnnotations(annotationScope.fileName, annotationScope.fileSize, playerState.duration);
  const annotationsRef = useRef(annotations);
  const { toasts, addToast, removeToast } = useToast();

  // ── Scrubber markers for scene/act grouping ──
  const scrubberMarkers = useMemo(() => {
    const sorted = [...annotations].sort((a, b) => a.timestamp - b.timestamp);
    const titleMarkers: ScrubberTitleMarker[] = [];
    const sceneMarkers: ScrubberSceneMarker[] = [];
    const sceneBands: ScrubberSceneBand[] = [];
    const scenes: { timestamp: number; name: string }[] = [];

    for (const ann of sorted) {
      if (ann.cue.type === 'TITLE') {
        titleMarkers.push({ timestamp: ann.timestamp, name: ann.cue.what || 'Title' });
      } else if (ann.cue.type === 'SCENE') {
        scenes.push({ timestamp: ann.timestamp, name: ann.cue.what || 'Scene' });
      }
    }
    for (let i = 0; i < scenes.length; i++) {
      const color = SCENE_BAND_COLORS[i % SCENE_BAND_COLORS.length];
      sceneMarkers.push({ timestamp: scenes[i].timestamp, name: scenes[i].name, color });
      if (scenes.length >= 2 && i < scenes.length - 1) {
        sceneBands.push({ startTime: scenes[i].timestamp, endTime: scenes[i + 1].timestamp, color, name: scenes[i].name });
      }
      if (scenes.length >= 2 && i === scenes.length - 1) {
        sceneBands.push({ startTime: scenes[i].timestamp, endTime: Infinity, color, name: scenes[i].name });
      }
    }
    return { titleMarkers, sceneMarkers, sceneBands };
  }, [annotations]);

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
      setHasUnsavedChanges(true);
      onUnsavedChangesChange?.(true);
    }
  }, [annotations, onUnsavedChangesChange]);

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
    setHasUnsavedChanges(false);
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

  // Sync live config back to the project record in IndexedDB so exports are always current
  useEffect(() => {
    if (!projectId || !configLoaded) return;
    const timer = setTimeout(() => {
      updateProjectConfig(projectId, config);
    }, 2000); // debounce 2s to avoid excessive writes
    return () => clearTimeout(timer);
  }, [projectId, config, configLoaded]);

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
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (cuesDirtyRef.current) {
        const currentFileName = annotationScope.fileName || 'no-video';
        const currentFileSize = annotationScope.fileName ? annotationScope.fileSize : 0;
        backupAnnotations(currentFileName, currentFileSize, annotationsRef.current);
        cuesDirtyRef.current = false;
        // Show browser warning for unsaved changes
        e.preventDefault();
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

  // Compute which field keys have data in any annotation (current project)
  const usedFieldKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const ann of annotations) {
      for (const [k, v] of Object.entries(ann.cue)) {
        if (v && typeof v === 'string' && v.trim()) keys.add(k);
      }
    }
    return keys;
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
    loadAnnotations(currentFileName, currentFileSize).then((restored) => {
      replaceAll(restored);
      addToast(`Restored ${restored.length} cue${restored.length !== 1 ? 's' : ''} for current video`, 'success');
    });
  }, [annotationScope, replaceAll, addToast]);

  const handleRecoverConfig = useCallback(() => {
    reloadConfig();
    addToast('Configuration restored from backup', 'success');
  }, [reloadConfig, addToast]);

  // Update active annotation on time change
  useEffect(() => {
    updateActiveAnnotation(playerState.currentTime);
  }, [playerState.currentTime, updateActiveAnnotation]);

  // Handle file selection (with optional handle from File System Access API)
  const handleFileSelected = useCallback(
    (file: File, handle?: FileSystemFileHandle) => {
      // Revoke previous video URL
      if (previousUrlRef.current) {
        URL.revokeObjectURL(previousUrlRef.current);
      }

      const url = URL.createObjectURL(file);
      previousUrlRef.current = url;

      setVideoFile(file);
      setVideoSrc(url);
      // When a project is open, cues belong to the project — don't re-scope to the video
      if (!projectId) {
        setAnnotationScope({ fileName: file.name, fileSize: file.size });
      }
      setIsAnnotating(false);
      setIsNoVideoMode(false);

      // Store the handle if provided (FSAA — persistent access for next session)
      if (handle && projectId) {
        storeVideoHandle(handle);
        onVideoHandleStored?.(handle);
      }

      // Notify parent (AppShell) so it can update the project's video reference
      if (onVideoLoaded) {
        const tempVideo = document.createElement('video');
        tempVideo.src = url;
        tempVideo.onloadedmetadata = () => {
          onVideoLoaded(file, tempVideo.duration);
        };
      }

      // Check for no-video annotations to migrate, or existing annotations on this video
      (async () => {
        const migrated = await migrateNoVideoAnnotations(file.name, file.size);
        if (migrated > 0) {
          addToast(`Migrated ${migrated} annotation${migrated !== 1 ? 's' : ''} to this video`, 'info');
        } else {
          const { exists, count } = await hasAnnotationData(file.name, file.size);
          if (exists) {
            addToast(`Restored ${count} annotation${count !== 1 ? 's' : ''} from previous session`, 'info');
          }
        }
      })();
    },
    [addToast, onVideoLoaded, onVideoHandleStored, projectId, storeVideoHandle],
  );

  // Auto-load video when handle resolves to 'granted' (returning user with stored handle)
  const handleAutoLoadedRef = useRef(false);
  useEffect(() => {
    if (handleState.status === 'granted' && handleState.file && !videoSrc && !isNoVideoMode && !handleAutoLoadedRef.current) {
      handleAutoLoadedRef.current = true;
      handleFileSelected(handleState.file);
      addToast('Video reconnected from previous session', 'success', 3000);
    }
    // Reset the flag when project changes
    if (handleState.status === 'loading' || handleState.status === 'none') {
      handleAutoLoadedRef.current = false;
    }
  }, [handleState.status, handleState.file, videoSrc, isNoVideoMode, handleFileSelected, addToast]);

  // Handle continue without video
  const handleContinueWithoutVideo = useCallback(() => {
    if (previousUrlRef.current) {
      URL.revokeObjectURL(previousUrlRef.current);
      previousUrlRef.current = '';
    }
    setVideoFile(null);
    setVideoSrc('');
    // When a project is open, cues belong to the project — don't re-scope
    if (!projectId) {
      setAnnotationScope({ fileName: '', fileSize: 0 });
    }
    setIsAnnotating(false);
    setIsNoVideoMode(true);
    addToast('Ready to add annotations. Upload a video anytime.', 'info');
  }, [addToast, projectId]);

  // Handle video error
  const handleVideoError = useCallback(() => {
    addToast('Unable to play this video format. Try MP4 (H.264) or WebM.', 'error', 5000);
  }, [addToast]);

  const saveCurrentVideoAnnotations = useCallback(() => {
    const currentFileName = annotationScope.fileName || 'no-video';
    const currentFileSize = annotationScope.fileSize || 0;
    saveAnnotations(currentFileName, currentFileSize, annotations);
  }, [annotationScope, annotations]);

  // Open a file picker for video selection (uses FSAA when available for persistent handle)
  const openVideoPicker = useCallback((onPicked: (file: File, handle?: FileSystemFileHandle) => void) => {
    if (supportsFileSystemAccess) {
      pickVideoWithHandle().then((result) => {
        if (result) {
          onPicked(result.file, result.handle);
        }
      });
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'video/*';
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) onPicked(file);
      };
      input.click();
    }
  }, []);

  // ── BroadcastChannel (dual-window sync) ──
  const onBroadcastMessage = useCallback((msg: SyncMessage) => {
    switch (msg.type) {
      case 'TIMECODE_UPDATE':
        popupTimecodeRef.current = msg.seconds;
        setPopupTimecode(msg.seconds);
        break;
      case 'PLAYBACK_STATE':
        // Reflect to local state for UI (active cue tracking, etc.)
        break;
      case 'POPUP_READY':
        // Popup loaded and video is playing
        break;
      case 'POPUP_CLOSING':
        // Popup has been closed — bring video back to main window
        // Force video re-initialization by cycling the src URL
        setIsDualWindow(false);
        popupRef.current = null;
        break;
    }
  }, []);

  // After dual-window ends, re-create the video URL so the newly mounted <video>
  // element gets fresh event listeners from useVideoPlayer (src change triggers reset)
  const wasDualWindowRef = useRef(false);
  useEffect(() => {
    if (isDualWindow) {
      wasDualWindowRef.current = true;
    } else if (wasDualWindowRef.current && videoFile) {
      wasDualWindowRef.current = false;
      // Revoke old URL and create a fresh one to force useVideoPlayer re-init
      if (previousUrlRef.current) {
        URL.revokeObjectURL(previousUrlRef.current);
      }
      const freshUrl = URL.createObjectURL(videoFile);
      previousUrlRef.current = freshUrl;
      setVideoSrc(freshUrl);
    }
  }, [isDualWindow, videoFile]);

  const { send: broadcastSend } = useBroadcastSync(onBroadcastMessage);

  // Sync showVideoTimecode config to popup when it changes
  useEffect(() => {
    if (isDualWindow) {
      broadcastSend({ type: 'CONFIG_SHOW_TIMECODE', show: config.showVideoTimecode });
    }
  }, [config.showVideoTimecode, isDualWindow, broadcastSend]);

  // Toggle play/pause (Space)
  const handleTogglePlay = useCallback(() => {
    if (isDualWindow) {
      broadcastSend({ type: 'CMD_TOGGLE_PLAY' });
      return;
    }
    if (!videoSrc) return;
    playerActions.togglePlay();
  }, [videoSrc, playerActions, isDualWindow, broadcastSend]);

  // Enter → pause & annotate
  const handleEnterAnnotate = useCallback(() => {
    if (!videoSrc && !isNoVideoMode && !isDualWindow) return;
    if (isAnnotating) return; // Already annotating

    if (isDualWindow) {
      // In dual-window mode, pause popup and use its timecode
      broadcastSend({ type: 'CMD_PAUSE' });
      setAnnotateTimestamp(popupTimecodeRef.current);
    } else if (videoSrc) {
      // In video mode, pause and use current time
      const video = videoRef.current;
      if (!video) return;
      video.pause();
      setAnnotateTimestamp(playerState.currentTime);
    } else if (isNoVideoMode) {
      // In no-video mode, use 0:00
      setAnnotateTimestamp(0);
    }
    
    setIsAnnotating(true);
  }, [videoSrc, isNoVideoMode, isAnnotating, playerState.currentTime, isDualWindow, broadcastSend]);

  // Save cue — close form and resume playback
  const handleSaveCue = useCallback(
    (cue: CueFields, overrideTimestamp?: number) => {
      addAnnotation(typeof overrideTimestamp === 'number' ? overrideTimestamp : annotateTimestamp, cue);

      setIsAnnotating(false);
      addToast('Cue saved', 'success');
      // Resume playback after saving
      if (isDualWindow) {
        broadcastSend({ type: 'CMD_PLAY' });
      } else {
        try {
          videoRef.current?.play().catch(() => {});
        } catch {
          // ignore
        }
      }
    },
    [annotateTimestamp, addAnnotation, addToast, isDualWindow, broadcastSend],
  );

  // Cancel note — close form and resume playback
  const handleCancelNote = useCallback(() => {
    setIsAnnotating(false);
    // Resume playback
    if (isDualWindow) {
      broadcastSend({ type: 'CMD_PLAY' });
    } else {
      try {
        videoRef.current?.play().catch(() => {});
      } catch {
        // ignore
      }
    }
  }, [isDualWindow, broadcastSend]);

  // Seek to annotation timestamp
  const handleSeek = useCallback(
    (time: number) => {
      if (isDualWindow) {
        broadcastSend({ type: 'CMD_SEEK', seconds: time });
        popupTimecodeRef.current = time;
        setPopupTimecode(time);
        updateActiveAnnotation(time);
      } else {
        playerActions.seek(time);
      }
    },
    [playerActions, isDualWindow, broadcastSend, updateActiveAnnotation],
  );

  // Pop out video into a separate window
  const handlePopOutVideo = useCallback(() => {
    if (!projectId || !videoSrc) return;

    // Pause local video before handing off
    videoRef.current?.pause();

    const popup = window.open(
      `/video-window?projectId=${encodeURIComponent(projectId)}&showTimecode=${config.showVideoTimecode ? '1' : '0'}`,
      'cuetation-video',
      'popup=1,width=1280,height=720,menubar=0,toolbar=0,location=0,status=0',
    );

    if (popup) {
      popupRef.current = popup;
      setIsDualWindow(true);
    }
  }, [projectId, videoSrc]);

  // Bring video back from popup
  const handleBringBack = useCallback(() => {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    popupRef.current = null;
    setIsDualWindow(false);
  }, []);

  // Export — open the format chooser dialog
  const handleExport = useCallback(() => {
    if (annotations.length === 0) return;
    setIsExportDialogOpen(true);
  }, [annotations.length]);

  // Direct CSV export
  const handleExportCSV = useCallback(() => {
    if (annotations.length === 0) return;
    exportAnnotationsToCSV(annotations, videoFile?.name ?? 'video');
    addToast(`Exported ${annotations.length} cues to CSV`, 'success');
  }, [annotations, videoFile, addToast]);

  // Open XLSX template builder (closes the export dialog)
  const handleExportXLSX = useCallback(() => {
    setIsExportDialogOpen(false);
    setIsXlsxBuilderOpen(true);
  }, []);

  // Export full project (.cuetation.json)
  const handleExportProject = useCallback(async () => {
    if (!projectId) return;
    try {
      const projects = await loadProjects();
      const project = projects.find((p) => p.id === projectId);
      if (!project) { addToast('Project not found', 'error'); return; }
      const json = await exportProjectToJSON(project, config);
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.cuetation.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast('Project exported', 'success');
    } catch (err) {
      addToast(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    }
  }, [projectId, config, addToast]);

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

  // Ctrl+S explicit save handler
  const handleExplicitSave = useCallback(() => {
    if (!cuesDirtyRef.current) return; // silent no-op
    performCueBackup();
    onSave?.();
    onUnsavedChangesChange?.(false);
  }, [performCueBackup, onSave, onUnsavedChangesChange]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S / Cmd+S for explicit save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleExplicitSave();
        return;
      }

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

      // G → Go To dialog
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        setIsGoToOpen(true);
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          {
            const skipAmount = e.shiftKey || e.ctrlKey ? 1 : 5;
            if (isDualWindow) {
              broadcastSend({ type: 'CMD_SEEK', seconds: popupTimecodeRef.current - skipAmount });
            } else {
              handleSeek(playerState.currentTime - skipAmount);
            }
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          {
            const skipAmount = e.shiftKey || e.ctrlKey ? 1 : 5;
            if (isDualWindow) {
              broadcastSend({ type: 'CMD_SEEK', seconds: popupTimecodeRef.current + skipAmount });
            } else {
              handleSeek(playerState.currentTime + skipAmount);
            }
          }
          break;
        case ',':
          e.preventDefault();
          if (isDualWindow) {
            // Approximate frame step backward (~1/24s)
            broadcastSend({ type: 'CMD_SEEK', seconds: popupTimecodeRef.current - (1 / 24) });
          } else {
            playerActions.stepFrame(-1);
          }
          break;
        case '.':
          e.preventDefault();
          if (isDualWindow) {
            broadcastSend({ type: 'CMD_SEEK', seconds: popupTimecodeRef.current + (1 / 24) });
          } else {
            playerActions.stepFrame(1);
          }
          break;
        case '+':
        case '=':
          e.preventDefault();
          {
            const speeds = [1, 1.5, 2, 4, 8];
            const idx = speeds.indexOf(playerState.playbackRate);
            if (idx < speeds.length - 1) {
              const next = speeds[idx + 1];
              if (isDualWindow) {
                broadcastSend({ type: 'CMD_SPEED', speed: next });
              } else {
                playerActions.setSpeed(next);
              }
              addToast(`Speed: ${next}x`, 'info', 1500);
            }
          }
          break;
        case '-':
          e.preventDefault();
          {
            const speeds = [1, 1.5, 2, 4, 8];
            const idx = speeds.indexOf(playerState.playbackRate);
            if (idx > 0) {
              const prev = speeds[idx - 1];
              if (isDualWindow) {
                broadcastSend({ type: 'CMD_SPEED', speed: prev });
              } else {
                playerActions.setSpeed(prev);
              }
              addToast(`Speed: ${prev}x`, 'info', 1500);
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTogglePlay, handleEnterAnnotate, handleExplicitSave, playerActions, playerState.playbackRate, playerState.currentTime, addToast, isNoVideoMode, isConfigOpen, handleSeek, isDualWindow, broadcastSend]);

  // Cleanup video URL on unmount
  useEffect(() => {
    return () => {
      if (previousUrlRef.current) URL.revokeObjectURL(previousUrlRef.current);
    };
  }, []);

  // Gate on config loaded from IndexedDB
  if (!configLoaded) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <span className="font-mono text-sm tracking-widest uppercase" style={{ color: 'var(--text-dim)' }}>Loading…</span>
      </div>
    );
  }

  return (
    <div className={`h-screen flex flex-col overflow-hidden${config.theatreMode ? ' theatre-mode' : ''}`} style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Header */}
      <header style={{
        height: 44,
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 0,
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div className="font-display" style={{
          fontSize: 17,
          color: 'var(--text)',
          letterSpacing: '-0.01em',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingRight: 16,
          borderRight: '1px solid var(--border)',
          marginRight: 12,
        }}>
          Cue<em style={{ fontStyle: 'italic', color: 'var(--amber)' }}>tation</em>
        </div>

        {/* Home link */}
        {onGoHome && (
          <button
            type="button"
            onClick={onGoHome}
            style={{
              fontSize: 12,
              color: 'var(--text-mid)',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: 'var(--r-sm)',
              border: 'none',
              background: 'transparent',
              transition: 'all 0.15s',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-mid)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            ← Home
          </button>
        )}

        {/* Project */}
        {projectName && (
          <>
            <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 'var(--r-sm)',
            }}>
              <div style={{
                width: 18, height: 18,
                background: 'var(--amber-dim)',
                border: '1px solid rgba(191,87,0,0.3)',
                borderRadius: 3,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Film style={{ width: 10, height: 10, color: 'var(--amber)' }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{projectName}</span>
              {hasUnsavedChanges && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--yellow)', animation: 'pulse 2s infinite', display: 'inline-block' }} title="Unsaved changes" />
              )}
              {onSwitchProject && (
                <button
                  type="button"
                  onClick={onSwitchProject}
                  style={{
                    fontSize: 11,
                    color: 'var(--text-dim)',
                    padding: '3px 7px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-sm)',
                    marginLeft: 4,
                    cursor: 'pointer',
                    background: 'transparent',
                    transition: 'all 0.15s',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-hi)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-mid)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-dim)'; }}
                >
                  Switch ▾
                </button>
              )}
            </div>
          </>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Settings button */}
          <button
            type="button"
            onClick={() => { isConfigOpenRef.current = true; setIsConfigOpen(true); }}
            style={{
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 'var(--r-sm)',
              cursor: 'pointer',
              color: 'var(--text-mid)',
              border: '1px solid transparent',
              background: 'transparent',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'var(--bg-hover)'; b.style.borderColor = 'var(--border)'; b.style.color = 'var(--text)'; }}
            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'transparent'; b.style.borderColor = 'transparent'; b.style.color = 'var(--text-mid)'; }}
            title="Configuration"
          >
            <Settings className="w-4 h-4" />
          </button>
          {/* Export button */}
          <button
            type="button"
            onClick={() => setIsExportDialogOpen(true)}
            style={{
              height: 28,
              padding: '0 12px',
              background: 'var(--amber)',
              color: 'var(--text-inv)',
              border: 'none',
              borderRadius: 'var(--r-sm)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--amber-hi)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--amber)'; }}
          >
            ↓ Export
          </button>
        </div>
      </header>

      {/* Main content */}
      {!videoSrc && !isNoVideoMode ? (
        // Show reconnect banner when there's a stored handle needing attention
        handleState.isSupported && handleState.status !== 'none' && handleState.status !== 'granted' ? (
          <main className="flex-1 flex flex-col lg:flex-row gap-0 min-h-0 overflow-hidden" style={{ background: 'var(--bg)' }}>
            <div className="flex flex-col min-w-0 min-h-0 w-full" style={{ flex: '1 1 0%', background: '#0a0a0c' }}>
              <VideoReconnectBanner
                bannerState={handleState.status === 'loading' ? 'loading' : handleState.status as 'prompt' | 'denied' | 'broken'}
                videoFilename={handleState.videoFilename}
                onRequestAccess={async () => {
                  const file = await requestVideoAccess();
                  if (file) {
                    handleFileSelected(file);
                    addToast('Video reconnected', 'success', 3000);
                  }
                }}
                onRelinkVideo={async () => {
                  const result = await pickAndStoreVideo();
                  if (result) {
                    handleFileSelected(result.file, result.handle);
                    addToast('Video relinked', 'success', 3000);
                  }
                }}
                onLoadDifferentVideo={async () => {
                  await clearVideoHandle();
                  const result = supportsFileSystemAccess
                    ? await pickAndStoreVideo()
                    : null;
                  if (result) {
                    handleFileSelected(result.file, result.handle);
                  }
                  // If FSAA not available or cancelled, will show VideoDropZone
                }}
                onContinueWithoutVideo={handleContinueWithoutVideo}
              />
            </div>
          </main>
        ) : (
          <main className="flex-1 flex items-center justify-center p-8" style={{ background: 'var(--bg)' }}>
            <VideoDropZone
              onFileSelected={handleFileSelected}
              onContinueWithoutVideo={handleContinueWithoutVideo}
            />
          </main>
        )
      ) : (
        <main ref={mainRef} className="flex-1 flex flex-col lg:flex-row gap-0 min-h-0 overflow-hidden" style={{ background: 'var(--bg)' }}>
          {/* Left: Video + cue form — hidden in dual-window mode */}
          {!isDualWindow && (
          <>
          <div ref={containerRef} className="flex flex-col min-w-0 min-h-0" style={{ flex: '1 1 0%', borderRight: 'none', background: '#0a0a0c' }}>
            {/* Video panel header with Pop out button */}
            {videoSrc && supportsDualWindow && (
              <div className="flex items-center justify-between px-3 py-1.5" style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border)' }}>
                <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>Video</span>
                <button
                  type="button"
                  onClick={handlePopOutVideo}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors"
                  style={{ color: 'var(--text-mid)', background: 'transparent', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--border-hi)'; e.currentTarget.style.color = 'var(--text)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-mid)'; }}
                  title="Open video in a separate window for dual-monitor use"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Pop out video</span>
                </button>
              </div>
            )}
            {!isNoVideoMode ? (
              <VideoPlayer
                ref={videoRef}
                src={videoSrc}
                state={playerState}
                actions={playerActions}
                onVideoError={handleVideoError}
                showVideoTimecode={config.showVideoTimecode}
                videoTimecodePosition={config.videoTimecodePosition}
                onVideoTimecodePositionChange={setVideoTimecodePosition}
                titleMarkers={scrubberMarkers.titleMarkers}
                sceneMarkers={scrubberMarkers.sceneMarkers}
                sceneBands={scrubberMarkers.sceneBands}
              />
            ) : (
              <div className="w-full flex flex-col items-center justify-center min-h-[300px]" style={{ background: 'linear-gradient(135deg, #0f0f12 0%, #141418 100%)' }}>
                <div className="text-center">
                  <p className="font-mono text-sm" style={{ color: 'var(--text-dim)', letterSpacing: '0.05em' }}>NO VIDEO LOADED</p>
                  <p className="font-mono text-xs mt-1" style={{ color: 'var(--text-dim)' }}>Cues will default to 0:00</p>
                </div>
              </div>
            )}
            {/* Video filename bar */}
            {videoFile && (
              <div className="flex items-center justify-between font-mono" style={{ padding: '6px 12px', background: 'var(--bg-raised)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {videoFile.name}
                  {videoFile.size ? <span style={{ color: 'var(--text-dim)', opacity: 0.6, marginLeft: 8 }}>{(videoFile.size / (1024 * 1024)).toFixed(0)}MB</span> : null}
                </span>
                <button
                  type="button"
                  onClick={() => setIsChangeVideoOpen(true)}
                  className="font-mono"
                  style={{ fontSize: 11, color: 'var(--text-dim)', cursor: 'pointer', textDecoration: 'underline', background: 'transparent', border: 'none', fontFamily: 'inherit', whiteSpace: 'nowrap', marginLeft: 12, flexShrink: 0 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-dim)'; }}
                >
                  Change video
                </button>
              </div>
            )}
            {isNoVideoMode && !videoFile && (
              <div className="flex items-center justify-center font-mono" style={{ padding: '6px 12px', background: 'var(--bg-raised)', borderTop: '1px solid var(--border)' }}>
                <button
                  type="button"
                  onClick={() => setIsNoVideoMode(false)}
                  className="font-mono"
                  style={{ fontSize: 11, color: 'var(--text-dim)', cursor: 'pointer', textDecoration: 'underline', background: 'transparent', border: 'none', fontFamily: 'inherit' }}
                >
                  Upload video
                </button>
              </div>
            )}
            {/* Clickable keyboard hints */}
            {!isAnnotating && videoSrc && (
              <div className="flex flex-wrap items-center gap-1 px-3 py-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-raised)' }}>
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors"
                  style={{ color: 'var(--text-mid)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                  title="Play / Pause"
                >
                  <kbd className="inline-flex items-center justify-center w-7 h-7 text-[11px] font-mono font-bold rounded" style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)', border: '1px solid var(--border-hi)' }}>␣</kbd>
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{playerState.isPlaying ? 'Pause' : 'Play'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleEnterAnnotate}
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors"
                  style={{ background: 'rgba(191,87,0,0.12)', color: 'var(--amber)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(191,87,0,0.22)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(191,87,0,0.12)')}
                  title="New Cue"
                >
                  <kbd className="inline-flex items-center justify-center w-7 h-7 text-[11px] font-mono font-bold rounded" style={{ background: 'rgba(191,87,0,0.25)', color: 'var(--amber)', border: '1px solid rgba(191,87,0,0.5)' }}>↵</kbd>
                  <span className="text-xs font-medium" style={{ color: 'var(--amber)' }}>Cue</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSeek(playerState.currentTime - 5)}
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors"
                  style={{ color: 'var(--text-mid)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                  title="Back 5s"
                >
                  <kbd className="inline-flex items-center justify-center w-7 h-7 text-[11px] font-mono font-bold rounded" style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)', border: '1px solid var(--border-hi)' }}>←</kbd>
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>−5s</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSeek(playerState.currentTime + 5)}
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors"
                  style={{ color: 'var(--text-mid)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                  title="Forward 5s"
                >
                  <kbd className="inline-flex items-center justify-center w-7 h-7 text-[11px] font-mono font-bold rounded" style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)', border: '1px solid var(--border-hi)' }}>→</kbd>
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>+5s</span>
                </button>
                <button
                  type="button"
                  onClick={() => playerActions.stepFrame(-1)}
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors"
                  style={{ color: 'var(--text-mid)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                  title="Previous frame"
                >
                  <kbd className="inline-flex items-center justify-center w-7 h-7 text-[11px] font-mono font-bold rounded" style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)', border: '1px solid var(--border-hi)' }}>,</kbd>
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>−1f</span>
                </button>
                <button
                  type="button"
                  onClick={() => playerActions.stepFrame(1)}
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors"
                  style={{ color: 'var(--text-mid)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                  title="Next frame"
                >
                  <kbd className="inline-flex items-center justify-center w-7 h-7 text-[11px] font-mono font-bold rounded" style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)', border: '1px solid var(--border-hi)' }}>.</kbd>
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>+1f</span>
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
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors"
                  style={{ color: 'var(--text-mid)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                  title="Speed up"
                >
                  <kbd className="inline-flex items-center justify-center w-7 h-7 text-[11px] font-mono font-bold rounded" style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)', border: '1px solid var(--border-hi)' }}>+</kbd>
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Fast</span>
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
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors"
                  style={{ color: 'var(--text-mid)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                  title="Slow down"
                >
                  <kbd className="inline-flex items-center justify-center w-7 h-7 text-[11px] font-mono font-bold rounded" style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)', border: '1px solid var(--border-hi)' }}>−</kbd>
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Slow</span>
                </button>
              </div>
            )}
            {!isAnnotating && isNoVideoMode && (
              <div className="mt-2 flex items-center gap-2 px-1">
                <button
                  type="button"
                  onClick={handleEnterAnnotate}
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors"
                  style={{ background: 'rgba(191,87,0,0.12)', color: 'var(--amber)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(191,87,0,0.22)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(191,87,0,0.12)')}
                  title="Add Cue"
                >
                  <kbd className="inline-flex items-center justify-center w-7 h-7 text-[11px] font-mono font-bold rounded" style={{ background: 'rgba(191,87,0,0.25)', color: 'var(--amber)', border: '1px solid rgba(191,87,0,0.5)' }}>↵</kbd>
                  <span className="text-xs font-medium" style={{ color: 'var(--amber)' }}>Add Cue</span>
                </button>
              </div>
            )}
          </div>
          {/* Draggable splitter handle */}
          <div
            className="hidden lg:flex items-center justify-center shrink-0 cursor-col-resize group"
            style={{ width: 6, background: 'var(--bg)', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}
            onMouseDown={(e) => {
              e.preventDefault();
              splitterDragRef.current = { startX: e.clientX, startWidth: panelWidthPx };
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
            }}
            onDoubleClick={() => setPanelWidthPx(380)}
            title="Drag to resize • Double-click to reset"
          >
            <div className="w-[2px] h-8 rounded-full transition-colors" style={{ background: 'var(--border-hi)' }} />
          </div>
          </>
          )}

          {/* Right: Cue Sheet panel — full width in dual-window, constrained otherwise */}
          <div className="h-[calc(100vh-5rem)] overflow-hidden flex flex-col" style={isDualWindow ? { flex: '1 1 0%' } : { width: panelWidthPx, flexShrink: 0 }}>
            {/* Dual-window status bar */}
            {isDualWindow && (
              <div
                className="flex items-center gap-2 px-4 flex-shrink-0"
                style={{ height: 28, background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)' }}
              >
                <span style={{ color: 'var(--amber)', fontSize: 14 }}>⬡</span>
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Video on external screen</span>
                <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>·</span>
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Keep this window focused for hotkeys</span>
                <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>·</span>
                <button
                  type="button"
                  onClick={handleBringBack}
                  className="text-xs underline"
                  style={{ color: 'var(--amber)', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--amber-hi)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--amber)'; }}
                >
                  Bring back
                </button>
              </div>
            )}
            <AnnotationPanel
              projectId={projectId || ''}
              annotations={annotations}
              activeId={activeId}
              skippedIds={skippedIds}
              showSkippedCues={config.showSkippedCues}
              currentTime={isDualWindow ? popupTimecode : playerState.currentTime}
              isPlaying={playerState.isPlaying}
              cueTypeColors={config.cueTypeColors}
              cueTypeShortCodes={config.cueTypeShortCodes}
              cueTypeFontColors={config.cueTypeFontColors}
              showShortCodes={config.showShortCodes}
              expandedSearchFilter={config.expandedSearchFilter}
              onSetExpandedSearchFilter={setExpandedSearchFilter}
              showPastCues={config.showPastCues}
              cueSheetView={config.cueSheetView}
              theatreMode={config.theatreMode}
              cueTypeFields={config.cueTypeFields}
              fieldDefinitions={config.fieldDefinitions}
              mandatoryFields={config.mandatoryFields}
              onSeek={handleSeek}
              onEdit={updateAnnotation}
              onDelete={deleteAnnotation}
              onExport={handleExport}
              onImport={handleImport}
              isNoVideoMode={isNoVideoMode}
              visibleColumns={config.visibleColumns}
              cueTypeColumns={config.cueTypeColumns}
              cueTypes={config.cueTypes}
              onSetStatus={setAnnotationStatus}
              onSetFlag={setAnnotationFlag}
              onDuplicate={duplicateAnnotation}
              onReorderTieGroup={reorderInTieGroup}
              isCreating={isAnnotating}
              createTimestamp={annotateTimestamp}
              onCreateSave={handleSaveCue}
              onCreateCancel={handleCancelNote}
              createSaveRef={cueFormSaveRef}
            />
          </div>
        </main>
      )}

      {/* Change Video Modal */}
      {isChangeVideoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-xl shadow-2xl w-full max-w-sm p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Change Video</h2>
              <button
                type="button"
                onClick={() => setIsChangeVideoOpen(false)}
                className="p-1 rounded-md transition-colors"
                style={{ color: 'var(--text-mid)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-mid)'; }}
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm mb-5" style={{ color: 'var(--text-mid)' }}>
              Select a new video file. Copy cues to the new video, or switch and keep that video's own cues.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  openVideoPicker((file, handle) => {
                    saveCurrentVideoAnnotations();
                    saveAnnotations(file.name, file.size, annotations);
                    handleFileSelected(file, handle);
                    setIsChangeVideoOpen(false);
                    addToast('Switched video and copied current cues', 'success');
                  });
                }}
                className="w-full px-4 py-2.5 text-sm text-white rounded-lg transition-colors"
                style={{ background: 'var(--amber)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--amber-hi)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--amber)')}
              >
                Select New Video (Copy Cues)
              </button>
              <button
                type="button"
                onClick={() => {
                  openVideoPicker((file, handle) => {
                    saveCurrentVideoAnnotations();
                    handleFileSelected(file, handle);
                    setIsChangeVideoOpen(false);
                    addToast('Switched video \u2014 loaded its own cues', 'info');
                  });
                }}
                className="w-full px-4 py-2.5 text-sm rounded-lg transition-colors"
                style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-panel)')}
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
        liveConfig={config}
        cueTypes={config.cueTypes}
        cueTypeColors={config.cueTypeColors}
        cueTypeShortCodes={config.cueTypeShortCodes}
        cueTypeFontColors={config.cueTypeFontColors}
        cueTypeFields={config.cueTypeFields}
        visibleColumns={config.visibleColumns}
        cueTypeColumns={config.cueTypeColumns}
        usedCueTypes={usedCueTypes}
        showShortCodes={config.showShortCodes}
        showPastCues={config.showPastCues}
        onSetShowPastCues={setShowPastCues}
        showSkippedCues={config.showSkippedCues}
        onSetShowSkippedCues={setShowSkippedCues}
        showVideoTimecode={config.showVideoTimecode}
        cueSheetView={config.cueSheetView}
        onSetCueSheetView={setCueSheetView}
        theatreMode={config.theatreMode}
        onSetTheatreMode={setTheatreMode}
        onSetShowVideoTimecode={setShowVideoTimecode}
        currentVideoName={videoFile?.name}
        currentVideoSize={videoFile?.size}
        cueBackupIntervalMinutes={config.cueBackupIntervalMinutes}
        onSetCueBackupInterval={setCueBackupInterval}
        onAddCueType={addCueType}
        onRemoveCueType={removeCueType}
        onRenameCueType={handleRenameCueType}
        onSetCueTypeColor={setCueTypeColor}
        onSetCueTypeShortCode={setCueTypeShortCode}
        onSetCueTypeFontColor={setCueTypeFontColor}
        onSetShowShortCodes={setShowShortCodes}
        onSetCueTypeFields={setCueTypeFields}
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
        onDeleteProject={() => {
          onDeleteProject?.();
          setIsConfigOpen(false);
        }}
        onApplyTemplate={applyTemplate}
        onAddField={addFieldDefinition}
        onUpdateField={updateFieldDefinition}
        onArchiveField={archiveFieldDefinition}
        onRestoreField={restoreFieldDefinition}
        usedFieldKeys={usedFieldKeys}
        mandatoryFields={config.mandatoryFields}
        onSetMandatoryField={setMandatoryField}
        onUnsetMandatoryField={unsetMandatoryField}
        addToast={addToast}
        projectName={projectName}
        annotationCount={annotations.length}
        onGoHome={onGoHome}
        onDeleteAllProjects={onDeleteAllProjects}
      />

      {/* Export Dialog — CSV vs XLSX chooser */}
      <ExportDialog
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
        onExportCSV={handleExportCSV}
        onExportXLSX={handleExportXLSX}
        onExportProject={handleExportProject}
        annotationCount={annotations.length}
      />

      {/* XLSX Template Builder */}
      <ExportTemplateBuilder
        isOpen={isXlsxBuilderOpen}
        onClose={() => setIsXlsxBuilderOpen(false)}
        annotations={annotations}
        cueTypes={config.cueTypes}
        cueTypeColors={config.cueTypeColors}
        cueTypeShortCodes={config.cueTypeShortCodes}
        skippedIds={skippedIds}
        videoName={videoFile?.name ?? 'video'}
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

      {/* Go To dialog */}
      {isGoToOpen && (
        <GoToDialog
          annotations={annotations}
          cueTypeShortCodes={config.cueTypeShortCodes}
          cueTypes={config.cueTypes}
          onSeek={(time) => handleSeek(time)}
          onClose={() => setIsGoToOpen(false)}
        />
      )}
    </div>
  );
}
