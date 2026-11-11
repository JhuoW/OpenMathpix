import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compareVersions,
  issueUrl,
  PROJECT_URL,
  readLatestRelease,
  RELEASES_URL,
  userGuideUrl,
} from '../src/main/release-version';

test('Help opens the README in the interface language and a prefilled issue report', () => {
  assert.equal(userGuideUrl('en'), `${PROJECT_URL}#readme`);
  assert.equal(userGuideUrl('zh-CN'), `${PROJECT_URL}/blob/master/README.zh-CN.md`);
  const url = new URL(issueUrl({ version: '2026.11.11', os: 'Windows 10.0.26200', arch: 'x64' }));
  assert.equal(`${url.origin}${url.pathname}`, `${PROJECT_URL}/issues/new`);
  const body = url.searchParams.get('body')!;
  assert.match(body, /OpenMathpix 2026\.11\.11/);
  assert.match(body, /Windows 10\.0\.26200 \(x64\)/);
});

test('date-based releases compare numerically across padding, months and years', () => {
  assert.equal(compareVersions('v2026.11.01', '2026.11.1'), 0);
  assert.equal(compareVersions('v2026.11.01', '2026.11.11'), -1);
  assert.equal(compareVersions('v2026.11.01', '2026.9.30'), 1);
  assert.equal(compareVersions('v2027.1.1', '2026.12.31'), 1);
  assert.equal(compareVersions('v2026.11.11', '0.1.0'), 1);
});

test('prerelease ordering is respected and malformed versions fail closed', () => {
  assert.equal(compareVersions('2026.11.11', '2026.11.11-rc.1'), 1);
  assert.equal(compareVersions('1.0.0-beta.10', '1.0.0-beta.2'), 1);
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-alpha.1'), -1);
  assert.equal(compareVersions('1.0.0+build.2', '1.0.0+build.1'), 0);
  for (const value of [
    'latest',
    '1.0',
    '1.2.3.4',
    'v1.0.0/path',
    '1.0.0-foo..bar',
    '999999999999999999.0.0',
  ]) {
    assert.equal(compareVersions(value, '1.0.0'), null);
  }
});

test('release response offers only stable newer versions and opens the trusted matching tag', () => {
  const result = readLatestRelease(
    {
      draft: false,
      prerelease: false,
      tag_name: 'v2026.11.12',
      html_url: 'https://untrusted.invalid/',
    },
    '2026.11.11',
  );
  assert.deepEqual(result, {
    version: '2026.11.12',
    available: true,
    url: `${RELEASES_URL}/tag/v2026.11.12`,
    installer: undefined,
  });
  assert.equal(
    readLatestRelease({ draft: false, prerelease: false, tag_name: 'v2026.11.01' }, '2026.11.11')
      .available,
    false,
  );
  for (const response of [
    null,
    {},
    { draft: true, prerelease: false, tag_name: 'v2027.1.1' },
    { draft: false, prerelease: true, tag_name: 'v2027.1.1-beta' },
    { draft: false, prerelease: false, tag_name: 'latest' },
  ]) {
    assert.throws(() => readLatestRelease(response, '2026.11.11'));
  }
});
