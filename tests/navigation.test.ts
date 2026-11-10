import assert from 'node:assert/strict';
import { test } from 'node:test';
import { externalLinkTarget, isSameDocument } from '../src/main/navigation';

test('only web links may be opened outside the app', () => {
  assert.equal(externalLinkTarget('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(externalLinkTarget('http://localhost:8080/'), 'http://localhost:8080/');
  for (const url of [
    'file:///etc/passwd',
    'javascript:alert(1)',
    'smb://server/share',
    'data:text/html,hi',
    'not a url',
  ]) {
    assert.equal(externalLinkTarget(url), null, url);
  }
});

test('reloading the current page is allowed, leaving it is not', () => {
  const page = 'file:///app/out/renderer/index.html';
  assert.equal(isSameDocument(`${page}#settings`, page), true);
  assert.equal(isSameDocument('file:///app/out/renderer/overlay.html', page), false);
  assert.equal(isSameDocument('https://example.com/', page), false);
  assert.equal(isSameDocument('http://localhost:5173/', 'http://localhost:5173/'), true);
  assert.equal(isSameDocument('http://localhost:5174/', 'http://localhost:5173/'), false);
});
