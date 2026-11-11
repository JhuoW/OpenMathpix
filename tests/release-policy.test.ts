import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { createRequire } from 'node:module';

const loadScript = createRequire(path.resolve('package.json'));
const { validateReleaseVersion } = loadScript('./scripts/check-release.cjs') as {
  validateReleaseVersion(pkg: { version: string }, lock: unknown, tag?: string): string;
};

const lockFor = (version: string) => ({ version, packages: { '': { version } } });

test('package version accepts calendar versions and requires the exact release tag', () => {
  assert.equal(
    validateReleaseVersion({ version: '2026.11.11' }, lockFor('2026.11.11'), 'v2026.11.11'),
    '2026.11.11',
  );
  assert.equal(validateReleaseVersion({ version: '2028.2.29' }, lockFor('2028.2.29')), '2028.2.29');
  assert.throws(
    () => validateReleaseVersion({ version: '2026.11.1' }, lockFor('2026.11.1'), 'v2026.11.01'),
    /does not match/,
  );
});

test('package version rejects impossible dates, leading zeroes, and stale lockfiles', () => {
  for (const version of [
    '0.1.0',
    '2026.11.01',
    '2026.02.1',
    '2026.13.1',
    '2026.2.29',
    '2026.4.31',
  ]) {
    assert.throws(() => validateReleaseVersion({ version }, lockFor(version)));
  }
  assert.throws(
    () => validateReleaseVersion({ version: '2026.11.11' }, lockFor('0.1.0')),
    /package-lock/,
  );
  assert.throws(
    () =>
      validateReleaseVersion(
        { version: '2026.11.11' },
        { version: '2026.11.11', packages: { '': { version: '0.1.0' } } },
      ),
    /package-lock/,
  );
});
