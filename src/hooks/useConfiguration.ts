import { useState, useCallback, useEffect, useRef } from 'react';
import type { AppConfig, ColumnConfig, FieldDefinition, TemplateData, ThemeMode } from '../types';
import { DEFAULT_CONFIG, DEFAULT_VISIBLE_COLUMNS, RESERVED_CUE_TYPES, getDefaultFieldsForType, DEFAULT_FIELD_DEFINITIONS, labelToFieldKey, ensureUniqueFieldKey } from '../types';
import { openDB } from 'idb';
import { loadConfig, saveConfig, backupConfig, exportConfigToJSON, importConfigFromJSON, clearPrimaryData, clearAllIDBData } from '../utils/storage';

/** Migrate a loaded config: ensure fieldDefinitions is populated with at least all Tier 1/2 fields. */
function migrateFieldDefinitions(cfg: AppConfig): AppConfig {
  let result = cfg;
  if (!result.fieldDefinitions || result.fieldDefinitions.length === 0) {
    result = { ...result, fieldDefinitions: [...DEFAULT_FIELD_DEFINITIONS] };
  } else {
    // Ensure all Tier 1/2 defaults exist (may have been added in a newer version)
    const existingKeys = new Set(result.fieldDefinitions.map((f) => f.key));
    const missing = DEFAULT_FIELD_DEFINITIONS.filter((d) => !existingKeys.has(d.key));
    if (missing.length > 0) {
      result = { ...result, fieldDefinitions: [...result.fieldDefinitions, ...missing] };
    }
  }
  // Ensure mandatoryFields exists
  if (!result.mandatoryFields) {
    result = { ...result, mandatoryFields: {} };
  }
  // Ensure hidden arrays exist
  if (!result.hiddenCueTypes) {
    result = { ...result, hiddenCueTypes: [] };
  }
  if (!result.hiddenFieldKeys) {
    result = { ...result, hiddenFieldKeys: [] };
  }
  return result;
}

