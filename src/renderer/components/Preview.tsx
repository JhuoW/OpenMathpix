import React from 'react';
import katex from 'katex';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useAppStore } from '../store';

export default function Preview() {
  const { ocrResult, activeTab, currentImage } = useAppStore();

  if (!ocrResult && activeTab !== 'image') {
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
          No LaTeX formulas found. Try PP-StructureV3 or PaddleOCR-VL pipeline.
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
  const ref = React.useRef<HTMLDivElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!ref.current) return;
    try {
      // Strip surrounding $$ for rendering
      const cleaned = latex.replace(/^\$\$|\$\$$/g, '').trim();
      katex.render(cleaned, ref.current, {
        displayMode: true,
        throwOnError: false,
        output: 'html',
      });
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, [latex]);

  return (
    <div className="flex-1 overflow-auto p-4">
      <div ref={ref} className="text-center" />
      {error && (
        <div className="mt-2 text-red-500 text-xs">
          Parse error: {error}
        </div>
      )}
      <details className="mt-4">
        <summary className="text-xs text-gray-400 cursor-pointer">Raw LaTeX source</summary>
        <pre className="mt-1 text-xs font-mono bg-gray-50 dark:bg-gray-800 p-2 rounded overflow-auto">
          {latex}
        </pre>
      </details>
    </div>
  );
}
