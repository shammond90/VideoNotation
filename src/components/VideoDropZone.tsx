import { useCallback, useRef, useState } from 'react';
import { Upload } from 'lucide-react';

interface VideoDropZoneProps {
  onFileSelected: (file: File) => void;
}

export function VideoDropZone({ onFileSelected }: VideoDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('video/')) {
        onFileSelected(file);
      }
    },
    [onFileSelected],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileSelected(file);
      }
    },
    [onFileSelected],
  );

  return (
    <div className="flex items-center justify-center w-full h-full min-h-[60vh]">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          flex flex-col items-center justify-center w-full max-w-2xl p-16 rounded-2xl border-2 border-dashed
          cursor-pointer transition-all duration-200 select-none
          ${isDragging
            ? 'border-indigo-400 bg-indigo-500/10 scale-[1.02]'
            : 'border-slate-600 bg-slate-800/50 hover:border-slate-400 hover:bg-slate-800'}
        `}
      >
        <Upload className="w-16 h-16 text-slate-400 mb-4" />
        <h2 className="text-xl font-semibold text-slate-200 mb-2">Drop a video here to get started</h2>
        <p className="text-sm text-slate-400 mb-6">or click to browse files</p>
        <p className="text-xs text-slate-500">Supports MP4, WebM, MOV and other browser-compatible formats</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
}
