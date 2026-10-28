import React from 'react';
import katex from 'katex';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useAppStore } from '../store';

export default function Preview() {
  const { ocrResult, activeTab, currentImage, settings, mfrStatus, setCurrentPage } = useAppStore();

  if (!ocrResult && activeTab !== 'image') {
    if (settings?.ocrEngine === 'mfr' && mfrStatus?.state !== 'ready') {
      return (
        <div className="flex-1 flex items-center justify-center px-8 text-center">
          <div className="max-w-sm space-y-3">
            <p className="text-sm font-medium">
              {mfrStatus?.state === 'downloading'
                ? 'Your local formula model is downloading'
                : 'Set up local formula recognition'}
            </p>
            <p className="text-sm text-gray-500">
              Download MFR-1.5 once (about 120 MB) to turn formula screenshots into LaTeX offline.
            </p>
            <button
              onClick={() => setCurrentPage('settings')}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              {mfrStatus?.state === 'downloading' ? 'View Download' : 'Open Model Settings'}
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        No result yet. Capture a snip or paste an image.
      </div>
    );
  }

  if (activeTab === 'image') {
    if (!currentImage) {
      return (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          No image captured.
        </div>
      );
    }
    return (
      <div className="flex-1 overflow-auto p-4 flex items-start justify-center">
        <img
          src={`data:image/png;base64,${currentImage}`}
          alt="Captured"
          className="max-w-full border border-gray-200 dark:border-gray-700 rounded"
        />
      </div>
    );
  }

  if (activeTab === 'latex') {
    const latex = ocrResult!.latex;
    if (!latex) {
      return (
        <div className="flex-1 p-4 text-gray-400 text-sm">
          {settings?.ocrEngine === 'mfr'
            ? 'No LaTeX formula found. Try a clearer snip containing a single formula.'
            : 'No LaTeX formulas found. Try PP-StructureV3 or PaddleOCR-VL pipeline.'}
        </div>
      );
    }
    return <LatexPreview latex={latex} />;
  }

  if (activeTab === 'markdown') {
    return (
      <div className="flex-1 overflow-auto p-4 prose dark:prose-invert max-w-none">
        <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
          {ocrResult!.markdown}
        </Markdown>
      </div>
    );
  }

  // text
  return (
    <div className="flex-1 overflow-auto p-4">
      <pre className="whitespace-pre-wrap font-mono text-sm">{ocrResult!.text}</pre>
    </div>
  );
}

function LatexPreview({ latex }: { latex: string }) {
  const formulas = React.useMemo(() => {
    // OCR returns one $$...$$ block per formula. Render each independently.
    const blocks = Array.from(latex.matchAll(/\$\$([\s\S]*?)\$\$/g), (match) => match[1].trim());
    const sources = blocks.length ? blocks : [latex.trim()];
    return sources.map((source) => {
      try {
        return {
          source,
          html: katex.renderToString(source, {
            displayMode: true,
            throwOnError: true,
            output: 'html',
          }),
          error: null,
        };
      } catch (error) {
        return {
          source,
          html: null,
          error: error instanceof Error ? error.message : 'Invalid LaTeX',
        };
      }
    });
  }, [latex]);

  return (
    <div className="flex-1 overflow-auto p-4">
      {formulas.map((formula, index) => (
        <div key={index} className="mb-4 overflow-x-auto">
          {formula.html !== null ? (
            <div className="text-center" dangerouslySetInnerHTML={{ __html: formula.html }} />
          ) : (
            <>
              <pre className="whitespace-pre-wrap text-sm">{formula.source}</pre>
              <p className="mt-2 text-red-500 text-xs">Parse error: {formula.error}</p>
            </>
          )}
        </div>
      ))}
      <details className="mt-4">
        <summary className="text-xs text-gray-400 cursor-pointer">Raw LaTeX source</summary>
        <pre className="mt-1 text-xs font-mono bg-gray-50 dark:bg-gray-800 p-2 rounded overflow-auto">
          {latex}
        </pre>
      </details>
    </div>
  );
}
