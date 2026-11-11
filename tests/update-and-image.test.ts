import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import {
  findInstaller,
  parseChecksum,
  readLatestRelease,
  RELEASES_URL,
} from '../src/main/release-version';
import { formulaPng, formulaSvg, RENDER_ERROR } from '../src/main/formula-image';
import { START_HIDDEN_ARG, startedAtLogin } from '../src/main/login-item';

const hash = 'a'.repeat(64);
const name = 'OpenMathpix-Setup-2026.11.12-x64.exe';

test('the in-app update uses only a matching installer that publishes a checksum', () => {
  const assets = [
    { name: 'OpenMathpix-portable.exe', size: 100 },
    {
      name,
      size: 127_000_000,
      digest: `sha256:${hash}`,
      browser_download_url: 'https://evil.invalid/x',
    },
    { name: `${name}.sha256`, size: 110 },
  ];
  const installer = findInstaller(assets, 'v2026.11.12');
  assert.deepEqual(installer, {
    name,
    size: 127_000_000,
    // Built from the repository URL; the API's download URL is ignored.
    url: `${RELEASES_URL}/download/v2026.11.12/${name}`,
    checksumUrl: `${RELEASES_URL}/download/v2026.11.12/${name}.sha256`,
    sha256: hash,
  });
  // Zero-padded historical tags still match the installer's version.
  const padded = [
    { name: 'OpenMathpix-Setup-2026.3.4-x64.exe', size: 1000 },
    { name: 'OpenMathpix-Setup-2026.3.4-x64.exe.sha256', size: 110 },
  ];
  assert.equal(findInstaller(padded, 'v2026.03.04')?.name, padded[0].name);
  assert.equal(findInstaller(assets.slice(0, 2), 'v2026.11.12'), undefined, 'no checksum file');
  assert.equal(findInstaller(assets, 'v2026.11.13'), undefined, 'version mismatch');
  assert.equal(
    findInstaller([{ ...assets[1], size: 900_000_000 }, assets[2]], 'v2026.11.12'),
    undefined,
    'implausible size',
  );
  assert.equal(findInstaller('nope', 'v1.0.0'), undefined);
  const release = readLatestRelease(
    { draft: false, prerelease: false, tag_name: 'v2026.11.12', assets },
    '2026.11.11',
  );
  assert.equal(release.installer?.name, name);
});

test('update checksum files must name exactly the installer', () => {
  assert.equal(parseChecksum(`${hash.toUpperCase()}  ${name}\n`, name), hash);
  assert.equal(parseChecksum(`${hash} *${name}`, name), hash);
  assert.throws(() => parseChecksum(`${hash}  other.exe`, name), /invalid/);
  assert.throws(() => parseChecksum('not a hash', name), /invalid/);
});

test('formulas become standalone SVG and white-background PNG images', async () => {
  const svg = await formulaSvg(String.raw`x=\frac{-b\pm\sqrt{b^{2}-4ac}}{2a}`);
  assert.match(svg, /^<\?xml/);
  assert.match(svg, /<svg[^>]+width="[\d.]+px"[^>]+height="[\d.]+px"/);
  assert.ok(!svg.includes('currentColor'), 'colours are fixed for other apps');
  const png = await formulaPng(String.raw`x=\frac{-b\pm\sqrt{b^{2}-4ac}}{2a}`, 2);
  const meta = await sharp(png).metadata();
  assert.equal(meta.format, 'png');
  assert.ok(meta.width! > 300 && meta.height! > 80, `${meta.width}x${meta.height}`);
  const corner = await sharp(png)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer();
  assert.deepEqual([...corner].slice(0, 3), [255, 255, 255]);
  // Cloud results with several $$ blocks become one image; bad LaTeX is reported.
  assert.match(await formulaSvg('$a$\n\n$b$'), /<svg/);
  await assert.rejects(
    () => formulaSvg(String.raw`\frac{a`),
    (error: Error) => error.message === RENDER_ERROR,
  );
  await assert.rejects(
    () => formulaSvg(String.raw`\notacommand x`),
    (error: Error) => error.message === RENDER_ERROR,
  );
  await assert.rejects(
    () => formulaSvg('  '),
    (error: Error) => error.message === RENDER_ERROR,
  );
});

test('a sign-in start is recognised from its argument', () => {
  assert.equal(startedAtLogin(['OpenMathpix.exe', START_HIDDEN_ARG]), true);
  assert.equal(startedAtLogin(['OpenMathpix.exe']), false);
});
