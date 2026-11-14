import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { createSettingsService, type PreparedModel } from '../src/main/settings-service';
import type { AppSettings } from '../src/shared/types';

const defaults: AppSettings = {
  ocrEngine: 'mfr',
  mfrModelPath: '',
  mfrDownloadDirectory: '',
  mfrModelEnabled: true,
  apiUrl: 'https://example.test',
  accessToken: '',
  textellerModelPath: '',
  textellerDownloadDirectory: '',
  textellerModelEnabled: true,
  pipeline: 'PP-StructureV3',
  snipHotkey: 'Control+Shift+S',
  defaultOutputFormat: 'latex',
  historyLimit: 100,
  theme: 'system',
  language: 'en',
  afterSnip: 'window',
  latexCopyStyle: 'plain',
  cleanLatex: true,
  launchAtLogin: true,
  autoCheckUpdates: true,
  modelSource: 'huggingface',
};

test('download location is saved independently of the active imported model and engine', async () => {
  const service = setup();
  await service.update({ mfrModelPath: '/external/model' });
  service.events.length = 0;
  const directory = resolve('model storage');
  const saved = await service.update({ mfrDownloadDirectory: directory });
  assert.equal(saved.mfrDownloadDirectory, directory);
  assert.equal(saved.mfrModelPath, '/external/model');
  assert.equal(saved.ocrEngine, 'mfr');
  assert.deepEqual(service.events, ['persist', 'changed']);
  await assert.rejects(service.update({ mfrDownloadDirectory: 'relative/path' }), /absolute/);
  assert.equal(service.read().mfrDownloadDirectory, directory);
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

function setup(overrides: Partial<Parameters<typeof createSettingsService>[0]> = {}) {
  let saved = { ...defaults };
  const events: string[] = [];
  const verified: (string | undefined)[] = [];
  const deps: Parameters<typeof createSettingsService>[0] = {
    read: () => ({ ...saved }),
    persist: (updates, engine) => {
      events.push('persist');
      verified.push(engine);
      saved = { ...saved, ...updates };
    },
    prepareModel: async () => {
      events.push('prepare');
      return {
        commit: () => events.push('commit'),
        dispose: () => events.push('dispose'),
      };
    },
    testCloud: async () => {
      events.push('test-cloud');
    },
    prepareTextellerModel: async () => {
      events.push('prepare-texteller');
      return {
        commit: () => events.push('commit-texteller'),
        dispose: () => events.push('dispose-texteller'),
      };
    },
    changed: () => events.push('changed'),
    ...overrides,
  };
  return { ...createSettingsService(deps), read: deps.read, events, verified };
}

test('cloud activation cannot bypass explicit Connect & Use and cannot incur an autosave request', async () => {
  const service = setup();
  await assert.rejects(service.update({ ocrEngine: 'paddleocr' }), /Connect & Use/);

  assert.deepEqual(service.events, []);
  assert.deepEqual(service.read(), defaults);
});

test('explicit Paddle connection validates once and persists only the verified configuration', async () => {
  const service = setup();
  await service.connect({ ocrEngine: 'paddleocr', accessToken: ' key ' });
  assert.equal(service.read().accessToken, 'key');
  assert.deepEqual(service.events, ['test-cloud', 'persist', 'changed']);
  assert.deepEqual(service.verified, ['paddleocr']);
  service.events.length = 0;
  await service.update({ theme: 'dark' });
  assert.deepEqual(service.events, ['persist', 'changed']);
});

test('TexTeller setup is independent of MFR and commits only after validation', async () => {
  const service = setup();
  await service.update({ mfrModelPath: '/models/working-mfr' });
  service.events.length = 0;
  await service.update({ ocrEngine: 'texteller', textellerModelPath: '/models/texteller' });
  assert.equal(service.read().ocrEngine, 'texteller');
  assert.equal(service.read().mfrModelPath, '/models/working-mfr');
  assert.equal(service.read().textellerModelPath, '/models/texteller');
  assert.deepEqual(service.events, [
    'prepare-texteller',
    'persist',
    'commit-texteller',
    'changed',
    'dispose-texteller',
  ]);
});

test('failed second local setup preserves working MFR and both directories', async () => {
  const service = setup({
    prepareTextellerModel: async () => {
      throw new Error('Invalid TexTeller model');
    },
  });
  const previous = service.read();
  await assert.rejects(
    service.update({ ocrEngine: 'texteller', textellerModelPath: '/bad' }),
    /Invalid TexTeller/,
  );
  assert.deepEqual(service.read(), previous);
});

test('TexTeller can be selected before installation and only explicit setup enables a removed model', async () => {
  let preparations = 0;
  const service = setup({
    prepareTextellerModel: async (directory, options) => {
      preparations++;
      if (!directory) assert.equal(options?.allowMissingDefault, true);
      return { commit() {}, dispose() {} };
    },
  });
  await service.update({ ocrEngine: 'texteller' });
  assert.equal(preparations, 1);
  await service.update({ textellerModelEnabled: false });
  await service.update({ ocrEngine: 'mfr' });
  await service.update({ ocrEngine: 'texteller' });
  assert.equal(preparations, 1);
  assert.equal(service.read().textellerModelEnabled, false);
  await service.update({ textellerModelPath: '/valid' });
  assert.equal(preparations, 2);
  assert.equal(service.read().textellerModelEnabled, true);
});

test('failed model deletion persists a disabled retry target without losing the other engine', async () => {
  const service = setup({
    prepareClearTextellerModel: async () => ({
      recoveryPath: '/locked/texteller',
      commit: async () => {
        throw new Error('File in use');
      },
      dispose: async () => {},
    }),
  });
  await assert.rejects(service.clearModel('texteller'), /File in use/);
  assert.equal(service.read().textellerModelPath, '/locked/texteller');
  assert.equal(service.read().textellerModelEnabled, false);
  assert.equal(service.read().mfrModelEnabled, true);
});

test('switching from cloud to local can save before the default model is installed', async () => {
  const prepared: string[] = [];
  const service = setup({
    prepareModel: async (directory, options) => {
      assert.equal(directory, undefined);
      if (!options?.allowMissingDefault) throw new Error('Model is not installed');
      return {
        commit: () => {
          assert.equal(service.read().ocrEngine, 'mfr');
          prepared.push('commit-not-downloaded');
        },
        dispose: () => prepared.push('dispose'),
      };
    },
  });
  await service.connect({ ocrEngine: 'paddleocr' });
  service.events.length = 0;
  const saved = await service.update({ ocrEngine: 'mfr' });
  assert.equal(saved.ocrEngine, 'mfr');
  assert.equal(saved.mfrModelPath, '');
  assert.deepEqual(service.events, ['persist', 'changed']);
  assert.deepEqual(prepared, ['commit-not-downloaded', 'dispose']);
});

test('explicit default installation and custom imports remain strict while switching engines', async () => {
  const service = setup({
    prepareModel: async (_directory, options) => {
      assert.equal(options?.allowMissingDefault, false);
      throw new Error('Missing model files');
    },
  });
  await service.connect({ ocrEngine: 'paddleocr' });
  const previous = service.read();
  for (const mfrModelPath of ['', '/missing/custom/model']) {
    await assert.rejects(service.update({ ocrEngine: 'mfr', mfrModelPath }), /Missing model files/);
    assert.deepEqual(service.read(), previous);
  }
});

test('a selected custom path cannot bypass validation when switching back to local', async () => {
  let broken = false;
  const service = setup({
    prepareModel: async (directory, options) => {
      assert.equal(directory, '/custom/model');
      assert.equal(options?.allowMissingDefault, false);
      if (broken) throw new Error('Custom model became unreadable');
      return { commit() {}, dispose() {} };
    },
  });
  await service.update({ mfrModelPath: '/custom/model' });
  await service.connect({ ocrEngine: 'paddleocr' });
  const previous = service.read();
  broken = true;
  await assert.rejects(service.update({ ocrEngine: 'mfr' }), /became unreadable/);
  assert.deepEqual(service.read(), previous);
});

test('switching to an installed local model waits for validation before persisting the engine', async () => {
  const entered = deferred();
  const finish = deferred();
  const service = setup({
    prepareModel: async (_directory, options) => {
      assert.equal(options?.allowMissingDefault, true);
      entered.resolve();
      await finish.promise;
      return { commit() {}, dispose() {} };
    },
  });
  await service.connect({ ocrEngine: 'paddleocr' });
  const local = service.update({ ocrEngine: 'mfr' });
  await entered.promise;
  assert.equal(service.read().ocrEngine, 'paddleocr');
  finish.resolve();
  await local;
  assert.equal(service.read().ocrEngine, 'mfr');
});

test('corrupt default models still fail an engine switch and preserve cloud settings', async () => {
  const service = setup({
    prepareModel: async (_directory, options) => {
      assert.equal(options?.allowMissingDefault, true);
      throw new Error('Incomplete, corrupt, or incompatible model');
    },
  });
  await service.connect({ ocrEngine: 'paddleocr' });
  const previous = service.read();
  await assert.rejects(service.update({ ocrEngine: 'mfr' }), /corrupt/);
  assert.deepEqual(service.read(), previous);
});

test('startup revalidation of the saved local engine does not allow missing models', async () => {
  const service = setup({
    prepareModel: async (_directory, options) => {
      assert.equal(options?.allowMissingDefault, false);
      throw new Error('Model disappeared before startup validation');
    },
  });
  await assert.rejects(service.update({ ocrEngine: 'mfr' }), /disappeared/);
  assert.deepEqual(service.read(), defaults);
  assert.deepEqual(service.events, []);
});

test('failed model validation retains the active model path and engine', async () => {
  const service = setup({
    prepareModel: async () => {
      throw new Error('Missing encoder_model.onnx');
    },
  });
  await assert.rejects(service.update({ mfrModelPath: '/broken/model' }), /Missing/);
  assert.deepEqual(service.read(), defaults);
  assert.deepEqual(service.events, []);
});

test('a verified model is committed only after settings persistence succeeds', async () => {
  const service = setup();
  const saved = await service.update({ mfrModelPath: '/models/Formula Model' });
  assert.equal(saved.mfrModelPath, '/models/Formula Model');
  assert.deepEqual(service.events, ['prepare', 'persist', 'commit', 'changed', 'dispose']);

  const failing = setup({
    persist: () => {
      throw new Error('disk full');
    },
  });
  await assert.rejects(failing.update({ mfrModelPath: '/new/model' }), /disk full/);
  assert.deepEqual(failing.events, ['prepare', 'dispose']);
  assert.equal(failing.read().mfrModelPath, '');
});

test('a failed API validation does not overwrite working credentials or switch engines', async () => {
  const service = setup({
    testCloud: async () => {
      throw new Error('Authentication failed');
    },
  });
  await assert.rejects(
    service.connect({ ocrEngine: 'paddleocr', apiUrl: 'https://bad.test', accessToken: 'bad' }),
    /Authentication/,
  );
  assert.deepEqual(service.read(), defaults);
  await service.update({ theme: 'dark' });
  assert.equal(
    service.read().theme,
    'dark',
    'failed recognition update does not block preferences',
  );
});

test('switching to an unconfigured API fails before attempting a network request', async () => {
  const service = setup();
  await assert.rejects(service.connect({ ocrEngine: 'paddleocr', apiUrl: '' }), /Enter an API URL/);
  assert.deepEqual(service.events, []);
});

test('slow API validation does not block preferences or overwrite their newer values', async () => {
  const entered = deferred();
  const finish = deferred();
  const service = setup({
    testCloud: async () => {
      entered.resolve();
      await finish.promise;
    },
  });
  const cloud = service.connect({ ocrEngine: 'paddleocr' });
  await entered.promise;
  const dark = await service.update({ theme: 'dark', historyLimit: 30 });
  assert.equal(dark.theme, 'dark');
  assert.equal(dark.ocrEngine, 'mfr', 'old engine remains active while validation is pending');
  finish.resolve();
  await cloud;
  assert.equal(service.read().theme, 'dark');
  assert.equal(service.read().historyLimit, 30);
  assert.equal(service.read().ocrEngine, 'paddleocr');
});

test('recognition updates are serialized and a rejected update does not poison the queue', async () => {
  const entered = deferred();
  const finish = deferred();
  const paths: (string | undefined)[] = [];
  const service = setup({
    prepareModel: async (directory): Promise<PreparedModel> => {
      paths.push(directory);
      if (directory === '/bad') {
        entered.resolve();
        await finish.promise;
        throw new Error('Invalid model');
      }
      return { commit() {}, dispose() {} };
    },
  });
  const failed = assert.rejects(service.update({ mfrModelPath: '/bad' }), /Invalid model/);
  await entered.promise;
  const good = service.update({ mfrModelPath: '/good' });
  assert.deepEqual(paths, ['/bad']);
  finish.resolve();
  await failed;
  await good;
  assert.deepEqual(paths, ['/bad', '/good']);
  assert.equal(service.read().mfrModelPath, '/good');
});

test('selecting the managed model prepares the default directory even after a custom model', async () => {
  const paths: (string | undefined)[] = [];
  const service = setup({
    prepareModel: async (directory) => {
      paths.push(directory);
      return { commit() {}, dispose() {} };
    },
  });
  await service.update({ mfrModelPath: '/custom/model' });
  await service.update({ mfrModelPath: '' });
  assert.deepEqual(paths, ['/custom/model', undefined]);
});

test('invalid preference input is rejected without changing persisted settings', async () => {
  const service = setup();
  for (const value of [0, 501, NaN, 10.5]) {
    await assert.rejects(service.update({ historyLimit: value }), /History Limit/);
  }
  assert.deepEqual(service.read(), defaults);
  assert.deepEqual(service.events, []);
});

test('language applies independently without reinitializing the recognition engine', async () => {
  const service = setup();
  await service.update({ language: 'zh-CN' });
  assert.equal(service.read().language, 'zh-CN');
  assert.deepEqual(service.events, ['persist', 'changed']);
  await assert.rejects(service.update({ language: 'unknown' }), /Unsupported language/);
  assert.equal(service.read().language, 'zh-CN');
});

test('clearing the model resets its path without initializing a missing model', async () => {
  const events: string[] = [];
  const service = setup({
    prepareClearModel: async () => ({
      commit: async () => {
        events.push('clear');
      },
      dispose: async () => {
        events.push('dispose');
      },
    }),
  });
  await service.update({ mfrModelPath: '/external/model' });
  service.events.length = 0;
  await service.clearModel();
  assert.equal(service.read().mfrModelPath, '');
  assert.equal(service.read().mfrModelEnabled, false);
  assert.equal(service.read().ocrEngine, 'mfr');
  assert.deepEqual(service.events, ['persist', 'changed']);
  assert.deepEqual(events, ['clear', 'dispose']);
});

test('failed persistence rolls back the staged cache without committing its deletion', async () => {
  const events: string[] = [];
  const service = setup({
    persist: () => {
      throw new Error('disk full');
    },
    prepareClearModel: async () => ({
      commit: async () => {
        events.push('clear');
      },
      dispose: async () => {
        events.push('restore');
      },
    }),
  });
  await assert.rejects(service.clearModel(), /disk full/);
  assert.deepEqual(events, ['restore']);
  assert.deepEqual(service.events, []);
});

test('a cleanup failure cannot reactivate a partially deleted model and broadcasts the reset', async () => {
  const service = setup({
    prepareClearModel: async () => ({
      commit: async () => {
        throw new Error('Could not remove remaining cache files');
      },
      dispose: async () => {},
    }),
  });
  await service.update({ mfrModelPath: '/external/model' });
  service.events.length = 0;
  await assert.rejects(service.clearModel(), /remaining cache/);
  assert.equal(service.read().mfrModelPath, '');
  assert.equal(service.read().mfrModelEnabled, false);
  assert.deepEqual(service.events, ['persist', 'changed']);
  await service.update({ theme: 'dark' });
  assert.equal(service.read().theme, 'dark');
});
