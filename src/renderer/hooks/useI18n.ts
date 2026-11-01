import { useCallback } from 'react';
import { useAppStore } from '../store';
import {
  localizeError,
  translate,
  type TranslationKey,
  type TranslationParams,
} from '../../shared/i18n';

export function useI18n() {
  const language = useAppStore((state) => state.settings?.language ?? 'en');
  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => translate(language, key, params),
    [language],
  );
  const message = useCallback((text: string) => localizeError(language, text), [language]);
  return { language, t, message };
}
