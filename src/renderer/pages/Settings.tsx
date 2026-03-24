import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import type { AppSettings, Pipeline, OutputFormat, Theme } from '../../shared/types';

const pipelines: { value: Pipeline; label: string; desc: string }[] = [
  { value: 'PP-OCRv5', label: 'PP-OCRv5', desc: 'General text (CJK + English)' },
  {
    value: 'PP-StructureV3',
    label: 'PP-StructureV3',
    desc: 'Tables, formulas, charts, mixed layout',
  },
  { value: 'PaddleOCR-VL', label: 'PaddleOCR-VL', desc: 'Vision-language document parsing' },
  {
    value: 'PaddleOCR-VL-1.5',
    label: 'PaddleOCR-VL-1.5',
    desc: 'Upgraded VL model — higher accuracy, seal & irregular text',
  },
];

export default function Settings() {
  const { settings, setSettings, showToast } = useAppStore();
  const [local, setLocal] = useState<AppSettings | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (settings) setLocal({ ...settings });
  }, [settings]);

  if (!local) return null;

  const save = async (updates: Partial<AppSettings>) => {
    const merged = { ...local, ...updates };
    setLocal(merged);
    await window.api.setSettings(updates);
    const fresh = await window.api.getSettings();
    setSettings(fresh);
    showToast('Settings saved');
  };

  const testConnection = async () => {
    setTesting(true);
    const res = await window.api.testConnection();
    setTesting(false);
    if (res.ok) {
      showToast('Connection successful!');
    } else {
      showToast(`Connection failed: ${res.error}`);
    }
  };

  return (
    <div className="max-w-lg mx-auto p-6 space-y-8">
      {/* API Configuration */}
      <section>
        <h2 className="text-lg font-semibold mb-4">API Configuration</h2>

        <label className="block mb-3">
          <span className="text-sm font-medium">API URL</span>
          <input
            type="text"
            value={local.apiUrl}
            onChange={(e) => setLocal({ ...local, apiUrl: e.target.value })}
            onBlur={() => save({ apiUrl: local.apiUrl })}
            placeholder="https://xxxxx.aistudio-hub.baidu.com"
            className="mt-1 block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block mb-3">
          <span className="text-sm font-medium">Access Token</span>
          <div className="flex gap-2 mt-1">
            <input
              type={showToken ? 'text' : 'password'}
              value={local.accessToken}
              onChange={(e) => setLocal({ ...local, accessToken: e.target.value })}
              onBlur={() => save({ accessToken: local.accessToken })}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => setShowToken(!showToken)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {showToken ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>

        <p className="text-xs text-gray-400 mb-3">
          For self-hosted PaddleOCR, leave the Access Token empty and set the API URL to your local
          server address.
        </p>

        <label className="block mb-4">
          <span className="text-sm font-medium">Pipeline</span>
          <div className="mt-2 space-y-2">
            {pipelines.map((p) => (
              <label
                key={p.value}
                className={`flex items-start gap-3 p-2 rounded border cursor-pointer ${
                  local.pipeline === p.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <input
                  type="radio"
                  name="pipeline"
                  checked={local.pipeline === p.value}
                  onChange={() => save({ pipeline: p.value })}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium">{p.label}</div>
                  <div className="text-xs text-gray-500">{p.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </label>

        <button
          onClick={testConnection}
          disabled={testing}
          className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
      </section>

      {/* Preferences */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Preferences</h2>

        <label className="block mb-3">
          <span className="text-sm font-medium">Snip Hotkey</span>
          <input
            type="text"
            value={local.snipHotkey}
            onChange={(e) => setLocal({ ...local, snipHotkey: e.target.value })}
            onBlur={() => save({ snipHotkey: local.snipHotkey })}
            className="mt-1 block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-400">e.g. CommandOrControl+Shift+S</span>
        </label>

        <label className="block mb-3">
          <span className="text-sm font-medium">Default Output Format</span>
          <div className="flex gap-4 mt-2">
            {(['latex', 'markdown', 'text'] as OutputFormat[]).map((fmt) => (
              <label key={fmt} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="outputFormat"
                  checked={local.defaultOutputFormat === fmt}
                  onChange={() => save({ defaultOutputFormat: fmt })}
                />
                {fmt.charAt(0).toUpperCase() + fmt.slice(1)}
              </label>
            ))}
          </div>
        </label>

        <label className="block mb-3">
          <span className="text-sm font-medium">Theme</span>
          <div className="flex gap-4 mt-2">
            {(['light', 'dark', 'system'] as Theme[]).map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="theme"
                  checked={local.theme === t}
                  onChange={() => save({ theme: t })}
                />
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </label>
            ))}
          </div>
        </label>

        <label className="block mb-3">
          <span className="text-sm font-medium">History Limit</span>
          <input
            type="number"
            min={10}
            max={500}
            value={local.historyLimit}
            onChange={(e) => setLocal({ ...local, historyLimit: Number(e.target.value) })}
            onBlur={() => save({ historyLimit: local.historyLimit })}
            className="mt-1 block w-24 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
      </section>

      {/* About */}
      <section>
        <h2 className="text-lg font-semibold mb-2">About</h2>
        <p className="text-sm text-gray-500">OpenMathpix v0.1.0</p>
      </section>
    </div>
  );
}
