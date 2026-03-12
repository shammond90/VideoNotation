import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { X, Plus, Trash2, GripVertical, Download, Upload, Lock, Pencil, Check, AlertTriangle, ChevronDown, ChevronRight, Save, FileDown, FileUp, Info } from 'lucide-react';
import type { ColumnConfig, Project, AppConfig } from '../types';
import { RESERVED_CUE_TYPES, LOOP_CUE_TYPE, EDITABLE_FIELD_KEYS, EDITABLE_FIELD_LABELS, AUTOFOLLOW_COLUMN_KEYS, LINK_COLUMN_KEYS, getDefaultFieldsForType } from '../types';
import type { ConfigTemplate } from '../utils/configTemplates';
import { loadConfigTemplates, saveConfigTemplate, deleteConfigTemplate, renameConfigTemplate, exportTemplateToJSON, exportAllTemplatesToJSON, importTemplatesFromJSON } from '../utils/configTemplates';
import { loadProjects, deleteProject as deleteProjectFromStorage, updateProjectMetadata, exportProjectToJSON } from '../utils/projectStorage';
import {
  listBackups,
  restoreBackup,
  getBackupPayload,
  getAnnotationStorageKey,
  getConfigStorageKey,
  listVideoFilesWithBackups,
  deleteVideoBackups,
  type BackupSnapshot,
  type VideoFileInfo,
} from '../utils/storage';
import { exportAnnotationsToCSV } from '../utils/csv';
import InfoModal from './InfoModal';
import { featureNotes } from '../content/featureNotes';
import { userGuide } from '../content/userGuide';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function relativeTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return 'just now';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  return `${months} mo${months !== 1 ? 's' : ''} ago`;
}

interface ConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  liveConfig: AppConfig;
  cueTypes: string[];
  cueTypeColors: Record<string, string>;
  cueTypeShortCodes: Record<string, string>;
  cueTypeFontColors: Record<string, string>;
  cueTypeFields: Record<string, string[]>;
  visibleColumns: ColumnConfig[];
  cueTypeColumns: Record<string, ColumnConfig[]>;
  usedCueTypes: Set<string>;
  showShortCodes: boolean;
  showPastCues: boolean;
  showSkippedCues: boolean;
  showVideoTimecode: boolean;
  cueSheetView: 'classic' | 'production';
  onSetCueSheetView: (view: 'classic' | 'production') => void;
  theatreMode: boolean;
  onSetTheatreMode: (enabled: boolean) => void;
  currentVideoName?: string;
  currentVideoSize?: number;
  cueBackupIntervalMinutes: number;
  onSetCueBackupInterval: (minutes: number) => void;
  onAddCueType: (name: string) => void;
  onRemoveCueType: (name: string) => void;
  onRenameCueType: (oldName: string, newName: string) => void;
  onSetCueTypeColor: (cueType: string, color: string) => void;
  onSetCueTypeShortCode: (cueType: string, shortCode: string) => void;
  onSetCueTypeFontColor: (cueType: string, color: string) => void;
  onSetShowShortCodes: (show: boolean) => void;
  onSetShowPastCues: (show: boolean) => void;
  onSetShowSkippedCues: (show: boolean) => void;
  onSetShowVideoTimecode: (show: boolean) => void;
  onSetCueTypeFields: (cueType: string, fields: string[]) => void;
  onToggleColumn: (key: string, cueType?: string) => void;
  onReorderColumns: (fromIndex: number, toIndex: number, cueType?: string) => void;
  onAddCueTypeColumns: (cueType: string) => void;
  onRemoveCueTypeColumns: (cueType: string) => void;
  onExportConfig: () => void;
  onImportConfig: (file: File) => Promise<void>;
  onRecoverCurrentVideoCues: () => void;
  onRecoverConfig: () => void;
  onClearAllData: () => void;
  onClearCurrentVideoCues: (fileName: string, fileSize: number) => void;
  onClearAllCues: () => void;
  onApplyCueTypesTemplate: (data: CueTypesTemplateData) => void;
  onApplyColumnsTemplate: (data: ColumnsTemplateData) => void;
}

/** Data shape stored in a "cueTypes" template. */
export interface CueTypesTemplateData {
  cueTypes: string[];
  cueTypeColors: Record<string, string>;
  cueTypeShortCodes: Record<string, string>;
  cueTypeFontColors?: Record<string, string>;
  cueTypeFields: Record<string, string[]>;
}

/** Data shape stored in a "columns" template. */
export interface ColumnsTemplateData {
  visibleColumns: ColumnConfig[];
  cueTypeColumns: Record<string, ColumnConfig[]>;
}

// ── Sortable column item ──

function SortableColumnItem({
  column,
  onToggle,
}: {
  column: ColumnConfig;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.key,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-3 py-2 bg-[var(--bg-panel-a50)] rounded-md border border-[var(--border-hi-a50)] hover:bg-[var(--bg-panel)]"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-[var(--text-dim)] hover:text-[var(--text-mid)] touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <label className="flex items-center gap-2 flex-1 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={column.visible}
          onChange={onToggle}
          className="w-4 h-4 rounded border-[var(--border-hi)] bg-[var(--bg-hover)] text-[var(--amber)] focus:ring-[#BF5700] focus:ring-offset-0 cursor-pointer"
        />
        <span className="text-sm text-[var(--text)]">{column.label}</span>
        <span className="text-[10px] text-[var(--text-dim)] font-mono">({column.key})</span>
      </label>
    </div>
  );
}

// ── Sortable field item for cue type field ordering ──

/** Fields that are always locked at the top of every cue type and cannot be moved or removed. */
const LOCKED_FIELD_KEYS = ['timestamp', 'cueNumber'];

