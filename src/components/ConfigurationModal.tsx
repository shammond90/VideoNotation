import { useState, useRef, useMemo } from 'react';
import { X, Plus, Trash2, GripVertical, Download, Upload, Lock, Pencil, Check, AlertTriangle } from 'lucide-react';
import type { ColumnConfig } from '../types';
import { RESERVED_CUE_TYPES } from '../types';
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
  cueTypes: string[];
  cueTypeColors: Record<string, string>;
  cueTypeAllowStandby: Record<string, boolean>;
  cueTypeAllowWarning: Record<string, boolean>;
  visibleColumns: ColumnConfig[];
  cueTypeColumns: Record<string, ColumnConfig[]>;
  usedCueTypes: Set<string>;
  distanceView: boolean;
  currentVideoName?: string;
  currentVideoSize?: number;
  cueBackupIntervalMinutes: number;
  onSetCueBackupInterval: (minutes: number) => void;
  onSetDistanceView: (v: boolean) => void;
  onAddCueType: (name: string) => void;
  onRemoveCueType: (name: string) => void;
  onRenameCueType: (oldName: string, newName: string) => void;
  onSetCueTypeColor: (cueType: string, color: string) => void;
  onSetCueTypeAllowStandby: (cueType: string, allow: boolean) => void;
  onSetCueTypeAllowWarning: (cueType: string, allow: boolean) => void;
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
      className="flex items-center gap-3 px-3 py-2 bg-slate-700/50 rounded-md border border-slate-600/50 hover:bg-slate-700"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 touch-none"
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
          className="w-4 h-4 rounded border-slate-500 bg-slate-600 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
        />
        <span className="text-sm text-slate-200">{column.label}</span>
        <span className="text-[10px] text-slate-500 font-mono">({column.key})</span>
      </label>
    </div>
  );
}

// ── Main modal ──

