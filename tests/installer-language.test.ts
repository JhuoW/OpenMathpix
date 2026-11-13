import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  INSTALLER_LANGUAGE_FILE,
  installerLanguageUpdate,
  parseInstallerLanguage,
  readInstallerLanguage,
} from '../src/main/installer-language';

test('reads the language chosen in Setup with its installation stamp', () => {
  assert.deepEqual(parseInstallerLanguage('zh-CN\r\n134076543210000000\r\n'), {
    language: 'zh-CN',
    stamp: 'zh-CN\n134076543210000000',
  });
  const byteOrderMark = String.fromCharCode(0xfeff);
  assert.deepEqual(parseInstallerLanguage(`${byteOrderMark}en\n1\n`), {
    language: 'en',
    stamp: 'en\n1',
  });
  for (const invalid of ['', 'fr\n1', 'ZH-cn\n1', 'zh\n1']) {
    assert.equal(parseInstallerLanguage(invalid), undefined, invalid);
  }
});

test('applies a Setup language once per installation', () => {
  const first = parseInstallerLanguage('zh-CN\r\n100\r\n');
  assert.deepEqual(installerLanguageUpdate(first, undefined), {
    language: 'zh-CN',
    installerLanguageApplied: 'zh-CN\n100',
  });
  // Restarting the app, or a later switch to English in the app, keeps the user's choice.
  assert.equal(installerLanguageUpdate(first, 'zh-CN\n100'), undefined);
  // Running Setup again with a choice is a new installation, even in the same language.
  assert.deepEqual(installerLanguageUpdate(parseInstallerLanguage('zh-CN\r\n200'), 'zh-CN\n100'), {
    language: 'zh-CN',
    installerLanguageApplied: 'zh-CN\n200',
  });
  // Silent installs (in-app updates) leave no choice, so nothing changes.
  assert.equal(installerLanguageUpdate(undefined, 'zh-CN\n100'), undefined);
});

test('a missing or unreadable Setup choice is ignored', () => {
  const resources = fs.mkdtempSync(path.join(os.tmpdir(), 'openmathpix-installer-language-'));
  try {
    assert.equal(readInstallerLanguage(resources), undefined);
    fs.writeFileSync(path.join(resources, INSTALLER_LANGUAGE_FILE), 'zh-CN\r\n42\r\n');
    assert.deepEqual(readInstallerLanguage(resources), { language: 'zh-CN', stamp: 'zh-CN\n42' });
    fs.writeFileSync(path.join(resources, INSTALLER_LANGUAGE_FILE), 'de\r\n42\r\n');
    assert.equal(readInstallerLanguage(resources), undefined);
  } finally {
    fs.rmSync(resources, { recursive: true, force: true });
  }
});
