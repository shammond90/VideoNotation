import { useState, useCallback, useEffect } from 'react';
import type { AppConfig, ColumnConfig } from '../types';
import { DEFAULT_VISIBLE_COLUMNS, RESERVED_CUE_TYPES } from '../types';
import { loadConfig, saveConfig, exportConfigToJSON, importConfigFromJSON } from '../utils/storage';

export function useConfiguration() {
  const [config, setConfig] = useState<AppConfig>(() => loadConfig());

  // Auto-save whenever config changes
  useEffect(() => {
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
      return {
        ...prev,
        cueTypes: prev.cueTypes.filter((t) => t !== name),
        cueTypeColumns: restTypeColumns,
        cueTypeColors: restColors,
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
      return { ...prev, cueTypes: newTypes, cueTypeColumns: newTypeColumns, cueTypeColors: newColors };
    });
  }, []);

  const setCueTypeColor = useCallback((cueType: string, color: string) => {
    setConfig((prev) => ({
      ...prev,
      cueTypeColors: { ...prev.cueTypeColors, [cueType]: color },
    }));
  }, []);

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
      // Clone the default columns as the starting point
      const cloned = DEFAULT_VISIBLE_COLUMNS.map((c) => ({ ...c }));
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

  return {
    config,
    setCueTypes,
    addCueType,
    removeCueType,
    renameCueType,
    setCueTypeColor,
    setVisibleColumns,
    toggleColumnVisibility,
    reorderColumns,
    addCueTypeColumns,
    removeCueTypeColumns,
    exportConfig,
    importConfig: handleImportConfig,
  };
}
