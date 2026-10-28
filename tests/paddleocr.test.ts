import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import axios, { AxiosError, AxiosHeaders } from 'axios';
import {
  buildUrl,
  extractLatexFromMarkdown,
  parseResponse,
  recognize,
  stripMarkdown,
  testConnection,
} from '../src/services/paddleocr';

const params = {
  apiUrl: 'https://example.com',
  pipeline: 'PP-StructureV3' as const,
  accessToken: ' token ',
  imageBase64: 'image',
};
const layout = (text: string) => ({
  errorCode: 0,
  result: { layoutParsingResults: [{ markdown: { text } }] },
});
afterEach(() => mock.restoreAll());

test('extracts mixed inline and block formulas exactly once in reading order', () => {
  assert.equal(
    extractLatexFromMarkdown('Before $a$ then $$b$$ and $c$ finally $$d$$'),
    '$$a$$\n\n$$b$$\n\n$$c$$\n\n$$d$$',
  );
});

test('preserves OCR formulas with whitespace inside math delimiters', () => {
  assert.equal(extractLatexFromMarkdown('$ x + y $ then $$ z $$'), '$$x + y$$\n\n$$z$$');
  assert.equal(stripMarkdown('Answer: $ x + y $'), 'Answer: x + y');
});

test('recognizes TeX delimiters, escaped dollars, and display rows ending in a line break', () => {
  const markdown = String.raw`\(a+b\) and \[c+d\] and $$\begin{matrix}a\\\end{matrix}$$; $\$5+x$; \$20`;
  assert.equal(
    extractLatexFromMarkdown(markdown),
    String.raw`$$a+b$$` +
      '\n\n' +
      String.raw`$$c+d$$` +
      '\n\n' +
      String.raw`$$\begin{matrix}a\\\end{matrix}$$` +
      '\n\n' +
      String.raw`$$\$5+x$$`,
  );
  assert.equal(extractLatexFromMarkdown('$$a\\\\$$'), '$$a\\\\$$');
});

test('ignores formulas in code, unmatched delimiters, and common currency amounts', () => {
  assert.equal(extractLatexFromMarkdown('`$code$`\n```tex\n$$code$$\n```\n$real$'), '$$real$$');
  assert.equal(extractLatexFromMarkdown('Pay $5 and $10. unmatched $$'), '');
  assert.equal(extractLatexFromMarkdown('unmatched $$'), '');
});

test('plain text preserves LaTeX operators while removing math delimiters and Markdown', () => {
  assert.equal(
    stripMarkdown('# Formula\n**Result:** $a*b*c + |x|$\n\n$$x_{i_j}$$'),
    'Formula\nResult: a*b*c + |x|\n\nx_{i_j}',
  );
});

test('builds endpoints without appending paths after query parameters', () => {
  assert.equal(
    buildUrl(' https://example.com/base/?key=value#fragment ', 'PP-OCRv5'),
    'https://example.com/base/ocr?key=value',
  );
  assert.equal(
    buildUrl('https://example.com/layout-parsing/?key=value', 'PP-StructureV3'),
    'https://example.com/layout-parsing?key=value',
  );
  assert.equal(
    buildUrl('http://localhost:8080', 'PP-StructureV3'),
    'http://localhost:8080/layout-parsing',
  );
  assert.throws(() => buildUrl('file:///tmp/ocr', 'PP-OCRv5'), /HTTP and HTTPS/);
});

test('parses current and legacy text response formats', () => {
  const result = parseResponse({
    errorCode: 0,
    result: { ocrResults: [{ prunedResult: { rec_texts: ['one', 'two'] } }, { text: 'three' }] },
  });
  assert.equal(result.text, 'one\ntwo\nthree');
  assert.equal(result.latex, '');
  assert.equal(parseResponse(layout('$x$')).latex, '$$x$$');
});

test('retains top-level and legacy text fallbacks when pruned text is missing or empty', () => {
  const result = parseResponse({
    errorCode: 0,
    result: {
      ocrResults: [
        { prunedResult: {}, rec_texts: ['top-level'] },
        { prunedResult: { rec_texts: [] }, text: 'legacy' },
        { rec_texts: [] },
      ],
    },
  });
  assert.equal(result.text, 'top-level\nlegacy');
});

test('rejects malformed successful responses instead of reporting empty success', () => {
  for (const response of [
    null,
    '<html>wrong endpoint</html>',
    {},
    { errorCode: 0 },
    { errorCode: 0, result: {} },
    { errorCode: 0, result: { layoutParsingResults: [{}] } },
  ]) {
    assert.throws(() => parseResponse(response), /Unexpected PaddleOCR response/);
  }
  assert.throws(
    () => parseResponse({ errorCode: 401, errorMsg: 'invalid token' }),
    /Authentication failed/,
  );
});

test('requests formula and table recognition for PP-StructureV3', async () => {
  const post = mock.method(axios, 'post', async () => ({ data: layout('$x$') }));
  assert.equal((await recognize(params)).latex, '$$x$$');
  const [url, payload, options] = post.mock.calls[0].arguments;
  assert.equal(url, 'https://example.com/layout-parsing');
  assert.equal((payload as Record<string, unknown>).useFormulaRecognition, true);
  assert.equal((payload as Record<string, unknown>).useTableRecognition, true);
  assert.equal(options?.headers?.Authorization, 'token token');
  assert.equal(options?.timeout, 30_000);
});

test('connection test rejects HTTP errors even when they have PaddleOCR JSON bodies', async () => {
  mock.method(axios, 'post', async () => {
    throw new AxiosError('Unauthorized', undefined, undefined, undefined, {
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: { errorCode: 401, errorMsg: 'Invalid token' },
    });
  });
  await assert.rejects(testConnection(params), /Authentication failed/);
});

test('connection test rejects application errors and non-OCR success bodies', async () => {
  let data: unknown = { errorCode: 500, errorMsg: 'failed' };
  mock.method(axios, 'post', async () => ({ data }));
  await assert.rejects(testConnection(params), /server error/);
  data = '<html>OK</html>';
  await assert.rejects(testConnection(params), /Unexpected PaddleOCR response/);
});

test('connection test uses the same response validation and a non-tiny PNG', async () => {
  const post = mock.method(axios, 'post', async () => ({ data: layout('$x=1$') }));
  await testConnection(params);
  const png = Buffer.from((post.mock.calls[0].arguments[1] as { file: string }).file, 'base64');
  assert.equal(png.readUInt32BE(16), 128);
  assert.equal(png.readUInt32BE(20), 64);
});

test('timeouts and network failures give actionable errors without HTTP undefined', async () => {
  const post = mock.method(axios, 'post', async () => {
    throw new AxiosError('timeout', 'ECONNABORTED');
  });
  await assert.rejects(recognize(params), /timed out/);
  post.mock.mockImplementation(async () => {
    throw new AxiosError('connection refused', 'ECONNREFUSED');
  });
  await assert.rejects(recognize(params), /Cannot reach the API/);
});
