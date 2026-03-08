import { useState, useCallback, useEffect, useRef } from 'react';
import type { AppConfig, ColumnConfig } from '../types';
import { DEFAULT_CONFIG, DEFAULT_VISIBLE_COLUMNS, RESERVED_CUE_TYPES, getDefaultFieldsForType } from '../types';
import type { CueTypesTemplateData, ColumnsTemplateData } from '../components/ConfigurationModal';
import { loadConfig, saveConfig, backupConfig, exportConfigToJSON, importConfigFromJSON, clearStorageFamily, clearPrimaryData, clearAllIDBData } from '../utils/storage';

export function useConfiguration() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);
  const initialLoadDone = useRef(false);

  // Load config from IndexedDB on mount
  useEffect(() => {
    loadConfig().then((loaded) => {
      setConfig(loaded);
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
      return {
        ...prev,
        cueTypes: prev.cueTypes.filter((t) => t !== name),
        cueTypeColumns: restTypeColumns,
        cueTypeColors: restColors,
        cueTypeAllowStandby: restAllowStandby,
        cueTypeAllowWarning: restAllowWarning,
        cueTypeFields: restTypeFields,
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
      return { ...prev, cueTypes: newTypes, cueTypeColumns: newTypeColumns, cueTypeColors: newColors, cueTypeAllowStandby: newAllowStandby, cueTypeAllowWarning: newAllowWarning, cueTypeFields: newTypeFields };
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

  const setShowVideoTimecode = useCallback((show: boolean) => {
    setConfig((prev) => ({ ...prev, showVideoTimecode: show }));
  }, []);

  const setVideoTimecodePosition = useCallback((pos: { x: number; y: number }) => {
    setConfig((prev) => ({ ...prev, videoTimecodePosition: pos }));
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
    const { default: { openDB } } = await import('idb');
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
   * Apply a Cue Types template.
   * - Reserved or in-use types are never removed.
   * - Types from the template are created if missing.
   * - Existing types that match are updated (colors, shortcodes, fields).
   * - Non-reserved, non-in-use types not in the template are removed.
   */
  const applyCueTypesTemplate = useCallback((data: CueTypesTemplateData, usedCueTypes?: Set<string>) => {
    setConfig((prev) => {
      const used = usedCueTypes ?? new Set<string>();
      const templateTypeSet = new Set(data.cueTypes);
      const reservedSet = new Set(RESERVED_CUE_TYPES as readonly string[]);

      // Start with types that are protected (reserved or in use), in their current order
      const protectedTypes = prev.cueTypes.filter((t) => reservedSet.has(t) || used.has(t));

      // Add template types that aren't already protected
      const newTypes = data.cueTypes.filter((t) => !protectedTypes.includes(t));
      const finalTypes = [...protectedTypes, ...newTypes];

      // Build merged maps
      const newColors = { ...prev.cueTypeColors };
      const newShortCodes = { ...prev.cueTypeShortCodes };
      const newFields = { ...prev.cueTypeFields };

      // Remove config for types that were dropped
      for (const t of prev.cueTypes) {
        if (!finalTypes.includes(t)) {
          delete newColors[t];
          delete newShortCodes[t];
          delete newFields[t];
        }
      }

      // Apply template data to all types in template
      for (const t of data.cueTypes) {
        if (data.cueTypeColors[t]) newColors[t] = data.cueTypeColors[t];
        if (data.cueTypeShortCodes[t]) newShortCodes[t] = data.cueTypeShortCodes[t];
        if (data.cueTypeFields[t]) newFields[t] = [...data.cueTypeFields[t]];
      }

      return {
        ...prev,
        cueTypes: finalTypes,
        cueTypeColors: newColors,
        cueTypeShortCodes: newShortCodes,
        cueTypeFields: newFields,
      };
    });
  }, []);

  /**
   * Apply a Columns template.
   * - Default columns are replaced from the template.
   * - All existing overrides are removed.
   * - Overrides from the template are added only for cue types that exist in config.
   */
  const applyColumnsTemplate = useCallback((data: ColumnsTemplateData) => {
    setConfig((prev) => {
      const currentTypeSet = new Set(prev.cueTypes);
      const newCueTypeColumns: Record<string, ColumnConfig[]> = {};

      // Only apply overrides for types that exist in the current config
      for (const [typeName, cols] of Object.entries(data.cueTypeColumns ?? {})) {
        if (currentTypeSet.has(typeName)) {
          newCueTypeColumns[typeName] = cols.map((c) => ({ ...c }));
        }
      }

      return {
        ...prev,
        visibleColumns: (data.visibleColumns ?? prev.visibleColumns).map((c) => ({ ...c })),
        cueTypeColumns: newCueTypeColumns,
      };
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
    setShowShortCodes,
    setExpandedSearchFilter,
    setShowPastCues,
    setShowSkippedCues,
    setDistanceView,
    setShowVideoTimecode,
    setVideoTimecodePosition,
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
    applyCueTypesTemplate,
    applyColumnsTemplate,
  };
}
