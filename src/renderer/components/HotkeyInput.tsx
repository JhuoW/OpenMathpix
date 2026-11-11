import React from 'react';
import { acceleratorFromKey, isMacPlatform } from '../hotkey';
import { useI18n } from '../hooks/useI18n';
import Kbd from './Kbd';

const DEFAULT_HOTKEY = 'CommandOrControl+Shift+S';
const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'OS']);
const isModifierKey = (key: string) => MODIFIER_KEYS.has(key);

interface HotkeyInputProps {
  value: string;
  onChange: (accelerator: string) => void;
}

/** Records a shortcut from a key press instead of asking for accelerator syntax. */
export default function HotkeyInput({ value, onChange }: HotkeyInputProps) {
  const { t } = useI18n();
  const [recording, setRecording] = React.useState(false);
  const [noKeyHint, setNoKeyHint] = React.useState(false);
  const pressed = React.useRef({ modifier: false, key: false });
  const button = React.useRef<HTMLButtonElement>(null);

  // Pressing the current hotkey while recording must not start a snip.
  React.useEffect(() => {
    if (!recording) return;
    void window.api.suspendHotkey(true).catch(() => undefined);
    return () => {
      void window.api.suspendHotkey(false).catch(() => undefined);
    };
  }, [recording]);

  const stop = () => {
    setRecording(false);
    setNoKeyHint(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (isModifierKey(event.key)) pressed.current.modifier = true;
    else pressed.current.key = true;
    const recorded = acceleratorFromKey(event, isMacPlatform());
    if (recorded.kind === 'incomplete') return;
    stop();
    if (recorded.kind === 'accelerator') onChange(recorded.accelerator);
  };

  // A shortcut owned by another application never reaches this window: only its modifier
  // keys arrive. Say so instead of appearing to ignore the key press.
  const onKeyUp = (event: React.KeyboardEvent) => {
    if (!recording) return;
    if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return;
    if (pressed.current.modifier && !pressed.current.key) setNoKeyHint(true);
    pressed.current = { modifier: false, key: false };
  };

  return (
    <div className="mt-1">
      <div className="flex items-center gap-2">
        <button
          ref={button}
          type="button"
          aria-label={t('Snip Hotkey')}
          onClick={() => {
            pressed.current = { modifier: false, key: false };
            setRecording(true);
          }}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onBlur={stop}
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
      {recording && noKeyHint && (
        <p role="status" className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          {t(
            'No key was received. If you pressed a shortcut, another application is probably using it. Try a different one.',
          )}
        </p>
      )}
    </div>
  );
}
