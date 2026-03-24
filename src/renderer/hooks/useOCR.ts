import { useCallback, useEffect } from 'react';
import { useAppStore } from '../store';

export function useOCR() {
  const {
    setCurrentImage,
    setOcrResult,
    setIsRecognizing,
    setError,
    setActiveTab,
    setCurrentPage,
    showToast,
    settings,
  } = useAppStore();

  const recognizeImage = useCallback(
    async (imageBase64: string) => {
      setCurrentImage(imageBase64);
      setOcrResult(null);
      setError(null);
      setIsRecognizing(true);
      setCurrentPage('result');

      try {
        const result = await window.api.recognize(imageBase64);
        setOcrResult(result);

        // Auto-select appropriate tab
        const fmt = settings?.defaultOutputFormat ?? 'latex';
        setActiveTab(fmt);

        // Auto-copy default format
        const textToCopy =
          fmt === 'latex' ? result.latex : fmt === 'markdown' ? result.markdown : result.text;
        if (textToCopy) {
          await navigator.clipboard.writeText(textToCopy);
          showToast('Copied!');
        }
      } catch (err: any) {
        setError(err.message || 'Recognition failed');
      } finally {
        setIsRecognizing(false);
      }
    },
    [settings, setCurrentImage, setOcrResult, setError, setIsRecognizing, setActiveTab, setCurrentPage, showToast],
  );

  // Listen for snip captures from main process
  useEffect(() => {
    const cleanup = window.api.onSnipCaptured((imageBase64: string) => {
      recognizeImage(imageBase64);
    });
    return cleanup;
  }, [recognizeImage]);

  // Handle paste (Ctrl+V)
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        const imageBase64 = await window.api.pasteImage();
        if (imageBase64) {
          e.preventDefault();
          showToast('Image pasted - recognizing...');
          recognizeImage(imageBase64);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [recognizeImage, showToast]);

  return { recognizeImage };
}
