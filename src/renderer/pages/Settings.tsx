import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import type { AppSettings, Pipeline, OutputFormat, Theme } from '../../shared/types';
import { validateSettingsUpdates } from '../../shared/settings';
import MfrModelSettings from '../components/MfrModelSettings';

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
  const { settings, setSettings, showToast, mfrStatus } = useAppStore();
  const [local, setLocal] = useState<AppSettings | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setLocal({ ...settings });
  }, [settings]);

  if (!local) return null;
  const localEngine = local.ocrEngine === 'mfr';

  const persist = async () => {
    const updates = validateSettingsUpdates(
      Object.fromEntries(
        Object.entries(local).filter(
          ([key, value]) =>
            settings?.[key as keyof AppSettings] !== value &&
            (!localEngine || !['apiUrl', 'accessToken', 'pipeline'].includes(key)),
        ),
      ),
    );
    const fresh = await window.api.setSettings(updates);
    setSettings(fresh);
    setLocal(fresh);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || testing) return;
    setSaving(true);
    setError(null);
    try {
      await persist();
      showToast('Settings saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (saving || testing) return;
    setTesting(true);
    setError(null);
    try {
      await persist();
      const res = await window.api.testConnection();
      if (!res.ok) {
        throw new Error(
          res.error || (localEngine ? 'Local model test failed.' : 'Connection failed.'),
        );
      }
      showToast(localEngine ? 'Local model test successful!' : 'Connection successful!');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : localEngine
            ? 'Local model test failed.'
            : 'Connection failed.',
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <form onSubmit={save} className="max-w-lg mx-auto p-6">
      <fieldset disabled={saving || testing} className="space-y-8 disabled:opacity-70">
        <section>
          <h2 className="text-lg font-semibold mb-4">Recognition Engine</h2>
          <div className="space-y-2">
            {[
              {
                value: 'mfr' as const,
                label: 'Local MFR-1.5',
                desc: 'Offline formula recognition on your CPU',
              },
              {
                value: 'paddleocr' as const,
                label: 'PaddleOCR API',
                desc: 'Cloud or self-hosted recognition service',
              },
            ].map((engine) => (
              <label
                key={engine.value}
                className={`flex items-start gap-3 p-2 rounded border cursor-pointer ${
                  local.ocrEngine === engine.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <input
                  type="radio"
                  name="ocrEngine"
                  checked={local.ocrEngine === engine.value}
                  onChange={() => {
                    setLocal({ ...local, ocrEngine: engine.value });
                    setError(null);
                  }}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium">{engine.label}</div>
                  <div className="text-xs text-gray-500">{engine.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* API Configuration */}
        {localEngine ? (
          <MfrModelSettings />
        ) : (
          <section>
            <h2 className="text-lg font-semibold mb-4">API Configuration</h2>

            <label className="block mb-3">
              <span className="text-sm font-medium">API URL</span>
              <input
                type="text"
                value={local.apiUrl}
                onChange={(e) => setLocal({ ...local, apiUrl: e.target.value })}
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
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {showToken ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            <p className="text-xs text-gray-400 mb-3">
              For self-hosted PaddleOCR, leave the Access Token empty and set the API URL to your
              local server address.
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
                      onChange={() => setLocal({ ...local, pipeline: p.value })}
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
          </section>
        )}

        <div>
          <button
            type="button"
            onClick={testConnection}
            disabled={testing || (localEngine && mfrStatus?.state !== 'ready')}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {testing
              ? localEngine
                ? 'Testing local model...'
                : 'Testing...'
              : localEngine
                ? 'Save & Test Local Model'
                : 'Save & Test Connection'}
          </button>
          {localEngine && mfrStatus?.state !== 'ready' && (
            <p className="text-xs text-gray-500 mt-2">Download the model before running a test.</p>
          )}
        </div>

        {/* Preferences */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Preferences</h2>

          <label className="block mb-3">
            <span className="text-sm font-medium">Snip Hotkey</span>
            <input
              type="text"
              value={local.snipHotkey}
              onChange={(e) => setLocal({ ...local, snipHotkey: e.target.value })}
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
                    onChange={() => setLocal({ ...local, defaultOutputFormat: fmt })}
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
                    onChange={() => setLocal({ ...local, theme: t })}
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
              className="mt-1 block w-24 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        </section>

        <button
          type="submit"
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>

        {/* About */}
        <section>
          <h2 className="text-lg font-semibold mb-2">About</h2>
          <p className="text-sm text-gray-500">OpenMathpix v0.1.0</p>
        </section>
      </fieldset>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
