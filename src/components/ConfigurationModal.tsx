import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { X, Plus, Trash2, GripVertical, Download, Lock, Pencil, Check, AlertTriangle, ChevronDown, ChevronRight, Save, FileUp, Info, UserCircle, RotateCcw, Archive, Star, Tag, List, LayoutGrid, Eye, EyeOff, Keyboard, Bookmark, FolderOpen } from 'lucide-react';
import type { ColumnConfig, Project, AppConfig, FieldDefinition, ConfigTemplate, TemplateData, Toast } from '../types';
import { RESERVED_CUE_TYPES, EDITABLE_FIELD_KEYS, LINK_COLUMN_KEYS, getDefaultFieldsForType, getFieldLabel, extractTemplateData, FACTORY_DEFAULT_TEMPLATE } from '../types';
import { loadConfigTemplates, saveConfigTemplate, deleteConfigTemplate, renameConfigTemplate, exportTemplateToJSON, importTemplateFromJSON, getDefaultTemplate, setDefaultTemplate } from '../utils/configTemplates';
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
import { ConfirmDialog } from './ConfirmDialog';
import { useConfirm } from '../hooks/useConfirm';
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
  autoplayAfterCue: boolean;
  onSetAutoplayAfterCue: (enabled: boolean) => void;
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
  onDeleteProject: () => void;
  onApplyTemplate: (data: TemplateData) => void;
  // Field definition CRUD
  onAddField: (def: Omit<FieldDefinition, 'key' | 'tier' | 'archived'>) => string | null;
  onUpdateField: (key: string, updates: Partial<Pick<FieldDefinition, 'label' | 'sizeHint'>>) => void;
  onArchiveField: (key: string) => void;
  onRestoreField: (key: string) => void;
  // In-use field detection
  usedFieldKeys?: Set<string>;
  // Mandatory fields per type
  mandatoryFields?: Record<string, string[]>;
  onSetMandatoryField?: (cueType: string, fieldKey: string) => void;
  onUnsetMandatoryField?: (cueType: string, fieldKey: string) => void;
  // Reorder & hide
  onReorderCueTypes?: (newOrder: string[]) => void;
  onToggleCueTypeHidden?: (typeName: string) => void;
  hiddenCueTypes?: string[];
  onToggleFieldHidden?: (fieldKey: string) => void;
  hiddenFieldKeys?: string[];
  /** Toast notification handler — passed from parent so toasts use the shared stack. */
  addToast?: (message: string, type: Toast['type'], opts?: number | { duration?: number; details?: string }) => string;
  /** Current project name for Data tab confirmation messages. */
  projectName?: string;
  /** Total annotation count across all videos in the current project. */
  annotationCount?: number;
  /** Callback to navigate to home screen. */
  onGoHome?: () => void;
  /** Callback to delete all projects (used for Factory Reset). */
  onDeleteAllProjects?: () => Promise<void>;
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

// ── Sortable cue type row for drag reorder ──

