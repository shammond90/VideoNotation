import type { Annotation } from '../types';

function getStorageKey(fileName: string, fileSize: number): string {
  return `annotations:${fileName}:${fileSize}`;
}

export function loadAnnotations(fileName: string, fileSize: number): Annotation[] {
  try {
    const key = getStorageKey(fileName, fileSize);
    const data = localStorage.getItem(key);
    if (!data) return [];
    return JSON.parse(data) as Annotation[];
  } catch {
    return [];
  }
}

export function saveAnnotations(fileName: string, fileSize: number, annotations: Annotation[]): void {
  try {
    const key = getStorageKey(fileName, fileSize);
    localStorage.setItem(key, JSON.stringify(annotations));
  } catch (e) {
    console.error('Failed to save annotations to localStorage:', e);
    throw new Error('localStorage is full. Please export your annotations and clear some space.');
  }
}
