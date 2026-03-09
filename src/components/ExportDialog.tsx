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
      <div className="rounded-xl shadow-2xl w-full max-w-sm p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Export Cues</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md transition-colors"
            style={{ color: 'var(--text-mid)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-mid)'; }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm mb-5" style={{ color: 'var(--text-mid)' }}>
          {annotationCount} cue{annotationCount !== 1 ? 's' : ''} — choose export format:
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => { onExportCSV(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left"
            style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--border-hi)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-panel)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <FileText className="w-5 h-5 text-blue-400 shrink-0" />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Export CSV</p>
              <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Plain comma-separated values</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => { onExportXLSX(); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left"
            style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--border-hi)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-panel)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <FileSpreadsheet className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Export XLSX</p>
              <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Formatted spreadsheet with template builder</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
