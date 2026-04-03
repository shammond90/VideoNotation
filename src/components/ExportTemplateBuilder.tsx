import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  useDroppable,
  type CollisionDetection,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  X,
  Plus,
  RotateCcw,
  Lock,
  Save,
  Trash2,
  Download,
  ChevronDown,
} from 'lucide-react';
import type {
  ExportTemplateColumn,
  ExportColorOverrides,
  Annotation,
} from '../types';
import {
  LOCKED_EXPORT_COLUMNS,
  EXPORT_POOL_FIELDS,
  CUE_FIELD_LABELS,
  VIRTUAL_COLUMN_LABELS,
} from '../types';
import {
  loadXlsxExportTemplates,
  saveXlsxExportTemplate,
  deleteXlsxExportTemplate,
} from '../utils/configTemplates';
import type { XlsxExportTemplate } from '../utils/configTemplates';
import { exportAnnotationsToXlsx } from '../utils/xlsx';

// ── Helper: auto-generate column name from field keys ──
function autoName(fieldKeys: string[]): string {
  if (fieldKeys.length === 0) return 'Empty Column';
  return fieldKeys.map((k) => {
    return CUE_FIELD_LABELS[k as keyof typeof CUE_FIELD_LABELS]
      ?? VIRTUAL_COLUMN_LABELS[k]
      ?? k;
  }).join(' / ');
}

// ── Droppable gap between columns (for inserting new columns from pool) ──
function ColumnGapDropZone({ index, isPoolDragging }: { index: number; isPoolDragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `gap-${index}` });
  if (!isPoolDragging) return null;
  return (
    <div
      ref={setNodeRef}
      className={`h-1.5 -my-0.5 rounded-full transition-all ${
        isOver ? 'bg-(--amber) h-2 -my-0.5 shadow-[0_0_8px_var(--amber)]' : 'bg-(--border-hi)/30 hover:bg-(--border-hi)/60'
      }`}
    />
  );
}

// ── Droppable column card target ──
function ColumnDropTarget({ columnId, children }: { columnId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-drop-${columnId}` });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-h-[32px] flex flex-wrap gap-1 p-1.5 rounded border border-dashed transition-colors ${
        isOver ? 'border-(--amber-hi) bg-(--amber)/10' : 'border-(--border-hi)/50 bg-(--bg-card)/30'
      }`}
    >
      {children}
    </div>
  );
}

