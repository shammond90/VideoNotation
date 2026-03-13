/**
 * useVideoHandle — React hook for managing persistent video file handles.
 *
 * Orchestrates the File System Access API lifecycle:
 * 1. On mount, resolves the stored handle for the current project.
 * 2. Exposes state so the UI can show the appropriate banner/action.
 * 3. Provides `requestAccess()` and `relinkVideo()` for user-gesture–driven flows.
 * 4. Auto-attempts permission if the page was opened via gesture.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  supportsFileSystemAccess,
  saveVideoHandle,
  deleteVideoHandle,
  resolveVideoHandle,
  requestAndGetFile,
  pickVideoWithHandle,
  type HandlePermissionState,
} from '../utils/videoHandleStorage';

export interface VideoHandleState {
  /** Current resolution state of the stored handle */
  status: HandlePermissionState | 'loading';
  /** The resolved File when status === 'granted' */
  file: File | null;
  /** The stored handle (for requesting permission later) */
  handle: FileSystemFileHandle | null;
  /** Whether the File System Access API is available */
  isSupported: boolean;
  /** Project's stored video filename (for display in banners) */
  videoFilename: string | null;
}

interface UseVideoHandleOptions {
  projectId: string | undefined;
  /** Video filename from the project record, used for display */
  videoFilename?: string | null;
  /** Video filesize from the project record, used for relink comparison */
  videoFilesize?: number | null;
  /** If true, automatically attempt request on mount (user gesture context) */
  autoRequest?: boolean;
}

interface UseVideoHandleReturn {
  state: VideoHandleState;
  /** Request read permission (must be in user-gesture context). Resolves with the File or null. */
  requestAccess: () => Promise<File | null>;
  /** Pick a new video via FSAA and store the handle. Returns { file, handle } or null. */
  pickAndStoreVideo: () => Promise<{ file: File; handle: FileSystemFileHandle } | null>;
  /** Store a handle from an <input type="file"> fallback (no FSAA). */
  storeHandle: (handle: FileSystemFileHandle) => Promise<void>;
  /** Clear the stored handle for this project. */
  clearHandle: () => Promise<void>;
  /** Re-resolve the handle (e.g. after permission changes). */
  refresh: () => Promise<void>;
}

export function useVideoHandle({
  projectId,
  videoFilename = null,
  videoFilesize: _videoFilesize = null,
  autoRequest = false,
}: UseVideoHandleOptions): UseVideoHandleReturn {
  const [state, setState] = useState<VideoHandleState>({
    status: 'loading',
    file: null,
    handle: null,
    isSupported: supportsFileSystemAccess,
    videoFilename: videoFilename ?? null,
  });

  const autoRequestedRef = useRef(false);

  // Resolve handle on mount or projectId change
  useEffect(() => {
    if (!projectId) {
      setState((s) => ({ ...s, status: 'none', file: null, handle: null }));
      return;
    }

    if (!supportsFileSystemAccess) {
      setState((s) => ({
        ...s,
        status: 'none',
        file: null,
        handle: null,
        isSupported: false,
        videoFilename: videoFilename ?? null,
      }));
      return;
    }

    let cancelled = false;
    autoRequestedRef.current = false;

    (async () => {
      const result = await resolveVideoHandle(projectId);

      if (cancelled) return;

      setState((s) => ({
        ...s,
        status: result.permissionState,
        file: result.file,
        handle: result.handle,
        videoFilename: videoFilename ?? null,
      }));

      // Auto-request permission if allowed and status is 'prompt'
      if (autoRequest && result.permissionState === 'prompt' && result.handle && !autoRequestedRef.current) {
        autoRequestedRef.current = true;
        const file = await requestAndGetFile(result.handle);
        if (cancelled) return;

        if (file) {
          setState((s) => ({ ...s, status: 'granted', file, handle: result.handle }));
        } else {
          setState((s) => ({ ...s, status: 'denied', file: null, handle: result.handle }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, autoRequest, videoFilename]);

  // Request access (user-gesture context)
  const requestAccess = useCallback(async (): Promise<File | null> => {
    if (!state.handle) return null;

    const file = await requestAndGetFile(state.handle);
    if (file) {
      setState((s) => ({ ...s, status: 'granted', file, handle: s.handle }));
      return file;
    } else {
      // Could be denied or file is broken
      setState((s) => ({ ...s, status: 'denied', file: null }));
      return null;
    }
  }, [state.handle]);

  // Pick a new video and store handle
  const pickAndStoreVideo = useCallback(async () => {
    if (!projectId || !supportsFileSystemAccess) return null;

    const result = await pickVideoWithHandle();
    if (!result) return null;

    await saveVideoHandle(projectId, result.handle);
    setState((s) => ({
      ...s,
      status: 'granted',
      file: result.file,
      handle: result.handle,
      videoFilename: result.file.name,
    }));
    return result;
  }, [projectId]);

  // Store a handle (from drag-drop or other source)
  const storeHandle = useCallback(
    async (handle: FileSystemFileHandle) => {
      if (!projectId) return;
      await saveVideoHandle(projectId, handle);
      try {
        const file = await handle.getFile();
        setState((s) => ({
          ...s,
          status: 'granted',
          file,
          handle,
          videoFilename: file.name,
        }));
      } catch {
        setState((s) => ({ ...s, status: 'broken', file: null, handle }));
      }
    },
    [projectId],
  );

  // Clear handle
  const clearHandle = useCallback(async () => {
    if (!projectId) return;
    await deleteVideoHandle(projectId);
    setState((s) => ({ ...s, status: 'none', file: null, handle: null }));
  }, [projectId]);

  // Refresh — re-resolve the handle
  const refresh = useCallback(async () => {
    if (!projectId || !supportsFileSystemAccess) return;

    const result = await resolveVideoHandle(projectId);
    setState((s) => ({
      ...s,
      status: result.permissionState,
      file: result.file,
      handle: result.handle,
    }));
  }, [projectId]);

  return {
    state,
    requestAccess,
    pickAndStoreVideo,
    storeHandle,
    clearHandle,
    refresh,
  };
}
