import axios from 'axios';
import type { Pipeline, OCRResult } from '../shared/types';

interface RecognizeParams {
  imageBase64: string;
  pipeline: Pipeline;
  apiUrl: string;
  accessToken: string;
}

interface ConnectionParams {
  pipeline: Pipeline;
  apiUrl: string;
  accessToken: string;
}

function getEndpoint(pipeline: Pipeline): string {
  switch (pipeline) {
    case 'PP-OCRv5':
      return '/ocr';
    case 'PP-StructureV3':
    case 'PaddleOCR-VL':
    case 'PaddleOCR-VL-1.5':
      return '/layout-parsing';
  }
}

function getDefaultOptions(pipeline: Pipeline): Record<string, boolean> {
  // Match official API examples from aistudio.baidu.com/paddleocr/task
  switch (pipeline) {
    case 'PP-OCRv5':
      return {};
    case 'PP-StructureV3':
      return {};
    case 'PaddleOCR-VL':
    case 'PaddleOCR-VL-1.5':
      return {};
  }
}

function extractLatexFromMarkdown(md: string): string {
  const blocks: string[] = [];
  const blockRe = /\$\$([\s\S]*?)\$\$/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(md))) blocks.push(m[1].trim());
  const inlineRe = /(?<!\$)\$(?!\$)([^$]+?)\$/g;
  while ((m = inlineRe.exec(md))) blocks.push(m[1].trim());
  if (blocks.length === 0) return '';
  if (blocks.length === 1) return `$$${blocks[0]}$$`;
  return blocks.map((b) => `$$${b}$$`).join('\n\n');
}

function stripMarkdown(text: string): string {
  return text
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
    .trim();
}

function buildUrl(apiUrl: string, pipeline: Pipeline): string {
  const cleaned = apiUrl.trim().replace(/\/+$/, '');
  // If the user pasted a full URL that already ends with an endpoint path, use it as-is
  if (/\/(ocr|layout-parsing)$/.test(cleaned)) {
    return cleaned;
  }
  // Otherwise it's a bare base URL — append the endpoint for the selected pipeline
  return `${cleaned}${getEndpoint(pipeline)}`;
}

export async function recognize(params: RecognizeParams): Promise<OCRResult> {
  const url = buildUrl(params.apiUrl, params.pipeline);
  console.log('[PaddleOCR] POST', url, 'pipeline:', params.pipeline, 'hasToken:', !!params.accessToken);

  const payload: Record<string, unknown> = {
    file: params.imageBase64,
    fileType: 1,
    ...getDefaultOptions(params.pipeline),
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (params.accessToken) {
    headers['Authorization'] = `token ${params.accessToken.trim()}`;
  }

  let response;
  try {
    response = await axios.post(url, payload, { headers, timeout: 30_000 });
  } catch (err: any) {
    const status = err.response?.status;
    const body = err.response?.data;
    console.error('[PaddleOCR] Request failed:', status, body);
    throw new Error(
      `Request failed (HTTP ${status}) for ${url}` +
        (body ? `: ${JSON.stringify(body).slice(0, 200)}` : ''),
    );
  }
  const data = response.data;

  if (data.errorCode !== 0) {
    throw new Error(`PaddleOCR error ${data.errorCode}: ${data.errorMsg}`);
  }

  // Detect response format from the actual endpoint or response shape
  const isOcrEndpoint = url.endsWith('/ocr') || data.result?.ocrResults;
  if (isOcrEndpoint) {
    const results = data.result?.ocrResults ?? [];
    const lines: string[] = [];
    for (const r of results) {
      // API returns prunedResult.rec_texts (array of strings)
      const texts: string[] = r.prunedResult?.rec_texts ?? r.rec_texts ?? [];
      if (texts.length > 0) {
        lines.push(...texts);
      } else if (r.text) {
        // Fallback for older API format
        lines.push(r.text);
      }
    }
    const text = lines.join('\n');
    return { text, markdown: text, latex: '', rawResponse: data };
  }

  // PP-StructureV3 / PaddleOCR-VL
  const parsingResults = data.result?.layoutParsingResults ?? [];
  const mdParts = parsingResults
    .map((r: { markdown?: { text?: string } }) => r.markdown?.text ?? '')
    .filter(Boolean);
  const markdown = mdParts.join('\n\n---\n\n');

  return {
    markdown,
    latex: extractLatexFromMarkdown(markdown),
    text: stripMarkdown(markdown),
    rawResponse: data,
  };
}

/**
 * Test that the API URL and token are valid. Sends a tiny image and considers
 * any JSON response from the server (even an error like 500) as proof that
 * the connection, URL, and auth are all working.
 */
export async function testConnection(params: ConnectionParams): Promise<void> {
  const url = buildUrl(params.apiUrl, params.pipeline);
  const testImage =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

  const payload: Record<string, unknown> = {
    file: testImage,
    fileType: 1,
    ...getDefaultOptions(params.pipeline),
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (params.accessToken) {
    headers['Authorization'] = `token ${params.accessToken.trim()}`;
  }

  try {
    await axios.post(url, payload, { headers, timeout: 15_000 });
    // 2xx response — definitely OK
  } catch (err: any) {
    if (err.response) {
      // Server responded. Check if it's a PaddleOCR JSON error (means connection works).
      const data = err.response.data;
      if (data && typeof data.errorCode === 'number') {
        // Server processed the request and returned a PaddleOCR error
        // (e.g. 500 "can't OCR a 1px image") — connection is fine.
        return;
      }
      // Non-PaddleOCR error (e.g. 401 bad auth, 404 wrong URL)
      throw new Error(`HTTP ${err.response.status}: ${JSON.stringify(data).slice(0, 200)}`);
    }
    // Network error (DNS, timeout, etc.)
    throw new Error(err.message || 'Connection failed');
  }
}
