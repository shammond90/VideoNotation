/**
 * Video Handle Storage — persists FileSystemFileHandle per project in IndexedDB.
 *
 * Uses the existing cuetation-db keyval store (from storage.ts) with key pattern
 * `video-handle:{projectId}`. FileSystemFileHandle is structured-cloneable and
 * can be stored directly.
 */
import { getDB, STORE_NAME } from './idb';

// Chromium-specific File System Access API extensions (not in standard lib types)
interface FileSystemPermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface ChromiumFileSystemFileHandle extends FileSystemFileHandle {
  queryPermission(descriptor?: FileSystemPermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemPermissionDescriptor): Promise<PermissionState>;
}

// ── Feature detection ──

export const supportsFileSystemAccess =
  typeof window !== 'undefined' && 'showOpenFilePicker' in window;

function handleKey(projectId: string): string {
  return `video-handle:${projectId}`;
}

// ── Public API ──

/**
 * Save a FileSystemFileHandle for a project.
 */
export async function saveVideoHandle(
  projectId: string,
  handle: FileSystemFileHandle,
): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, handle, handleKey(projectId));
}

/**
 * Load the stored FileSystemFileHandle for a project, or undefined if none.
 */
export async function loadVideoHandle(
  projectId: string,
): Promise<FileSystemFileHandle | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, handleKey(projectId));
}

/**
 * Delete the stored handle for a project (e.g., on video clear or project delete).
 */
export async function deleteVideoHandle(projectId: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, handleKey(projectId));
}

/**
 * Attempt to resolve a stored handle back to a File.
 *
 * Returns `{ file, permissionState }` where permissionState is:
 *  - 'granted' — file was successfully retrieved
 *  - 'prompt'  — user needs to grant permission first
 *  - 'denied'  — permission was explicitly denied
 *  - 'broken'  — handle exists but file is missing/moved/corrupted
 *  - 'none'    — no stored handle
 */
export type HandlePermissionState = 'granted' | 'prompt' | 'denied' | 'broken' | 'none';

export interface HandleResolution {
  file: File | null;
  permissionState: HandlePermissionState;
  handle: FileSystemFileHandle | null;
}

export async function resolveVideoHandle(
  projectId: string,
): Promise<HandleResolution> {
  const handle = await loadVideoHandle(projectId);
  if (!handle) {
    return { file: null, permissionState: 'none', handle: null };
  }

  try {
    // Check current permission (doesn't trigger a prompt)
    const perm = await (handle as ChromiumFileSystemFileHandle).queryPermission({ mode: 'read' });

    if (perm === 'granted') {
      // Already granted — try to get file
      try {
        const file = await handle.getFile();
        return { file, permissionState: 'granted', handle };
      } catch {
        // File gone/moved
        return { file: null, permissionState: 'broken', handle };
      }
    }

    if (perm === 'prompt') {
      return { file: null, permissionState: 'prompt', handle };
    }

    // 'denied'
    return { file: null, permissionState: 'denied', handle };
  } catch {
    // Handle somehow corrupted
    return { file: null, permissionState: 'broken', handle };
  }
}

/**
 * Request read permission on a handle and try to get the file.
 * Must be called from a user-gesture context.
 *
 * Returns the File if successful, null if denied or broken.
 */
export async function requestAndGetFile(
  handle: FileSystemFileHandle,
): Promise<File | null> {
  try {
    const perm = await (handle as ChromiumFileSystemFileHandle).requestPermission({ mode: 'read' });
    if (perm === 'granted') {
      try {
        return await handle.getFile();
      } catch {
        return null; // file moved/deleted
      }
    }
    return null; // denied
  } catch {
    return null;
  }
}

/**
 * Open a video file via the File System Access API (showOpenFilePicker).
 * Falls back to null if user cancels.
 *
 * Returns `{ file, handle }` or null.
 */
export async function pickVideoWithHandle(): Promise<{
  file: File;
  handle: FileSystemFileHandle;
} | null> {
  try {
    const [handle] = await (window as any).showOpenFilePicker({
      types: [
        {
          description: 'Video files',
          accept: {
            'video/*': ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.ogv'],
          },
        },
      ],
      multiple: false,
    });
    const file = await handle.getFile();
    return { file, handle };
  } catch {
    // User cancelled or API error
    return null;
  }
}
