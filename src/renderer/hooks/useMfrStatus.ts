import { useEffect } from 'react';
import { useAppStore } from '../store';

/** Subscribe once at the app level so downloads remain visible across pages. */
export function useMfrStatus() {
  const setMfrStatus = useAppStore((state) => state.setMfrStatus);

  useEffect(() => {
    let active = true;
    let receivedUpdate = false;
    const unsubscribe = window.api.onMfrStatus((status) => {
      if (!active) return;
      receivedUpdate = true;
      setMfrStatus(status);
    });

    window.api
      .getMfrStatus()
      .then((status) => {
        // A delayed initial response must not replace a newer download event.
        if (active && !receivedUpdate) setMfrStatus(status);
      })
      .catch((error: unknown) => {
        if (active && !receivedUpdate) {
          setMfrStatus({
            state: 'error',
            downloadedBytes: 0,
            totalBytes: 0,
            error: error instanceof Error ? error.message : 'Could not check the local model.',
          });
        }
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [setMfrStatus]);
}
