import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localizeError, translate } from '../src/shared/i18n';

test('model setup and cache actions have English and Chinese copy', () => {
  assert.equal(translate('en', 'Download Local Model'), 'Download Local Model');
  assert.equal(translate('zh-CN', 'Download Local Model'), '下载本地模型');
  assert.equal(translate('zh-CN', 'Clear Model Cache'), '清理模型缓存');
  assert.equal(translate('zh-CN', 'MFR-1.5 is ready'), 'MFR-1.5 已就绪');
  assert.equal(translate('en', 'Settings'), 'Settings');
  assert.equal(translate('zh-CN', 'Settings'), '设置');
});

test('translated labels interpolate paths without translating or interpreting their contents', () => {
  const path = 'C:\\Settings\\History\\Text\\{model}';
  assert.equal(translate('zh-CN', 'Model folder: {path}', { path }), `模型目录：${path}`);
  assert.equal(translate('en', 'Model folder: {path}', { path }), `Model folder: ${path}`);
});

test('common IPC errors and composed success/warning toasts follow the selected language', () => {
  assert.equal(
    localizeError(
      'zh-CN',
      "Error invoking remote method 'settings:set': Error: Enter a valid HTTP or HTTPS API URL.",
    ),
    '请输入有效的 HTTP 或 HTTPS API 地址。',
  );
  assert.equal(
    localizeError('zh-CN', 'Copied! Could not update recognition history.'),
    '已复制！ 无法更新识别历史记录。',
  );
  assert.equal(
    localizeError(
      'zh-CN',
      'Model is already ready. Clear the model cache before downloading again.',
    ),
    '模型已就绪，如需重新下载，请先清理模型缓存。',
  );
});

test('missing-file and cleanup errors preserve file paths that contain UI words', () => {
  const path = '/tmp/Settings/History/Text/tokenizer.json';
  assert.equal(
    localizeError('zh-CN', `Missing or unreadable files: ${path}.`),
    `缺失或无法读取的文件：${path}。`,
  );
  const cleanup = `The model is disabled, but some cached files could not be removed. Remaining cache: ${path}. Close programs using these files and retry Clear Model Cache.`;
  const translated = localizeError('zh-CN', cleanup);
  assert.ok(translated.includes(path));
  assert.match(translated, /模型已停用/);
  const diagnostic = `EACCES: permission denied, unlink '${path}'`;
  assert.equal(localizeError('zh-CN', diagnostic), diagnostic);
});

test('legacy model errors are English in English mode and remain Chinese in Chinese mode', () => {
  const blank = '截图中没有可辨认的公式，请重新框选公式区域。';
  assert.equal(localizeError('zh-CN', blank), blank);
  assert.equal(
    localizeError('en', blank),
    'No recognizable formula in the screenshot. Please capture a formula region again.',
  );
  assert.match(
    localizeError('en', '公式输出超过 256 个 token，结果可能不完整，请分别框选较短的公式。'),
    /exceeded 256 tokens/,
  );
});
