import { useState, useRef } from 'react';
import { X, Plus, Trash2, GripVertical, Download, Upload, Lock, Pencil, Check, AlertTriangle } from 'lucide-react';
import type { ColumnConfig } from '../types';
import { RESERVED_CUE_TYPES, VIRTUAL_COLUMN_LABELS } from '../types';
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
  onClearAllData,
  onClearCurrentVideoCues,
  onClearAllCues,
}: ConfigurationModalProps) {
  const [newTypeName, setNewTypeName] = useState('');
  const [activeTab, setActiveTab] = useState<'types' | 'columns' | 'view' | 'data'>('types');
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [columnView, setColumnView] = useState<string>('default');
  const importRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
            Abridged Columns
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
                                className="flex items-center gap-1 cursor-pointer"
                                title="Allow Standby cues for this type"
                              >
                                <input
                                  type="checkbox"
                                  checked={!!cueTypeAllowStandby[type]}
                                  onChange={(e) => onSetCueTypeAllowStandby(type, e.target.checked)}
                                  className="w-3.5 h-3.5 rounded border-slate-500 bg-slate-600 text-amber-500 focus:ring-amber-500 focus:ring-offset-0 cursor-pointer"
                                />
                                <span className="text-[9px] font-bold text-amber-400">SB</span>
                              </label>
                              <label
                                className="flex items-center gap-1 cursor-pointer"
                                title="Allow Warning cues for this type"
                              >
                                <input
                                  type="checkbox"
                                  checked={!!cueTypeAllowWarning[type]}
                                  onChange={(e) => onSetCueTypeAllowWarning(type, e.target.checked)}
                                  className="w-3.5 h-3.5 rounded border-slate-500 bg-slate-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                                />
                                <span className="text-[9px] font-bold text-blue-400">WN</span>
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

          {activeTab === 'data' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400 mb-6">
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
