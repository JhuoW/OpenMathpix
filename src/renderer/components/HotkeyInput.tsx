import React from 'react';
import { acceleratorFromKey, isMacPlatform } from '../hotkey';
import { useI18n } from '../hooks/useI18n';
import Kbd from './Kbd';

const DEFAULT_HOTKEY = 'CommandOrControl+Shift+S';

interface HotkeyInputProps {
  value: string;
  onChange: (accelerator: string) => void;
}

/** Records a shortcut from a key press instead of asking for accelerator syntax. */
export default function HotkeyInput({ value, onChange }: HotkeyInputProps) {
  const { t } = useI18n();
  const [recording, setRecording] = React.useState(false);
  const button = React.useRef<HTMLButtonElement>(null);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    const recorded = acceleratorFromKey(event, isMacPlatform());
    if (recorded.kind === 'incomplete') return;
    setRecording(false);
    if (recorded.kind === 'accelerator') onChange(recorded.accelerator);
  };

  return (
    <div className="mt-1 flex items-center gap-2">
      <button
        ref={button}
        type="button"
        aria-label={t('Snip Hotkey')}
        onClick={() => setRecording(true)}
        onKeyDown={onKeyDown}
        onBlur={() => setRecording(false)}
        className={`flex min-h-[38px] flex-1 items-center rounded-md border px-3 py-1.5 text-left text-sm transition-colors ${
          recording
            ? 'border-blue-500 ring-2 ring-blue-500/40 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-gray-400'
        }`}
      >
        {recording ? (
          <span className="text-blue-700 dark:text-blue-300">
            {t('Press the new shortcut. Esc cancels.')}
          </span>
        ) : (
          <span className="flex w-full items-center justify-between gap-2">
            <Kbd accelerator={value} />
            <span className="text-xs text-gray-400">{t('Click to change')}</span>
          </span>
        )}
      </button>
      {value !== DEFAULT_HOTKEY && (
        <button
          type="button"
          onClick={() => onChange(DEFAULT_HOTKEY)}
          className="btn-secondary !py-2"
        >
          {t('Reset')}
        </button>
      )}
    </div>
  );
}
