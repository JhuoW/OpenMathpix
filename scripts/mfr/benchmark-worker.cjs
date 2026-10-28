#!/usr/bin/env node
/* Exercise the built application worker through its supported Node IPC path. */
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { fork } = require('node:child_process');
const { performance } = require('node:perf_hooks');

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

async function main() {
  const modelDir = argument('--model-dir');
  if (!modelDir)
    throw new Error('Usage: node scripts/mfr/benchmark-worker.cjs --model-dir DIRECTORY');
  const manifestPath = path.resolve(argument('--manifest', 'tests/fixtures/mfr/manifest.json'));
  const output = path.resolve(argument('--output', 'scripts/mfr/results/built-worker.json'));
  const workerPath = path.resolve(argument('--worker', 'out/main/mfr-worker.js'));
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const report = {
    implementation:
      'Built OpenMathpix mfr-worker.js through child_process.fork IPC; actual worker code, not a complete Electron UI test.',
    purpose: manifest.purpose,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length,
      intraOpNumThreads: 2,
      interOpNumThreads: 1,
      onnxruntime: require('onnxruntime-node').env.versions,
      sharp: require('sharp').versions.sharp,
      vips: require('sharp').versions.vips,
    },
    workerSha256: crypto
      .createHash('sha256')
      .update(await fs.readFile(workerPath))
      .digest('hex'),
    timingNotes:
      'External elapsedMs includes base64 serialization, IPC, and recognition. The first case also includes model initialization and worker startup; later cases reuse the worker. OS file cache is not flushed.',
    maxTokens: 1024,
    cases: [],
  };
  await fs.mkdir(path.dirname(output), { recursive: true });
  const child = fork(workerPath, [], { silent: true });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-4000);
  });
  let id = 0;
  async function recognize(image) {
    const requestId = ++id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        child.kill();
        reject(new Error('Worker did not respond within 90 seconds'));
      }, 90_000);
      const cleanup = () => {
        clearTimeout(timer);
        child.removeListener('message', onMessage);
        child.removeListener('error', onError);
        child.removeListener('exit', onExit);
      };
      const onMessage = (message) => {
        if (message.id !== requestId) return;
        cleanup();
        resolve(message);
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };
      const onExit = (code) => {
        cleanup();
        reject(new Error(`Worker exited with code ${code}: ${stderr}`));
      };
      child.on('message', onMessage);
      child.once('error', onError);
      child.once('exit', onExit);
      child.send({ id: requestId, modelDir, imageBase64: image.toString('base64') });
    });
  }
  try {
    for (const fixture of manifest.cases) {
      const buffer = await fs.readFile(path.join(path.dirname(manifestPath), fixture.file));
      const started = performance.now();
      const message = await recognize(buffer);
      const row = {
        id: fixture.id,
        kind: fixture.kind,
        file: fixture.file,
        status: message.error ? 'error' : 'ok',
        elapsedMs: performance.now() - started,
      };
      if (message.error) row.error = message.error;
      else
        Object.assign(row, {
          latex: message.result.latex,
          generatedTokens: message.result.tokenCount,
          engineElapsedMs: message.result.elapsedMs,
          loadMs: message.result.loadMs,
          workerPeakRssKiB: message.result.peakRssKiB,
        });
      report.cases.push(row);
      await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify(row)}\n`);
    }
  } finally {
    if (child.connected) child.disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
