import React from 'react';
import { useAppStore } from '../store';
import { useI18n } from '../hooks/useI18n';
import { acceleratorKeys, isMacPlatform } from '../hotkey';
import type { TranslationKey } from '../../shared/i18n';
import { HistoryIcon, SettingsIcon, SnipIcon } from './Icons';

const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

const navItems: {
  page: 'result' | 'settings' | 'history';
  label: TranslationKey;
  Icon: typeof SnipIcon;
}[] = [
  { page: 'result', label: 'Result', Icon: SnipIcon },
  { page: 'history', label: 'History', Icon: HistoryIcon },
  { page: 'settings', label: 'Settings', Icon: SettingsIcon },
];

export default function Toolbar() {
  const { t } = useI18n();
  const { currentPage, setCurrentPage, isRecognizing, showToast, settings } = useAppStore();
  const hotkey = settings
    ? acceleratorKeys(settings.snipHotkey, isMacPlatform()).join(isMacPlatform() ? '' : '+')
    : '';

  return (
    <header
      className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <span className="font-semibold text-sm mr-2 pl-1" style={noDrag}>
        OpenMathpix
      </span>

      <nav className="flex gap-1" style={noDrag}>
        {navItems.map(({ page, label, Icon }) => (
          <button
            key={page}
            onClick={() => setCurrentPage(page)}
            aria-current={currentPage === page ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-md transition-colors ${
              currentPage === page
                ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-gray-700/60'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {t(label)}
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      <button
        onClick={() =>
          window.api.startSnip().catch(() => showToast('Could not start screen capture.'))
        }
        disabled={isRecognizing}
        title={hotkey ? t('New Snip ({hotkey})', { hotkey }) : undefined}
        className="btn-primary !py-1 disabled:cursor-wait"
        style={noDrag}
      >
        <SnipIcon className="w-3.5 h-3.5" />
        {t('New Snip')}
      </button>
    </header>
  );
}
