import { FileSpreadsheet, FileText, X } from 'lucide-react';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExportCSV: () => void;
  onExportXLSX: () => void;
  annotationCount: number;
}

export function ExportDialog({
  isOpen,
  onClose,
  onExportCSV,
  onExportXLSX,
  annotationCount,
}: ExportDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">Export Cues</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-slate-400 mb-5">
          {annotationCount} cue{annotationCount !== 1 ? 's' : ''} — choose export format:
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => { onExportCSV(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-lg hover:bg-slate-700 hover:border-slate-500 transition-colors text-left"
          >
            <FileText className="w-5 h-5 text-blue-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-200">Export CSV</p>
              <p className="text-[10px] text-slate-400">Plain comma-separated values</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => { onExportXLSX(); }}
            className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-lg hover:bg-slate-700 hover:border-slate-500 transition-colors text-left"
          >
            <FileSpreadsheet className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-200">Export XLSX</p>
              <p className="text-[10px] text-slate-400">Formatted spreadsheet with template builder</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
