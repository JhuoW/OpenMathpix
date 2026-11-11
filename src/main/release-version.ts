export const PROJECT_URL = 'https://github.com/JhuoW/OpenMathpix';
export const RELEASES_URL = `${PROJECT_URL}/releases`;
export const LATEST_RELEASE_API = 'https://api.github.com/repos/JhuoW/OpenMathpix/releases/latest';
export const DEVELOPER_URL = 'https://wei2hu0.github.io/';

/** The README in the interface language. */
export function userGuideUrl(language: 'en' | 'zh-CN'): string {
  return language === 'zh-CN'
    ? `${PROJECT_URL}/blob/master/README.zh-CN.md`
    : `${PROJECT_URL}#readme`;
}

/** A new GitHub issue, prefilled with the details a bug report needs. */
export function issueUrl(environment: { version: string; os: string; arch: string }): string {
  const body = [
    '**What happened?**',
    '',
    '**Steps to reproduce**',
    '1. ',
    '',
    '**Environment**',
    `- OpenMathpix ${environment.version}`,
    `- ${environment.os} (${environment.arch})`,
  ].join('\n');
  return `${PROJECT_URL}/issues/new?body=${encodeURIComponent(body)}`;
}

interface Version {
  parts: number[];
  prerelease: string[];
}

/** Accept historical zero-padded date tags as well as npm's unpadded version. */
function parseVersion(input: string): Version | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(input);
  if (!match) return null;
  const parts = match.slice(1, 4).map(Number);
  const prerelease = match[4]?.split('.') ?? [];
  if (!parts.every(Number.isSafeInteger) || prerelease.some((part) => !part)) return null;
  return { parts, prerelease };
}

/** Positive means candidate is newer. Reject unknown versions instead of offering a downgrade. */
export function compareVersions(candidate: string, current: string): number | null {
  const next = parseVersion(candidate);
  const installed = parseVersion(current);
  if (!next || !installed) return null;
  for (let i = 0; i < next.parts.length; i++) {
    if (next.parts[i] !== installed.parts[i]) return next.parts[i] > installed.parts[i] ? 1 : -1;
  }
  if (!next.prerelease.length && !installed.prerelease.length) return 0;
  if (!next.prerelease.length) return 1;
  if (!installed.prerelease.length) return -1;
  for (let i = 0; i < Math.max(next.prerelease.length, installed.prerelease.length); i++) {
    const a = next.prerelease[i];
    const b = installed.prerelease[i];
    if (a === b) continue;
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) {
      const aValue = BigInt(a);
      const bValue = BigInt(b);
      if (aValue === bValue) continue;
      return aValue > bValue ? 1 : -1;
    }
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a > b ? 1 : -1;
  }
  return 0;
}

export interface ReleaseCheck {
  version: string;
  url: string;
  available: boolean;
  /** The Windows installer of this release, when it publishes one with a checksum file. */
  installer?: InstallerAsset;
}

export interface InstallerAsset {
  name: string;
  size: number;
  /** Built from the trusted repository URL, never taken from the API response. */
  url: string;
  checksumUrl: string;
  /** GitHub's own SHA-256 of the asset, when the API reports it. */
  sha256?: string;
}

const INSTALLER_NAME = /^OpenMathpix-Setup-(\d+\.\d+\.\d+)-x64\.exe$/;
const MAX_INSTALLER_BYTES = 400 * 1024 * 1024;

/** The release's x64 installer: matching version, sane size, and a published .sha256 file. */
export function findInstaller(assets: unknown, tag: string): InstallerAsset | undefined {
  if (!Array.isArray(assets)) return undefined;
  const entries = assets.filter(
    (asset): asset is Record<string, unknown> => !!asset && typeof asset === 'object',
  );
  for (const asset of entries) {
    const name = asset.name;
    if (typeof name !== 'string') continue;
    const match = INSTALLER_NAME.exec(name);
    if (!match || compareVersions(match[1], tag) !== 0) continue;
    const size = asset.size;
    if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0) continue;
    if (size > MAX_INSTALLER_BYTES) continue;
    if (!entries.some((other) => other.name === `${name}.sha256`)) continue;
    const digest =
      typeof asset.digest === 'string' ? /^sha256:([a-f0-9]{64})$/i.exec(asset.digest) : null;
    const base = `${RELEASES_URL}/download/${encodeURIComponent(tag)}`;
    return {
      name,
      size,
      url: `${base}/${encodeURIComponent(name)}`,
      checksumUrl: `${base}/${encodeURIComponent(`${name}.sha256`)}`,
      sha256: digest ? digest[1].toLowerCase() : undefined,
    };
  }
  return undefined;
}

/** The hash from a `sha256sum`-style line naming exactly this file. */
export function parseChecksum(text: string, name: string): string {
  const line = text.trim().split(/\r?\n/)[0] ?? '';
  const match = /^([a-f0-9]{64}) [ *]?(.+)$/i.exec(line.trim());
  if (!match || match[2].trim() !== name) throw new Error('The update checksum file is invalid.');
  return match[1].toLowerCase();
}

export function readLatestRelease(value: unknown, current: string): ReleaseCheck {
  if (!value || typeof value !== 'object') throw new Error('Invalid release response.');
  const release = value as Record<string, unknown>;
  if (
    release.draft !== false ||
    release.prerelease !== false ||
    typeof release.tag_name !== 'string'
  ) {
    throw new Error('No stable release was returned.');
  }
  const comparison = compareVersions(release.tag_name, current);
  if (comparison === null) throw new Error('The release version could not be compared.');
  return {
    version: release.tag_name.replace(/^v/, ''),
    // Construct a trusted repository URL; do not open arbitrary URLs from an API response.
    url: `${RELEASES_URL}/tag/${encodeURIComponent(release.tag_name)}`,
    available: comparison > 0,
    installer: findInstaller(release.assets, release.tag_name),
  };
}
