<p align="center">
  <img src="image/OpenMathpix-logo.png" alt="OpenMathpix" width="300" />
</p>

<h1 align="center">OpenMathpix</h1>

<p align="center">
  Open-source desktop snipping tool that captures screen regions and converts math formulas, tables, text into LaTeX, Markdown, or plain text — powered by <a href="https://github.com/PaddlePaddle/PaddleOCR">PaddleOCR</a> on Baidu AIStudio.
</p>

---

## Installation

### Windows (portable)

1. Download `OpenMathpix-win-portable.zip` from Releases.
2. Extract the zip file.
3. Run `OpenMathpix.exe` from the extracted folder.

### Build from source

```bash
git clone git@github.com:JhuoW/OpenMathpix.git
cd OpenMathpix
npm install
npm run dev          
npm run package      
```

## Getting started

### Step 1: Get your API credentials

1. Go to [https://aistudio.baidu.com/paddleocr](https://aistudio.baidu.com/paddleocr) and log in (or create a free Baidu AIStudio account).
2. Click **"API"** button to access the model list. Then select a model (e.g. PaddleOCR-VL) to reveal the example code and your unique API URL and Access Token.
<div align="center">
  <img src="instruct/0.png" width=50%" style="margin: 0 1.5%;"/>
</div>
3. Copy these two values from the example:
  - **API URL** — your unique endpoint, e.g. `https://xxxxxx.aistudio-app.com/layout-parsing`
  - **Access Token** — your authentication token (also at [https://aistudio.baidu.com/index/accessToken](https://aistudio.baidu.com/index/accessToken))

> **Note:** Each model gets its own API URL (different subdomain). If you switch models, copy the new URL too.

### Step 2: Configure OpenMathpix

1. Launch OpenMathpix.
2. Click **Settings** in the toolbar.
3. Under **API Configuration**:
   - Paste your **API URL**.
   - Paste your **Access Token**.
   - Select a **Pipeline** that matches the model you chose on AIStudio.
4. Click **Test Connection** to verify.

### Step 3: Capture and recognize

#### Screen snip (recommended)

Press **Ctrl+Shift+S** (or **Cmd+Shift+S** on macOS) to dim the screen, then click and drag to select a region. Release to capture. Press **Escape** to cancel.

You can also click **New Snip** in the toolbar or right-click the tray icon > **Snip**.

#### Paste from clipboard

Copy an image, then press **Ctrl+V** / **Cmd+V** in the OpenMathpix window.

#### Drag and drop

Drag a PNG, JPG, BMP, or WEBP file onto the OpenMathpix window.

## Viewing results

After recognition, results appear in four tabs:

| Tab                | Description                                                  |
| ------------------ | ------------------------------------------------------------ |
| **LaTeX**    | Extracted math rendered via KaTeX, with copyable raw source. |
| **Markdown** | Structured output (headings, tables, inline math).           |
| **Text**     | Plain text with all formatting stripped.                     |
| **Image**    | The original captured screenshot.                            |

Click **Copy** to copy the active tab. The default format is auto-copied after each recognition.

## Pipelines

| Pipeline                   | Best for                               | Output           |
| -------------------------- | -------------------------------------- | ---------------- |
| **PP-OCRv5**         | General text (CJK + English)           | Text only        |
| **PP-StructureV3**   | Math, tables, charts, mixed layout     | Markdown + LaTeX |
| **PaddleOCR-VL**     | Vision-language document parsing       | Markdown + LaTeX |
| **PaddleOCR-VL-1.5** | Higher accuracy, seal & irregular text | Markdown + LaTeX |

> Each pipeline has its own API URL on AIStudio. When switching pipelines, update the URL in Settings to match.

## Settings

| Setting        | Default          | Description                               |
| -------------- | ---------------- | ----------------------------------------- |
| API URL        | —               | Your PaddleOCR AIStudio endpoint.         |
| Access Token   | —               | Stored encrypted on disk via safeStorage. |
| Pipeline       | PP-StructureV3   | Which OCR pipeline to use.                |
| Snip Hotkey    | `Ctrl+Shift+S` | Global shortcut for screen capture.       |
| Default Output | LaTeX            | Format auto-copied after recognition.     |
| Theme          | System           | Light / Dark / System.                    |
| History Limit  | 100              | Max saved recognitions (10–500).         |

**Self-hosted:** Set the API URL to your local server (e.g. `http://localhost:8080`) and leave the token empty.

## History

Click **History** in the toolbar to browse past recognitions. Each entry shows a thumbnail, timestamp, and preview. Use the search bar to filter, or click an entry to re-open its result.

## System tray

Closing the window minimizes to tray. Right-click the tray icon for:

- **Snip** — start capture
- **Open Window** — show main window
- **Settings** — open settings
- **Quit** — exit

## Keyboard shortcuts

| Shortcut                           | Action                      |
| ---------------------------------- | --------------------------- |
| `Ctrl+Shift+S` / `Cmd+Shift+S` | Screen snip (global)        |
| `Ctrl+V` / `Cmd+V`             | Paste image for recognition |
| `Escape`                         | Cancel snip                 |

## License

MIT
