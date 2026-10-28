import axios from 'axios';
import type { Pipeline, OCRResult } from '../shared/types';

interface ConnectionParams {
  pipeline: Pipeline;
  apiUrl: string;
  accessToken: string;
}

interface RecognizeParams extends ConnectionParams {
  imageBase64: string;
}

function getDefaultOptions(pipeline: Pipeline): Record<string, boolean> {
  // Screen snips are already upright and flat. Avoid unnecessary preprocessing.
  const options = { useDocOrientationClassify: false, useDocUnwarping: false };
  if (pipeline === 'PP-OCRv5') {
    return { ...options, useTextlineOrientation: false };
  }
  if (pipeline === 'PP-StructureV3') {
    return {
      ...options,
      useTextlineOrientation: false,
      useFormulaRecognition: true,
      useTableRecognition: true,
      useChartRecognition: false,
    };
  }
  return { ...options, useChartRecognition: false };
}

interface MathSpan {
  start: number;
  end: number;
  source: string;
}

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  while (index > 0 && text[--index] === '\\') backslashes++;
  return backslashes % 2 === 1;
}

/** Scan once in reading order, so block and inline expressions never overlap. */
function findMathSpans(markdown: string): MathSpan[] {
  const spans: MathSpan[] = [];
  for (let i = 0; i < markdown.length; i++) {
    if (isEscaped(markdown, i)) continue;

    // Dollar signs inside Markdown code are literal text.
    if (markdown[i] === '`' || markdown.startsWith('~~~', i)) {
      const marker = markdown[i];
      let length = 1;
      while (markdown[i + length] === marker) length++;
      const close = markdown.indexOf(marker.repeat(length), i + length);
      if (close !== -1) i = close + length - 1;
      continue;
    }

    const opening = markdown.startsWith('$$', i)
      ? '$$'
      : markdown[i] === '$'
        ? '$'
        : markdown.startsWith('\\[', i)
          ? '\\['
          : markdown.startsWith('\\(', i)
            ? '\\('
            : null;
    if (!opening) continue;
    const closing = opening === '\\[' ? '\\]' : opening === '\\(' ? '\\)' : opening;
    const contentStart = i + opening.length;
    let end = markdown.indexOf(closing, contentStart);
    while (end !== -1 && isEscaped(markdown, end)) {
      end = markdown.indexOf(closing, end + closing.length);
    }
    if (end === -1) {
      i += opening.length - 1;
      continue;
    }
    const content = markdown.slice(contentStart, end);
    if (
      opening === '$' &&
      (markdown[end + 1] === '$' || /\n/.test(content) || /\d/.test(markdown[end + 1] ?? ''))
    )
      continue;
    if (content.trim()) {
      spans.push({ start: i, end: end + closing.length, source: content.trim() });
    }
    i = end + closing.length - 1;
  }
  return spans;
}

export function extractLatexFromMarkdown(markdown: string): string {
  return findMathSpans(markdown)
    .map(({ source }) => `$$${source}$$`)
    .join('\n\n');
}

export function stripMarkdown(markdown: string): string {
  // Protect LaTeX operators before removing Markdown emphasis/table punctuation.
  const formulas = findMathSpans(markdown);
  let text = markdown;
  for (let i = formulas.length - 1; i >= 0; i--) {
    const formula = formulas[i];
    text = text.slice(0, formula.start) + `\u0000${i}\u0000` + text.slice(formula.end);
  }
  return (
    text
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/\|/g, ' ')
      .replace(/^[-:| ]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      // eslint-disable-next-line no-control-regex -- NUL-delimited placeholders protect math during formatting removal.
      .replace(/\u0000(\d+)\u0000/g, (_, index: string) => formulas[Number(index)].source)
      .trim()
  );
}

