import assert from 'node:assert/strict';
import { test } from 'node:test';
import { engineIsActive } from '../src/renderer/engine-status';
import type { EngineStatuses, MfrStatus } from '../src/shared/types';

const statuses: EngineStatuses = {
  mfr: { state: 'ready' },
  paddleocr: { state: 'inactive' },
  texteller: { state: 'inactive' },
};
const filesPresent: MfrStatus = {
  state: 'ready',
  downloadedBytes: 120,
  totalBytes: 120,
};

test('local Active requires real operational readiness, not the saved selection or files alone', () => {
  const selected = {
    ocrEngine: 'mfr' as const,
    mfrModelEnabled: true,
    textellerModelEnabled: true,
  };
  assert.equal(engineIsActive('mfr', selected, null, null), false);
  assert.equal(engineIsActive('mfr', selected, statuses, filesPresent), false);
  assert.equal(
    engineIsActive('mfr', selected, statuses, { ...filesPresent, operational: false }),
    false,
  );
  assert.equal(
    engineIsActive('mfr', selected, statuses, { ...filesPresent, operational: true }),
    true,
  );
  assert.equal(
    engineIsActive(
      'mfr',
      { ...selected, mfrModelEnabled: false, textellerModelEnabled: false },
      statuses,
      {
        ...filesPresent,
        operational: true,
      },
    ),
    false,
  );
  assert.equal(
    engineIsActive('mfr', selected, statuses, {
      ...filesPresent,
      state: 'error',
      operational: true,
    }),
    false,
  );
  assert.equal(
    engineIsActive('mfr', selected, statuses, {
      ...filesPresent,
      state: 'not-downloaded',
      operational: false,
    }),
    false,
  );
});

test('typing credentials or starting a connection cannot mark a cloud engine Active', () => {
  const selected = {
    ocrEngine: 'paddleocr' as const,
    mfrModelEnabled: false,
    textellerModelEnabled: false,
  };
  for (const state of ['inactive', 'checking', 'error'] as const) {
    assert.equal(
      engineIsActive('paddleocr', selected, { ...statuses, paddleocr: { state } }, null),
      false,
    );
  }
  assert.equal(
    engineIsActive('paddleocr', selected, { ...statuses, paddleocr: { state: 'ready' } }, null),
    true,
  );
});

test('a ready alternative stays inactive until selected, and does not hide the current working engine', () => {
  const allReady: EngineStatuses = {
    mfr: { state: 'ready' },
    paddleocr: { state: 'ready' },
    texteller: { state: 'ready' },
  };
  const model = { ...filesPresent, operational: true };
  const localSelected = {
    ocrEngine: 'mfr' as const,
    mfrModelEnabled: true,
    textellerModelEnabled: true,
  };
  assert.equal(engineIsActive('mfr', localSelected, allReady, model), true);
  assert.equal(engineIsActive('paddleocr', localSelected, allReady, model), false);
  const cloudSelected = {
    ocrEngine: 'paddleocr' as const,
    mfrModelEnabled: true,
    textellerModelEnabled: true,
  };
  assert.equal(engineIsActive('mfr', cloudSelected, allReady, model), false);
  assert.equal(engineIsActive('paddleocr', cloudSelected, allReady, model), true);
});

test('two local models have independent readiness and uninstall state', () => {
  const ready: EngineStatuses = {
    mfr: { state: 'ready' },
    texteller: { state: 'ready' },
    paddleocr: { state: 'inactive' },
  };
  const selected = {
    ocrEngine: 'texteller' as const,
    mfrModelEnabled: true,
    textellerModelEnabled: true,
  };
  const loaded = { ...filesPresent, operational: true };
  assert.equal(engineIsActive('texteller', selected, ready, loaded, null), false);
  assert.equal(engineIsActive('texteller', selected, ready, loaded, filesPresent), false);
  assert.equal(engineIsActive('texteller', selected, ready, loaded, loaded), true);
  assert.equal(engineIsActive('mfr', selected, ready, loaded, loaded), false);
  assert.equal(
    engineIsActive(
      'texteller',
      { ...selected, textellerModelEnabled: false },
      ready,
      loaded,
      loaded,
    ),
    false,
  );
  assert.equal(
    engineIsActive('texteller', { ...selected, mfrModelEnabled: false }, ready, null, loaded),
    true,
  );
});
