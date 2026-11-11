const fs = require('node:fs');
const path = require('node:path');

/** One date-based version is used by npm, Electron, NSIS, About, and release tags. */
function validateReleaseVersion(pkg, lock, tag) {
  const match = /^(20\d{2})\.([1-9]|1[0-2])\.([1-9]|[12]\d|3[01])$/.exec(pkg.version);
  if (!match) {
    throw new Error('Use YYYY.M.D without leading zeroes in package.json (for example 2026.11.1).');
  }
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('The release version must be a valid calendar date.');
  }
  if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) {
    throw new Error(
      'package-lock.json must match the version in package.json. Run npm install --package-lock-only.',
    );
  }
  if (tag && tag !== `v${pkg.version}`) {
    throw new Error(`Release tag ${tag} does not match v${pkg.version}.`);
  }
  return pkg.version;
}

if (require.main === module) {
  try {
    const root = path.resolve(__dirname, '..');
    const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
    const version = validateReleaseVersion(
      read('package.json'),
      read('package-lock.json'),
      process.env.RELEASE_TAG,
    );
    console.log(`OpenMathpix ${version}; release tag v${version}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { validateReleaseVersion };
