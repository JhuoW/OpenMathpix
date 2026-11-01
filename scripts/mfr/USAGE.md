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

For desktop use, open **Settings → Local MFR-1.5** and use **Download Local Model**
or **Select Local Model**. The latter accepts a folder containing the eight original
files from the pinned revision linked above:

```text
encoder_model.onnx
decoder_model.onnx
config.json
generation_config.json
preprocessor_config.json
special_tokens_map.json
tokenizer.json
tokenizer_config.json
```

The app checks file sizes and SHA-256 hashes, then initializes the candidate model
and tests a formula before saving the selection. A failed import leaves the prior
working model active. The folder is used directly and remembered across restarts;
keep it available. Automatic downloads use the system proxy. If the download times
out, check access to Hugging Face and its file download servers, retry, or download
these files in a browser and select their folder. Settings save and validate changes
automatically; no manual Save or Save & Test step is needed.

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
The desktop smoke script checks automatic settings persistence across navigation and restart,
manual model selection and cancellation, missing/corrupt model rollback, real inference from
the selected folder, and the default expansion and manual toggling of Raw LaTeX source. Only
the native folder picker's response is mocked; the app's validation and model loading run
normally. Migration mode checks the one-time switch from old PaddleOCR settings to local MFR,
with API credentials retained. After that migration, explicitly saved engine and language
choices must survive restart. It also checks that local MFR can be selected before a model is
downloaded, without leaving a pending selection, and that clearing a damaged default cache
recovers a failed local selection. A fresh configuration must start with local MFR and English.
No real API is contacted.

```bash
npm install --prefix /tmp/openmathpix-ui-test playwright-core
node scripts/mfr/desktop-smoke.cjs --model-dir "$MFR_MODEL_DIR" \
  --playwright-module /tmp/openmathpix-ui-test/node_modules/playwright-core --packaged
node scripts/mfr/desktop-smoke.cjs --migration \
  --playwright-module /tmp/openmathpix-ui-test/node_modules/playwright-core
node scripts/mfr/desktop-snip-smoke.cjs --model-dir "$MFR_MODEL_DIR" \
  --playwright-module /tmp/openmathpix-ui-test/node_modules/playwright-core
node scripts/mfr/download-smoke.cjs --model-dir "$MFR_MODEL_DIR" \
  --playwright-module /tmp/openmathpix-ui-test/node_modules/playwright-core
node scripts/mfr/ux-smoke.cjs --model-dir "$MFR_MODEL_DIR" \
  --playwright-module /tmp/openmathpix-ui-test/node_modules/playwright-core
```

The download smoke test supplies simulated timeout and streaming network responses using
the real model files. It checks manual recovery, blocked duplicate downloads, cancelled cleanup,
safe cache removal, and downloading/initializing all eight files again. Native dialog responses
are simulated. It performs real ONNX inference, but does not verify external connectivity or
system proxy behavior. Downloaded files and settings stay in a new temporary test profile.

The UX smoke test exercises the native View language menu, immediate interface translation,
language persistence across restart, cache clearing, and the close-window choices. Dialog
responses are simulated; menu actions, window events, persistence and application exit are real.
It verifies that cache cleanup does not delete an external model reached through a symlink.
Under Xvfb without a window manager, minimizing is verified by observing the actual minimize
call, not a visible taskbar. These desktop scripts cover Linux/X11 only.

The recorded Linux Xvfb run exercised New Snip, actual desktop capture, overlay pointer
selection, utility-process recognition, KaTeX preview, and history persistence. Drag/drop
checks also rejected a blank image and recovered on the next formula. A separate migration
check confirmed that clearing an old user's cloud URL does not silently switch engines.
Reports are in `results/desktop-*.json` and `results/settings-migration.json`; a captured
formula result is in `results/visual/desktop-capture.png`. Xvfb does not validate Wayland,
physical multi-monitor behavior, Windows or macOS. The production downloader also fetched
and verified all 119,654,633 bytes in a fresh directory; see `results/model-download.json`.
