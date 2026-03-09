import { useRef, useState } from 'react';

export type VideoAssignmentMode = 'no-video' | 'video-not-found';

interface VideoAssignmentScreenProps {
  mode: VideoAssignmentMode;
  previousVideo?: {
    filename: string;
    duration: string;
  };
  onVideoSelected: (file: File) => void;
  onContinueWithoutVideo: () => void;
  onBack: () => void;
}

/**
 * Video assignment screen appears after creating a project or when video is not found.
 */
export function VideoAssignmentScreen({
  mode,
  previousVideo,
  onVideoSelected,
  onContinueWithoutVideo,
  onBack,
}: VideoAssignmentScreenProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    // Validate video type
    const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (!videoTypes.includes(file.type)) {
      setError('Please select a video file (MP4, WebM, or MOV)');
      return;
    }

    setError(null);
    onVideoSelected(file);
  };

  const isNotFound = mode === 'video-not-found';
  const title = isNotFound ? 'Video not found' : 'Assign a video';
  const subtitle = isNotFound
    ? `Cannot find ${previousVideo?.filename} (${previousVideo?.duration}).`
    : 'Select a rehearsal recording to work from.';

  const notFoundNote = isNotFound
    ? 'It may have been moved or renamed.'
    : '';

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <button
          onClick={onBack}
          className="text-indigo-400 hover:text-indigo-300 text-sm font-semibold mb-8 flex items-center gap-1 transition-colors"
        >
          <span>←</span> Back
        </button>

        {/* Content */}
        <div className="bg-slate-800 rounded-lg p-8 border border-slate-700">
          <h1 className="text-2xl font-bold mb-2">{title}</h1>
          <p className="text-slate-400 mb-2">{subtitle}</p>
          {notFoundNote && <p className="text-slate-400 mb-6">{notFoundNote}</p>}

          {/* File picker */}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            className="hidden"
            aria-label="Select video file"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors mb-4"
          >
            Select Video File
          </button>

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

          {/* Info box */}
          <div className="bg-slate-700 rounded p-4 mb-6 text-sm text-slate-300">
            <p>Supports MP4, WebM, MOV and other browser-compatible formats.</p>
            <p className="mt-2">
              The System uses 29.97 FPS NTSC Dropframe Timecode.
            </p>
          </div>

          {/* Continue without video */}
          <button
            onClick={onContinueWithoutVideo}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
          >
            Continue Without Video
          </button>
        </div>
      </div>
    </div>
  );
}