function SortableCueTypeRow({
  type,
  isReserved,
  children,
}: {
  type: string;
  isReserved: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `cue-type-${type}`,
    disabled: isReserved,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-1">
        {isReserved ? (
          <div className="w-5 shrink-0" />
        ) : (
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-[var(--text-dim)] hover:text-[var(--text-mid)] touch-none shrink-0"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
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
  isMandatory,
  onToggle,
  onToggleMandatory,
}: {
  fieldKey: string;
  label: string;
  isActive: boolean;
  isLocked: boolean;
  isMandatory?: boolean;
  onToggle: () => void;
  onToggleMandatory?: () => void;
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
      {/* Mandatory toggle — only for active, non-locked fields */}
      {isActive && !isLocked && onToggleMandatory && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleMandatory(); }}
          className={`text-[10px] px-1.5 py-0.5 rounded transition-colors shrink-0 ${
            isMandatory
              ? 'text-red-400 bg-red-500/15 hover:bg-red-500/25'
              : 'text-[var(--text-dim)] hover:text-[var(--text-mid)] hover:bg-[var(--bg-hover)]'
          }`}
          title={isMandatory ? 'Remove mandatory requirement' : 'Mark as mandatory'}
        >
          {isMandatory ? '✱ Req' : '✱'}
        </button>
      )}
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
  autoplayAfterCue,
  onSetAutoplayAfterCue,
  onSetCueTypeFields,
  onToggleColumn,
  onReorderColumns,
  onAddCueTypeColumns,
  onRemoveCueTypeColumns,
  onExportConfig: _onExportConfig,
  onImportConfig,
  onRecoverCurrentVideoCues,
  onRecoverConfig,
  onClearAllData,
  onClearCurrentVideoCues: _onClearCurrentVideoCues,
  onClearAllCues,
  onDeleteProject,
  onApplyTemplate,
  onAddField,
  onUpdateField,
  onArchiveField,
  onRestoreField,
  usedFieldKeys,
  mandatoryFields,
  onSetMandatoryField,
  onUnsetMandatoryField,
  onReorderCueTypes,
  onToggleCueTypeHidden,
  hiddenCueTypes,
  onToggleFieldHidden,
  hiddenFieldKeys,
  addToast,
  projectName,
  annotationCount,
  onGoHome,
  onDeleteAllProjects,
}: ConfigurationModalProps) {
  const { confirmState, showConfirm } = useConfirm();
  const [newTypeName, setNewTypeName] = useState('');
  const [activeTab, setActiveTab] = useState<'types' | 'fields' | 'columns' | 'view' | 'hotkeys' | 'templates' | 'savefiles' | 'data' | 'projects' | 'info'>('types');

  type TabKey = typeof activeTab;
  const tabMeta: Record<TabKey, { title: string; desc: string; icon: React.ReactNode; group: 'setup' | 'manage' | 'info' }> = {
    types:     { title: 'Cue Types',  desc: 'Define the cue types available when creating or editing a cue. Reserved types cannot be deleted. Types in use cannot be deleted until their cues are reassigned.', icon: <Tag className="w-3.5 h-3.5" />, group: 'setup' },
    fields:    { title: 'Fields',     desc: 'Create custom fields, rename existing fields, or archive fields you no longer need. Reserved and in-use fields cannot be archived. Archived fields preserve existing cue data.', icon: <List className="w-3.5 h-3.5" />, group: 'setup' },
    columns:   { title: 'Columns',    desc: 'Choose which fields appear as columns in the abridged cue list. Drag to reorder. Toggle visibility with the checkbox. Add type-specific overrides to show different columns per cue type.', icon: <LayoutGrid className="w-3.5 h-3.5" />, group: 'setup' },
    view:      { title: 'View',       desc: 'Control how cues are displayed in the cue sheet. Changes apply immediately.', icon: <Eye className="w-3.5 h-3.5" />, group: 'setup' },
    hotkeys:   { title: 'HotKeys',    desc: 'Keyboard shortcuts active while on the cue sheet. Shortcuts are disabled when typing in text fields.', icon: <Keyboard className="w-3.5 h-3.5" />, group: 'setup' },
    templates: { title: 'Templates',  desc: 'Save and load configuration templates capturing Cue Types, Fields, Columns, and View settings. Export as .cuetation-template.json to share between installations.', icon: <Bookmark className="w-3.5 h-3.5" />, group: 'manage' },
    savefiles: { title: 'Save Files', desc: 'Manage backup snapshots. Cue backups are created automatically at the configured interval while you are active, and when the tab is backgrounded or the page is closed.', icon: <RotateCcw className="w-3.5 h-3.5" />, group: 'manage' },
    data:      { title: 'Data',       desc: 'Destructive actions scoped to the current project, or to the entire application. All actions require confirmation before executing.', icon: <AlertTriangle className="w-3.5 h-3.5" />, group: 'manage' },
    projects:  { title: 'Projects',   desc: 'Manage all projects. Edit metadata or delete unused projects.', icon: <FolderOpen className="w-3.5 h-3.5" />, group: 'manage' },
    info:      { title: 'Info',       desc: 'View feature notes and the user guide for Cuetation.', icon: <Info className="w-3.5 h-3.5" />, group: 'info' },
  };

  const sidebarItem = (tab: TabKey) => {
    const meta = tabMeta[tab];
    const isActive = activeTab === tab;
    return (
      <button
        key={tab}
        type="button"
        onClick={() => {
          if (tab === 'templates') refreshTemplates();
          if (tab === 'savefiles') setRecoveryTick((prev) => prev + 1);
          setActiveTab(tab);
        }}
        className="flex items-center gap-2.5 w-full text-left transition-colors"
        style={{
          padding: '9px 16px',
          borderLeft: `2px solid ${isActive ? 'var(--amber)' : 'transparent'}`,
          background: isActive ? 'var(--amber-dim)' : 'transparent',
        }}
        onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'; }}
        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
      >
        <span
          className="flex items-center justify-center flex-shrink-0 rounded"
          style={{
            width: 22, height: 22,
            background: isActive ? 'var(--amber-dim)' : 'var(--bg-input)',
            border: `1px solid ${isActive ? 'var(--amber-glow)' : 'var(--border)'}`,
            color: isActive ? 'var(--amber)' : 'var(--text-dim)',
          }}
        >
          {meta.icon}
        </span>
        <span className="text-xs font-medium" style={{ color: isActive ? 'var(--amber)' : 'var(--text-mid)' }}>
          {meta.title}
        </span>
      </button>
    );
  };
  const [showFeatureNotes, setShowFeatureNotes] = useState(false);
  const [showUserGuide, setShowUserGuide] = useState(false);
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [columnView, setColumnView] = useState<string>('default');
  const [recoveryTick, setRecoveryTick] = useState(0);
  const [selectedVideoKey, setSelectedVideoKey] = useState<string>('');
  const [expandedFieldType, setExpandedFieldType] = useState<string | null>(null);
  // Field management state
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldInputType, setNewFieldInputType] = useState<'text' | 'number' | 'checkbox'>('text');
  const [newFieldPrecision, setNewFieldPrecision] = useState<'integer' | 'decimal'>('integer');
  const [newFieldSizeHint, setNewFieldSizeHint] = useState<'small' | 'medium' | 'large'>('small');
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);
  const [editingFieldLabel, setEditingFieldLabel] = useState('');
  const [editingFieldSizeHint, setEditingFieldSizeHint] = useState<'small' | 'medium' | 'large'>('small');
  const [showArchivedFields, setShowArchivedFields] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const templateImportRef = useRef<HTMLInputElement>(null);

  // Template state
  const [savedTemplates, setSavedTemplates] = useState<ConfigTemplate[]>([]);
  const [newTemplateName, setNewTemplateName] = useState('');
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
      const hasLinking = typeFields.includes('linkCueNumber');
      // 'type' column is always shown; other columns shown only if their field is enabled for this type
      // Visibility (checked/unchecked) is controlled separately
      return base.filter((col) => {
        if (col.key === 'type') return true;
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
  const allTypesForOverride = [...new Set([...cueTypes])];
  const typesAvailableForOverride = allTypesForOverride.filter((t) => !cueTypeColumns[t]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="flex flex-col overflow-hidden rounded-xl border shadow-2xl"
        style={{
          width: 900,
          maxWidth: '100%',
          height: '85vh',
          background: 'var(--bg-raised)',
          borderColor: 'var(--border-hi)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03)',
        }}
      >
        {/* ─── HEADER ─── */}
        <div
          className="flex items-center gap-3 flex-shrink-0"
          style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)' }}
        >
          <span style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 18, color: 'var(--text)', letterSpacing: '0.01em' }}>
            Cue<em style={{ fontStyle: 'italic', color: 'var(--amber)' }}>tation</em>
          </span>
          <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Configuration</span>
          <span
            className="ml-auto"
            style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.06em', color: 'var(--text-dim)', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, padding: '3px 7px' }}
          >
            v0.9.1
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center flex-shrink-0 transition-colors"
            style={{
              width: 28, height: 28, borderRadius: '50%',
              border: '1px solid var(--border-hi)', background: 'var(--bg-card)',
              color: 'var(--text-dim)', fontSize: 13,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--text-mid)'; e.currentTarget.style.color = 'var(--text-mid)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-hi)'; e.currentTarget.style.color = 'var(--text-dim)'; }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ─── BODY ─── */}
        <div className="flex flex-1 min-h-0">
          {/* SIDEBAR */}
          <div
            className="flex flex-col flex-shrink-0 overflow-y-auto annotation-scroll"
            style={{
              width: 176,
              background: 'var(--bg-card)',
              borderRight: '1px solid var(--border)',
              padding: '8px 0 12px',
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase' as const, color: 'var(--text-dim)', padding: '6px 16px 5px' }}>Setup</span>
            {sidebarItem('types')}
            {sidebarItem('fields')}
            {sidebarItem('columns')}
            {sidebarItem('view')}
            {sidebarItem('hotkeys')}
            <div style={{ height: 1, background: 'var(--border)', margin: '7px 14px' }} />
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase' as const, color: 'var(--text-dim)', padding: '14px 16px 5px' }}>Manage</span>
            {sidebarItem('templates')}
            {sidebarItem('savefiles')}
            {sidebarItem('data')}
            {sidebarItem('projects')}
            <div style={{ height: 1, background: 'var(--border)', margin: '7px 14px' }} />
            {sidebarItem('info')}
          </div>

          {/* CONTENT AREA */}
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            {/* Content header */}
            <div className="flex-shrink-0" style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 5 }}>{tabMeta[activeTab].title}</h3>
              <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6, fontWeight: 300, maxWidth: 540 }}>{tabMeta[activeTab].desc}</p>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto annotation-scroll" style={{ padding: '20px 24px' }}>
          {activeTab === 'types' && (
            <div className="space-y-4">
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
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event: DragEndEvent) => {
                  const { active, over } = event;
                  if (!over || active.id === over.id || !onReorderCueTypes) return;
                  const oldIndex = cueTypes.findIndex((t) => `cue-type-${t}` === active.id);
                  const newIndex = cueTypes.findIndex((t) => `cue-type-${t}` === over.id);
                  if (oldIndex < 0 || newIndex < 0) return;
                  const reordered = [...cueTypes];
                  const [moved] = reordered.splice(oldIndex, 1);
                  reordered.splice(newIndex, 0, moved);
                  onReorderCueTypes(reordered);
                }}
              >
              <SortableContext items={cueTypes.map((t) => `cue-type-${t}`)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {cueTypes.map((type) => {
                  const isReserved = (RESERVED_CUE_TYPES as readonly string[]).includes(type);
                  const isInUse = usedCueTypes.has(type);
                  const isLocked = isReserved || isInUse;
                  const isEditing = editingType === type;
                  const isHidden = hiddenCueTypes?.includes(type) ?? false;

                  return (
                    <SortableCueTypeRow key={type} type={type} isReserved={isReserved}>
                    <React.Fragment>
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
                            {isHidden && (
                              <span className="flex items-center gap-1 text-[10px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">
                                <EyeOff className="w-3 h-3" />
                                Hidden
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
                            className={`p-1 text-[var(--text-dim)] hover:text-[var(--text-mid)] hover:bg-[var(--bg-hover)] rounded transition-colors`}
                            title={`Rename ${type}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {!isReserved && onToggleCueTypeHidden && (
                            <button
                              type="button"
                              onClick={() => onToggleCueTypeHidden(type)}
                              className={`p-1 rounded transition-colors ${isHidden ? 'text-amber-400 hover:text-amber-300' : 'text-[var(--text-dim)] hover:text-[var(--text-mid)]'} hover:bg-[var(--bg-hover)]`}
                              title={isHidden ? `Show ${type} in dropdowns and cue sheet` : `Hide ${type} from dropdowns and cue sheet`}
                            >
                              {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          )}
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
                      const fieldDefs = liveConfig.fieldDefinitions ?? [];
                      const archivedKeys = new Set(fieldDefs.filter((f) => f.archived).map((f) => f.key));
                      const hiddenKeys = new Set(hiddenFieldKeys ?? []);
                      // Combine static editable keys + custom (Tier 3) keys, excluding archived and hidden
                      const tier3Keys = fieldDefs.filter((f) => f.tier === 3 && !f.archived).map((f) => f.key);
                      const allEditableKeys = [...EDITABLE_FIELD_KEYS.filter((k) => !archivedKeys.has(k) && !hiddenKeys.has(k)), ...tier3Keys.filter((k) => !hiddenKeys.has(k))];

                      const currentFields = (cueTypeFields[type] ?? getDefaultFieldsForType(type)).filter((k) => !hiddenKeys.has(k));
                      const allCount = allEditableKeys.length;
                      const selectedCount = currentFields.filter((k) => !archivedKeys.has(k) && !hiddenKeys.has(k)).length;

                      const toggleField = (fieldKey: string) => {
                        if (LOCKED_FIELD_KEYS.includes(fieldKey)) return;
                        const next = currentFields.includes(fieldKey)
                          ? currentFields.filter((f) => f !== fieldKey)
                          : [...currentFields, fieldKey];
                        onSetCueTypeFields(type, next);
                      };

                      const selectAll = () => {
                        // Keep locked at top, add remaining in editable order
                        const ordered = [...LOCKED_FIELD_KEYS, ...allEditableKeys.filter((k) => !LOCKED_FIELD_KEYS.includes(k))];
                        onSetCueTypeFields(type, ordered);
                      };
                      const selectNone = () => onSetCueTypeFields(type, [...LOCKED_FIELD_KEYS]);
                      const resetDefaults = () => onSetCueTypeFields(type, getDefaultFieldsForType(type).filter((k) => !hiddenKeys.has(k)));

                      // Build the ordered display list:
                      // 1. Locked fields always at top (always active)
                      // 2. Active (non-locked) fields in their current order
                      // 3. Inactive fields at the bottom in definition order
                      const activeNonLocked = currentFields.filter((k) => !LOCKED_FIELD_KEYS.includes(k) && !archivedKeys.has(k) && !hiddenKeys.has(k));
                      const inactiveFields = allEditableKeys.filter((k) => !LOCKED_FIELD_KEYS.includes(k) && !currentFields.includes(k));
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
                                {orderedKeys.map((fieldKey) => {
                                  const fieldActive = LOCKED_FIELD_KEYS.includes(fieldKey) || currentFields.includes(fieldKey);
                                  const fieldLocked = LOCKED_FIELD_KEYS.includes(fieldKey);
                                  const typeMandatory = mandatoryFields?.[type] ?? [];
                                  const isMandatory = typeMandatory.includes(fieldKey);
                                  return (
                                    <SortableFieldItem
                                      key={fieldKey}
                                      fieldKey={fieldKey}
                                      label={getFieldLabel(fieldKey, liveConfig.fieldDefinitions)}
                                      isActive={fieldActive}
                                      isLocked={fieldLocked}
                                      isMandatory={isMandatory}
                                      onToggle={() => toggleField(fieldKey)}
                                      onToggleMandatory={onSetMandatoryField && onUnsetMandatoryField ? () => {
                                        if (isMandatory) {
                                          onUnsetMandatoryField(type, fieldKey);
                                        } else {
                                          onSetMandatoryField(type, fieldKey);
                                        }
                                      } : undefined}
                                    />
                                  );
                                })}
                              </div>
                            </SortableContext>
                          </DndContext>
                        </div>
                      );
                    })()}
                    </React.Fragment>
                    </SortableCueTypeRow>
                  );
                })}
              </div>
              </SortableContext>
              </DndContext>

            </div>
          )}

          {activeTab === 'fields' && (() => {
            const fieldDefs = liveConfig.fieldDefinitions ?? [];
            const activeFields = fieldDefs.filter((f) => !f.archived);
            const archivedFields = fieldDefs.filter((f) => f.archived);
            const tierLabel = (t: 1 | 2 | 3) => t === 1 ? 'Reserved' : t === 2 ? 'Default' : 'Custom';
            const tierColor = (t: 1 | 2 | 3) => t === 1 ? 'text-amber-400 bg-amber-500/10' : t === 2 ? 'text-sky-400 bg-sky-500/10' : 'text-emerald-400 bg-emerald-500/10';
            const isFieldInUse = (key: string) => usedFieldKeys?.has(key) ?? false;

            return (
              <div className="space-y-4">
                {/* Add new custom field */}
                <div className="p-3 bg-[var(--bg-card)]/60 border border-[var(--border-hi)]/30 rounded-md space-y-2">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Create Custom Field</span>
                  <div className="flex gap-2 flex-wrap">
                    <input
                      type="text"
                      value={newFieldLabel}
                      onChange={(e) => setNewFieldLabel(e.target.value)}
                      placeholder="Field label..."
                      className="flex-1 min-w-[120px] bg-[var(--bg-panel)] text-[var(--text)] rounded px-2.5 py-1.5 text-xs border border-[var(--border-hi)] focus:border-[var(--amber)] focus:ring-1 focus:ring-[#BF5700] outline-none placeholder-slate-500"
                    />
                    <div className="relative">
                      <select
                        value={newFieldInputType}
                        onChange={(e) => {
                          const val = e.target.value as 'text' | 'number' | 'checkbox';
                          setNewFieldInputType(val);
                          if (val === 'checkbox') setNewFieldSizeHint('small');
                        }}
                        className="bg-[var(--bg-panel)] border border-[var(--border-hi)] rounded px-2 py-1.5 text-xs text-[var(--text)] appearance-none pr-6 focus:border-[var(--amber)] focus:outline-none"
                      >
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="checkbox">Checkbox</option>
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-mid)] pointer-events-none" />
                    </div>
                    {newFieldInputType === 'number' && (
                      <div className="relative">
                        <select
                          value={newFieldPrecision}
                          onChange={(e) => setNewFieldPrecision(e.target.value as 'integer' | 'decimal')}
                          className="bg-[var(--bg-panel)] border border-[var(--border-hi)] rounded px-2 py-1.5 text-xs text-[var(--text)] appearance-none pr-6 focus:border-[var(--amber)] focus:outline-none"
                        >
                          <option value="integer">Integer</option>
                          <option value="decimal">Decimal</option>
                        </select>
                        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-mid)] pointer-events-none" />
                      </div>
                    )}
                    {newFieldInputType !== 'checkbox' && (
                      <div className="relative">
                        <select
                          value={newFieldSizeHint}
                          onChange={(e) => setNewFieldSizeHint(e.target.value as 'small' | 'medium' | 'large')}
                          className="bg-[var(--bg-panel)] border border-[var(--border-hi)] rounded px-2 py-1.5 text-xs text-[var(--text)] appearance-none pr-6 focus:border-[var(--amber)] focus:outline-none"
                        >
                          <option value="small">Small</option>
                          <option value="medium">Medium</option>
                          <option value="large">Large</option>
                        </select>
                        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-mid)] pointer-events-none" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!newFieldLabel.trim()) return;
                        onAddField({
                          label: newFieldLabel.trim(),
                          inputType: newFieldInputType,
                          ...(newFieldInputType === 'number' ? { numberPrecision: newFieldPrecision } : {}),
                          sizeHint: newFieldSizeHint,
                        });
                        setNewFieldLabel('');
                        setNewFieldInputType('text');
                        setNewFieldPrecision('integer');
                        setNewFieldSizeHint('small');
                      }}
                      disabled={!newFieldLabel.trim()}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs bg-[var(--amber)] text-white rounded hover:bg-[var(--amber)]/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                  </div>
                </div>

                {/* Active fields list */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Active Fields ({activeFields.length})</span>
                  <div className="space-y-1 overflow-y-auto annotation-scroll" style={{ maxHeight: 'calc(85vh - 340px)' }}>
                    {activeFields.map((fd) => (
                      <div
                        key={fd.key}
                        className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-panel-a50)] rounded border border-[var(--border-hi-a50)]"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {editingFieldKey === fd.key ? (
                            <div className="flex items-center gap-1.5 flex-1">
                              <input
                                type="text"
                                value={editingFieldLabel}
                                onChange={(e) => setEditingFieldLabel(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (editingFieldLabel.trim()) {
                                      onUpdateField(fd.key, { label: editingFieldLabel.trim(), sizeHint: editingFieldSizeHint });
                                    }
                                    setEditingFieldKey(null);
                                  }
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setEditingFieldKey(null);
                                  }
                                }}
                                autoFocus
                                className="flex-1 bg-[var(--bg-hover)] text-[var(--text)] rounded px-2 py-0.5 text-xs border border-[var(--amber)] focus:ring-1 focus:ring-[#BF5700] outline-none"
                              />
                              <div className="relative">
                                <select
                                  value={editingFieldSizeHint}
                                  onChange={(e) => setEditingFieldSizeHint(e.target.value as 'small' | 'medium' | 'large')}
                                  className="bg-[var(--bg-panel)] border border-[var(--border-hi)] rounded px-1.5 py-0.5 text-[10px] text-[var(--text)] appearance-none pr-5 focus:border-[var(--amber)] focus:outline-none"
                                >
                                  <option value="small">S</option>
                                  <option value="medium">M</option>
                                  <option value="large">L</option>
                                </select>
                                <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-[var(--text-mid)] pointer-events-none" />
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (editingFieldLabel.trim()) {
                                    onUpdateField(fd.key, { label: editingFieldLabel.trim(), sizeHint: editingFieldSizeHint });
                                  }
                                  setEditingFieldKey(null);
                                }}
                                className="p-0.5 text-emerald-400 hover:text-emerald-300 rounded transition-colors"
                                title="Save"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingFieldKey(null)}
                                className="p-0.5 text-[var(--text-dim)] hover:text-[var(--text-mid)] rounded transition-colors"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className="text-xs text-[var(--text)] font-medium truncate">{fd.label}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 ${tierColor(fd.tier as 1 | 2 | 3)}`}>
                                {fd.tier === 1 ? <Lock className="w-2.5 h-2.5" /> : fd.tier === 3 ? <UserCircle className="w-2.5 h-2.5" /> : null}
                                {tierLabel(fd.tier as 1 | 2 | 3)}
                              </span>
                              {fd.tier !== 1 && isFieldInUse(fd.key) && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 text-violet-400 bg-violet-500/10">
                                  <Lock className="w-2.5 h-2.5" />
                                  In Use
                                </span>
                              )}
                              {fd.inputType === 'number' && (
                                <span className="text-[9px] text-[var(--text-dim)] bg-[var(--bg-hover)] px-1 py-0.5 rounded">
                                  {fd.numberPrecision === 'decimal' ? '#.##' : '#'}
                                </span>
                              )}
                              {fd.inputType === 'checkbox' && (
                                <span className="text-[9px] text-[var(--text-dim)] bg-[var(--bg-hover)] px-1 py-0.5 rounded">☑</span>
                              )}
                              <span className="text-[9px] text-[var(--text-dim)]">
                                {fd.sizeHint === 'large' ? 'L' : fd.sizeHint === 'medium' ? 'M' : 'S'}
                              </span>
                              {(hiddenFieldKeys ?? []).includes(fd.key) && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 text-orange-400 bg-orange-500/10">
                                  <EyeOff className="w-2.5 h-2.5" />
                                  Hidden
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        {editingFieldKey !== fd.key && (
                          <div className="flex items-center gap-1 ml-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingFieldKey(fd.key);
                                setEditingFieldLabel(fd.label);
                                setEditingFieldSizeHint(fd.sizeHint);
                              }}
                              className="p-0.5 text-[var(--text-dim)] hover:text-[var(--text-mid)] hover:bg-[var(--bg-hover)] rounded transition-colors"
                              title={`Edit ${fd.label}`}
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            {fd.tier !== 1 && !isFieldInUse(fd.key) && onToggleFieldHidden && (
                              <button
                                type="button"
                                onClick={() => onToggleFieldHidden(fd.key)}
                                className={`p-0.5 rounded transition-colors ${(hiddenFieldKeys ?? []).includes(fd.key) ? 'text-orange-400 hover:text-orange-300' : 'text-[var(--text-dim)] hover:text-[var(--text-mid)]'} hover:bg-[var(--bg-hover)]`}
                                title={(hiddenFieldKeys ?? []).includes(fd.key) ? `Show ${fd.label}` : `Hide ${fd.label} from all cue types, columns, and exports`}
                              >
                                {(hiddenFieldKeys ?? []).includes(fd.key) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </button>
                            )}
                            {fd.tier !== 1 && !isFieldInUse(fd.key) && (
                              <button
                                type="button"
                                onClick={async () => {
                                  const ok = await showConfirm({
                                    title: 'Archive Field',
                                    message: `Archive "${fd.label}"? Existing cue data will be preserved and you can restore this field later.`,
                                    confirmLabel: 'Archive',
                                    variant: 'warning',
                                    icon: 'archive',
                                  });
                                  if (ok) onArchiveField(fd.key);
                                }}
                                className="p-0.5 text-[var(--text-dim)] hover:text-red-400 hover:bg-[var(--bg-hover)] rounded transition-colors"
                                title={`Archive ${fd.label}`}
                              >
                                <Archive className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Archived fields */}
                {archivedFields.length > 0 && (
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setShowArchivedFields((v) => !v)}
                      className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--text-dim)] hover:text-[var(--text-mid)]"
                    >
                      {showArchivedFields ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      Archived ({archivedFields.length})
                    </button>
                    {showArchivedFields && (
                      <div className="space-y-1">
                        {archivedFields.map((fd) => (
                          <div
                            key={fd.key}
                            className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-panel-a50)]/50 rounded border border-[var(--border-hi-a50)] opacity-60"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-xs text-[var(--text-mid)] line-through truncate">{fd.label}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded ${tierColor(fd.tier as 1 | 2 | 3)}`}>
                                {tierLabel(fd.tier as 1 | 2 | 3)}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => onRestoreField(fd.key)}
                              className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-[var(--bg-hover)] rounded transition-colors"
                              title={`Restore ${fd.label}`}
                            >
                              <RotateCcw className="w-3 h-3" />
                              Restore
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {activeTab === 'columns' && (
            <div className="space-y-4">
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

              {/* Autoplay after Cue toggle */}
              <label className="flex items-center gap-3 px-3 py-3 bg-[var(--bg-panel-a50)] rounded-md border border-[var(--border-hi-a50)] cursor-pointer select-none hover:bg-[var(--bg-panel)]">
                <input
                  type="checkbox"
                  checked={autoplayAfterCue}
                  onChange={() => onSetAutoplayAfterCue(!autoplayAfterCue)}
                  className="w-4 h-4 rounded border-[var(--border-hi)] bg-[var(--bg-hover)] text-[var(--amber)] focus:ring-[#BF5700] focus:ring-offset-0 cursor-pointer"
                />
                <div>
                  <span className="text-sm text-[var(--text)] font-medium">Autoplay after Cue</span>
                  <p className="text-[10px] text-[var(--text-dim)] mt-0.5">
                    Automatically resume video playback after saving or cancelling a new cue.
                  </p>
                </div>
              </label>
            </div>
          )}

          {activeTab === 'hotkeys' && (
            <div>
              {/* Video Playback */}
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase' as const, color: 'var(--text-dim)', marginBottom: 10 }}>Video Playback</div>
              {([
                { key: 'Space', action: 'Play / Pause', hi: true },
                { key: '←', action: 'Seek back 1 second', hi: false },
                { key: 'Ctrl + ←', action: 'Seek back 5 seconds', hi: false },
                { key: '→', action: 'Seek forward 1 second', hi: false },
                { key: 'Ctrl + →', action: 'Seek forward 5 seconds', hi: false },
                { key: ',', action: 'Previous frame', hi: false },
                { key: 'Ctrl + ,', action: 'Back 5 frames', hi: false },
                { key: '.', action: 'Next frame', hi: false },
                { key: 'Ctrl + .', action: 'Forward 5 frames', hi: false },
                { key: '+', action: 'Increase playback speed', hi: false },
                { key: '−', action: 'Decrease playback speed', hi: false },
              ] as const).map(({ key, action, hi }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <kbd
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 500, fontFamily: "'DM Mono', monospace",
                      minWidth: 80, padding: '3px 9px', borderRadius: 4, whiteSpace: 'nowrap' as const,
                      background: 'var(--bg-card)',
                      color: hi ? 'var(--amber)' : 'var(--text-mid)',
                      border: `1px solid ${hi ? 'var(--amber)' : 'var(--border-hi)'}`,
                    }}
                  >{key}</kbd>
                  <span style={{ fontSize: 12, color: 'var(--text-mid)', flex: 1, fontWeight: 300 }}>{action}</span>
                </div>
              ))}

              {/* Cue Annotation */}
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase' as const, color: 'var(--text-dim)', marginBottom: 10, marginTop: 18 }}>Cue Annotation</div>
              {([
                { key: 'Enter', action: 'Open cue form / Add cue', hi: true },
                { key: 'Ctrl+Enter', action: 'Save cue (when cue form is open)', hi: false },
                { key: 'Escape', action: 'Close cue form without saving', hi: false },
                { key: 'J', action: 'Toggle Jump Navigation menu', hi: false },
                { key: 'G', action: 'Toggle Go To Navigation menu', hi: false },
              ] as const).map(({ key, action, hi }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <kbd
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 500, fontFamily: "'DM Mono', monospace",
                      minWidth: 80, padding: '3px 9px', borderRadius: 4, whiteSpace: 'nowrap' as const,
                      background: 'var(--bg-card)',
                      color: hi ? 'var(--amber)' : 'var(--text-mid)',
                      border: `1px solid ${hi ? 'var(--amber)' : 'var(--border-hi)'}`,
                    }}
                  >{key}</kbd>
                  <span style={{ fontSize: 12, color: 'var(--text-mid)', flex: 1, fontWeight: 300 }}>{action}</span>
                </div>
              ))}

              {/* Global */}
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase' as const, color: 'var(--text-dim)', marginBottom: 10, marginTop: 18 }}>Global</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0' }}>
                <kbd
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 500, fontFamily: "'DM Mono', monospace",
                    minWidth: 80, padding: '3px 9px', borderRadius: 4, whiteSpace: 'nowrap' as const,
                    background: 'var(--bg-card)', color: 'var(--text-mid)', border: '1px solid var(--border-hi)',
                  }}
                >Ctrl+S</kbd>
                <span style={{ fontSize: 12, color: 'var(--text-mid)', flex: 1, fontWeight: 300 }}>Save project (works everywhere)</span>
              </div>
            </div>
          )}

          {activeTab === 'templates' && (
            <div className="space-y-5">
              {/* Save current config as template */}
              <div className="p-4 bg-[var(--bg-panel)]/30 border border-[var(--border-hi-a50)] rounded-lg space-y-3">
                <h3 className="text-sm font-medium text-[var(--text)]">Save Current Configuration</h3>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="Template name"
                    className="flex-1 bg-[var(--bg-panel)] border border-[var(--border-hi)] rounded-md px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--amber)] focus:outline-none"
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        const name = newTemplateName.trim();
                        if (!name) return;
                        const existing = savedTemplates.find((t) => t.name === name);
                        if (existing) {
                          const ok = await showConfirm({
                            title: 'Overwrite Template',
                            message: `A template named "${name}" already exists. Replace it with your current configuration?`,
                            confirmLabel: 'Overwrite',
                            variant: 'warning',
                          });
                          if (!ok) return;
                        }
                        const template: ConfigTemplate = {
                          id: existing?.id ?? crypto.randomUUID(),
                          name,
                          data: extractTemplateData(liveConfig),
                          createdAt: existing?.createdAt ?? new Date().toISOString(),
                          updatedAt: new Date().toISOString(),
                        };
                        await saveConfigTemplate(template);
                        await refreshTemplates();
                        setNewTemplateName('');
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={!newTemplateName.trim()}
                    onClick={async () => {
                      const name = newTemplateName.trim();
                      if (!name) return;
                      const existing = savedTemplates.find((t) => t.name === name);
                      if (existing) {
                        const ok = await showConfirm({
                          title: 'Overwrite Template',
                          message: `A template named "${name}" already exists. Replace it with your current configuration?`,
                          confirmLabel: 'Overwrite',
                          variant: 'warning',
                        });
                        if (!ok) return;
                      }
                      const template: ConfigTemplate = {
                        id: existing?.id ?? crypto.randomUUID(),
                        name,
                        data: extractTemplateData(liveConfig),
                        createdAt: existing?.createdAt ?? new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                      };
                      await saveConfigTemplate(template);
                      await refreshTemplates();
                      setNewTemplateName('');
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm bg-[var(--amber)] text-white rounded-md hover:brightness-110 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save
                  </button>
                </div>
              </div>

              {/* Import template */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => templateImportRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--bg-panel)] text-[var(--text-mid)] rounded-md hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  Import Template
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await showConfirm({
                      title: 'Reset to Factory Defaults',
                      message: 'This will replace your current cue types, fields, columns, and view settings with the Cuetation Standard defaults.',
                      confirmLabel: 'Reset',
                      variant: 'warning',
                      icon: 'reset',
                    });
                    if (ok) onApplyTemplate(FACTORY_DEFAULT_TEMPLATE.data);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--bg-panel)] text-[var(--text-mid)] rounded-md hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset to Factory
                </button>
                <input
                  ref={templateImportRef}
                  type="file"
                  accept=".json,.cuetation-template.json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      await importTemplateFromJSON(file);
                      await refreshTemplates();
                      addToast?.('Template imported', 'success');
                    } catch (err) {
                      addToast?.('This doesn\u2019t look like a valid template file.', 'error', {
                        details: err instanceof Error ? err.message : 'Check the file format.',
                      });
                    }
                    if (templateImportRef.current) templateImportRef.current.value = '';
                  }}
                  className="hidden"
                />
              </div>

              {/* Saved templates list */}
              <div className="p-4 bg-[var(--bg-panel)]/30 border border-[var(--border-hi-a50)] rounded-lg space-y-2">
                <h3 className="text-sm font-medium text-[var(--text)]">Saved Templates</h3>
                {savedTemplates.length === 0 ? (
                  <p className="text-[11px] text-[var(--text-dim)] italic">No templates saved. Save your current configuration above to get started.</p>
                ) : (
                  <div className="space-y-1.5">
                    {savedTemplates
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
                      .map((tpl) => {
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
                                    {tpl.data.cueTypes.length} types · Updated {relativeTimeAgo(tpl.updatedAt)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {/* Apply */}
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const ok = await showConfirm({
                                        title: 'Apply Template',
                                        message: `Apply "${tpl.name}"? This will replace your current cue types, fields, columns, and view settings.`,
                                        confirmLabel: 'Apply',
                                        variant: 'warning',
                                      });
                                      if (ok) onApplyTemplate(tpl.data);
                                    }}
                                    className="px-2 py-1 text-[10px] font-medium bg-emerald-600 text-white rounded hover:bg-emerald-500 transition-colors"
                                    title="Apply template"
                                  >
                                    Apply
                                  </button>
                                  {/* Set as Default */}
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const isCurrentDefault = tpl.isDefault;
                                      await setDefaultTemplate(isCurrentDefault ? null : tpl.id);
                                      await refreshTemplates();
                                      addToast?.(
                                        isCurrentDefault
                                          ? `"${tpl.name}" is no longer the default template.`
                                          : `"${tpl.name}" set as default template.`,
                                        'success',
                                      );
                                    }}
                                    className={`p-1 rounded transition-colors ${tpl.isDefault ? 'text-amber-400 hover:text-amber-300' : 'text-[var(--text-dim)] hover:text-amber-400'} hover:bg-[var(--bg-hover)]`}
                                    title={tpl.isDefault ? 'Remove as default template' : 'Set as default template'}
                                  >
                                    <Star className="w-3 h-3" fill={tpl.isDefault ? 'currentColor' : 'none'} />
                                  </button>
                                  {/* Rename */}
                                  <button
                                    type="button"
                                    onClick={() => { setEditingTemplateId(tpl.id); setEditingTemplateName(tpl.name); }}
                                    className="p-1 text-[var(--text-dim)] hover:text-[var(--text-mid)] hover:bg-[var(--bg-hover)] rounded transition-colors"
                                    title="Rename"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  {/* Export */}
                                  <button
                                    type="button"
                                    onClick={() => exportTemplateToJSON(tpl)}
                                    className="p-1 text-[var(--text-dim)] hover:text-[var(--text-mid)] hover:bg-[var(--bg-hover)] rounded transition-colors"
                                    title="Export as .cuetation-template.json"
                                  >
                                    <Download className="w-3 h-3" />
                                  </button>
                                  {/* Delete */}
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
            </div>
          )}

          {activeTab === 'savefiles' && (
            <div className="space-y-5">
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
                                      const ok = await showConfirm({
                                        title: 'Restore Backup',
                                        message: `Restore cues from the backup at ${new Date(snapshot.savedAt).toLocaleString()}? This will replace the saved cues for "${selectedDisplayName}".`,
                                        confirmLabel: 'Restore',
                                        variant: 'warning',
                                      });
                                      if (ok) {
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
                            const ok = await showConfirm({
                              title: 'Delete All Backups',
                              message: `Permanently delete every backup snapshot for "${selectedDisplayName}"? The video will no longer appear in this list until new cues are created for it.`,
                              confirmLabel: 'Delete All',
                              variant: 'danger',
                              icon: 'trash',
                            });
                            if (ok) {
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
                            const ok = await showConfirm({
                              title: 'Restore Configuration',
                              message: `Restore configuration from the backup at ${new Date(snapshot.savedAt).toLocaleString()}?`,
                              confirmLabel: 'Restore',
                              variant: 'warning',
                            });
                            if (ok) {
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
            <div className="space-y-6">
              {/* ── THIS PROJECT ── */}
              <div>
                <p className="text-[11px] uppercase tracking-widest font-medium text-[var(--text-dim)] mb-4">
                  This Project
                </p>
                <div className="space-y-3">
                  {/* Reset Configuration */}
                  <div className="p-4 bg-red-900/20 border border-red-800/40 rounded-lg">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--text)]">Reset Configuration</p>
                        <p className="text-[13px] font-light text-[var(--text-mid)] mt-0.5">
                          Revert cue types, fields, columns, and view settings to your default template. Cues are not affected.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const defaultTpl = await getDefaultTemplate();
                          const hasDefault = !!defaultTpl;
                          const ok = await showConfirm({
                            title: 'Reset configuration?',
                            message: 'This will revert all cue types, fields, and column settings to your default template. Your cues will not be affected.',
                            detail: hasDefault
                              ? undefined
                              : "You don\u2019t have a saved default template. Cuetation\u2019s built-in defaults will be used.",
                            confirmLabel: 'Reset Configuration',
                            variant: 'danger',
                            icon: 'reset',
                          });
                          if (ok) {
                            const data = defaultTpl?.data ?? FACTORY_DEFAULT_TEMPLATE.data;
                            onApplyTemplate(data);
                            addToast?.(
                              hasDefault
                                ? 'Configuration reset to default template.'
                                : 'Configuration reset to built-in defaults.',
                              'success',
                            );
                          }
                        }}
                        className="shrink-0 px-4 py-2 text-xs text-red-400 rounded border border-red-800/50 bg-transparent hover:bg-red-900/20 transition-colors"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  {/* Clear All Cues */}
                  <div className="p-4 bg-red-900/20 border border-red-800/40 rounded-lg">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--text)]">Clear All Cues</p>
                        <p className="text-[13px] font-light text-[var(--text-mid)] mt-0.5">
                          Permanently delete all cues in this project. Configuration and project metadata are not affected.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={annotationCount === 0}
                        title={annotationCount === 0 ? 'This project has no cues.' : undefined}
                        onClick={async () => {
                          const ok = await showConfirm({
                            title: 'Clear all cues?',
                            message: `This will permanently delete all ${annotationCount ?? 0} cues in ${projectName ?? 'this project'}. This cannot be undone.`,
                            detail: 'Configuration and project settings are not affected.',
                            confirmLabel: 'Clear All Cues',
                            variant: 'danger',
                            icon: 'trash',
                          });
                          if (ok) {
                            onClearAllCues();
                            addToast?.('All cues cleared.', 'success');
                          }
                        }}
                        className="shrink-0 px-4 py-2 text-xs text-red-400 rounded border border-red-800/50 bg-transparent hover:bg-red-900/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Delete Project */}
                  <div className="p-4 bg-red-900/20 border border-red-800/40 rounded-lg">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--text)]">Delete Project</p>
                        <p className="text-[13px] font-light text-[var(--text-mid)] mt-0.5">
                          Permanently delete this project and all its cues. You will be returned to the home screen.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await showConfirm({
                            title: `Delete "${projectName ?? 'this project'}"?`,
                            message: `This will permanently delete this project and all ${annotationCount ?? 0} of its cues. You will be returned to the home screen.`,
                            detail: 'This cannot be undone.',
                            confirmLabel: 'Delete Project',
                            variant: 'danger',
                            icon: 'trash',
                          });
                          if (ok) {
                            onDeleteProject();
                          }
                        }}
                        className="shrink-0 px-4 py-2 text-xs text-red-400 rounded border border-red-800/50 bg-transparent hover:bg-red-900/20 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── EVERYTHING ── */}
              <div className="pt-2 mt-2 border-t border-[var(--border-hi)]">
                <p className="text-[11px] uppercase tracking-widest font-medium text-[var(--text-dim)] mb-4">
                  Everything
                </p>
                <div className="p-4 bg-red-950/40 border border-red-800/60 rounded-lg">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text)]">Factory Reset</p>
                      <p className="text-[13px] font-light text-[var(--text-mid)] mt-0.5">
                        Delete all projects, cues, configuration, templates, and backups across the entire app. Returns to first-launch state.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await showConfirm({
                          title: 'Delete Everything?',
                          message: 'This will permanently delete all user data and settings, restoring the app to its default state. You will be returned to the home screen.',
                          detail: 'This cannot be undone.',
                          confirmLabel: 'Delete Everything',
                          variant: 'danger',
                          icon: 'reset',
                          requireText: 'EVERYTHING',
                        });
                        if (ok) {
                          await onDeleteAllProjects?.();
                          onClearAllData();
                          onGoHome?.();
                        }
                      }}
                      className="shrink-0 px-4 py-2 text-xs font-medium text-red-500 rounded border border-red-700/60 bg-transparent hover:bg-red-900/20 transition-colors"
                    >
                      Factory Reset
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'projects' && (
            <ProjectAdminTab liveConfig={liveConfig} />
          )}
          {activeTab === 'info' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowFeatureNotes(true)}
                className="flex items-center gap-3.5 w-full text-left transition-colors"
                style={{ padding: '15px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-hi)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <span className="flex items-center justify-center flex-shrink-0" style={{ width: 36, height: 36, borderRadius: 7, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-mid)', fontSize: 16 }}>
                  <Info className="w-4.5 h-4.5" />
                </span>
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 2 }}>Feature Notes</p>
                  <p style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 300 }}>What's new and recently changed in Cuetation.</p>
                </div>
                <span style={{ color: 'var(--text-dim)', fontSize: 16, marginLeft: 'auto' }}>›</span>
              </button>
              <button
                type="button"
                onClick={() => setShowUserGuide(true)}
                className="flex items-center gap-3.5 w-full text-left transition-colors"
                style={{ padding: '15px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-hi)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <span className="flex items-center justify-center flex-shrink-0" style={{ width: 36, height: 36, borderRadius: 7, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-mid)', fontSize: 16 }}>
                  <Info className="w-4.5 h-4.5" />
                </span>
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 2 }}>User Guide</p>
                  <p style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 300 }}>Full documentation for every feature.</p>
                </div>
                <span style={{ color: 'var(--text-dim)', fontSize: 16, marginLeft: 'auto' }}>›</span>
              </button>
              <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Cuetation · Phase 1 · Local-first build</span>
                <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.06em', color: 'var(--text-dim)', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, padding: '3px 7px' }}>v0.9.1</span>
              </div>
              <InfoModal isOpen={showFeatureNotes} onClose={() => setShowFeatureNotes(false)} title="Feature Notes" content={featureNotes} />
              <InfoModal isOpen={showUserGuide} onClose={() => setShowUserGuide(false)} title="User Guide" content={userGuide} />
            </div>
          )}
            </div>
          </div>{/* /content area */}
        </div>{/* /body */}

        {/* ─── FOOTER ─── */}
        <div
          className="flex items-center justify-end flex-shrink-0"
          style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}
        >
          <input
            ref={importRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={onClose}
            className="transition-colors"
            style={{
              background: 'var(--amber)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '10px 32px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: '0.01em',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--amber-hi)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--amber)'; }}
          >
            Done
          </button>
        </div>
      </div>
      <ConfirmDialog {...confirmState} />
    </div>
  );
}