// ── Sortable column card ──
function SortableColumnCard({
  column,
  onRemoveField,
  onRemoveColumn,
  onNameChange,
  onResetName,
}: {
  column: ExportTemplateColumn;
  onRemoveField: (colId: string, fieldKey: string) => void;
  onRemoveColumn: (colId: string) => void;
  onNameChange: (colId: string, name: string) => void;
  onResetName: (colId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 bg-(--bg-panel)/60 rounded-lg border border-(--border-hi)/50 p-2.5 group"
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-(--text-dim) hover:text-(--text-mid) touch-none mt-1 shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Column name + lock/reset controls */}
        <div className="flex items-center gap-1.5">
          {column.locked ? (
            <div className="flex items-center gap-1.5 flex-1">
              <Lock className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-xs font-semibold text-amber-300 truncate">{column.name}</span>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={column.name}
                onChange={(e) => onNameChange(column.id, e.target.value)}
                className="flex-1 bg-(--bg-card) border border-(--border-hi) rounded px-2 py-0.5 text-xs text-(--text) focus:border-(--amber) focus:outline-none min-w-0"
                placeholder="Column name"
              />
              {column.customName && (
                <button
                  type="button"
                  onClick={() => onResetName(column.id)}
                  className="p-0.5 text-(--text-dim) hover:text-(--text-mid) shrink-0"
                  title="Reset to auto-name"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </>
          )}
        </div>

        {/* Fields drop target + field chips */}
        {!column.locked && (
          <ColumnDropTarget columnId={column.id}>
            {column.fieldKeys.length === 0 ? (
              <span className="text-[10px] text-(--text-dim) italic px-1">Drop fields here</span>
            ) : (
              column.fieldKeys.map((fk) => (
                <span
                  key={fk}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-(--amber)/30 text-(--amber) text-[10px] font-medium"
                >
                  {CUE_FIELD_LABELS[fk as keyof typeof CUE_FIELD_LABELS] ?? VIRTUAL_COLUMN_LABELS[fk] ?? fk}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemoveField(column.id, fk); }}
                    className="hover:text-red-400"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))
            )}
          </ColumnDropTarget>
        )}
      </div>

      {/* Delete column button (not for locked) */}
      {!column.locked && (
        <button
          type="button"
          onClick={() => onRemoveColumn(column.id)}
          className="p-1 text-(--text-dim) hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
          title="Remove column"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Draggable field from the pool ──
function DraggablePoolField({ fieldKey, label }: { fieldKey: string; label: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: `pool-${fieldKey}`,
    data: { type: 'pool-field', fieldKey },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-(--bg-panel)/50 rounded border border-(--border-hi)/40 text-xs text-(--text-mid) cursor-grab active:cursor-grabbing hover:bg-(--bg-panel) hover:border-(--border-hi) transition-colors select-none"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="w-3 h-3 text-(--text-dim) shrink-0" />
      {label}
    </div>
  );
}

// ── Main component ──

const LAST_TEMPLATE_KEY = 'xlsxExport-lastTemplateId';

interface ExportTemplateBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  annotations: Annotation[];
  cueTypes: string[];
  cueTypeColors: Record<string, string>;
  cueTypeShortCodes: Record<string, string>;
  skippedIds: Set<string>;
  videoName: string;
  hiddenCueTypes?: string[];
  hiddenFieldKeys?: string[];
  addToast: (message: string, type?: 'success' | 'info' | 'warning' | 'error', duration?: number) => void;
}

export function ExportTemplateBuilder({
  isOpen,
  onClose,
  annotations,
  cueTypes,
  cueTypeColors,
  cueTypeShortCodes,
  skippedIds,
  videoName,
  hiddenCueTypes,
  hiddenFieldKeys,
  addToast,
}: ExportTemplateBuilderProps) {
  // ── State ──
  const [columns, setColumns] = useState<ExportTemplateColumn[]>([...LOCKED_EXPORT_COLUMNS]);
  const [colorOverrides, setColorOverrides] = useState<ExportColorOverrides>({});
  const [includeSkipped, setIncludeSkipped] = useState(true);
  const [templateName, setTemplateName] = useState('');
  const [savedTemplates, setSavedTemplates] = useState<XlsxExportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [activePoolField, setActivePoolField] = useState<string | null>(null);
  const [poolSearch, setPoolSearch] = useState('');
  const [excludedCueTypes, setExcludedCueTypes] = useState<Set<string>>(new Set());

  // Load templates on open, auto-load last-used template
  useEffect(() => {
    if (isOpen) {
      loadXlsxExportTemplates().then((xlsxTemplates) => {
        setSavedTemplates(xlsxTemplates);

        // Try to restore last-used template
        const lastId = localStorage.getItem(LAST_TEMPLATE_KEY);
        const lastTpl = lastId ? xlsxTemplates.find((t) => t.id === lastId) : undefined;
        if (lastTpl) {
          setSelectedTemplateId(lastTpl.id);
          setTemplateName(lastTpl.name);
          setColumns((lastTpl.columns ?? LOCKED_EXPORT_COLUMNS).map((c) => ({ ...c })));
          setColorOverrides({ ...(lastTpl.colorOverrides ?? {}) });
          setIncludeSkipped(lastTpl.includeSkipped ?? true);
          setExcludedCueTypes(new Set(lastTpl.excludedCueTypes ?? []));
        } else {
          // Reset to defaults
          setColumns([...LOCKED_EXPORT_COLUMNS.map((c) => ({ ...c }))]);
          setColorOverrides({});
          setIncludeSkipped(true);
          setTemplateName('');
          setSelectedTemplateId('');
          setExcludedCueTypes(new Set());
        }
        setPoolSearch('');
      });
    }
  }, [isOpen]);

  // Collect all field keys currently placed in any column
  const usedFieldKeys = useMemo(() => {
    const used = new Set<string>();
    for (const col of columns) {
      for (const fk of col.fieldKeys) used.add(fk);
    }
    return used;
  }, [columns]);

  // Pool fields — exclude fields already placed in columns and hidden fields, then apply search filter
  const poolFields = useMemo(() => {
    const hiddenKeys = new Set(hiddenFieldKeys ?? []);
    let fields = EXPORT_POOL_FIELDS.filter((f) => !usedFieldKeys.has(f.key) && !hiddenKeys.has(f.key));
    const q = poolSearch.toLowerCase().trim();
    if (q) {
      fields = fields.filter((f) => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q));
    }
    return fields;
  }, [poolSearch, usedFieldKeys, hiddenFieldKeys]);

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // ── Column operations ──

  const addColumn = useCallback(() => {
    const newCol: ExportTemplateColumn = {
      id: crypto.randomUUID(),
      fieldKeys: [],
      name: 'New Column',
      customName: false,
    };
    setColumns((prev) => [...prev, newCol]);
  }, []);

  const removeColumn = useCallback((colId: string) => {
    setColumns((prev) => prev.filter((c) => c.id !== colId));
  }, []);

  const removeFieldFromColumn = useCallback((colId: string, fieldKey: string) => {
    setColumns((prev) => prev.map((c) => {
      if (c.id !== colId) return c;
      const newKeys = c.fieldKeys.filter((k) => k !== fieldKey);
      const newName = c.customName ? c.name : autoName(newKeys);
      return { ...c, fieldKeys: newKeys, name: newName };
    }));
  }, []);

  const addFieldToColumn = useCallback((colId: string, fieldKey: string) => {
    setColumns((prev) => prev.map((c) => {
      if (c.id !== colId) return c;
      if (c.fieldKeys.includes(fieldKey)) return c;
      const newKeys = [...c.fieldKeys, fieldKey];
      const newName = c.customName ? c.name : autoName(newKeys);
      return { ...c, fieldKeys: newKeys, name: newName };
    }));
  }, []);

  const handleNameChange = useCallback((colId: string, name: string) => {
    setColumns((prev) => prev.map((c) => {
      if (c.id !== colId) return c;
      return { ...c, name, customName: true };
    }));
  }, []);

  const handleResetName = useCallback((colId: string) => {
    setColumns((prev) => prev.map((c) => {
      if (c.id !== colId) return c;
      return { ...c, name: autoName(c.fieldKeys), customName: false };
    }));
  }, []);

  // Helper: create a new column with a field at a specific position
  const createColumnAtIndex = useCallback((fieldKey: string, index: number) => {
    const newCol: ExportTemplateColumn = {
      id: crypto.randomUUID(),
      fieldKeys: [fieldKey],
      name: autoName([fieldKey]),
      customName: false,
    };
    setColumns((prev) => {
      const next = [...prev];
      next.splice(index, 0, newCol);
      return next;
    });
  }, []);

  // Custom collision detection: prefer column-drop targets, then gap zones, when dragging pool fields
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const activeId = String(args.active.id);
    if (activeId.startsWith('pool-')) {
      // For pool fields, check pointerWithin first to find column-drop targets or gap zones
      const pointerCollisions = pointerWithin(args);
      const columnDrop = pointerCollisions.find((c) => String(c.id).startsWith('column-drop-'));
      if (columnDrop) return [columnDrop];
      const gap = pointerCollisions.find((c) => String(c.id).startsWith('gap-'));
      if (gap) return [gap];
      // Not over any drop zone → return empty so handleDragEnd creates a new column at end
      return [];
    }
    return closestCenter(args);
  }, []);

  // ── Drag and drop ──

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id);
    if (id.startsWith('pool-')) {
      setActivePoolField(id.replace('pool-', ''));
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActivePoolField(null);
    const { active, over } = event;

    const activeId = String(active.id);

    // Pool field: if dropped on a column-drop zone, add to that column;
    // if dropped on a gap zone, insert new column at that position;
    // otherwise create a new column at end
    if (activeId.startsWith('pool-')) {
      const fieldKey = activeId.replace('pool-', '');
      const overId = over ? String(over.id) : '';
      if (overId.startsWith('column-drop-')) {
        const colId = overId.replace('column-drop-', '');
        addFieldToColumn(colId, fieldKey);
      } else if (overId.startsWith('gap-')) {
        const gapIndex = parseInt(overId.replace('gap-', ''), 10);
        createColumnAtIndex(fieldKey, gapIndex);
      } else {
        createColumnAtIndex(fieldKey, columns.length);
      }
      return;
    }

    if (!over) return;
    const overId = String(over.id);

    // Reordering column cards
    if (!activeId.startsWith('pool-') && !overId.startsWith('pool-') && !overId.startsWith('column-drop-')) {
      setColumns((prev) => {
        const oldIndex = prev.findIndex((c) => c.id === activeId);
        const newIndex = prev.findIndex((c) => c.id === overId);
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }, [addFieldToColumn, createColumnAtIndex, columns]);

  // ── Templates ──

  const handleSaveTemplate = useCallback(async () => {
    const name = templateName.trim() || `Export ${savedTemplates.length + 1}`;
    const template: XlsxExportTemplate = {
      id: selectedTemplateId || crypto.randomUUID(),
      name,
      columns: columns.map((c) => ({ ...c })),
      colorOverrides: { ...colorOverrides },
      includeSkipped,
      excludedCueTypes: [...excludedCueTypes],
      createdAt: selectedTemplateId
        ? savedTemplates.find((t) => t.id === selectedTemplateId)?.createdAt ?? new Date().toISOString()
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveXlsxExportTemplate(template);
    const all = await loadXlsxExportTemplates();
    setSavedTemplates(all);
    setSelectedTemplateId(template.id);
    setTemplateName(template.name);
    localStorage.setItem(LAST_TEMPLATE_KEY, template.id);
    addToast('Template saved', 'success', 3000);
  }, [templateName, columns, colorOverrides, includeSkipped, excludedCueTypes, savedTemplates, selectedTemplateId, addToast]);

  const handleLoadTemplate = useCallback((templateId: string) => {
    const tpl = savedTemplates.find((t) => t.id === templateId);
    if (!tpl) return;
    setSelectedTemplateId(tpl.id);
    setTemplateName(tpl.name);
    setColumns((tpl.columns ?? LOCKED_EXPORT_COLUMNS).map((c) => ({ ...c })));
    setColorOverrides({ ...(tpl.colorOverrides ?? {}) });
    setIncludeSkipped(tpl.includeSkipped ?? true);
    setExcludedCueTypes(new Set(tpl.excludedCueTypes ?? []));
    localStorage.setItem(LAST_TEMPLATE_KEY, tpl.id);
  }, [savedTemplates]);

  const handleDeleteTemplate = useCallback(async (templateId: string) => {
    await deleteXlsxExportTemplate(templateId);
    const all = await loadXlsxExportTemplates();
    setSavedTemplates(all);
    if (selectedTemplateId === templateId) {
      setSelectedTemplateId('');
      setTemplateName('');
      localStorage.removeItem(LAST_TEMPLATE_KEY);
    }
  }, [selectedTemplateId]);

  // ── Export ──

  const handleExport = useCallback(async () => {
    // Combine global hiddenCueTypes with builder-level excludedCueTypes
    const allHidden = [...new Set([...(hiddenCueTypes ?? []), ...excludedCueTypes])];
    await exportAnnotationsToXlsx({
      annotations,
      columns,
      colorOverrides,
      cueTypeColors,
      cueTypeShortCodes,
      skippedIds,
      includeSkipped,
      videoName,
      hiddenCueTypes: allHidden.length > 0 ? allHidden : undefined,
    });
    onClose();
  }, [annotations, columns, colorOverrides, cueTypeColors, cueTypeShortCodes, skippedIds, includeSkipped, videoName, hiddenCueTypes, excludedCueTypes, onClose]);

  // Column ids for sortable context
  const columnIds = useMemo(() => columns.map((c) => c.id), [columns]);
  // Pool field ids
  const poolFieldIds = useMemo(() => poolFields.map((f) => `pool-${f.key}`), [poolFields]);

  // Count user columns (non-locked)
  const userColumnCount = columns.filter((c) => !c.locked).length;

  // Compute included cue count (respects skipped + excluded cue types)
  const { includedCueCount, totalCueCount } = useMemo(() => {
    const total = annotations.length;
    const allHidden = new Set([...(hiddenCueTypes ?? []), ...excludedCueTypes]);
    let included = annotations;
    if (!includeSkipped) {
      included = included.filter((a) => !skippedIds.has(a.id));
    }
    if (allHidden.size > 0) {
      included = included.filter((a) => !allHidden.has(a.cue.type));
    }
    return { includedCueCount: included.length, totalCueCount: total };
  }, [annotations, hiddenCueTypes, excludedCueTypes, includeSkipped, skippedIds]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-(--bg-card) border border-(--border) rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-(--border) shrink-0">
          <h2 className="text-lg font-semibold text-(--text)">Export XLSX — Template Builder</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-(--text-mid) hover:text-(--text) hover:bg-(--bg-panel) rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Template selector bar */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-(--border)/50 shrink-0 bg-(--bg-card)/50">
          <label className="text-xs text-(--text-mid) font-medium shrink-0">Template:</label>
          <div className="relative flex-1 max-w-xs">
            <select
              value={selectedTemplateId}
              onChange={(e) => {
                if (e.target.value) handleLoadTemplate(e.target.value);
                else {
                  setSelectedTemplateId('');
                  setTemplateName('');
                  setColumns([...LOCKED_EXPORT_COLUMNS.map((c) => ({ ...c }))]);
                  setColorOverrides({});
                }
              }}
              className="w-full bg-(--bg-panel) border border-(--border-hi) rounded-md px-3 py-1.5 text-xs text-(--text) appearance-none pr-8 focus:border-(--amber) focus:outline-none"
            >
              <option value="">New template…</option>
              {savedTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--text-mid) pointer-events-none" />
          </div>
          <input
            type="text"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Template name"
            className="flex-1 max-w-xs bg-(--bg-panel) border border-(--border-hi) rounded-md px-3 py-1.5 text-xs text-(--text) focus:border-(--amber) focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSaveTemplate}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-(--amber) text-white rounded-md hover:bg-(--amber) transition-colors shrink-0"
          >
            <Save className="w-3 h-3" />
            Save
          </button>
          {selectedTemplateId && (
            <button
              type="button"
              onClick={() => handleDeleteTemplate(selectedTemplateId)}
              className="p-1.5 text-(--text-dim) hover:text-red-400 hover:bg-(--bg-panel) rounded-md transition-colors shrink-0"
              title="Delete template"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Main content: Field Pool | Column Builder */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {/* Left: Field Pool */}
            <div className="w-56 border-r border-(--border) flex flex-col shrink-0">
              <div className="px-3 pt-3 pb-2 border-b border-(--border)/50">
                <h3 className="text-xs font-semibold text-(--text-mid) uppercase tracking-wider mb-2">Field Pool</h3>
                <input
                  type="text"
                  value={poolSearch}
                  onChange={(e) => setPoolSearch(e.target.value)}
                  placeholder="Search fields…"
                  className="w-full bg-(--bg-panel)/50 border border-(--border-hi)/50 rounded px-2 py-1 text-xs text-(--text-mid) focus:border-(--amber) focus:outline-none"
                />
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 annotation-scroll">
                <SortableContext items={poolFieldIds} strategy={verticalListSortingStrategy}>
                  {poolFields.map((f) => (
                    <DraggablePoolField key={f.key} fieldKey={f.key} label={f.label} />
                  ))}
                </SortableContext>
                {poolFields.length === 0 && (
                  <p className="text-[10px] text-(--text-dim) italic text-center py-4">No matching fields</p>
                )}
              </div>
            </div>

            {/* Right: Column Builder + options */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-(--border)/50">
                <h3 className="text-xs font-semibold text-(--text-mid) uppercase tracking-wider flex-1">
                  Columns ({columns.length})
                </h3>
                <button
                  type="button"
                  onClick={addColumn}
                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium bg-(--bg-panel) text-(--text-mid) rounded hover:bg-(--bg-hover) transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add Column
                </button>
              </div>

              {/* Scrollable column list */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-0 annotation-scroll">
                <SortableContext items={columnIds} strategy={verticalListSortingStrategy}>
                  {columns.map((col, idx) => (
                    <div key={col.id}>
                      <ColumnGapDropZone index={idx} isPoolDragging={!!activePoolField} />
                      <div className="py-1">
                        <SortableColumnCard
                          column={col}
                          onRemoveField={removeFieldFromColumn}
                          onRemoveColumn={removeColumn}
                          onNameChange={handleNameChange}
                          onResetName={handleResetName}
                        />
                      </div>
                    </div>
                  ))}
                  <ColumnGapDropZone index={columns.length} isPoolDragging={!!activePoolField} />
                </SortableContext>

                {userColumnCount === 0 && (
                  <div className="text-center py-8 text-(--text-dim)">
                    <p className="text-sm font-medium mb-1">No custom columns yet</p>
                    <p className="text-xs">Drag fields from the pool into this area, or click "Add Column"</p>
                  </div>
                )}
              </div>

              {/* Bottom options: cue type + skipped */}
              <div className="border-t border-(--border)/50 px-4 py-3 space-y-3 shrink-0">
                {/* Cue type overrides */}
                <div>
                  <h4 className="text-[10px] font-semibold text-(--text-mid) uppercase tracking-wider mb-2">Cue Types</h4>
                  <div className="flex flex-wrap gap-2">
                    {cueTypes.filter(ct => !(hiddenCueTypes ?? []).includes(ct)).map((ct) => {
                      const isExcluded = excludedCueTypes.has(ct);
                      const effectiveColor = colorOverrides[ct] || cueTypeColors[ct] || '#6b7280';
                      return (
                        <div key={ct} className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={effectiveColor}
                            onChange={(e) => setColorOverrides((prev) => ({ ...prev, [ct]: e.target.value }))}
                            className="w-5 h-5 rounded border border-(--border-hi) cursor-pointer"
                          />
                          <button
                            type="button"
                            onClick={() => setExcludedCueTypes((prev) => {
                              const next = new Set(prev);
                              if (next.has(ct)) next.delete(ct);
                              else next.add(ct);
                              return next;
                            })}
                            className={`text-[10px] select-none transition-colors ${
                              isExcluded
                                ? 'line-through text-(--text-dim) opacity-50'
                                : 'text-(--text-mid) hover:text-(--text)'
                            }`}
                            title={isExcluded ? 'Click to include in export' : 'Click to exclude from export'}
                          >
                            {ct}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Include skipped cues */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeSkipped}
                    onChange={(e) => setIncludeSkipped(e.target.checked)}
                    className="w-4 h-4 rounded border-(--border-hi) bg-(--bg-hover) text-(--amber) focus:ring-(--border-focus) focus:ring-offset-0 cursor-pointer"
                  />
                  <span className="text-xs text-(--text-mid)">Include skipped cues</span>
                  <span className="text-[10px] text-(--text-dim)">(italicised in export)</span>
                </label>
              </div>
            </div>

            {/* Drag overlay */}
            <DragOverlay>
              {activePoolField && (
                <div className="px-2.5 py-1.5 bg-(--amber)/80 rounded border border-(--amber-hi) text-xs text-white font-medium shadow-lg">
                  {CUE_FIELD_LABELS[activePoolField as keyof typeof CUE_FIELD_LABELS]
                    ?? VIRTUAL_COLUMN_LABELS[activePoolField]
                    ?? activePoolField}
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-(--border) shrink-0">
          <p className="text-[10px] text-(--text-dim)">
            {includedCueCount === totalCueCount
              ? `${totalCueCount} cues`
              : `${includedCueCount}/${totalCueCount} cues`
            } &bull; {columns.length} columns
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs bg-(--bg-panel) text-(--text-mid) rounded-md hover:bg-(--bg-hover) transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={annotations.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-xs bg-emerald-600 text-white rounded-md hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              Export XLSX
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