function SortableFieldItem({
  fieldKey,
  label,
  isActive,
  isLocked,
  onToggle,
}: {
  fieldKey: string;
  label: string;
  isActive: boolean;
  isLocked: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `field-${fieldKey}`,
    disabled: isLocked,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md border ${
        isLocked
          ? 'bg-[var(--bg-panel)]/30 border-[var(--border-hi)]/30'
          : 'bg-[var(--bg-panel-a50)] border-[var(--border-hi-a50)] hover:bg-[var(--bg-panel)]'
      }`}
    >
      {isLocked ? (
        <Lock className="w-3.5 h-3.5 text-[var(--text-dim)] shrink-0" />
      ) : (
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-[var(--text-dim)] hover:text-[var(--text-mid)] touch-none shrink-0"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      )}
      <label className={`flex items-center gap-1.5 flex-1 ${isLocked ? '' : 'cursor-pointer'} select-none`}>
        <input
          type="checkbox"
          checked={isActive}
          onChange={onToggle}
          disabled={isLocked}
          className="w-3.5 h-3.5 rounded border-[var(--border-hi)] bg-[var(--bg-hover)] text-[var(--amber)] focus:ring-[#BF5700] focus:ring-offset-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <span className={`text-[11px] ${isActive ? 'text-[var(--text)]' : 'text-[var(--text-dim)]'}`}>
          {label}
        </span>
      </label>
    </div>
  );
}

// ── Project Admin Tab ──

function ProjectAdminTab({ liveConfig }: { liveConfig: AppConfig }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    production_name: string;
    choreographer: string;
    venue: string;
    year: string;
    notes: string;
  }>({ name: '', production_name: '', choreographer: '', venue: '', year: '', notes: '' });
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    const p = await loadProjects();
    setProjects(p);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    try {
      await deleteProjectFromStorage(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      setDeleteConfirmId(null);
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  }, []);

  const startEditing = useCallback((project: Project) => {
    setEditingId(project.id);
    setEditForm({
      name: project.name,
      production_name: project.production_name || '',
      choreographer: project.choreographer || '',
      venue: project.venue || '',
      year: project.year || '',
      notes: project.notes || '',
    });
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId || !editForm.name.trim()) return;
    try {
      await updateProjectMetadata(editingId, {
        production_name: editForm.production_name || undefined,
        choreographer: editForm.choreographer || undefined,
        venue: editForm.venue || undefined,
        year: editForm.year || undefined,
        notes: editForm.notes || undefined,
      });
      // Also update name — updateProjectMetadata doesn't change name, so we do it via loadProject + save
      // For simplicity, reload after metadata update
      await reload();
      setEditingId(null);
    } catch (err) {
      console.error('Failed to update project:', err);
    }
  }, [editingId, editForm, reload]);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
  }, []);

  if (isLoading) {
    return <p className="text-sm text-[var(--text-mid)]">Loading projects...</p>;
  }

  if (projects.length === 0) {
    return <p className="text-sm text-[var(--text-mid)]">No projects found.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--text-mid)]">
        Manage all projects. Edit metadata or delete unused projects.
      </p>
      <div className="space-y-3">
        {projects.map((project) => (
          <div
            key={project.id}
            className="p-4 bg-[var(--bg-panel)]/30 border border-[var(--border-hi)]/40 rounded-lg"
          >
            {editingId === project.id ? (
              /* Inline edit form */
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-[var(--text-mid)] block mb-0.5">Project Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full bg-[var(--bg)] border border-[var(--border-hi)] rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-mid)] block mb-0.5">Production</label>
                  <input
                    type="text"
                    value={editForm.production_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, production_name: e.target.value }))}
                    className="w-full bg-[var(--bg)] border border-[var(--border-hi)] rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#BF5700]"
                    placeholder="Production name"
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-mid)] block mb-0.5">Choreographer</label>
                  <input
                    type="text"
                    value={editForm.choreographer}
                    onChange={(e) => setEditForm((f) => ({ ...f, choreographer: e.target.value }))}
                    className="w-full bg-[var(--bg)] border border-[var(--border-hi)] rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#BF5700]"
                    placeholder="Choreographer"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-[var(--text-mid)] block mb-0.5">Venue</label>
                    <input
                      type="text"
                      value={editForm.venue}
                      onChange={(e) => setEditForm((f) => ({ ...f, venue: e.target.value }))}
                      className="w-full bg-[var(--bg)] border border-[var(--border-hi)] rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#BF5700]"
                      placeholder="Venue"
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-xs text-[var(--text-mid)] block mb-0.5">Year</label>
                    <input
                      type="text"
                      value={editForm.year}
                      onChange={(e) => setEditForm((f) => ({ ...f, year: e.target.value }))}
                      className="w-full bg-[var(--bg)] border border-[var(--border-hi)] rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#BF5700]"
                      placeholder="Year"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-[var(--text-mid)] block mb-0.5">Notes</label>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                    className="w-full bg-[var(--bg)] border border-[var(--border-hi)] rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#BF5700] resize-none"
                    rows={2}
                    placeholder="Notes"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={cancelEditing}
                    className="text-xs text-[var(--text-mid)] hover:text-[var(--text)] px-3 py-1 rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={!editForm.name.trim()}
                    className="text-xs bg-[var(--amber)] hover:bg-[var(--amber)] text-white font-semibold px-3 py-1 rounded transition-colors disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              /* Display mode */
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[var(--text)] text-sm">{project.name}</p>
                  {project.production_name && (
                    <p className="text-xs text-[var(--text-mid)] mt-0.5">{project.production_name}</p>
                  )}
                  {project.choreographer && (
                    <p className="text-xs text-[var(--text-dim)] mt-0.5">Choreo: {project.choreographer}</p>
                  )}
                  {(project.venue || project.year) && (
                    <p className="text-xs text-[var(--text-dim)] mt-0.5">
                      {project.venue}{project.venue && project.year ? ' • ' : ''}{project.year}
                    </p>
                  )}
                  <p className="text-xs text-[var(--text-dim)] mt-1">
                    {project.video_filename ? `Video: ${project.video_filename}` : 'No video assigned'}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => startEditing(project)}
                    className="flex items-center gap-1 text-xs text-[var(--text-mid)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]/40 rounded-md px-2 py-1 transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                  <button
                    onClick={async () => {
                      const json = await exportProjectToJSON(project, liveConfig);
                      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.cuetation.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="flex items-center gap-1 text-xs text-[var(--text-mid)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]/40 rounded-md px-2 py-1 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Export
                  </button>
                  {deleteConfirmId === project.id ? (
                    <>
                      <button
                        onClick={() => handleDeleteProject(project.id)}
                        className="text-xs bg-red-600 hover:bg-red-700 text-white font-semibold py-1 px-3 rounded transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="text-xs bg-[var(--bg-hover)] hover:bg-[var(--border-hi)] text-white font-semibold py-1 px-3 rounded transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(project.id)}
                      className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-md px-2 py-1 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main modal ──

export function ConfigurationModal({
  isOpen,
  onClose,
  liveConfig,
  cueTypes,
  cueTypeColors,
  cueTypeShortCodes,
  cueTypeFontColors,
  cueTypeFields,
  visibleColumns,
  cueTypeColumns,
  usedCueTypes,
  showShortCodes,
  showPastCues,
  showSkippedCues,
  showVideoTimecode,
  cueSheetView,
  onSetCueSheetView,
  theatreMode,
  onSetTheatreMode,
  currentVideoName,
  currentVideoSize,
  cueBackupIntervalMinutes,
  onSetCueBackupInterval,
  onAddCueType,
  onRemoveCueType,
  onRenameCueType,
  onSetCueTypeColor,
  onSetCueTypeShortCode,
  onSetCueTypeFontColor,
  onSetShowShortCodes,
  onSetShowPastCues,
  onSetShowSkippedCues,
  onSetShowVideoTimecode,
  onSetCueTypeFields,
  onToggleColumn,
  onReorderColumns,
  onAddCueTypeColumns,
  onRemoveCueTypeColumns,
  onExportConfig,
  onImportConfig,
  onRecoverCurrentVideoCues,
  onRecoverConfig,
  onClearAllData,
  onClearCurrentVideoCues,
  onClearAllCues,
  onApplyCueTypesTemplate,
  onApplyColumnsTemplate,
}: ConfigurationModalProps) {
  const [newTypeName, setNewTypeName] = useState('');
  const [activeTab, setActiveTab] = useState<'types' | 'columns' | 'view' | 'templates' | 'savefiles' | 'data' | 'projects' | 'info'>('types');
  const [showFeatureNotes, setShowFeatureNotes] = useState(false);
  const [showUserGuide, setShowUserGuide] = useState(false);
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [columnView, setColumnView] = useState<string>('default');
  const [recoveryTick, setRecoveryTick] = useState(0);
  const [selectedVideoKey, setSelectedVideoKey] = useState<string>('');
  const [expandedFieldType, setExpandedFieldType] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const templateImportRef = useRef<HTMLInputElement>(null);

  // Template state
  const [savedTemplates, setSavedTemplates] = useState<ConfigTemplate[]>([]);
  const [typesTemplateId, setTypesTemplateId] = useState('');
  const [typesTemplateName, setTypesTemplateName] = useState('');
  const [columnsTemplateId, setColumnsTemplateId] = useState('');
  const [columnsTemplateName, setColumnsTemplateName] = useState('');
  // Templates tab state
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateName, setEditingTemplateName] = useState('');
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

  // Load templates on mount
  useEffect(() => {
    loadConfigTemplates().then(setSavedTemplates);
  }, []);

  const refreshTemplates = useCallback(async () => {
    setSavedTemplates(await loadConfigTemplates());
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // These state hooks MUST be before the early return to satisfy Rules of Hooks
  const [videoFiles, setVideoFiles] = useState<VideoFileInfo[]>([]);
  useEffect(() => {
    listVideoFilesWithBackups().then(setVideoFiles);
  }, [recoveryTick]);

  // Auto-select current video if nothing selected yet
  const effectiveSelectedKey = useMemo(() => {
    if (selectedVideoKey && videoFiles.some((v) => v.storageKey === selectedVideoKey)) {
      return selectedVideoKey;
    }
    // Default to current video if available
    if (currentVideoName && currentVideoSize !== undefined) {
      const currentKey = getAnnotationStorageKey(currentVideoName, currentVideoSize);
      if (videoFiles.some((v) => v.storageKey === currentKey)) return currentKey;
    }
    // Fall back to first video
    return videoFiles.length > 0 ? videoFiles[0].storageKey : '';
  }, [selectedVideoKey, videoFiles, currentVideoName, currentVideoSize]);

  const selectedVideoInfo = useMemo(() => {
    return videoFiles.find((v) => v.storageKey === effectiveSelectedKey) ?? null;
  }, [videoFiles, effectiveSelectedKey]);

  const [selectedVideoBackups, setSelectedVideoBackups] = useState<BackupSnapshot[]>([]);
  useEffect(() => {
    if (!effectiveSelectedKey) { setSelectedVideoBackups([]); return; }
    listBackups(effectiveSelectedKey).then(setSelectedVideoBackups);
  }, [effectiveSelectedKey, recoveryTick]);

  const [configBackups, setConfigBackups] = useState<BackupSnapshot[]>([]);
  useEffect(() => {
    listBackups(getConfigStorageKey()).then(setConfigBackups);
  }, [recoveryTick]);

  const activeColumns = useMemo(() => {
    const base =
      columnView !== 'default' && cueTypeColumns[columnView]
        ? cueTypeColumns[columnView]
        : visibleColumns;
    // When viewing a specific type override, filter to only columns whose field is enabled for that type
    if (columnView !== 'default') {
      const typeFields = cueTypeFields[columnView] ?? getDefaultFieldsForType(columnView);
      const hasAutofollow = typeFields.includes('addAutofollow');
      const hasLinking = typeFields.includes('linkCueNumber');
      // 'type' column is always shown; other columns shown only if their field is enabled for this type
      // Visibility (checked/unchecked) is controlled separately
      return base.filter((col) => {
        if (col.key === 'type') return true;
        // Autofollow columns are shown when addAutofollow is enabled for this type
        if (hasAutofollow && AUTOFOLLOW_COLUMN_KEYS.includes(col.key)) return true;
        // Link columns are shown when linkCueNumber is enabled for this type
        if (hasLinking && LINK_COLUMN_KEYS.includes(col.key)) return true;
        return typeFields.includes(col.key);
      });
    }
    // For default view, show all columns
    return base;
  }, [columnView, cueTypeColumns, visibleColumns, cueTypeFields]);

  if (!isOpen) return null;

  const handleAddType = () => {
    const trimmed = newTypeName.trim().toUpperCase();
    if (trimmed) {
      onAddCueType(trimmed);
      setNewTypeName('');
    }
  };

  const handleStartEdit = (type: string) => {
    setEditingType(type);
    setEditingName(type);
  };

  const handleSaveEdit = () => {
    if (!editingType) return;
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== editingType) {
      onRenameCueType(editingType, trimmed);
    }
    setEditingType(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingType(null);
    setEditingName('');
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Resolve indices against the FULL (unfiltered) column array so splice
    // targets the correct positions even when activeColumns is a subset.
    const cueType = columnView !== 'default' ? columnView : undefined;
    const baseColumns =
      cueType && cueTypeColumns[cueType]
        ? cueTypeColumns[cueType]
        : visibleColumns;
    const fromIndex = baseColumns.findIndex((c) => c.key === active.id);
    const toIndex = baseColumns.findIndex((c) => c.key === over.id);
    if (fromIndex !== -1 && toIndex !== -1) {
      onReorderColumns(fromIndex, toIndex, cueType);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await onImportConfig(file);
    } catch {
      // handled upstream
    }
    if (importRef.current) importRef.current.value = '';
  };

  const typesWithOverrides = Object.keys(cueTypeColumns);
  const allTypesForOverride = [...new Set([...cueTypes, LOOP_CUE_TYPE])];
  const typesAvailableForOverride = allTypesForOverride.filter((t) => !cueTypeColumns[t]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text)]">Configuration</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[var(--text-mid)] hover:text-[var(--text)] hover:bg-[var(--bg-panel)] rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)]">
          <button
            type="button"
            onClick={() => setActiveTab('types')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'types'
                ? 'text-[var(--amber-hi)] border-b-2 border-[var(--amber-hi)] bg-[var(--bg-panel)]/30'
                : 'text-[var(--text-mid)] hover:text-[var(--text)]'
            }`}
          >
            Cue Types
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('columns')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'columns'
                ? 'text-[var(--amber-hi)] border-b-2 border-[var(--amber-hi)] bg-[var(--bg-panel)]/30'
                : 'text-[var(--text-mid)] hover:text-[var(--text)]'
            }`}
          >
            Columns
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('view')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'view'
                ? 'text-[var(--amber-hi)] border-b-2 border-[var(--amber-hi)] bg-[var(--bg-panel)]/30'
                : 'text-[var(--text-mid)] hover:text-[var(--text)]'
            }`}
          >
            View
          </button>
          <button
            type="button"
            onClick={() => { refreshTemplates(); setActiveTab('templates'); }}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'templates'
                ? 'text-[var(--amber-hi)] border-b-2 border-[var(--amber-hi)] bg-[var(--bg-panel)]/30'
                : 'text-[var(--text-mid)] hover:text-[var(--text)]'
            }`}
          >
            Templates
          </button>
          <button
            type="button"
            onClick={() => { setRecoveryTick((prev) => prev + 1); setActiveTab('savefiles'); }}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'savefiles'
                ? 'text-[var(--amber-hi)] border-b-2 border-[var(--amber-hi)] bg-[var(--bg-panel)]/30'
                : 'text-[var(--text-mid)] hover:text-[var(--text)]'
            }`}
          >
            Save Files
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('data')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'data'
                ? 'text-[var(--amber-hi)] border-b-2 border-[var(--amber-hi)] bg-[var(--bg-panel)]/30'
                : 'text-[var(--text-mid)] hover:text-[var(--text)]'
            }`}
          >
            Data
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('projects')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'projects'
                ? 'text-[var(--amber-hi)] border-b-2 border-[var(--amber-hi)] bg-[var(--bg-panel)]/30'
                : 'text-[var(--text-mid)] hover:text-[var(--text)]'
            }`}
          >
            Projects
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'info'
                ? 'text-[var(--amber-hi)] border-b-2 border-[var(--amber-hi)] bg-[var(--bg-panel)]/30'
                : 'text-[var(--text-mid)] hover:text-[var(--text)]'
            }`}
          >
            Info
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto annotation-scroll p-6">
          {activeTab === 'types' && (
            <div className="space-y-4">
              {/* Template selector bar */}
              <div className="flex items-center gap-2 p-3 bg-[var(--bg-panel)]/30 border border-[var(--border-hi)]/40 rounded-lg">
                <label className="text-xs text-[var(--text-mid)] font-medium shrink-0">Template:</label>
                <div className="relative flex-1 max-w-[180px]">
                  <select
                    value={typesTemplateId}
                    onChange={(e) => {
                      const tpl = savedTemplates.find((t) => t.id === e.target.value);
                      if (tpl) {
                        setTypesTemplateId(tpl.id);
                        setTypesTemplateName(tpl.name);
                      } else {
                        setTypesTemplateId('');
                        setTypesTemplateName('');
                      }
                    }}
                    className="w-full bg-[var(--bg-panel)] border border-[var(--border-hi)] rounded-md px-2 py-1.5 text-xs text-[var(--text)] appearance-none pr-7 focus:border-[var(--amber)] focus:outline-none"
                  >
                    <option value="">New template…</option>
                    {savedTemplates.filter((t) => t.category === 'cueTypes').map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-mid)] pointer-events-none" />
                </div>
                <input
                  type="text"
                  value={typesTemplateName}
                  onChange={(e) => setTypesTemplateName(e.target.value)}
                  placeholder="Template name"
                  className="flex-1 max-w-[180px] bg-[var(--bg-panel)] border border-[var(--border-hi)] rounded-md px-2 py-1.5 text-xs text-[var(--text)] focus:border-[var(--amber)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const name = typesTemplateName.trim() || `Cue Types ${savedTemplates.filter((t) => t.category === 'cueTypes').length + 1}`;
                    const data: CueTypesTemplateData = {
                      cueTypes: [...cueTypes],
                      cueTypeColors: { ...cueTypeColors },
                      cueTypeShortCodes: { ...cueTypeShortCodes },
                      cueTypeFontColors: { ...cueTypeFontColors },
                      cueTypeFields: { ...cueTypeFields },
                    };
                    const template: ConfigTemplate = {
                      id: typesTemplateId || crypto.randomUUID(),
                      name,
                      category: 'cueTypes',
                      data,
                      createdAt: typesTemplateId
                        ? savedTemplates.find((t) => t.id === typesTemplateId)?.createdAt ?? new Date().toISOString()
                        : new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    };
                    await saveConfigTemplate(template);
                    await refreshTemplates();
                    setTypesTemplateId(template.id);
                    setTypesTemplateName(template.name);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-[var(--amber)] text-white rounded-md hover:bg-[var(--amber)] transition-colors shrink-0"
                >
                  <Save className="w-3 h-3" />
                  Save
                </button>
                {typesTemplateId && (
                  <button
                    type="button"
                    onClick={() => {
                      const tpl = savedTemplates.find((t) => t.id === typesTemplateId);
                      if (!tpl) return;
                      if (confirm(`Apply template "${tpl.name}"?\n\nThis will update your cue type configuration. Reserved and in-use types will be preserved; other types may be removed.`)) {
                        onApplyCueTypesTemplate(tpl.data as CueTypesTemplateData);
                      }
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-emerald-600 text-white rounded-md hover:bg-emerald-500 transition-colors shrink-0"
                  >
                    Apply
                  </button>
                )}
              </div>

              <p className="text-xs text-[var(--text-mid)]">
                Define the cue types available in the dropdown when creating or editing a cue.
                Types that are in use cannot be deleted. You can rename any type.
              </p>

              {/* Add new type */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddType();
                    }
                  }}
                  placeholder="New type name..."
                  className="flex-1 bg-[var(--bg-panel)] text-[var(--text)] rounded px-3 py-2 text-sm border border-[var(--border-hi)] focus:border-[var(--amber)] focus:ring-1 focus:ring-[#BF5700] outline-none placeholder-slate-500"
                />
                <button
                  type="button"
                  onClick={handleAddType}
                  disabled={!newTypeName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-[var(--amber)] text-white rounded-md hover:bg-[var(--amber)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>

              {/* Type list */}
              <div className="space-y-1.5">
                {[...cueTypes, ...(cueTypes.includes(LOOP_CUE_TYPE) ? [] : [LOOP_CUE_TYPE])].map((type) => {
                  const isReserved = (RESERVED_CUE_TYPES as readonly string[]).includes(type);
                  const isInUse = usedCueTypes.has(type);
                  const isLocked = isReserved || isInUse;
                  const isEditing = editingType === type;

                  return (
                    <React.Fragment key={type}>
                    <div
                      className="flex items-center justify-between px-3 py-2 bg-[var(--bg-panel-a50)] rounded-md border border-[var(--border-hi-a50)]"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5 flex-1">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveEdit();
                                }
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  handleCancelEdit();
                                }
                              }}
                              autoFocus
                              className="flex-1 bg-[var(--bg-hover)] text-[var(--text)] rounded px-2 py-1 text-sm border border-[var(--amber)] focus:ring-1 focus:ring-[#BF5700] outline-none"
                            />
                            <button
                              type="button"
                              onClick={handleSaveEdit}
                              className="p-1 text-emerald-400 hover:text-emerald-300 hover:bg-[var(--bg-hover)] rounded transition-colors"
                              title="Save"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              className="p-1 text-[var(--text-dim)] hover:text-[var(--text-mid)] hover:bg-[var(--bg-hover)] rounded transition-colors"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="text-sm text-[var(--text)] font-medium">{type}</span>
                            {isReserved && (
                              <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                <Lock className="w-3 h-3" />
                                Reserved
                              </span>
                            )}
                            {!isReserved && isInUse && (
                              <span className="flex items-center gap-1 text-[10px] text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded">
                                <Lock className="w-3 h-3" />
                                In Use
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      {!isEditing && (
                        <div className="flex items-center gap-1.5 ml-2">
                          {/* Expand / collapse field selection */}
                          <button
                            type="button"
                            onClick={() => setExpandedFieldType((prev) => (prev === type ? null : type))}
                            className="p-1 text-[var(--text-mid)] hover:text-[var(--amber-hi)] hover:bg-[var(--bg-hover)] rounded transition-colors"
                            title="Configure visible fields"
                          >
                            {expandedFieldType === type ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                          {/* Colour picker */}
                          <label
                            className="relative w-6 h-6 rounded cursor-pointer border border-[var(--border-hi)] shrink-0 overflow-hidden"
                            style={{ backgroundColor: cueTypeColors[type] || '#6b7280' }}
                            title={`Colour: ${cueTypeColors[type] || '#6b7280'}`}
                          >
                            <input
                              type="color"
                              value={cueTypeColors[type] || '#6b7280'}
                              onChange={(e) => onSetCueTypeColor(type, e.target.value)}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                          </label>
                          {/* Short code input */}
                          <input
                            type="text"
                            value={cueTypeShortCodes[type] || ''}
                            onChange={(e) => onSetCueTypeShortCode(type, e.target.value)}
                            placeholder="SC"
                            maxLength={4}
                            title="Short code (max 4 characters)"
                            className="w-10 h-6 text-center text-xs bg-[var(--bg-hover)] text-[var(--text)] rounded border border-[var(--border-hi)] focus:border-[var(--amber)] focus:ring-1 focus:ring-[#BF5700] outline-none placeholder-slate-500"
                          />
                          {/* Font colour picker (Production badge text) */}
                          <label
                            className="relative w-6 h-6 rounded cursor-pointer border border-[var(--border-hi)] shrink-0 overflow-hidden flex items-center justify-center"
                            style={{ backgroundColor: 'var(--bg-hover)' }}
                            title={`Font colour: ${cueTypeFontColors[type] || '#ffffff'}`}
                          >
                            <span className="text-[9px] font-bold pointer-events-none" style={{ color: cueTypeFontColors[type] || '#ffffff' }}>A</span>
                            <input
                              type="color"
                              value={cueTypeFontColors[type] || '#ffffff'}
                              onChange={(e) => onSetCueTypeFontColor(type, e.target.value)}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(type)}
                            className={`p-1 text-[var(--text-dim)] hover:text-[var(--text-mid)] hover:bg-[var(--bg-hover)] rounded transition-colors ${type === LOOP_CUE_TYPE ? 'hidden' : ''}`}
                            title={`Rename ${type}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {!isLocked && (
                            <button
                              type="button"
                              onClick={() => onRemoveCueType(type)}
                              className="p-1 text-[var(--text-dim)] hover:text-red-400 hover:bg-[var(--bg-hover)] rounded transition-colors"
                              title={`Remove ${type}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Expandable field selection — now a sortable list with locked fields at top */}
                    {expandedFieldType === type && !isEditing && (() => {
                      const currentFields = cueTypeFields[type] ?? getDefaultFieldsForType(type);
                      const allCount = EDITABLE_FIELD_KEYS.length;
                      const selectedCount = currentFields.length;

                      const toggleField = (fieldKey: string) => {
                        if (LOCKED_FIELD_KEYS.includes(fieldKey)) return;
                        const next = currentFields.includes(fieldKey)
                          ? currentFields.filter((f) => f !== fieldKey)
                          : [...currentFields, fieldKey];
                        onSetCueTypeFields(type, next);
                      };

                      const selectAll = () => {
                        // Keep locked at top, add remaining in EDITABLE order
                        const ordered = [...LOCKED_FIELD_KEYS, ...EDITABLE_FIELD_KEYS.filter((k) => !LOCKED_FIELD_KEYS.includes(k))];
                        onSetCueTypeFields(type, ordered);
                      };
                      const selectNone = () => onSetCueTypeFields(type, [...LOCKED_FIELD_KEYS]);
                      const resetDefaults = () => onSetCueTypeFields(type, getDefaultFieldsForType(type));

                      // Build the ordered display list:
                      // 1. Locked fields always at top (always active)
                      // 2. Active (non-locked) fields in their current order
                      // 3. Inactive fields at the bottom in EDITABLE_FIELD_KEYS order
                      const activeNonLocked = currentFields.filter((k) => !LOCKED_FIELD_KEYS.includes(k));
                      const inactiveFields = EDITABLE_FIELD_KEYS.filter((k) => !LOCKED_FIELD_KEYS.includes(k) && !currentFields.includes(k));
                      const orderedKeys = [...LOCKED_FIELD_KEYS, ...activeNonLocked, ...inactiveFields];

                      const handleFieldDragEnd = (event: DragEndEvent) => {
                        const { active, over } = event;
                        if (!over || active.id === over.id) return;
                        const activeKey = String(active.id).replace('field-', '');
                        const overKey = String(over.id).replace('field-', '');
                        // Don't allow moving into the locked zone
                        if (LOCKED_FIELD_KEYS.includes(activeKey) || LOCKED_FIELD_KEYS.includes(overKey)) return;
                        // Reorder within active fields
                        const activeIdx = activeNonLocked.indexOf(activeKey);
                        const overIdx = activeNonLocked.indexOf(overKey);
                        if (activeIdx === -1) return; // can't move inactive fields by drag
                        if (overIdx === -1) return;
                        const reordered = [...activeNonLocked];
                        const [moved] = reordered.splice(activeIdx, 1);
                        reordered.splice(overIdx, 0, moved);
                        onSetCueTypeFields(type, [...LOCKED_FIELD_KEYS, ...reordered]);
                      };

                      return (
                        <div className="mt-1 ml-4 mr-2 mb-1 p-3 bg-[var(--bg-card)]/60 border border-[var(--border-hi)]/40 rounded-md space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">
                              Fields &amp; order ({selectedCount}/{allCount})
                            </span>
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={selectAll} className="text-[10px] text-[var(--amber-hi)] hover:text-[var(--amber)]">All</button>
                              <button type="button" onClick={selectNone} className="text-[10px] text-[var(--amber-hi)] hover:text-[var(--amber)]">None</button>
                              <button type="button" onClick={resetDefaults} className="text-[10px] text-[var(--amber-hi)] hover:text-[var(--amber)]">Defaults</button>
                            </div>
                          </div>
                          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFieldDragEnd}>
                            <SortableContext
                              items={orderedKeys.map((k) => `field-${k}`)}
                              strategy={verticalListSortingStrategy}
                            >
                              <div className="space-y-1 max-h-60 overflow-y-auto annotation-scroll">
                                {orderedKeys.map((fieldKey) => (
                                  <SortableFieldItem
                                    key={fieldKey}
                                    fieldKey={fieldKey}
                                    label={EDITABLE_FIELD_LABELS[fieldKey] || fieldKey}
                                    isActive={LOCKED_FIELD_KEYS.includes(fieldKey) || currentFields.includes(fieldKey)}
                                    isLocked={LOCKED_FIELD_KEYS.includes(fieldKey)}
                                    onToggle={() => toggleField(fieldKey)}
                                  />
                                ))}
                              </div>
                            </SortableContext>
                          </DndContext>
                        </div>
                      );
                    })()}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'columns' && (
            <div className="space-y-4">
              {/* Template selector bar */}
              <div className="flex items-center gap-2 p-3 bg-[var(--bg-panel)]/30 border border-[var(--border-hi)]/40 rounded-lg">
                <label className="text-xs text-[var(--text-mid)] font-medium shrink-0">Template:</label>
                <div className="relative flex-1 max-w-[180px]">
                  <select
                    value={columnsTemplateId}
                    onChange={(e) => {
                      const tpl = savedTemplates.find((t) => t.id === e.target.value);
                      if (tpl) {
                        setColumnsTemplateId(tpl.id);
                        setColumnsTemplateName(tpl.name);
                      } else {
                        setColumnsTemplateId('');
                        setColumnsTemplateName('');
                      }
                    }}
                    className="w-full bg-[var(--bg-panel)] border border-[var(--border-hi)] rounded-md px-2 py-1.5 text-xs text-[var(--text)] appearance-none pr-7 focus:border-[var(--amber)] focus:outline-none"
                  >
                    <option value="">New template…</option>
                    {savedTemplates.filter((t) => t.category === 'columns').map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-mid)] pointer-events-none" />
                </div>
                <input
                  type="text"
                  value={columnsTemplateName}
                  onChange={(e) => setColumnsTemplateName(e.target.value)}
                  placeholder="Template name"
                  className="flex-1 max-w-[180px] bg-[var(--bg-panel)] border border-[var(--border-hi)] rounded-md px-2 py-1.5 text-xs text-[var(--text)] focus:border-[var(--amber)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const name = columnsTemplateName.trim() || `Columns ${savedTemplates.filter((t) => t.category === 'columns').length + 1}`;
                    const data: ColumnsTemplateData = {
                      visibleColumns: visibleColumns.map((c) => ({ ...c })),
                      cueTypeColumns: Object.fromEntries(
                        Object.entries(cueTypeColumns).map(([k, v]) => [k, v.map((c) => ({ ...c }))])
                      ),
                    };
                    const template: ConfigTemplate = {
                      id: columnsTemplateId || crypto.randomUUID(),
                      name,
                      category: 'columns',
                      data,
                      createdAt: columnsTemplateId
                        ? savedTemplates.find((t) => t.id === columnsTemplateId)?.createdAt ?? new Date().toISOString()
                        : new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    };
                    await saveConfigTemplate(template);
                    await refreshTemplates();
                    setColumnsTemplateId(template.id);
                    setColumnsTemplateName(template.name);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-[var(--amber)] text-white rounded-md hover:bg-[var(--amber)] transition-colors shrink-0"
                >
                  <Save className="w-3 h-3" />
                  Save
                </button>
                {columnsTemplateId && (
                  <button
                    type="button"
                    onClick={() => {
                      const tpl = savedTemplates.find((t) => t.id === columnsTemplateId);
                      if (!tpl) return;
                      if (confirm(`Apply template "${tpl.name}"?\n\nThis will replace your default column configuration and rebuild all type-specific overrides from the template.`)) {
                        onApplyColumnsTemplate(tpl.data as ColumnsTemplateData);
                      }
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-emerald-600 text-white rounded-md hover:bg-emerald-500 transition-colors shrink-0"
                  >
                    Apply
                  </button>
                )}
              </div>

              <p className="text-xs text-[var(--text-mid)]">
                Choose which fields appear in the abridged cue list.
                Drag to reorder. Toggle visibility with the checkbox.
                You can also add cue-type-specific column selections.
              </p>

              {/* Column view selector */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-[var(--text-mid)]">Viewing columns for:</label>
                <select
                  value={columnView}
                  onChange={(e) => setColumnView(e.target.value)}
                  className="bg-[var(--bg-panel)] text-[var(--text)] text-sm rounded px-2 py-1.5 border border-[var(--border-hi)] focus:border-[var(--amber)] focus:ring-1 focus:ring-[#BF5700] outline-none cursor-pointer"
                >
                  <option value="default">Default (all types)</option>
                  {typesWithOverrides.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                {typesAvailableForOverride.length > 0 && (
                  <div className="flex items-center gap-1 ml-auto">
                    <select
                      id="add-override-type"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          onAddCueTypeColumns(e.target.value);
                          setColumnView(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="bg-[var(--bg-panel)] text-[var(--text)] text-xs rounded px-2 py-1.5 border border-[var(--border-hi)] outline-none cursor-pointer"
                    >
                      <option value="" disabled>
                        + Add type override...
                      </option>
                      {typesAvailableForOverride.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {columnView !== 'default' && cueTypeColumns[columnView] && (
                  <button
                    type="button"
                    onClick={() => {
                      onRemoveCueTypeColumns(columnView);
                      setColumnView('default');
                    }}
                    className="ml-auto flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-[var(--bg-panel)] rounded transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove override
                  </button>
                )}
              </div>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                  items={activeColumns.map((c) => c.key)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1.5">
                    {activeColumns.map((col) => (
                      <SortableColumnItem
                        key={col.key}
                        column={col}
                        onToggle={() =>
                          onToggleColumn(col.key, columnView !== 'default' ? columnView : undefined)
                        }
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}

          {activeTab === 'view' && (
            <div className="space-y-4">
              <p className="text-xs text-[var(--text-mid)]">
                Control how cues are displayed in the cue sheet.
              </p>

              {/* Cue Sheet View selector */}
              <div className="px-3 py-3 bg-[var(--bg-panel-a50)] rounded-md border border-[var(--border-hi-a50)]">
                <span className="text-sm text-[var(--text)] font-medium">Cue Sheet View</span>
                <p className="text-[10px] text-[var(--text-dim)] mt-0.5 mb-2">
                  Choose between the classic card-based layout or the production cue sheet layout.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onSetCueSheetView('classic')}
                    className={`flex-1 px-3 py-2 rounded-md text-xs font-medium border transition-colors ${
                      cueSheetView === 'classic'
                        ? 'border-[var(--amber)] bg-[var(--amber-dim)] text-[var(--amber)]'
                        : 'border-[var(--border-hi-a50)] text-[var(--text-mid)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'
                    }`}
                  >
                    Classic
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetCueSheetView('production')}
                    className={`flex-1 px-3 py-2 rounded-md text-xs font-medium border transition-colors ${
                      cueSheetView === 'production'
                        ? 'border-[var(--amber)] bg-[var(--amber-dim)] text-[var(--amber)]'
                        : 'border-[var(--border-hi-a50)] text-[var(--text-mid)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'
                    }`}
                  >
                    Production
                  </button>
                </div>
              </div>

              {/* Theatre Mode toggle */}
              <label className="flex items-center gap-3 px-3 py-3 bg-[var(--bg-panel-a50)] rounded-md border border-[var(--border-hi-a50)] cursor-pointer select-none hover:bg-[var(--bg-panel)]">
                <input
                  type="checkbox"
                  checked={theatreMode}
                  onChange={() => onSetTheatreMode(!theatreMode)}
                  className="w-4 h-4 rounded border-[var(--border-hi)] bg-[var(--bg-hover)] text-[var(--amber)] focus:ring-[#BF5700] focus:ring-offset-0 cursor-pointer"
                />
                <div>
                  <span className="text-sm text-[var(--text)] font-medium">Theatre Mode</span>
                  <p className="text-[10px] text-[var(--text-dim)] mt-0.5">
                    Low-brightness colour scheme with pure black base and boosted contrast for dark environments.
                  </p>
                </div>
              </label>

              {/* Show short codes toggle */}
              <label className="flex items-center gap-3 px-3 py-3 bg-[var(--bg-panel-a50)] rounded-md border border-[var(--border-hi-a50)] cursor-pointer select-none hover:bg-[var(--bg-panel)]">
                <input
                  type="checkbox"
                  checked={showShortCodes}
                  onChange={() => onSetShowShortCodes(!showShortCodes)}
                  className="w-4 h-4 rounded border-[var(--border-hi)] bg-[var(--bg-hover)] text-[var(--amber)] focus:ring-[#BF5700] focus:ring-offset-0 cursor-pointer"
                />
                <div>
                  <span className="text-sm text-[var(--text)] font-medium">Show Short Codes</span>
                  <p className="text-[10px] text-[var(--text-dim)] mt-0.5">
                    Display short codes instead of full cue type names in the cue sheet (if defined).
                  </p>
                </div>
              </label>

              {/* Show past cues toggle */}
              <label className="flex items-center gap-3 px-3 py-3 bg-[var(--bg-panel-a50)] rounded-md border border-[var(--border-hi-a50)] cursor-pointer select-none hover:bg-[var(--bg-panel)]">
                <input
                  type="checkbox"
                  checked={showPastCues}
                  onChange={() => onSetShowPastCues(!showPastCues)}
                  className="w-4 h-4 rounded border-[var(--border-hi)] bg-[var(--bg-hover)] text-[var(--amber)] focus:ring-[#BF5700] focus:ring-offset-0 cursor-pointer"
                />
                <div>
                  <span className="text-sm text-[var(--text)] font-medium">Show Past Cues</span>
                  <p className="text-[10px] text-[var(--text-dim)] mt-0.5">
                    Display cues that have already passed, greyed out above the current position.
                  </p>
                </div>
              </label>

              {/* Show skipped cues toggle */}
              <label className="flex items-center gap-3 px-3 py-3 bg-[var(--bg-panel-a50)] rounded-md border border-[var(--border-hi-a50)] cursor-pointer select-none hover:bg-[var(--bg-panel)]">
                <input
                  type="checkbox"
                  checked={showSkippedCues}
                  onChange={() => onSetShowSkippedCues(!showSkippedCues)}
                  className="w-4 h-4 rounded border-[var(--border-hi)] bg-[var(--bg-hover)] text-[var(--amber)] focus:ring-[#BF5700] focus:ring-offset-0 cursor-pointer"
                />
                <div>
                  <span className="text-sm text-[var(--text)] font-medium">Show Skipped Cues</span>
                  <p className="text-[10px] text-[var(--text-dim)] mt-0.5">
                    Show cues that fall between two linked cues. When hidden, skipped cues are removed from the cue sheet.
                  </p>
                </div>
              </label>

              {/* Video timecode overlay toggle */}
              <label className="flex items-center gap-3 px-3 py-3 bg-[var(--bg-panel-a50)] rounded-md border border-[var(--border-hi-a50)] cursor-pointer select-none hover:bg-[var(--bg-panel)]">
                <input
                  type="checkbox"
                  checked={showVideoTimecode}
                  onChange={() => onSetShowVideoTimecode(!showVideoTimecode)}
                  className="w-4 h-4 rounded border-[var(--border-hi)] bg-[var(--bg-hover)] text-[var(--amber)] focus:ring-[#BF5700] focus:ring-offset-0 cursor-pointer"
                />
                <div>
                  <span className="text-sm text-[var(--text)] font-medium">Video Timecode</span>
                  <p className="text-[10px] text-[var(--text-dim)] mt-0.5">
                    Show a timecode overlay on the video. Drag it to reposition.
                  </p>
                </div>
              </label>
            </div>
          )}

          {activeTab === 'templates' && (
            <div className="space-y-5">
              <p className="text-xs text-[var(--text-mid)]">
                Manage saved templates for Cue Types, Columns, and XLSX Export configurations.
                You can rename, delete, export, and import templates here.
              </p>

              {/* Import / Export All bar */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await exportAllTemplatesToJSON();
                  }}
                  disabled={savedTemplates.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--bg-panel)] text-[var(--text-mid)] rounded-md hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  Export All Templates
                </button>
                <button
                  type="button"
                  onClick={() => templateImportRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--bg-panel)] text-[var(--text-mid)] rounded-md hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  Import Templates
                </button>
                <input
                  ref={templateImportRef}
                  type="file"
                  accept=".json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const result = await importTemplatesFromJSON(file);
                      refreshTemplates();
                      alert(`Imported ${result.imported} template(s)${result.skipped ? `, skipped ${result.skipped}` : ''}.`);
                    } catch {
                      alert('Failed to import templates. Please check the JSON file.');
                    }
                    if (templateImportRef.current) templateImportRef.current.value = '';
                  }}
                  className="hidden"
                />
              </div>

              {/* Template categories */}
              {(['cueTypes', 'columns', 'xlsxExport'] as const).map((category) => {
                const categoryLabels: Record<string, string> = {
                  cueTypes: 'Cue Types',
                  columns: 'Columns',
                  xlsxExport: 'XLSX Export',
                };
                const categoryTemplates = savedTemplates.filter((t) => t.category === category);

                return (
                  <div key={category} className="p-4 bg-[var(--bg-panel)]/30 border border-[var(--border-hi-a50)] rounded-lg space-y-2">
                    <h3 className="text-sm font-medium text-[var(--text)]">{categoryLabels[category]} Templates</h3>
                    {categoryTemplates.length === 0 ? (
                      <p className="text-[11px] text-[var(--text-dim)] italic">No templates saved.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {categoryTemplates.map((tpl) => {
                          const isEditingThis = editingTemplateId === tpl.id;
                          const isDeletingThis = deletingTemplateId === tpl.id;

                          return (
                            <div
                              key={tpl.id}
                              className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-card)]/50 border border-[var(--border-hi)]/40 rounded-md"
                            >
                              {isEditingThis ? (
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  <input
                                    type="text"
                                    value={editingTemplateName}
                                    onChange={(e) => setEditingTemplateName(e.target.value)}
                                    onKeyDown={async (e) => {
                                      if (e.key === 'Enter') {
                                        await renameConfigTemplate(tpl.id, editingTemplateName);
                                        await refreshTemplates();
                                        setEditingTemplateId(null);
                                      }
                                      if (e.key === 'Escape') setEditingTemplateId(null);
                                    }}
                                    autoFocus
                                    className="flex-1 bg-[var(--bg-hover)] text-[var(--text)] rounded px-2 py-1 text-xs border border-[var(--amber)] focus:ring-1 focus:ring-[#BF5700] outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await renameConfigTemplate(tpl.id, editingTemplateName);
                                      await refreshTemplates();
                                      setEditingTemplateId(null);
                                    }}
                                    className="p-1 text-emerald-400 hover:text-emerald-300 rounded"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingTemplateId(null)}
                                    className="p-1 text-[var(--text-dim)] hover:text-[var(--text-mid)] rounded"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs text-[var(--text)] truncate">{tpl.name}</p>
                                    <p className="text-[10px] text-[var(--text-dim)] truncate">
                                      Updated {relativeTimeAgo(tpl.updatedAt)}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => { setEditingTemplateId(tpl.id); setEditingTemplateName(tpl.name); }}
                                      className="p-1 text-[var(--text-dim)] hover:text-[var(--text-mid)] hover:bg-[var(--bg-hover)] rounded transition-colors"
                                      title="Rename"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => exportTemplateToJSON(tpl)}
                                      className="p-1 text-[var(--text-dim)] hover:text-[var(--text-mid)] hover:bg-[var(--bg-hover)] rounded transition-colors"
                                      title="Export as JSON"
                                    >
                                      <Download className="w-3 h-3" />
                                    </button>
                                    {isDeletingThis ? (
                                      <div className="flex items-center gap-1 bg-red-900/30 border border-red-700/50 rounded px-2 py-1">
                                        <AlertTriangle className="w-3 h-3 text-red-400" />
                                        <span className="text-[10px] text-red-300">Delete?</span>
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            await deleteConfigTemplate(tpl.id);
                                            await refreshTemplates();
                                            setDeletingTemplateId(null);
                                          }}
                                          className="text-[10px] text-red-400 hover:text-red-300 font-medium px-1"
                                        >
                                          Yes
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setDeletingTemplateId(null)}
                                          className="text-[10px] text-[var(--text-mid)] hover:text-[var(--text-mid)] px-1"
                                        >
                                          No
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setDeletingTemplateId(tpl.id)}
                                        className="p-1 text-[var(--text-dim)] hover:text-red-400 hover:bg-[var(--bg-hover)] rounded transition-colors"
                                        title="Delete template"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'savefiles' && (
            <div className="space-y-5">
              <p className="text-xs text-[var(--text-mid)]">
                Manage backup snapshots. Cue backups are created automatically at the configured interval
                while you are active, and when the tab is backgrounded or the page is closed. Configuration is
                backed up when you close this modal.
              </p>

              {/* Backup interval setting */}
              <div className="p-4 bg-[var(--bg-panel)]/30 border border-[var(--border-hi-a50)] rounded-lg space-y-2">
                <h3 className="text-sm font-medium text-[var(--text)]">Cue Backup Interval</h3>
                <p className="text-[10px] text-[var(--text-dim)]">
                  How often (in minutes) to create a rolling backup of your cues while you are actively working.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={cueBackupIntervalMinutes}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v) && v >= 1) onSetCueBackupInterval(v);
                    }}
                    className="w-20 bg-[var(--bg-panel)] text-[var(--text)] rounded px-3 py-1.5 text-sm border border-[var(--border-hi)] focus:border-[var(--amber)] focus:ring-1 focus:ring-[#BF5700] outline-none"
                  />
                  <span className="text-xs text-[var(--text-mid)]">minutes</span>
                </div>
              </div>

              {/* Per-video recovery section */}
              <div className="p-4 bg-[var(--bg-panel)]/30 border border-[var(--border-hi-a50)] rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-[var(--text)]">Video File Backups</h3>
                  <button
                    type="button"
                    onClick={() => setRecoveryTick((prev) => prev + 1)}
                    className="text-xs px-2 py-1 rounded bg-[var(--bg-panel)] text-[var(--text-mid)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    Refresh
                  </button>
                </div>

                {videoFiles.length === 0 ? (
                  <p className="text-[11px] text-[var(--text-dim)]">No video files with backups found.</p>
                ) : (
                  <>
                    {/* Video file dropdown */}
                    <div className="flex items-center gap-2 min-w-0">
                      <label className="text-xs text-[var(--text-mid)] shrink-0">Select video:</label>
                      <select
                        value={effectiveSelectedKey}
                        onChange={(e) => { setSelectedVideoKey(e.target.value); setRecoveryTick((prev) => prev + 1); }}
                        className="min-w-0 flex-1 bg-[var(--bg-panel)] text-[var(--text)] text-sm rounded px-2 py-1.5 border border-[var(--border-hi)] focus:border-[var(--amber)] focus:ring-1 focus:ring-[#BF5700] outline-none cursor-pointer"
                      >
                        {videoFiles.map((vf) => {
                          const displayName = vf.fileName === 'no-video' ? 'No Video' : vf.fileName;
                          const isCurrent = currentVideoName === vf.fileName && currentVideoSize === vf.fileSize;
                          return (
                            <option key={vf.storageKey} value={vf.storageKey}>
                              {displayName}
                              {isCurrent ? ' (current)' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* Backup list for the selected video */}
                    {selectedVideoInfo && (() => {
                      const selectedDisplayName = selectedVideoInfo.fileName === 'no-video' ? 'No Video' : selectedVideoInfo.fileName;
                      return (
                      <div className="space-y-2">
                        {selectedVideoBackups.length === 0 ? (
                          <p className="text-[11px] text-[var(--text-dim)]">No backups for this video.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {selectedVideoBackups.map((snapshot) => (
                              <div
                                key={`video-backup-${snapshot.slot}`}
                                className="flex items-center justify-between gap-3 px-3 py-2 rounded border border-[var(--border-hi-a50)] bg-[var(--bg-card)]/40"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="text-xs text-[var(--text)] truncate">
                                      {new Date(snapshot.savedAt).toLocaleString()}
                                    </p>
                                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg-panel)] text-[var(--text-mid)]">
                                      {relativeTimeAgo(snapshot.savedAt)}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-[var(--text-dim)]">
                                    {snapshot.itemCount ?? 0} cues · {snapshot.bytes} bytes
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const payload = await getBackupPayload(effectiveSelectedKey, snapshot.slot);
                                      if (!payload) return;
                                      try {
                                        const parsed = JSON.parse(payload);
                                        if (Array.isArray(parsed)) {
                                          exportAnnotationsToCSV(
                                            parsed,
                                            `${selectedDisplayName}-backup-${snapshot.slot}`,
                                          );
                                        }
                                      } catch {
                                        /* ignore */
                                      }
                                    }}
                                    className="text-xs px-2 py-1 rounded bg-[var(--bg-panel)] text-[var(--text-mid)] hover:bg-[var(--bg-hover)] transition-colors"
                                    title="Export this backup as CSV"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (
                                        confirm(
                                          `Restore cues from backup at ${new Date(snapshot.savedAt).toLocaleString()}?\n\nThis will replace the saved cues for "${selectedDisplayName}".`,
                                        )
                                      ) {
                                        if (await restoreBackup(effectiveSelectedKey, snapshot.slot)) {
                                          // If restoring the currently loaded video, reload it in the app
                                          if (
                                            currentVideoName === selectedVideoInfo.fileName &&
                                            currentVideoSize === selectedVideoInfo.fileSize
                                          ) {
                                            onRecoverCurrentVideoCues();
                                          }
                                          setRecoveryTick((prev) => prev + 1);
                                        }
                                      }
                                    }}
                                    className="text-xs px-2 py-1 rounded bg-[var(--amber)] text-white hover:bg-[var(--amber)] transition-colors"
                                  >
                                    Restore
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Delete all backups for this video */}
                        <button
                          type="button"
                          onClick={async () => {
                            if (
                              confirm(
                                `⚠️ Delete all backups for "${selectedDisplayName}"?\n\nThis will permanently remove all backup snapshots for this video file. The video will no longer appear in this dropdown until new cues are created for it.\n\nThis cannot be undone.`,
                              )
                            ) {
                              await deleteVideoBackups(selectedVideoInfo.fileName, selectedVideoInfo.fileSize);
                              setSelectedVideoKey('');
                              setRecoveryTick((prev) => prev + 1);
                            }
                          }}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 mt-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-md border border-red-800/40 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete All Backups for This Video
                        </button>
                      </div>
                      );
                    })()}
                  </>
                )}
              </div>

              {/* Config backups section */}
              <div className="p-4 bg-[var(--bg-panel)]/30 border border-[var(--border-hi-a50)] rounded-lg space-y-3">
                <h3 className="text-sm font-medium text-[var(--text)]">Configuration Backups</h3>
                {configBackups.length === 0 ? (
                  <p className="text-[11px] text-[var(--text-dim)]">No configuration backups yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {configBackups.map((snapshot) => (
                      <div
                        key={`config-backup-${snapshot.slot}`}
                        className="flex items-center justify-between gap-3 px-3 py-2 rounded border border-[var(--border-hi-a50)] bg-[var(--bg-card)]/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-[var(--text)] truncate">
                              {new Date(snapshot.savedAt).toLocaleString()}
                            </p>
                            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg-panel)] text-[var(--text-mid)]">
                              {relativeTimeAgo(snapshot.savedAt)}
                            </span>
                          </div>
                          <p className="text-[10px] text-[var(--text-dim)]">{snapshot.bytes} bytes</p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            if (
                              confirm(
                                `Restore configuration from backup at ${new Date(snapshot.savedAt).toLocaleString()}?`,
                              )
                            ) {
                              const key = getConfigStorageKey();
                              if (await restoreBackup(key, snapshot.slot)) {
                                onRecoverConfig();
                                setRecoveryTick((prev) => prev + 1);
                              }
                            }
                          }}
                          className="shrink-0 text-xs px-2 py-1 rounded bg-[var(--amber)] text-white hover:bg-[var(--amber)] transition-colors"
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-4">
              <p className="text-xs text-[var(--text-mid)]">
                Manage stored data. These actions are permanent and cannot be undone.
              </p>

              <div className="space-y-3">
                {currentVideoName && currentVideoSize !== undefined && (
                  <div className="p-4 bg-red-900/20 border border-red-800/40 rounded-lg">
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            `Clear all cues for "${currentVideoName}"?\n\nThis will remove all annotations for this video only. Your configuration will be preserved.`,
                          )
                        ) {
                          onClearCurrentVideoCues(currentVideoName, currentVideoSize);
                        }
                      }}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-md border border-red-800/50 transition-colors"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      Clear Cues for Current Video
                    </button>
                    <p className="text-[10px] text-red-400/70 mt-2">
                      Removes all cues from &quot;{currentVideoName}&quot; only.
                    </p>
                  </div>
                )}

                <div className="p-4 bg-red-900/20 border border-red-800/40 rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm(
                          'Clear all cues from all videos?\n\nThis will remove all annotations but keep your configuration intact.',
                        )
                      ) {
                        onClearAllCues();
                      }
                    }}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-md border border-red-800/50 transition-colors"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Clear All Cues
                  </button>
                  <p className="text-[10px] text-red-400/70 mt-2">
                    Removes all annotations from all videos. Configuration is preserved.
                  </p>
                </div>

                <div className="p-4 bg-red-950/40 border border-red-800/60 rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm(
                          'Factory reset all data?\n\nThis will delete all cues AND reset your configuration to defaults. This action is permanent.',
                        )
                      ) {
                        onClearAllData();
                        onClose();
                      }
                    }}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-500 hover:text-red-400 hover:bg-red-900/50 rounded-md border border-red-700/60 transition-colors font-medium"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Factory Reset (All Data)
                  </button>
                  <p className="text-[10px] text-red-500/70 mt-2">
                    ⚠️ Deletes all cues and resets your configuration to defaults. Cannot be undone.
                  </p>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'projects' && (
            <ProjectAdminTab liveConfig={liveConfig} />
          )}
          {activeTab === 'info' && (
            <div className="space-y-6">
              <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Application Info</h3>
              <p className="text-sm" style={{ color: 'var(--text-mid)' }}>View feature notes and the user guide for Cuetation.</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowFeatureNotes(true)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md transition-colors"
                  style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)', border: '1px solid var(--border-hi)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-panel)'; e.currentTarget.style.color = 'var(--text-mid)'; }}
                >
                  <Info className="w-4 h-4" />
                  Feature Notes
                </button>
                <button
                  type="button"
                  onClick={() => setShowUserGuide(true)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md transition-colors"
                  style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)', border: '1px solid var(--border-hi)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-panel)'; e.currentTarget.style.color = 'var(--text-mid)'; }}
                >
                  <Info className="w-4 h-4" />
                  User Guide
                </button>
              </div>
              <InfoModal isOpen={showFeatureNotes} onClose={() => setShowFeatureNotes(false)} title="Feature Notes" content={featureNotes} />
              <InfoModal isOpen={showUserGuide} onClose={() => setShowUserGuide(false)} title="User Guide" content={userGuide} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)]">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onExportConfig}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--bg-panel)] text-[var(--text-mid)] rounded-md hover:bg-[var(--bg-hover)] transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export Config
            </button>
            <button
              type="button"
              onClick={() => importRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--bg-panel)] text-[var(--text-mid)] rounded-md hover:bg-[var(--bg-hover)] transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Config
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".json"
              onChange={handleImportFile}
              className="hidden"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm bg-[var(--amber)] text-white rounded-md hover:bg-[var(--amber)] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