export function ConfigurationModal({
  isOpen,
  onClose,
  cueTypes,
  cueTypeColors,
  cueTypeAllowStandby,
  cueTypeAllowWarning,
  visibleColumns,
  cueTypeColumns,
  usedCueTypes,
  distanceView,
  currentVideoName,
  currentVideoSize,
  cueBackupIntervalMinutes,
  onSetCueBackupInterval,
  onSetDistanceView,
  onAddCueType,
  onRemoveCueType,
  onRenameCueType,
  onSetCueTypeColor,
  onSetCueTypeAllowStandby,
  onSetCueTypeAllowWarning,
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
}: ConfigurationModalProps) {
  const [newTypeName, setNewTypeName] = useState('');
  const [activeTab, setActiveTab] = useState<'types' | 'columns' | 'view' | 'savefiles' | 'data'>('types');
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [columnView, setColumnView] = useState<string>('default');
  const [recoveryTick, setRecoveryTick] = useState(0);
  const [selectedVideoKey, setSelectedVideoKey] = useState<string>('');
  const importRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // These useMemo hooks MUST be before the early return to satisfy Rules of Hooks
  const videoFiles = useMemo<VideoFileInfo[]>(() => {
    return listVideoFilesWithBackups();
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

  const selectedVideoBackups = useMemo<BackupSnapshot[]>(() => {
    if (!effectiveSelectedKey) return [];
    return listBackups(effectiveSelectedKey);
  }, [effectiveSelectedKey, recoveryTick]);

  const configBackups = useMemo<BackupSnapshot[]>(() => {
    return listBackups(getConfigStorageKey());
  }, [recoveryTick]);

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

  const activeColumns =
    columnView !== 'default' && cueTypeColumns[columnView]
      ? cueTypeColumns[columnView]
      : visibleColumns;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromIndex = activeColumns.findIndex((c) => c.key === active.id);
    const toIndex = activeColumns.findIndex((c) => c.key === over.id);
    if (fromIndex !== -1 && toIndex !== -1) {
      onReorderColumns(fromIndex, toIndex, columnView !== 'default' ? columnView : undefined);
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
  const typesAvailableForOverride = cueTypes.filter((t) => !cueTypeColumns[t]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">Configuration</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700">
          <button
            type="button"
            onClick={() => setActiveTab('types')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'types'
                ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-700/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Cue Types
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('columns')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'columns'
                ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-700/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Columns
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('view')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'view'
                ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-700/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            View
          </button>
          <button
            type="button"
            onClick={() => { setRecoveryTick((prev) => prev + 1); setActiveTab('savefiles'); }}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'savefiles'
                ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-700/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Save Files
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('data')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'data'
                ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-700/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Data
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto annotation-scroll p-6">
          {activeTab === 'types' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">
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
                  className="flex-1 bg-slate-700 text-slate-200 rounded px-3 py-2 text-sm border border-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none placeholder-slate-500"
                />
                <button
                  type="button"
                  onClick={handleAddType}
                  disabled={!newTypeName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>

              {/* Type list */}
              <div className="space-y-1.5">
                {cueTypes.map((type) => {
                  const isReserved = (RESERVED_CUE_TYPES as readonly string[]).includes(type);
                  const isInUse = usedCueTypes.has(type);
                  const isLocked = isReserved || isInUse;
                  const isEditing = editingType === type;

                  return (
                    <div
                      key={type}
                      className="flex items-center justify-between px-3 py-2 bg-slate-700/50 rounded-md border border-slate-600/50"
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
                              className="flex-1 bg-slate-600 text-slate-200 rounded px-2 py-1 text-sm border border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                            />
                            <button
                              type="button"
                              onClick={handleSaveEdit}
                              className="p-1 text-emerald-400 hover:text-emerald-300 hover:bg-slate-600 rounded transition-colors"
                              title="Save"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-600 rounded transition-colors"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="text-sm text-slate-200 font-medium">{type}</span>
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
                          {/* Standby / Warning allow checkboxes (non-reserved types only) */}
                          {!isReserved && (
                            <>
                              <label
                                className="flex items-center gap-2 cursor-pointer"
                                title="Allow Standby cues for this type"
                              >
                                <span className="text-[11px] font-medium text-amber-400">Standby</span>
                                <input
                                  type="checkbox"
                                  checked={!!cueTypeAllowStandby[type]}
                                  onChange={(e) => onSetCueTypeAllowStandby(type, e.target.checked)}
                                  className="w-4 h-4 rounded border-slate-500 bg-slate-600 text-amber-500 focus:ring-amber-500 focus:ring-offset-0 cursor-pointer"
                                />
                              </label>
                              <label
                                className="flex items-center gap-2 cursor-pointer"
                                title="Allow Warning cues for this type"
                              >
                                <span className="text-[11px] font-medium text-blue-400">Warning</span>
                                <input
                                  type="checkbox"
                                  checked={!!cueTypeAllowWarning[type]}
                                  onChange={(e) => onSetCueTypeAllowWarning(type, e.target.checked)}
                                  className="w-4 h-4 rounded border-slate-500 bg-slate-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                                />
                              </label>
                            </>
                          )}
                          {/* Colour picker */}
                          <label
                            className="relative w-6 h-6 rounded cursor-pointer border border-slate-500 shrink-0 overflow-hidden"
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
                          <button
                            type="button"
                            onClick={() => handleStartEdit(type)}
                            className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-600 rounded transition-colors"
                            title={`Rename ${type}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {!isLocked && (
                            <button
                              type="button"
                              onClick={() => onRemoveCueType(type)}
                              className="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-600 rounded transition-colors"
                              title={`Remove ${type}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'columns' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">
                Choose which fields appear in the abridged cue list.
                Drag to reorder. Toggle visibility with the checkbox.
                You can also add cue-type-specific column selections.
              </p>

              {/* Column view selector */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">Viewing columns for:</label>
                <select
                  value={columnView}
                  onChange={(e) => setColumnView(e.target.value)}
                  className="bg-slate-700 text-slate-200 text-sm rounded px-2 py-1.5 border border-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  <option value="default">Default (all types)</option>
                  {typesWithOverrides.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                {typesAvailableForOverride.length > 0 && columnView === 'default' && (
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
                      className="bg-slate-700 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-600 outline-none cursor-pointer"
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
                    className="ml-auto flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-slate-700 rounded transition-colors"
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
              <p className="text-xs text-slate-400">
                Configure how the cue sheet is displayed.
              </p>

              <label className="flex items-center gap-3 px-3 py-3 bg-slate-700/50 rounded-md border border-slate-600/50 cursor-pointer select-none hover:bg-slate-700">
                <input
                  type="checkbox"
                  checked={distanceView}
                  onChange={(e) => onSetDistanceView(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-500 bg-slate-600 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
                />
                <div>
                  <span className="text-sm text-slate-200 font-medium">Distance View</span>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Shows a large type + cue # badge on the left of each cue card in the cue sheet.
                    When disabled, uses a compact overlapping badge.
                  </p>
                </div>
              </label>
            </div>
          )}

          {activeTab === 'savefiles' && (
            <div className="space-y-5">
              <p className="text-xs text-slate-400">
                Manage backup snapshots. Cue backups are created automatically at the configured interval
                while you are active, and when the tab is backgrounded or the page is closed. Configuration is
                backed up when you close this modal.
              </p>

              {/* Backup interval setting */}
              <div className="p-4 bg-slate-700/30 border border-slate-600/50 rounded-lg space-y-2">
                <h3 className="text-sm font-medium text-slate-200">Cue Backup Interval</h3>
                <p className="text-[10px] text-slate-500">
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
                    className="w-20 bg-slate-700 text-slate-200 rounded px-3 py-1.5 text-sm border border-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                  <span className="text-xs text-slate-400">minutes</span>
                </div>
              </div>

              {/* Per-video recovery section */}
              <div className="p-4 bg-slate-700/30 border border-slate-600/50 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-slate-200">Video File Backups</h3>
                  <button
                    type="button"
                    onClick={() => setRecoveryTick((prev) => prev + 1)}
                    className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                  >
                    Refresh
                  </button>
                </div>

                {videoFiles.length === 0 ? (
                  <p className="text-[11px] text-slate-500">No video files with backups found.</p>
                ) : (
                  <>
                    {/* Video file dropdown */}
                    <div className="flex items-center gap-2 min-w-0">
                      <label className="text-xs text-slate-400 shrink-0">Select video:</label>
                      <select
                        value={effectiveSelectedKey}
                        onChange={(e) => { setSelectedVideoKey(e.target.value); setRecoveryTick((prev) => prev + 1); }}
                        className="min-w-0 flex-1 bg-slate-700 text-slate-200 text-sm rounded px-2 py-1.5 border border-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
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
                          <p className="text-[11px] text-slate-500">No backups for this video.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {selectedVideoBackups.map((snapshot) => (
                              <div
                                key={`video-backup-${snapshot.slot}`}
                                className="flex items-center justify-between gap-3 px-3 py-2 rounded border border-slate-600/50 bg-slate-800/40"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="text-xs text-slate-200 truncate">
                                      {new Date(snapshot.savedAt).toLocaleString()}
                                    </p>
                                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400">
                                      {relativeTimeAgo(snapshot.savedAt)}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-500">
                                    {snapshot.itemCount ?? 0} cues · {snapshot.bytes} bytes
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const payload = getBackupPayload(effectiveSelectedKey, snapshot.slot);
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
                                    className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                                    title="Export this backup as CSV"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (
                                        confirm(
                                          `Restore cues from backup at ${new Date(snapshot.savedAt).toLocaleString()}?\n\nThis will replace the saved cues for "${selectedDisplayName}".`,
                                        )
                                      ) {
                                        if (restoreBackup(effectiveSelectedKey, snapshot.slot)) {
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
                                    className="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
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
                          onClick={() => {
                            if (
                              confirm(
                                `⚠️ Delete all backups for "${selectedDisplayName}"?\n\nThis will permanently remove all backup snapshots for this video file. The video will no longer appear in this dropdown until new cues are created for it.\n\nThis cannot be undone.`,
                              )
                            ) {
                              deleteVideoBackups(selectedVideoInfo.fileName, selectedVideoInfo.fileSize);
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
              <div className="p-4 bg-slate-700/30 border border-slate-600/50 rounded-lg space-y-3">
                <h3 className="text-sm font-medium text-slate-200">Configuration Backups</h3>
                {configBackups.length === 0 ? (
                  <p className="text-[11px] text-slate-500">No configuration backups yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {configBackups.map((snapshot) => (
                      <div
                        key={`config-backup-${snapshot.slot}`}
                        className="flex items-center justify-between gap-3 px-3 py-2 rounded border border-slate-600/50 bg-slate-800/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-slate-200 truncate">
                              {new Date(snapshot.savedAt).toLocaleString()}
                            </p>
                            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400">
                              {relativeTimeAgo(snapshot.savedAt)}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500">{snapshot.bytes} bytes</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              confirm(
                                `Restore configuration from backup at ${new Date(snapshot.savedAt).toLocaleString()}?`,
                              )
                            ) {
                              const key = getConfigStorageKey();
                              if (restoreBackup(key, snapshot.slot)) {
                                onRecoverConfig();
                                setRecoveryTick((prev) => prev + 1);
                              }
                            }
                          }}
                          className="shrink-0 text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
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
              <p className="text-xs text-slate-400">
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onExportConfig}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export Config
            </button>
            <button
              type="button"
              onClick={() => importRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 transition-colors"
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
            className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-500 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
