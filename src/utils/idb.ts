import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'cuetation-db';
const DB_VERSION = 1;
const STORE_NAME = 'keyval';

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, key);
}

export async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, value, key);
}

export async function idbDelete(key: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, key);
}

export async function idbKeys(): Promise<string[]> {
  const db = await getDB();
  const keys = await db.getAllKeys(STORE_NAME);
  return keys.map(String);
}

export { STORE_NAME };