export function useConfiguration() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);
  const initialLoadDone = useRef(false);

  // Load config from IndexedDB on mount
  useEffect(() => {
    loadConfig().then((loaded) => {
      let migrated = migrateFieldDefinitions(loaded);
      // Backward-compat: migrate theatreMode boolean → theme enum
      if (!('theme' in migrated) || typeof (migrated as any).theme !== 'string') {
        const legacy = (migrated as any).theatreMode;
        migrated = { ...migrated, theme: legacy === true ? 'theatre' : 'standard' };
      }
      // For brand-new users, honour OS colour-scheme preference.
      // The flash-prevention script in index.html may have already written
      // a value; if so, adopt it so config and DOM stay in sync.
      try {
        const stored = localStorage.getItem('cuetation-theme');
        if (stored && migrated.theme === 'standard' && stored !== 'standard') {
          migrated = { ...migrated, theme: stored as ThemeMode };
        }
      } catch {}
      // Sync to localStorage for flash-free reload
      try { localStorage.setItem('cuetation-theme', migrated.theme); } catch {}
      setConfig(migrated);
      setConfigLoaded(true);
      initialLoadDone.current = true;
    });
  }, []);

  // Auto-save whenever config changes (skip the initial default)
  useEffect(() => {
    if (!initialLoadDone.current) return;
    saveConfig(config);
  }, [config]);

  const setCueTypes = useCallback((types: string[]) => {
    setConfig((prev) => {
      let result = types;
      if (!result.includes('TITLE')) result = ['TITLE', ...result];
      if (!result.includes('SCENE')) result = [...result.slice(0, 1), 'SCENE', ...result.slice(1)].filter((v, i, a) => a.indexOf(v) === i);
      return { ...prev, cueTypes: result };
    });
  }, []);

  const addCueType = useCallback((name: string) => {
    setConfig((prev) => {
      const trimmed = name.trim();
      if (!trimmed || prev.cueTypes.includes(trimmed)) return prev;
      return {
        ...prev,
        cueTypes: [...prev.cueTypes, trimmed],
        cueTypeColors: {
          ...prev.cueTypeColors,
          [trimmed]: '#6b7280', // default grey for new types
        },
      };
    });
  }, []);

  const removeCueType = useCallback((name: string) => {
    if ((RESERVED_CUE_TYPES as readonly string[]).includes(name)) return;
    setConfig((prev) => {
      const { [name]: _, ...restTypeColumns } = prev.cueTypeColumns;
      const { [name]: __, ...restColors } = prev.cueTypeColors;
      const { [name]: ___, ...restAllowStandby } = prev.cueTypeAllowStandby;
      const { [name]: ____, ...restAllowWarning } = prev.cueTypeAllowWarning;
      const { [name]: _____, ...restTypeFields } = prev.cueTypeFields;
      const { [name]: ______, ...restFontColors } = prev.cueTypeFontColors;
      return {
        ...prev,
        cueTypes: prev.cueTypes.filter((t) => t !== name),
        cueTypeColumns: restTypeColumns,
        cueTypeColors: restColors,
        cueTypeAllowStandby: restAllowStandby,
        cueTypeAllowWarning: restAllowWarning,
        cueTypeFields: restTypeFields,
        cueTypeFontColors: restFontColors,
      };
    });
  }, []);

  const renameCueType = useCallback((oldName: string, newName: string) => {
    setConfig((prev) => {
      const trimmed = newName.trim();
      if (!trimmed || (trimmed !== oldName && prev.cueTypes.includes(trimmed))) return prev;
      const newTypes = prev.cueTypes.map((t) => (t === oldName ? trimmed : t));
      // Rename key in cueTypeColumns if present
      const newTypeColumns = { ...prev.cueTypeColumns };
      if (newTypeColumns[oldName]) {
        newTypeColumns[trimmed] = newTypeColumns[oldName];
        delete newTypeColumns[oldName];
      }
      // Rename key in cueTypeColors if present
      const newColors = { ...prev.cueTypeColors };
      if (newColors[oldName]) {
        newColors[trimmed] = newColors[oldName];
        delete newColors[oldName];
      }
      // Rename key in standby/warning allow maps
      const newAllowStandby = { ...prev.cueTypeAllowStandby };
      if (newAllowStandby[oldName] !== undefined) {
        newAllowStandby[trimmed] = newAllowStandby[oldName];
        delete newAllowStandby[oldName];
      }
      const newAllowWarning = { ...prev.cueTypeAllowWarning };
      if (newAllowWarning[oldName] !== undefined) {
        newAllowWarning[trimmed] = newAllowWarning[oldName];
        delete newAllowWarning[oldName];
      }
      // Rename key in cueTypeFields if present
      const newTypeFields = { ...prev.cueTypeFields };
      if (newTypeFields[oldName] !== undefined) {
        newTypeFields[trimmed] = newTypeFields[oldName];
        delete newTypeFields[oldName];
      }
      // Rename key in cueTypeFontColors if present
      const newFontColors = { ...prev.cueTypeFontColors };
      if (newFontColors[oldName] !== undefined) {
        newFontColors[trimmed] = newFontColors[oldName];
        delete newFontColors[oldName];
      }
      return { ...prev, cueTypes: newTypes, cueTypeColumns: newTypeColumns, cueTypeColors: newColors, cueTypeAllowStandby: newAllowStandby, cueTypeAllowWarning: newAllowWarning, cueTypeFields: newTypeFields, cueTypeFontColors: newFontColors };
    });
  }, []);

  const setCueTypeColor = useCallback((cueType: string, color: string) => {
    setConfig((prev) => ({
      ...prev,
      cueTypeColors: { ...prev.cueTypeColors, [cueType]: color },
    }));
  }, []);

  const setCueTypeShortCode = useCallback((cueType: string, shortCode: string) => {
    setConfig((prev) => ({
      ...prev,
      cueTypeShortCodes: { ...prev.cueTypeShortCodes, [cueType]: shortCode },
    }));
  }, []);

  const setCueTypeFontColor = useCallback((cueType: string, color: string) => {
    setConfig((prev) => ({
      ...prev,
      cueTypeFontColors: { ...prev.cueTypeFontColors, [cueType]: color },
    }));
  }, []);

  const setShowShortCodes = useCallback((show: boolean) => {
    setConfig((prev) => ({ ...prev, showShortCodes: show }));
  }, []);

  const setExpandedSearchFilter = useCallback((expanded: boolean) => {
    setConfig((prev) => ({ ...prev, expandedSearchFilter: expanded }));
  }, []);

  const setShowPastCues = useCallback((show: boolean) => {
    setConfig((prev) => ({ ...prev, showPastCues: show }));
  }, []);

  const setShowSkippedCues = useCallback((show: boolean) => {
    setConfig((prev) => ({ ...prev, showSkippedCues: show }));
  }, []);

  const setDistanceView = useCallback((value: boolean) => {
    setConfig((prev) => ({ ...prev, distanceView: value }));
  }, []);

  const setCueSheetView = useCallback((view: 'classic' | 'production') => {
    setConfig((prev) => ({ ...prev, cueSheetView: view }));
  }, []);

  const setTheme = useCallback((theme: ThemeMode) => {
    setConfig((prev) => ({ ...prev, theme }));
    try { localStorage.setItem('cuetation-theme', theme); } catch {}
  }, []);

  const setShowVideoTimecode = useCallback((show: boolean) => {
    setConfig((prev) => ({ ...prev, showVideoTimecode: show }));
  }, []);

  const setVideoTimecodePosition = useCallback((pos: { x: number; y: number }) => {
    setConfig((prev) => ({ ...prev, videoTimecodePosition: pos }));
  }, []);

  const setAutoplayAfterCue = useCallback((enabled: boolean) => {
    setConfig((prev) => ({ ...prev, autoplayAfterCue: enabled }));
  }, []);

  const setVideoBrightness = useCallback((brightness: number) => {
    setConfig((prev) => ({ ...prev, videoBrightness: Math.max(0.2, Math.min(1.8, brightness)) }));
  }, []);

  const setCueBackupInterval = useCallback((minutes: number) => {
    setConfig((prev) => ({ ...prev, cueBackupIntervalMinutes: Math.max(1, Math.round(minutes)) }));
  }, []);

  const setCueTypeAllowStandby = useCallback((cueType: string, allow: boolean) => {
    setConfig((prev) => ({
      ...prev,
      cueTypeAllowStandby: { ...prev.cueTypeAllowStandby, [cueType]: allow },
    }));
  }, []);

  const setCueTypeAllowWarning = useCallback((cueType: string, allow: boolean) => {
    setConfig((prev) => ({
      ...prev,
      cueTypeAllowWarning: { ...prev.cueTypeAllowWarning, [cueType]: allow },
    }));
  }, []);

  const setCueTypeFields = useCallback((cueType: string, fields: string[]) => {
    setConfig((prev) => ({
      ...prev,
      cueTypeFields: { ...prev.cueTypeFields, [cueType]: fields },
    }));
  }, []);

  /** Return visible fields for a cue type; falls back to defaults if not customised. */
  const getFieldsForType = useCallback((cueType: string): string[] => {
    const cfg = config.cueTypeFields[cueType];
    if (cfg) return cfg;
    return getDefaultFieldsForType(cueType);
  }, [config.cueTypeFields]);

  const setVisibleColumns = useCallback((columns: ColumnConfig[]) => {
    setConfig((prev) => ({
      ...prev,
      visibleColumns: columns,
    }));
  }, []);

  const toggleColumnVisibility = useCallback((key: string, cueType?: string) => {
    setConfig((prev) => {
      if (cueType && prev.cueTypeColumns[cueType]) {
        return {
          ...prev,
          cueTypeColumns: {
            ...prev.cueTypeColumns,
            [cueType]: prev.cueTypeColumns[cueType].map((col) =>
              col.key === key ? { ...col, visible: !col.visible } : col,
            ),
          },
        };
      }
      return {
        ...prev,
        visibleColumns: prev.visibleColumns.map((col) =>
          col.key === key ? { ...col, visible: !col.visible } : col,
        ),
      };
    });
  }, []);

  const reorderColumns = useCallback((fromIndex: number, toIndex: number, cueType?: string) => {
    setConfig((prev) => {
      if (cueType && prev.cueTypeColumns[cueType]) {
        const cols = [...prev.cueTypeColumns[cueType]];
        const [moved] = cols.splice(fromIndex, 1);
        cols.splice(toIndex, 0, moved);
        return { ...prev, cueTypeColumns: { ...prev.cueTypeColumns, [cueType]: cols } };
      }
      const cols = [...prev.visibleColumns];
      const [moved] = cols.splice(fromIndex, 1);
      cols.splice(toIndex, 0, moved);
      return { ...prev, visibleColumns: cols };
    });
  }, []);

  const addCueTypeColumns = useCallback((cueType: string) => {
    setConfig((prev) => {
      if (prev.cueTypeColumns[cueType]) return prev; // already exists
      // Get the enabled fields for this cue type
      const typeFields = prev.cueTypeFields[cueType] ?? getDefaultFieldsForType(cueType);
      // Clone the default columns, but only mark as visible if the field is enabled for this type
      const cloned = DEFAULT_VISIBLE_COLUMNS.map((c) => ({
        ...c,
        visible: typeFields.includes(c.key),
      }));
      return {
        ...prev,
        cueTypeColumns: { ...prev.cueTypeColumns, [cueType]: cloned },
      };
    });
  }, []);

  const removeCueTypeColumns = useCallback((cueType: string) => {
    setConfig((prev) => {
      const { [cueType]: _, ...rest } = prev.cueTypeColumns;
      return { ...prev, cueTypeColumns: rest };
    });
  }, []);

  const exportConfig = useCallback(() => {
    exportConfigToJSON(config);
  }, [config]);

  const handleImportConfig = useCallback(async (file: File) => {
    const imported = await importConfigFromJSON(file);
    setConfig(imported);
  }, []);

  const clearAllData = useCallback(async () => {
    await clearAllIDBData();
    setConfig(DEFAULT_CONFIG);
  }, []);

  const clearCurrentVideoCues = useCallback(async (fileName: string, fileSize: number) => {
    const key = `annotations:${fileName}:${fileSize}`;
    await clearPrimaryData(key);
  }, []);

  const clearAllCues = useCallback(async () => {
    // We need to scan IDB keys for annotation base keys
    const db = await openDB('cuetation-db', 1);
    const allKeys = (await db.getAllKeys('keyval')).map(String);
    const baseKeys = new Set<string>();
    for (const key of allKeys) {
      if (key.startsWith('annotations:')) {
        const stripped = key
          .replace(/:meta$/, '')
          .replace(/:next:meta$/, '')
          .replace(/:next$/, '')
          .replace(/:backup:pointer$/, '')
          .replace(/:backup:\d+$/, '');
        baseKeys.add(stripped);
      }
    }
    for (const baseKey of baseKeys) {
      await clearPrimaryData(baseKey);
    }
  }, []);

  const reloadConfig = useCallback(() => {
    loadConfig().then((loaded) => setConfig(loaded));
  }, []);

  /** Create a backup snapshot of the current config (call on modal close / lifecycle). */
  const saveConfigBackup = useCallback(() => {
    backupConfig(config);
  }, [config]);

  /**
   * Apply a unified config template.
   * Replaces cue types, fields, columns, and view settings from the template.
   * Non-template fields (e.g. cueBackupIntervalMinutes, deprecated maps) are preserved.
   */
  const applyTemplate = useCallback((data: TemplateData) => {
    setConfig((prev) => ({
      ...prev,
      cueTypes: [...data.cueTypes],
      cueTypeColors: { ...data.cueTypeColors },
      cueTypeShortCodes: { ...data.cueTypeShortCodes },
      cueTypeFontColors: { ...data.cueTypeFontColors },
      cueTypeFields: Object.fromEntries(
        Object.entries(data.cueTypeFields).map(([k, v]) => [k, [...v]])
      ),
      mandatoryFields: Object.fromEntries(
        Object.entries(data.mandatoryFields ?? {}).map(([k, v]) => [k, [...v]])
      ),
      fieldDefinitions: data.fieldDefinitions.map((f) => ({ ...f })),
      visibleColumns: data.visibleColumns.map((c) => ({ ...c })),
      cueTypeColumns: Object.fromEntries(
        Object.entries(data.cueTypeColumns).map(([k, v]) => [k, v.map((c) => ({ ...c }))])
      ),
      cueSheetView: data.cueSheetView,
      theme: data.theme ?? ((data as any).theatreMode === true ? 'theatre' : 'standard'),
      showShortCodes: data.showShortCodes,
      showPastCues: data.showPastCues,
      showSkippedCues: data.showSkippedCues,
      distanceView: data.distanceView,
      expandedSearchFilter: data.expandedSearchFilter,
      showVideoTimecode: data.showVideoTimecode,
      videoTimecodePosition: { ...data.videoTimecodePosition },
      hiddenCueTypes: [...(data.hiddenCueTypes ?? [])],
      hiddenFieldKeys: [...(data.hiddenFieldKeys ?? [])],
    }));
  }, []);

  // ── Field Definition CRUD ──

  /** Add a new custom field (Tier 3). Returns the generated key, or null if label is empty. */
  const addFieldDefinition = useCallback((def: Omit<FieldDefinition, 'key' | 'tier' | 'archived'>): string | null => {
    const label = def.label.trim();
    if (!label) return null;
    let generatedKey = '';
    setConfig((prev) => {
      const existingKeys = new Set(prev.fieldDefinitions.map((f) => f.key));
      const baseKey = labelToFieldKey(label);
      generatedKey = ensureUniqueFieldKey(baseKey, existingKeys);
      const newDef: FieldDefinition = {
        key: generatedKey,
        label,
        tier: 3,
        inputType: def.inputType,
        numberPrecision: def.numberPrecision,
        sizeHint: def.sizeHint,
        archived: false,
      };
      // Add field to definitions
      const newDefs = [...prev.fieldDefinitions, newDef];
      // Add field key to all cue types' field lists (global scope by default)
      const newCueTypeFields = { ...prev.cueTypeFields };
      for (const cueType of prev.cueTypes) {
        const current = newCueTypeFields[cueType] ?? getDefaultFieldsForType(cueType);
        if (!current.includes(generatedKey)) {
          newCueTypeFields[cueType] = [...current, generatedKey];
        }
      }
      // Add to visibleColumns (hidden by default)
      const newVisibleCols: ColumnConfig[] = [
        ...prev.visibleColumns,
        { key: generatedKey as ColumnConfig['key'], label, visible: false },
      ];
      // Add to per-type column overrides
      const newCueTypeCols = { ...prev.cueTypeColumns };
      for (const [ct, cols] of Object.entries(newCueTypeCols)) {
        if (!cols.some((c) => c.key === generatedKey)) {
          newCueTypeCols[ct] = [...cols, { key: generatedKey as ColumnConfig['key'], label, visible: false }];
        }
      }
      return {
        ...prev,
        fieldDefinitions: newDefs,
        cueTypeFields: newCueTypeFields,
        visibleColumns: newVisibleCols,
        cueTypeColumns: newCueTypeCols,
      };
    });
    return generatedKey;
  }, []);

  /** Update an existing field definition (label, sizeHint, etc.). Tier and key cannot change. */
  const updateFieldDefinition = useCallback((key: string, updates: Partial<Pick<FieldDefinition, 'label' | 'sizeHint'>>) => {
    setConfig((prev) => {
      const idx = prev.fieldDefinitions.findIndex((f) => f.key === key);
      if (idx === -1) return prev;
      const field = prev.fieldDefinitions[idx];
      const updatedDef = { ...field, ...updates };
      const newDefs = [...prev.fieldDefinitions];
      newDefs[idx] = updatedDef;
      // Also update column labels if label changed
      let newVisibleCols = prev.visibleColumns;
      let newCueTypeCols = prev.cueTypeColumns;
      if (updates.label && updates.label !== field.label) {
        newVisibleCols = prev.visibleColumns.map((c) =>
          c.key === key ? { ...c, label: updates.label! } : c
        );
        newCueTypeCols = { ...prev.cueTypeColumns };
        for (const [ct, cols] of Object.entries(newCueTypeCols)) {
          newCueTypeCols[ct] = cols.map((c) =>
            c.key === key ? { ...c, label: updates.label! } : c
          );
        }
      }
      return { ...prev, fieldDefinitions: newDefs, visibleColumns: newVisibleCols, cueTypeColumns: newCueTypeCols };
    });
  }, []);

  /** Soft-delete (archive) a field. Tier 1 fields cannot be archived. */
  const archiveFieldDefinition = useCallback((key: string) => {
    setConfig((prev) => {
      const field = prev.fieldDefinitions.find((f) => f.key === key);
      if (!field || field.tier === 1) return prev;
      const newDefs = prev.fieldDefinitions.map((f) =>
        f.key === key ? { ...f, archived: true } : f
      );
      // Remove from all cueTypeFields
      const newCueTypeFields = { ...prev.cueTypeFields };
      for (const [ct, fields] of Object.entries(newCueTypeFields)) {
        newCueTypeFields[ct] = fields.filter((f) => f !== key);
      }
      return { ...prev, fieldDefinitions: newDefs, cueTypeFields: newCueTypeFields };
    });
  }, []);

  /** Restore a soft-deleted field. Re-adds it to all cue type field lists. */
  const restoreFieldDefinition = useCallback((key: string) => {
    setConfig((prev) => {
      const field = prev.fieldDefinitions.find((f) => f.key === key);
      if (!field || !field.archived) return prev;
      const newDefs = prev.fieldDefinitions.map((f) =>
        f.key === key ? { ...f, archived: false } : f
      );
      // Re-add to all cue type field lists
      const newCueTypeFields = { ...prev.cueTypeFields };
      for (const cueType of prev.cueTypes) {
        const current = newCueTypeFields[cueType] ?? getDefaultFieldsForType(cueType);
        if (!current.includes(key)) {
          newCueTypeFields[cueType] = [...current, key];
        }
      }
      return { ...prev, fieldDefinitions: newDefs, cueTypeFields: newCueTypeFields };
    });
  }, []);

  /** Set a field as mandatory for a specific cue type. */
  const setMandatoryField = useCallback((cueType: string, fieldKey: string) => {
    setConfig((prev) => {
      const current = prev.mandatoryFields?.[cueType] ?? [];
      if (current.includes(fieldKey)) return prev;
      return { ...prev, mandatoryFields: { ...prev.mandatoryFields, [cueType]: [...current, fieldKey] } };
    });
  }, []);

  /** Unset a field as mandatory for a specific cue type. */
  const unsetMandatoryField = useCallback((cueType: string, fieldKey: string) => {
    setConfig((prev) => {
      const current = prev.mandatoryFields?.[cueType] ?? [];
      if (!current.includes(fieldKey)) return prev;
      return { ...prev, mandatoryFields: { ...prev.mandatoryFields, [cueType]: current.filter((k) => k !== fieldKey) } };
    });
  }, []);

  /** Reorder cue types. Reserved types (TITLE, SCENE) are kept at the top automatically. */
  const reorderCueTypes = useCallback((newOrder: string[]) => {
    setConfig((prev) => {
      // Ensure reserved types stay at top
      const reserved = (RESERVED_CUE_TYPES as readonly string[]);
      const reservedInOrder = newOrder.filter((t) => reserved.includes(t));
      const nonReserved = newOrder.filter((t) => !reserved.includes(t));
      const final = [...reservedInOrder, ...nonReserved];
      // Verify no types lost
      if (final.length !== prev.cueTypes.length) return prev;
      return { ...prev, cueTypes: final };
    });
  }, []);

  /** Toggle a cue type's hidden state. Hidden types are excluded from dropdowns, cue sheet, and exports. */
  const toggleCueTypeHidden = useCallback((typeName: string) => {
    setConfig((prev) => {
      const hidden = prev.hiddenCueTypes ?? [];
      const isHidden = hidden.includes(typeName);
      return {
        ...prev,
        hiddenCueTypes: isHidden ? hidden.filter((t) => t !== typeName) : [...hidden, typeName],
      };
    });
  }, []);

  /**
   * Toggle a field's hidden state. Hidden fields are removed from all cue types' visible fields,
   * hidden from column config, and excluded from exports. Cannot hide Tier 1 or in-use fields.
   */
  const toggleFieldHidden = useCallback((fieldKey: string) => {
    setConfig((prev) => {
      const hidden = prev.hiddenFieldKeys ?? [];
      const isHidden = hidden.includes(fieldKey);
      if (isHidden) {
        // Unhide — just remove from hidden list; user re-adds to cue types manually
        return { ...prev, hiddenFieldKeys: hidden.filter((k) => k !== fieldKey) };
      }
      // Hide — add to hidden list and remove from all cue types' field lists
      const newCueTypeFields = { ...prev.cueTypeFields };
      for (const [ct, fields] of Object.entries(newCueTypeFields)) {
        if (fields.includes(fieldKey)) {
          newCueTypeFields[ct] = fields.filter((k) => k !== fieldKey);
        }
      }
      return {
        ...prev,
        hiddenFieldKeys: [...hidden, fieldKey],
        cueTypeFields: newCueTypeFields,
      };
    });
  }, []);

  const setCueTypeHotkey = useCallback((cueType: string, hotkey: string) => {
    setConfig((prev) => {
      const updated = { ...prev.cueTypeHotkeys };
      if (hotkey) {
        updated[cueType] = hotkey;
      } else {
        delete updated[cueType];
      }
      return { ...prev, cueTypeHotkeys: updated };
    });
  }, []);

  return {
    config,
    configLoaded,
    setCueTypes,
    addCueType,
    removeCueType,
    renameCueType,
    setCueTypeColor,
    setCueTypeShortCode,
    setCueTypeFontColor,
    setShowShortCodes,
    setExpandedSearchFilter,
    setShowPastCues,
    setShowSkippedCues,
    setDistanceView,
    setCueSheetView,
    setTheme,
    setShowVideoTimecode,
    setVideoTimecodePosition,
    setAutoplayAfterCue,
    setVideoBrightness,
    setCueBackupInterval,
    setCueTypeAllowStandby,
    setCueTypeAllowWarning,
    setCueTypeFields,
    getFieldsForType,
    setVisibleColumns,
    toggleColumnVisibility,
    reorderColumns,
    addCueTypeColumns,
    removeCueTypeColumns,
    exportConfig,
    importConfig: handleImportConfig,
    reloadConfig,
    saveConfigBackup,
    clearAllData,
    clearCurrentVideoCues,
    clearAllCues,
    applyTemplate,
    addFieldDefinition,
    updateFieldDefinition,
    archiveFieldDefinition,
    restoreFieldDefinition,
    setMandatoryField,
    unsetMandatoryField,
    reorderCueTypes,
    toggleCueTypeHidden,
    toggleFieldHidden,
    setCueTypeHotkey,
  };
}
