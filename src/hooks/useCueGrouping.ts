import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import type { Annotation } from '../types';

// ── Types ──

export interface TitleGroup {
  kind: 'title';
  annotation: Annotation;
  scenes: SceneGroup[];
  /** Cues directly under this title (before any scene) */
  orphanCues: Annotation[];
}

export interface SceneGroup {
  kind: 'scene';
  annotation: Annotation;
  cues: Annotation[];
}

/** A flat renderable item for the cue list */
export type GroupedItem =
  | { kind: 'title'; annotation: Annotation; childCount: number }
  | { kind: 'scene'; annotation: Annotation; parentTitleId: string | null; childCount: number }
  | { kind: 'cue'; annotation: Annotation; indent: 'none' | 'title' | 'scene' };

// ── Collapse state persistence ──

const COLLAPSE_STORAGE_PREFIX = 'cuetation:collapse:';

function loadCollapseState(projectId: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSE_STORAGE_PREFIX + projectId);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCollapseState(projectId: string, state: Record<string, boolean>) {
  try {
    localStorage.setItem(COLLAPSE_STORAGE_PREFIX + projectId, JSON.stringify(state));
  } catch {
    // quota exceeded — ignore
  }
}

// ── Scene band colours (cycling palette for scrubber) ──

export const SCENE_BAND_COLORS = [
  '#5c6bc0', // indigo
  '#00acc1', // cyan
  '#66bb6a', // green
  '#ffa726', // orange
  '#ab47bc', // purple
  '#ef5350', // red
  '#42a5f5', // blue
  '#26a69a', // teal
];

// ── Hook ──

