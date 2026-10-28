import React, { useState } from 'react';
import { useAppStore } from '../store';

export default function MfrModelSettings() {
  const { mfrStatus, showToast } = useAppStore();
  const [startingDownload, setStartingDownload] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const downloading = startingDownload || mfrStatus?.state === 'downloading';
  const ready = mfrStatus?.state === 'ready';
  const error = downloadError || mfrStatus?.error;
  const progress =
    mfrStatus && mfrStatus.totalBytes > 0
      ? Math.min(100, (mfrStatus.downloadedBytes / mfrStatus.totalBytes) * 100)
      : undefined;

  const download = async () => {
    if (downloading) return;
    setStartingDownload(true);
    setDownloadError(null);
    try {
      await window.api.downloadMfrModel();
      showToast('MFR-1.5 is ready for local recognition');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not download MFR-1.5.';
      setDownloadError(message);
      showToast('Model download failed. Please try again.');
    } finally {
      setStartingDownload(false);
    }
  };

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Local Formula Model</h2>
      <p className="text-sm text-gray-500 mb-3">
        Download Pix2Text MFR-1.5 once (about 120 MB), then recognize formulas offline on your CPU.
        No API URL or token is needed, and your images stay on this device.
      </p>
      <p className="text-xs text-gray-500 mb-4">
        Snip a single formula with a small margin. This model is designed for formulas; use
        PaddleOCR for text, tables, or mixed page layouts.
      </p>

      <div className="p-3 border border-gray-200 dark:border-gray-700 rounded space-y-3">
        <p className="text-sm font-medium" role="status">
          {ready && downloading
            ? 'Verifying MFR-1.5...'
            : ready
              ? 'MFR-1.5 is ready'
              : downloading
                ? 'Downloading MFR-1.5...'
                : !mfrStatus
                  ? 'Checking local model...'
                  : mfrStatus.state === 'error'
                    ? 'Model setup needs attention'
                    : 'Model has not been downloaded'}
        </p>

        {downloading && (
          <div>
            <progress
              aria-label="MFR-1.5 model download"
              max={100}
              value={progress}
              className="block w-full h-2 accent-blue-600"
            />
            <p className="text-xs text-gray-500 mt-1">
              {progress !== undefined && mfrStatus
                ? `${(mfrStatus.downloadedBytes / 1_000_000).toFixed(1)} / ${(mfrStatus.totalBytes / 1_000_000).toFixed(1)} MB (${Math.floor(progress)}%)`
                : 'Preparing download...'}
            </p>
          </div>
        )}

        {ready && (
          <p className="text-xs text-gray-500">
            Ready for offline use. Save this engine selection to use it for your next snip.
          </p>
        )}

        <button
          type="button"
          onClick={download}
          disabled={downloading || !mfrStatus}
          className={`px-4 py-2 text-sm rounded disabled:opacity-50 transition-colors ${
            ready
              ? 'border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {downloading
            ? 'Preparing model...'
            : ready
              ? 'Verify / Repair Model'
              : mfrStatus?.state === 'error' || downloadError
                ? 'Retry Model Download'
                : 'Download MFR-1.5'}
        </button>

        {!ready && !downloading && error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400 break-words">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
