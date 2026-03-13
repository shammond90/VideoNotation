import { useCallback, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { supportsFileSystemAccess, pickVideoWithHandle } from '../utils/videoHandleStorage';

interface VideoDropZoneProps {
  onFileSelected: (file: File, handle?: FileSystemFileHandle) => void;
  onContinueWithoutVideo?: () => void;
}

export function VideoDropZone({ onFileSelected, onContinueWithoutVideo }: VideoDropZoneProps) {
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

  // Use File System Access API when available (Chromium) for persistent handle
  const handleBrowseClick = useCallback(async () => {
    if (supportsFileSystemAccess) {
      const result = await pickVideoWithHandle();
      if (result) {
        onFileSelected(result.file, result.handle);
      }
    } else {
      fileInputRef.current?.click();
    }
  }, [onFileSelected]);

  return (
    <div className="flex items-center justify-center w-full h-full min-h-[60vh]">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleBrowseClick}
        className="flex flex-col items-center justify-center w-full max-w-2xl p-16 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 select-none"
        style={{
          borderColor: isDragging ? 'var(--amber)' : 'var(--border-hi)',
          background: isDragging ? 'rgba(191,87,0,0.07)' : 'var(--bg-card)',
          transform: isDragging ? 'scale(1.02)' : undefined,
          boxShadow: isDragging ? '0 0 32px rgba(191,87,0,0.15)' : undefined,
        }}
      >
        <div className="w-16 h-16 rounded-xl flex items-center justify-center mb-4" style={{ background: 'var(--bg-panel)' }}>
          <Upload className="w-8 h-8" style={{ color: isDragging ? 'var(--amber)' : 'var(--text-mid)' }} />
        </div>
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text)' }}>Drop a video here to get started</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-mid)' }}>or click to browse files</p>
        <p className="text-xs font-mono mb-1" style={{ color: 'var(--text-dim)' }}>MP4 · WebM · MOV · browser-compatible formats</p>
        <p className="text-xs font-mono italic" style={{ color: 'var(--text-dim)' }}>29.97 fps NTSC Drop Frame timecode</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="hidden"
        />
        {onContinueWithoutVideo && (
          <div className="mt-8 pt-6 w-full flex flex-col items-center" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>Or start annotating without a video first</p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onContinueWithoutVideo();
              }}
              className="px-4 py-2 text-xs rounded-lg transition-colors"
              style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)', border: '1px solid var(--border)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-panel)')}
            >
              Continue with No Video
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
