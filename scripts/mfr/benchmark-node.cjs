#!/usr/bin/env node
/* Run the production MFR engine against the same manifest as reference.py. */
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { performance } = require('node:perf_hooks');

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

async function main() {
  const modelDir = argument('--model-dir');
  if (!modelDir)
    throw new Error(
      'Usage: node scripts/mfr/benchmark-node.cjs --model-dir DIRECTORY [--engine COMPILED_JS]',
    );
  const manifestPath = path.resolve(argument('--manifest', 'tests/fixtures/mfr/manifest.json'));
  const output = path.resolve(argument('--output', 'scripts/mfr/results/node-engine.json'));
  const enginePath = path.resolve(argument('--engine', '.test-dist/src/services/mfr-engine.js'));
  const maxTokens = Number(argument('--max-tokens', '256'));
  const timeoutMs = Number(argument('--timeout-ms', '90000'));
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const { createMfrEngine } = require(enginePath);
  const loading = performance.now();
  const engine = await createMfrEngine(modelDir);
  const report = {
    implementation: 'Production OpenMathpix Node MFR engine, CPU.',
    purpose: manifest.purpose,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length,
      intraOpNumThreads: 2,
      interOpNumThreads: 1,
      threadNotes: 'Fixed by createMfrEngine, not the available logical CPU count.',
      onnxruntime: require('onnxruntime-node').env.versions,
      sharp: require('sharp').versions.sharp,
      vips: require('sharp').versions.vips,
    },
    loadMs: performance.now() - loading,
    maxTokens,
    timeoutMs,
    timingNotes:
      'One inference per case in listed order, no artificial warmup. Includes image preprocessing and generation; excludes session loading. OS file cache is not flushed.',
    cases: [],
    controls: [],
  };
  await fs.mkdir(path.dirname(output), { recursive: true });
  try {
    for (const fixture of manifest.cases) {
      const buffer = await fs.readFile(path.join(path.dirname(manifestPath), fixture.file));
      const started = performance.now();
      const row = { id: fixture.id, kind: fixture.kind, file: fixture.file, status: 'error' };
      try {
        const result = await engine.recognize(buffer, { maxTokens, timeoutMs });
        Object.assign(row, {
          status: 'ok',
          latex: result.latex,
          generatedTokens: result.tokenCount,
          engineElapsedMs: result.elapsedMs,
        });
      } catch (error) {
        row.error = error instanceof Error ? error.message : String(error);
      }
      row.elapsedMs = performance.now() - started;
      report.cases.push(row);
      report.peakRssKiB = process.resourceUsage().maxRSS;
      await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify(row)}\n`);
    }
    const baseline = await fs.readFile(path.join(path.dirname(manifestPath), 'simple.png'));
    for (const control of [
      { id: 'token-limit', options: { maxTokens: 1, timeoutMs }, expected: /不完整|超过/ },
      { id: 'timeout', options: { maxTokens, timeoutMs: 1 }, expected: /超时/ },
    ]) {
      const started = performance.now();
      const result = { id: control.id, passed: false };
      try {
        const recognized = await engine.recognize(baseline, control.options);
        result.unexpectedLatex = recognized.latex;
      } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
        result.passed = control.expected.test(result.error);
      }
      result.elapsedMs = performance.now() - started;
      report.controls.push(result);
      report.peakRssKiB = process.resourceUsage().maxRSS;
      await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } finally {
    await engine.dispose();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