export function useCueGrouping(
  annotations: Annotation[],
  projectId: string,
) {
  // ── Collapse state ──
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    loadCollapseState(projectId),
  );

  // Reset collapse state when project changes
  const prevProjectId = useRef(projectId);
  useEffect(() => {
    if (projectId !== prevProjectId.current) {
      prevProjectId.current = projectId;
      setCollapsed(loadCollapseState(projectId));
    }
  }, [projectId]);

  // Persist on change
  useEffect(() => {
    saveCollapseState(projectId, collapsed);
  }, [collapsed, projectId]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = true;
      }
      return next;
    });
  }, []);

  const expandSection = useCallback((id: string) => {
    setCollapsed((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const isCollapsed = useCallback(
    (id: string) => !!collapsed[id],
    [collapsed],
  );

  // ── Build tree structure from flat annotation list ──
  const tree = useMemo(() => {
    const sorted = [...annotations].sort((a, b) => {
      const dt = a.timestamp - b.timestamp;
      if (dt !== 0) return dt;
      // Structural priority: TITLE before SCENE before regular cues
      const priority = (t: string) => t === 'TITLE' ? -2 : t === 'SCENE' ? -1 : 0;
      const sp = priority(a.cue.type) - priority(b.cue.type);
      if (sp !== 0) return sp;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    const titles: TitleGroup[] = [];
    /** Cues before any TITLE */
    const preambleCues: Annotation[] = [];
    let currentTitle: TitleGroup | null = null;
    let currentScene: SceneGroup | null = null;

    for (const ann of sorted) {
      const type = ann.cue.type;

      if (type === 'TITLE') {
        // Finalise previous scene
        currentScene = null;
        // Create new title group
        currentTitle = { kind: 'title', annotation: ann, scenes: [], orphanCues: [] };
        titles.push(currentTitle);
      } else if (type === 'SCENE') {
        // Create new scene under current title (or orphaned if no title)
        currentScene = { kind: 'scene', annotation: ann, cues: [] };
        if (currentTitle) {
          currentTitle.scenes.push(currentScene);
        } else {
          // Orphaned scene — create a virtual title-less group
          // We'll handle this in the flat list builder
          // For now, treat as if it belongs to a null title
          if (!titles.length) {
            // Create a virtual "preamble" holder — we handle this separately
          }
          // Push to preamble as a special case
          preambleCues.push(ann);
          currentScene = null; // Reset — orphaned scenes act as standalone
        }
      } else {
        // Regular cue
        if (currentScene && currentTitle) {
          currentScene.cues.push(ann);
        } else if (currentTitle) {
          currentTitle.orphanCues.push(ann);
        } else {
          preambleCues.push(ann);
        }
      }
    }

    return { titles, preambleCues };
  }, [annotations]);

  // ── Build flat renderable list ──
  const groupedItems = useMemo((): GroupedItem[] => {
    const items: GroupedItem[] = [];

    // Preamble cues (before any TITLE)
    for (const ann of tree.preambleCues) {
      if (ann.cue.type === 'SCENE') {
        // Orphaned scene — render as scene row with no parent
        items.push({ kind: 'scene', annotation: ann, parentTitleId: null, childCount: 0 });
      } else {
        items.push({ kind: 'cue', annotation: ann, indent: 'none' });
      }
    }

    // Title groups
    for (const titleGroup of tree.titles) {
      const titleId = titleGroup.annotation.id;
      const totalChildren =
        titleGroup.orphanCues.length +
        titleGroup.scenes.reduce((_sum, s) => 1 + s.cues.length, 0);

      items.push({
        kind: 'title',
        annotation: titleGroup.annotation,
        childCount: totalChildren,
      });

      // If title is collapsed, skip children
      if (collapsed[titleId]) continue;

      // Orphan cues (directly under title, before any scene in this act)
      for (const ann of titleGroup.orphanCues) {
        items.push({ kind: 'cue', annotation: ann, indent: 'title' });
      }

      // Scenes
      for (const sceneGroup of titleGroup.scenes) {
        const sceneId = sceneGroup.annotation.id;
        items.push({
          kind: 'scene',
          annotation: sceneGroup.annotation,
          parentTitleId: titleId,
          childCount: sceneGroup.cues.length,
        });

        // If scene is collapsed (or its parent title is collapsed), skip children
        if (collapsed[sceneId]) continue;

        for (const ann of sceneGroup.cues) {
          items.push({ kind: 'cue', annotation: ann, indent: 'scene' });
        }
      }
    }

    return items;
  }, [tree, collapsed]);

  // ── Scene markers for scrubber ──
  const scrubberMarkers = useMemo(() => {
    const sorted = [...annotations].sort((a, b) => a.timestamp - b.timestamp);
    const titleMarkers: { timestamp: number; name: string }[] = [];
    const sceneMarkers: { timestamp: number; name: string; color: string }[] = [];
    const sceneBands: { startTime: number; endTime: number; color: string; name: string }[] = [];

    let sceneIndex = 0;
    const scenes: { timestamp: number; name: string }[] = [];

    for (const ann of sorted) {
      if (ann.cue.type === 'TITLE') {
        titleMarkers.push({
          timestamp: ann.timestamp,
          name: ann.cue.what || 'Title',
        });
      } else if (ann.cue.type === 'SCENE') {
        scenes.push({
          timestamp: ann.timestamp,
          name: ann.cue.what || 'Scene',
        });
      }
    }

    // Build scene markers and bands (only if 2+ scenes)
    for (let i = 0; i < scenes.length; i++) {
      const color = SCENE_BAND_COLORS[sceneIndex % SCENE_BAND_COLORS.length];
      sceneMarkers.push({
        timestamp: scenes[i].timestamp,
        name: scenes[i].name,
        color,
      });

      // Only draw bands when 2+ scenes exist
      if (scenes.length >= 2 && i < scenes.length - 1) {
        sceneBands.push({
          startTime: scenes[i].timestamp,
          endTime: scenes[i + 1].timestamp,
          color,
          name: scenes[i].name,
        });
      }
      // Last scene band extends to end of video (handled in VideoPlayer with duration)
      if (scenes.length >= 2 && i === scenes.length - 1) {
        sceneBands.push({
          startTime: scenes[i].timestamp,
          endTime: Infinity, // Will be clamped to duration in VideoPlayer
          color,
          name: scenes[i].name,
        });
      }

      sceneIndex++;
    }

    return { titleMarkers, sceneMarkers, sceneBands };
  }, [annotations]);

  // ── Jump navigation data ──
  const jumpNavItems = useMemo(() => {
    const items: { kind: 'title' | 'scene'; annotation: Annotation; indent: boolean }[] = [];
    for (const titleGroup of tree.titles) {
      items.push({ kind: 'title', annotation: titleGroup.annotation, indent: false });
      for (const sceneGroup of titleGroup.scenes) {
        items.push({ kind: 'scene', annotation: sceneGroup.annotation, indent: true });
      }
    }
    return items;
  }, [tree]);

  // ── Find section containing a given annotation ID ──
  const expandToAnnotation = useCallback(
    (annotationId: string) => {
      // Find which title and/or scene contains this annotation
      for (const titleGroup of tree.titles) {
        const titleId = titleGroup.annotation.id;
        if (titleId === annotationId) {
          expandSection(titleId);
          return;
        }
        for (const orphan of titleGroup.orphanCues) {
          if (orphan.id === annotationId) {
            expandSection(titleId);
            return;
          }
        }
        for (const sceneGroup of titleGroup.scenes) {
          const sceneId = sceneGroup.annotation.id;
          if (sceneId === annotationId) {
            expandSection(titleId);
            expandSection(sceneId);
            return;
          }
          for (const cue of sceneGroup.cues) {
            if (cue.id === annotationId) {
              expandSection(titleId);
              expandSection(sceneId);
              return;
            }
          }
        }
      }
    },
    [tree, expandSection],
  );

  return {
    tree,
    groupedItems,
    collapsed,
    toggleCollapse,
    expandSection,
    expandToAnnotation,
    isCollapsed,
    scrubberMarkers,
    jumpNavItems,
  };
}
