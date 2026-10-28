These scripts exercise the local MFR-1.5 implementation with 12 synthetic printed
formula images and two independent rejection cases. The shared fixture manifest
is `tests/fixtures/mfr/manifest.json`; it includes expected LaTeX, image hashes,
dimensions, generation details, and scoring limitations. No private screenshots
or credentials are used.

The checked-in run used the official model
[`breezedeus/pix2text-mfr-1.5`](https://huggingface.co/breezedeus/pix2text-mfr-1.5/tree/1cef9f0bdcd6a4c63df7de1311fb0894593340cc),
revision `1cef9f0bdcd6a4c63df7de1311fb0894593340cc`, on Linux with an AMD Ryzen
Threadripper PRO 7975WX. ONNX Runtime used two intra-op threads and one inter-op
thread with sequential execution. This is a small implementation smoke set,
not a representative accuracy benchmark or a laptop performance estimate.

From the repository root, set `MFR_MODEL_DIR` to the directory containing the
downloaded encoder/decoder ONNX files, tokenizer, and model configuration files.
The benchmark scripts do not download anything. Build and test commands require
the application's Node dependencies; Python is only a development reference.

```bash
export MFR_MODEL_DIR=/path/to/downloaded/mfr-1.5/revision
npm test
node scripts/mfr/benchmark-node.cjs --model-dir "$MFR_MODEL_DIR"
npm run build
node scripts/mfr/benchmark-worker.cjs --model-dir "$MFR_MODEL_DIR"
```

The first command compiles the engine into `.test-dist`. The worker benchmark
forks the actual `out/main/mfr-worker.js` bundle through its supported Node IPC
path. It covers the worker boundary but is not an Electron UI or packaged-app
test. The engine benchmark also checks explicit token-limit and timeout errors.
Negative cases are excluded from the formula accuracy denominator.

The independent Python reference uses CPU ONNX Runtime, Pillow, and HuggingFace
tokenizers without PyTorch, Optimum, or GPU packages. It implements the published
RGB 384×384 resize, normalization, and greedy full-prefix decoding. It does not
execute the official Transformers/Optimum wrapper. Use a separate environment:

```bash
python3 -m venv /tmp/openmathpix-mfr-reference-cpu
/tmp/openmathpix-mfr-reference-cpu/bin/python -m pip install -r scripts/mfr/requirements-reference.txt
/tmp/openmathpix-mfr-reference-cpu/bin/python scripts/mfr/reference.py \
  --model-dir "$MFR_MODEL_DIR" --threads 2 --max-new-tokens 256
python3 scripts/mfr/score.py scripts/mfr/results/python-reference.json \
  scripts/mfr/results/node-engine.json scripts/mfr/results/built-worker.json
```

If the system Python lacks `venv`/`ensurepip`, `uv venv` and `uv pip install
--python /tmp/openmathpix-mfr-reference-cpu/bin/python -r
scripts/mfr/requirements-reference.txt` can provide the same isolation. No Python
dependency is required by the application itself.

Fixture generation and optional visual comparison require Pillow, `pdflatex`
with `amsmath`/`geometry`, and `pdftoppm`. The fixture generator uses 180 DPI TeX
renders plus explicit low-resolution/dark-background variants. Regeneration may
change image hashes across TeX, font, and rasterizer versions; the committed
images are the stable inputs for the included reports.

```bash
python3 scripts/mfr/generate-fixtures.py
python3 scripts/mfr/render-comparison.py --report scripts/mfr/results/node-engine.json
```

Scoring keeps separate records for exact strings, conservative formatting
normalization, and visual inspection. Normalization is not mathematical
equivalence; successful TeX/KaTeX rendering is not correctness. Each checked-in
implementation produced 0/12 exact matches and 6/12 formatting-normalized
matches against the authored LaTeX. The remaining representations use alternate
environments, grouping, or fraction commands. The three implementations returned
identical raw LaTeX for all 12 formulas. Assistant visual inspection found the
same formula content in all 12 input/output pairs, recorded separately in
`results/visual-review.json`; no independent human review is claimed.

The direct Node run used sharp 0.35.5, libvips 8.18.7, and ONNX Runtime 1.31.1.
Recognition took 0.165–0.867 seconds, median 0.417 seconds; session initialization
took 0.287 seconds. Built-worker IPC calls took 0.160–0.967 seconds, median 0.477
seconds, with approximately 0.306 seconds of model loading included in the
first call. Peak RSS for the worker process was 345592 KiB (337.5 MiB), excluding
the main and renderer processes. Each sample ran once in sequence without an
artificial warm-up or OS cache flush; these are observations, not stable latency
distributions. Raw timings, versions, and errors are in `results/*.json`.

The Python reference intentionally lets the raw model see the blank image and
records its hallucinated LaTeX. The application rejects blank and invalid input
before inference. Pillow bicubic and sharp cubic interpolation are not
pixel-identical, even though all 12 decoded outputs agreed in this run. This set
does not establish handwriting quality, robustness to real noisy screenshots,
very long formulas, or mathematical equivalence on unseen examples.

Desktop checks use an isolated Linux profile and an optional external installation of
`playwright-core`; they do not change the user's settings or history. Run under an X11 display
or Xvfb after `npm test` and `npm run build`. The `--packaged` option tests the native libraries
inside the Linux unpacked distribution produced by `npx electron-builder --linux --dir`.

```bash
npm install --prefix /tmp/openmathpix-ui-test playwright-core
node scripts/mfr/desktop-smoke.cjs --model-dir "$MFR_MODEL_DIR" \
  --playwright-module /tmp/openmathpix-ui-test/node_modules/playwright-core --packaged
node scripts/mfr/desktop-smoke.cjs --migration \
  --playwright-module /tmp/openmathpix-ui-test/node_modules/playwright-core
node scripts/mfr/desktop-snip-smoke.cjs --model-dir "$MFR_MODEL_DIR" \
  --playwright-module /tmp/openmathpix-ui-test/node_modules/playwright-core
```

The recorded Linux Xvfb run exercised New Snip, actual desktop capture, overlay pointer
selection, utility-process recognition, KaTeX preview, and history persistence. Drag/drop
checks also rejected a blank image and recovered on the next formula. A separate migration
check confirmed that clearing an old user's cloud URL does not silently switch engines.
Reports are in `results/desktop-*.json` and `results/settings-migration.json`; a captured
formula result is in `results/visual/desktop-capture.png`. Xvfb does not validate Wayland,
physical multi-monitor behavior, Windows or macOS. The production downloader also fetched
and verified all 119,654,633 bytes in a fresh directory; see `results/model-download.json`.
