import { useState } from 'react';
import { FileSpreadsheet, FileText, FolderDown, ListMusic, X, ChevronLeft } from 'lucide-react';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExportCSV: () => void;
  onExportXLSX: () => void;
  onExportProject: () => void;
  annotationCount: number;
  /** When false, the XLSX option is hidden (tier-gated). */
  allowXlsx?: boolean;
}

export function ExportDialog({
  isOpen,
  onClose,
  onExportCSV,
  onExportXLSX,
  onExportProject,
  annotationCount,
  allowXlsx = true,
}: ExportDialogProps) {
  const [step, setStep] = useState<'choose' | 'cues'>('choose');

  if (!isOpen) return null;

  const handleClose = () => {
    setStep('choose');
    onClose();
  };

  // ── Step 1: Choose export type ──
  if (step === 'choose') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="rounded-xl shadow-2xl w-full max-w-sm p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Export</h2>
            <button
              type="button"
              onClick={handleClose}
              className="p-1 rounded-md transition-colors"
              style={{ color: 'var(--text-mid)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-mid)'; }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm mb-5" style={{ color: 'var(--text-mid)' }}>
            What would you like to export?
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => { onExportProject(); handleClose(); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left"
              style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--border-hi)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-panel)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              <FolderDown className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Export Project</p>
                <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Full project backup — config, cues & metadata (.cuetation.json)</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setStep('cues')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left"
              style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--border-hi)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-panel)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              <ListMusic className="w-5 h-5 text-blue-400 shrink-0" />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Export Cues</p>
                <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{annotationCount} cue{annotationCount !== 1 ? 's' : ''} — CSV or XLSX format</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Choose cue export format ──
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="rounded-xl shadow-2xl w-full max-w-sm p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep('choose')}
              className="p-1 rounded-md transition-colors"
              style={{ color: 'var(--text-mid)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-mid)'; }}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Export Cues</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
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
            onClick={() => { onExportCSV(); handleClose(); }}
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
          {allowXlsx && (
          <button
            type="button"
            onClick={() => { onExportXLSX(); setStep('choose'); }}
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
          )}
        </div>
      </div>
    </div>
  );
}
