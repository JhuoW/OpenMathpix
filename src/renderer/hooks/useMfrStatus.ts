import { useEffect } from 'react';
import { useAppStore } from '../store';
import type { MfrStatus } from '../../shared/types';

/** Subscribe once for both independent local models, including background downloads. */
export function useMfrStatus() {
  const setMfrStatus = useAppStore((state) => state.setMfrStatus);
  const setTextellerStatus = useAppStore((state) => state.setTextellerStatus);
  useEffect(() => {
    const subscribe = (
      listen: (cb: (status: MfrStatus) => void) => () => void,
      read: () => Promise<MfrStatus>,
      setStatus: (status: MfrStatus) => void,
    ) => {
      let active = true;
      let receivedUpdate = false;
      const unsubscribe = listen((status) => {
        if (!active) return;
        receivedUpdate = true;
        setStatus(status);
      });
      void read().then(
        (status) => {
          if (active && !receivedUpdate) setStatus(status);
        },
        (error: unknown) => {
          if (active && !receivedUpdate)
            setStatus({
              state: 'error',
              downloadedBytes: 0,
              totalBytes: 0,
              error: error instanceof Error ? error.message : 'Could not check the local model.',
            });
        },
      );
      return () => {
        active = false;
        unsubscribe();
      };
    };
    const stopMfr = subscribe(window.api.onMfrStatus, window.api.getMfrStatus, setMfrStatus);
    const stopTexteller = subscribe(
      window.api.onTextellerStatus,
      window.api.getTextellerStatus,
      setTextellerStatus,
    );
    return () => {
      stopMfr();
      stopTexteller();
    };
  }, [setMfrStatus, setTextellerStatus]);
}
