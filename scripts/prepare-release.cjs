const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateReleaseVersion } = require('./check-release.cjs');

const root = path.resolve(__dirname, '..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const version = validateReleaseVersion(
  read('package.json'),
  read('package-lock.json'),
  process.env.RELEASE_TAG,
);
const name = `OpenMathpix-Setup-${version}-x64.exe`;
const installer = path.join(root, 'dist', name);
const hash = crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex');
fs.writeFileSync(`${installer}.sha256`, `${hash}  ${name}\n`);
console.log(`${name}\n${hash}`);
