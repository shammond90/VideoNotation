import { openDB } from 'idb';

const DB_NAME = 'CuetationAuthCache';
const STORE_NAME = 'auth';
const AUTH_KEY = 'cached-session';
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export interface CachedAuth {
  userId: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  cachedAt: number; // timestamp ms
}

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

/** Save auth state to IndexedDB after a successful sign-in. */
export async function cacheAuthState(auth: Omit<CachedAuth, 'cachedAt'>): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, { ...auth, cachedAt: Date.now() } satisfies CachedAuth, AUTH_KEY);
}

/** Load cached auth state. Returns null if missing or expired (>3 days). */
export async function loadCachedAuth(): Promise<CachedAuth | null> {
  try {
    const db = await getDB();
    const cached = await db.get(STORE_NAME, AUTH_KEY) as CachedAuth | undefined;
    if (!cached) return null;
    if (Date.now() - cached.cachedAt > MAX_AGE_MS) {
      await db.delete(STORE_NAME, AUTH_KEY);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

/** Clear cached auth (e.g. on explicit sign-out). */
export async function clearCachedAuth(): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(STORE_NAME, AUTH_KEY);
  } catch {
    // Ignore
  }
}
