import { useEffect } from 'react';
import { useAppStore } from '../store';
import { createRecognizer } from '../recognition';

export const recognizeImage = createRecognizer({
  getState: useAppStore.getState,
  setState: useAppStore.setState,
  recognize: (image) => window.api.recognize(image),
  copyText: (text) => navigator.clipboard.writeText(text),
  showToast: (message) => useAppStore.getState().showToast(message),
});

// Mount only in App: consumers can import recognizeImage without adding listeners.
export function useOCR() {
  useEffect(() => window.api.onSnipCaptured(recognizeImage), []);

  useEffect(
    () =>
      window.api.onSnipError((message) => {
        const state = useAppStore.getState();
        if (state.isRecognizing) {
          state.showToast(message);
          return;
        }
        useAppStore.setState({
          currentImage: null,
          ocrResult: null,
          error: message,
          currentPage: 'result',
        });
      }),
    [],
  );

  useEffect(() => {
    const handler = (event: ClipboardEvent) => {
      // Pasting into settings/search fields must retain normal text editing.
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest('input, textarea, select') || target.isContentEditable)
      )
        return;
      const hasImage = Array.from(event.clipboardData?.items ?? []).some((item) =>
        item.type.startsWith('image/'),
      );
      if (!hasImage) return;
      event.preventDefault();
      if (useAppStore.getState().isRecognizing) {
        useAppStore.getState().showToast('Recognition in progress. Please wait.');
        return;
      }
      void window.api
        .pasteImage()
        .then((image) => {
          if (image) return recognizeImage(image);
          useAppStore.getState().showToast('No image found in the clipboard.');
        })
        .catch(() => {
          useAppStore.getState().showToast('Could not read the clipboard image.');
        });
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, []);

  return { recognizeImage };
}
