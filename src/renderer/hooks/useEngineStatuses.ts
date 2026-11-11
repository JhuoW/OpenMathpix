import { useEffect } from 'react';
import { useAppStore } from '../store';
import { cleanSettingsError } from '../settings-autosave';

/** Keep readiness current across page changes, including background recognitions. */
export function useEngineStatuses() {
  const setEngineStatuses = useAppStore((state) => state.setEngineStatuses);
  useEffect(() => {
    let active = true;
    let revision = 0;
    const unsubscribe = window.api.onEngineStatusesChanged((statuses) => {
      if (!active) return;
      revision++;
      setEngineStatuses(statuses);
    });
    const refresh = () => {
      const requested = ++revision;
      void window.api.getEngineStatuses().then(
        (statuses) => {
          if (active && requested === revision) setEngineStatuses(statuses);
        },
        (error: unknown) => {
          if (!active || requested !== revision) return;
          const failed = { state: 'error' as const, error: cleanSettingsError(error) };
          setEngineStatuses({ mfr: failed, paddleocr: failed, texteller: failed });
        },
      );
    };
    const unsubscribeModel = window.api.onMfrStatus(refresh);
    const unsubscribeTexteller = window.api.onTextellerStatus(refresh);
    const unsubscribeSettings = window.api.onSettingsChanged(refresh);
    refresh();
    return () => {
      active = false;
      unsubscribe();
      unsubscribeModel();
      unsubscribeTexteller();
      unsubscribeSettings();
    };
  }, [setEngineStatuses]);
}
