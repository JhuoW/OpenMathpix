import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { assertModelOutsideInstallation } from '../src/main/model-location';

test('model storage cannot live in the installation tree removed during upgrades', () => {
  const install = path.resolve('installation/OpenMathpix');
  for (const directory of [
    install,
    path.join(install, 'models', 'texteller'),
    path.join(install, 'data', '..', 'models'),
  ]) {
    assert.throws(
      () => assertModelOutsideInstallation(directory, install),
      /outside.*installation/,
    );
  }
  if (process.platform === 'win32') {
    assert.throws(() => assertModelOutsideInstallation(install.toUpperCase(), install), /outside/);
  }
  assert.doesNotThrow(() => assertModelOutsideInstallation(`${install}-models`, install));
  assert.doesNotThrow(() => assertModelOutsideInstallation(path.dirname(install), install));
  assert.doesNotThrow(() =>
    assertModelOutsideInstallation(path.resolve('user-data/models'), install),
  );
});