export function buildUrl(apiUrl: string, pipeline: Pipeline): string {
  let url: URL;
  try {
    url = new URL(apiUrl.trim());
  } catch {
    throw new Error('Invalid API URL. Enter an http:// or https:// address in Settings.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Invalid API URL. Only HTTP and HTTPS are supported.');
  }
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = /\/(ocr|layout-parsing)$/.test(pathname)
    ? pathname
    : pathname + (pipeline === 'PP-OCRv5' ? '/ocr' : '/layout-parsing');
  url.hash = '';
  return url.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function apiError(code: number, message?: unknown): Error {
  if (code === 401 || code === 403) {
    return new Error('Authentication failed. Check your Access Token and API URL in Settings.');
  }
  if (code === 429) return new Error('API rate limit reached. Please wait and retry.');
  if (code >= 500) return new Error(`PaddleOCR server error (${code}). Please retry later.`);
  const detail = typeof message === 'string' ? `: ${message.slice(0, 200)}` : '';
  return new Error(`PaddleOCR error ${code}${detail}`);
}

function invalidResponse(): Error {
  return new Error(
    'Unexpected PaddleOCR response. Check that the API URL points to an OCR endpoint.',
  );
}

export function parseResponse(data: unknown): OCRResult {
  if (!isRecord(data) || typeof data.errorCode !== 'number') throw invalidResponse();
  if (data.errorCode !== 0) throw apiError(data.errorCode, data.errorMsg);
  if (!isRecord(data.result)) throw invalidResponse();

  if (Array.isArray(data.result.ocrResults)) {
    const lines: string[] = [];
    for (const result of data.result.ocrResults) {
      if (!isRecord(result)) throw invalidResponse();
      const pruned = isRecord(result.prunedResult) ? result.prunedResult : result;
      const texts = pruned.rec_texts ?? result.rec_texts;
      if (Array.isArray(texts) && texts.every((text) => typeof text === 'string')) {
        lines.push(...texts);
        if (texts.length === 0 && typeof result.text === 'string') lines.push(result.text);
      } else if (typeof result.text === 'string') {
        lines.push(result.text);
      } else {
        throw invalidResponse();
      }
    }
    const text = lines.join('\n');
    return { text, markdown: text, latex: '', rawResponse: data };
  }

  if (!Array.isArray(data.result.layoutParsingResults)) throw invalidResponse();
  const mdParts = data.result.layoutParsingResults.map((result: unknown) => {
    if (
      !isRecord(result) ||
      !isRecord(result.markdown) ||
      typeof result.markdown.text !== 'string'
    ) {
      throw invalidResponse();
    }
    return result.markdown.text;
  });
  const markdown = mdParts.filter(Boolean).join('\n\n---\n\n');
  return {
    markdown,
    latex: extractLatexFromMarkdown(markdown),
    text: stripMarkdown(markdown),
    rawResponse: data,
  };
}

async function request(params: RecognizeParams, timeout: number): Promise<OCRResult> {
  const url = buildUrl(params.apiUrl, params.pipeline);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = params.accessToken.trim();
  if (token) headers.Authorization = `token ${token}`;

  let data: unknown;
  try {
    const response = await axios.post(
      url,
      {
        file: params.imageBase64,
        fileType: 1,
        ...getDefaultOptions(params.pipeline),
      },
      { headers, timeout },
    );
    data = response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        throw new Error('Request timed out. Please retry.');
      }
      if (error.response) {
        if (error.response.status === 404) {
          throw new Error('API endpoint not found (HTTP 404). Check your API URL in Settings.');
        }
        const body: unknown = error.response.data;
        throw apiError(error.response.status, isRecord(body) ? body.errorMsg : undefined);
      }
      throw new Error('Cannot reach the API. Check your network and API URL in Settings.');
    }
    throw error;
  }
  return parseResponse(data);
}

export async function recognize(params: RecognizeParams): Promise<OCRResult> {
  return request(params, 30_000);
}

/** Verify an actual OCR response; HTTP and application errors must remain failures. */
export async function testConnection(params: ConnectionParams): Promise<void> {
  // A valid 128 × 64 grayscale PNG with "x = 1", large enough for OCR preprocessing.
  const imageBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAIAAAABACAAAAAD3vSCjAAAAwElEQVR4nO3USxaDIBBE0d7/pskkJ1EsDNIfMngMwVN1RdDa5mEAAAAAAAAAAAAA/hZgppb07Dj99/N3gOvaRGAooF9Uc2kA0fa43we49D3vdwK6xoV+L+DUKfpNjVDAoXV4JnMBn165/xWAd7P+/iWAppMnRwSgOfpjAEv3LxKwewd2n4G7W1AB2P0f+EYqQT7gmCgE6YBzoI7PBPR5CyfRBRi8cRlgeOoqASuBkYDp2RRA1QAAAAAAAAAAAADwAl9y9qFzm4DpAAAAAElFTkSuQmCC';
  await request({ ...params, imageBase64 }, 15_000);
}
