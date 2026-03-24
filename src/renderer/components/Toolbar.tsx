import React from 'react';
import { useAppStore } from '../store';

export default function Toolbar() {
  const { currentPage, setCurrentPage } = useAppStore();

  const navItems: { page: 'result' | 'settings' | 'history'; label: string }[] = [
    { page: 'result', label: 'Snip' },
    { page: 'history', label: 'History' },
    { page: 'settings', label: 'Settings' },
  ];

  return (
    <header className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <span className="font-semibold text-sm mr-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        OpenMathpix
      </span>

      <nav className="flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {navItems.map(({ page, label }) => (
          <button
            key={page}
            onClick={() => setCurrentPage(page)}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              currentPage === page
                ? 'bg-blue-500 text-white'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      <button
        onClick={() => window.api.startSnip()}
        className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        New Snip
      </button>
    </header>
  );
}
