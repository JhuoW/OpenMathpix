import assert from 'node:assert/strict';
import { test } from 'node:test';
import { centredOver, createAboutHtml, LICENSE_URL, NOTICES_URL } from '../src/main/about-content';
import { DEVELOPER_URL, PROJECT_URL } from '../src/main/release-version';

test('About uses the runtime version and official developer and source links in both languages', () => {
  for (const language of ['en', 'zh-CN'] as const) {
    const html = createAboutHtml(language, '2026.11.11', 'data:image/png;base64,AA==');
    assert.ok(html.includes(`lang="${language}"`));
    assert.ok(html.includes('2026.11.11'));
    assert.ok(html.includes(`href="${DEVELOPER_URL}"`));
    assert.ok(html.includes(`href="${PROJECT_URL}"`));
    assert.ok(html.includes('Wei Zhuo'));
    assert.ok(html.includes('© 2026 Wei Zhuo'));
    assert.ok(html.includes(language === 'en' ? 'Developer' : '开发者'));
    assert.match(html, /script-src 'sha256-[A-Za-z0-9+/]+=*'/);
  }
});

test('About links the license and third-party notices and closes with Enter or Escape', () => {
  const html = createAboutHtml('zh-CN', '2026.11.11', 'data:image/png;base64,AA==');
  assert.ok(html.includes(`href="${LICENSE_URL}"`));
  assert.ok(html.includes(`href="${NOTICES_URL}"`));
  assert.ok(html.includes('第三方声明'));
  assert.ok(html.includes('github.com/JhuoW/OpenMathpix'));
  assert.match(html, /event\.key === "Escape"/);
  // External links open in the default browser through the window-open handler.
  assert.equal(html.match(/target="_blank" rel="noopener noreferrer"/g)?.length, 4);
});

test('the About dialog is centred over the main window and kept on its display', () => {
  const dialog = { x: 0, y: 0, width: 460, height: 420 };
  const area = { x: 0, y: 0, width: 1920, height: 1032 };
  assert.deepEqual(centredOver({ x: 560, y: 216, width: 800, height: 600 }, dialog, area), {
    x: 730,
    y: 306,
    width: 460,
    height: 420,
  });
  // A main window partly off the work area still yields a fully visible dialog.
  const edge = centredOver({ x: -300, y: 900, width: 400, height: 300 }, dialog, area);
  assert.equal(edge.x, 0);
  assert.equal(edge.y, 1032 - 420);
});

test('About never interpolates version or icon attributes as HTML', () => {
  const html = createAboutHtml('en', '<img src=x onerror=alert(1)>', '" onerror="alert(1)');
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('src="" onerror='));
});
