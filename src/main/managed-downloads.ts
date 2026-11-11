import { randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { MFR_FILES } from '../services/mfr-model';
import { TEXTELLER_FILES } from '../services/texteller-model';

export const DOWNLOAD_LEDGER = 'managed-downloads.json';
export const DOWNLOAD_MARKER = '.openmathpix-managed-model.json';
const APP_ID = 'com.openmathpix.app';
const REVISION = /^[a-f0-9]{40}$/;
const CLEARING = /^\.[a-f0-9]{40}\.clearing-[a-f0-9-]{36}$/;
const TOKEN = /^[a-f0-9-]{36}$/;
const MODEL_NAMES = {
  'mfr-1.5': new Set(MFR_FILES.flatMap(({ name }) => [name, `${name}.part`])),
  texteller: new Set(TEXTELLER_FILES.flatMap(({ name }) => [name, `${name}.part`])),
};

function modelNames(directory: string): Set<string> {
  return MODEL_NAMES[basename(dirname(directory)) as keyof typeof MODEL_NAMES];
}

interface DownloadEntry {
  directory: string;
  token: string;
}
interface DownloadLedger {
  version: 1;
  legacyMigrated?: boolean;
  downloads: DownloadEntry[];
}

const writes = new Map<string, Promise<unknown>>();
function serialize<T>(profile: string, operation: () => Promise<T>): Promise<T> {
  const key = resolve(profile).toLowerCase();
  const task = (writes.get(key) || Promise.resolve()).then(operation);
  const settled = task.catch(() => {});
  writes.set(key, settled);
  void settled.then(() => {
    if (writes.get(key) === settled) writes.delete(key);
  });
  return task;
}

function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

/** Reject every linked ancestor, including a junction above the selected storage root. */
export async function regularDirectory(directory: string): Promise<boolean> {
  if (!isAbsolute(directory)) throw new Error('The application data path must be absolute.');
  const absolute = resolve(directory);
  const root = parse(absolute).root;
  try {
    await lstat(root);
  } catch {
    throw new Error(`Model storage is unavailable. Reconnect the drive and retry: ${root}`);
  }
  let current = root;
  for (const segment of relative(root, absolute).split(sep).filter(Boolean)) {
    current = join(current, segment);
    try {
      const info = await lstat(current);
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error(`Refusing to follow a linked or non-directory data path: ${current}`);
      }
    } catch (error) {
      if (missing(error)) return false;
      throw error;
    }
  }
  return true;
}

export function isManagedModelLayout(directory: string): boolean {
  if (!isAbsolute(directory)) return false;
  const normalized = resolve(directory);
  return (
    (REVISION.test(basename(normalized)) || CLEARING.test(basename(normalized))) &&
    Object.hasOwn(MODEL_NAMES, basename(dirname(normalized))) &&
    basename(dirname(dirname(normalized))) === 'models'
  );
}

async function readLedger(profile: string): Promise<DownloadLedger> {
  try {
    if (!(await regularDirectory(profile))) return { version: 1, downloads: [] };
    const file = join(profile, DOWNLOAD_LEDGER);
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error('Invalid model download registry.');
    const value = JSON.parse(await readFile(file, 'utf8')) as DownloadLedger;
    if (
      value.version !== 1 ||
      (value.legacyMigrated !== undefined && typeof value.legacyMigrated !== 'boolean') ||
      !Array.isArray(value.downloads) ||
      value.downloads.some(
        (entry) =>
          !entry ||
          typeof entry.directory !== 'string' ||
          !isAbsolute(entry.directory) ||
          typeof entry.token !== 'string' ||
          !TOKEN.test(entry.token),
      )
    ) {
      throw new Error('Invalid model download registry.');
    }
    // A model this version no longer knows (e.g. a removed engine) is not ours to delete;
    // ignore it instead of making every model unusable.
    return {
      ...value,
      downloads: value.downloads.filter((entry) => isManagedModelLayout(entry.directory)),
    };
  } catch (error) {
    if (missing(error)) return { version: 1, downloads: [] };
    throw new Error(`Could not read the model download registry: ${(error as Error).message}`);
  }
}

async function writeLedger(profile: string, ledger: DownloadLedger): Promise<void> {
  await regularDirectory(profile);
  await mkdir(profile, { recursive: true });
  const temporary = join(profile, `.${DOWNLOAD_LEDGER}-${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(ledger, null, 2), { flag: 'wx' });
  try {
    await rename(temporary, join(profile, DOWNLOAD_LEDGER));
  } finally {
    await unlink(temporary).catch((error) => {
      if (!missing(error)) throw error;
    });
  }
}

async function readMarker(directory: string): Promise<string | undefined> {
  try {
    const file = join(directory, DOWNLOAD_MARKER);
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Invalid model ownership marker.');
    const marker = JSON.parse(await readFile(file, 'utf8'));
    if (marker.appId !== APP_ID || marker.version !== 1 || !TOKEN.test(marker.token)) {
      throw new Error('Invalid model ownership marker.');
    }
    return marker.token as string;
  } catch (error) {
    if (missing(error)) return undefined;
    throw error;
  }
}

/** Record before downloading, so interrupted and older download locations stay discoverable. */
export function registerManagedDownload(profile: string, directory: string): Promise<void> {
  return serialize(profile, async () => {
    if (!isManagedModelLayout(directory)) throw new Error('Invalid managed model directory.');
    const target = resolve(directory);
    await regularDirectory(target);
    const ledger = await readLedger(profile);
    await mkdir(target, { recursive: true });
    const token = (await readMarker(target)) || randomUUID();
    await writeFile(
      join(target, DOWNLOAD_MARKER),
      JSON.stringify({ version: 1, appId: APP_ID, token }),
    );
    const previous = ledger.downloads.find((entry) => resolve(entry.directory) === target);
    if (previous) previous.token = token;
    else ledger.downloads.push({ directory: target, token });
    await writeLedger(profile, ledger);
  });
}

/** Migrate only the app's known cache layout, never an arbitrary imported-model folder. */
export async function adoptLegacyManagedDownloads(
  profile: string,
  settings: {
    downloadRoot?: string;
    modelPath?: string;
    textellerDownloadRoot?: string;
    textellerModelPath?: string;
  } = {},
): Promise<void> {
  // Migration is one-time. After the registry exists, only actual download starts
  // may add ownership; a later imported folder must not be claimed by its name.
  await regularDirectory(profile);
  try {
    await lstat(join(profile, DOWNLOAD_LEDGER));
    if ((await readLedger(profile)).legacyMigrated) return;
  } catch (error) {
    if (!missing(error)) throw error;
  }
  const roots = new Set([
    profile,
    ...[settings.downloadRoot, settings.textellerDownloadRoot].filter(
      (root): root is string => !!root,
    ),
  ]);
  for (const modelPath of [settings.modelPath, settings.textellerModelPath]) {
    if (modelPath && isManagedModelLayout(modelPath)) {
      roots.add(dirname(dirname(dirname(resolve(modelPath)))));
    }
  }
  for (const root of roots) {
    for (const model of Object.keys(MODEL_NAMES)) {
      const parent = join(root, 'models', model);
      if (!(await regularDirectory(parent))) continue;
      for (const name of await readdir(parent)) {
        const directory = join(parent, name);
        if (!isManagedModelLayout(directory) || !(await regularDirectory(directory))) continue;
        const names = await readdir(directory);
        if (!names.some((file) => modelNames(directory).has(file) || file === DOWNLOAD_MARKER))
          continue;
        await registerManagedDownload(profile, directory);
      }
    }
  }
  // Also mark clean/new profiles as migrated so future imports remain external.
  await serialize(profile, async () => {
    const ledger = await readLedger(profile);
    await writeLedger(profile, { ...ledger, legacyMigrated: true });
  });
}

export async function managedDownloadDirectories(profile: string): Promise<string[]> {
  return (await readLedger(profile)).downloads.map((entry) => entry.directory);
}

export async function isManagedDownload(profile: string, directory: string): Promise<boolean> {
  if (!isManagedModelLayout(directory)) return false;
  const ledger = await readLedger(profile);
  const entry = ledger.downloads.find((item) => resolve(item.directory) === resolve(directory));
  if (!entry) return false;
  if (!(await regularDirectory(directory))) return true; // A missing download remains repairable.
  return (await readMarker(directory)) === entry.token;
}

interface RemovalTarget {
  entry: DownloadEntry;
  files: string[];
  completed?: boolean;
}

async function validateTarget(entry: DownloadEntry): Promise<RemovalTarget> {
  if (!isManagedModelLayout(entry.directory)) throw new Error('Invalid model removal target.');
  if (!(await regularDirectory(entry.directory))) return { entry, files: [], completed: true };
  const names = await readdir(entry.directory);
  const token = await readMarker(entry.directory);
  // A previous cleanup can finish files/marker deletion before the registry write fails.
  if (!token && !names.some((name) => modelNames(entry.directory).has(name)))
    return { entry, files: [], completed: true };
  if (token !== entry.token) {
    throw new Error(
      `Model ownership could not be verified. No files were removed: ${entry.directory}`,
    );
  }
  const files = names.filter((name) => modelNames(entry.directory).has(name));
  for (const name of files) {
    const info = await lstat(join(entry.directory, name));
    if (!info.isFile() && !info.isSymbolicLink()) {
      throw new Error(`A model file was replaced with a directory: ${join(entry.directory, name)}`);
    }
  }
  return { entry, files };
}

async function removeTarget({ entry, files, completed }: RemovalTarget): Promise<void> {
  if (completed) return;
  if (!(await regularDirectory(entry.directory))) return;
  if ((await readMarker(entry.directory)) !== entry.token)
    throw new Error('Model ownership changed during removal.');
  for (const name of files) {
    await regularDirectory(entry.directory);
    await unlink(join(entry.directory, name)).catch((error) => {
      if (!missing(error)) throw error;
    });
  }
  await unlink(join(entry.directory, DOWNLOAD_MARKER));
  // Remove empty application-created folders only. User files and the chosen storage root stay.
  for (const directory of [
    entry.directory,
    dirname(entry.directory),
    dirname(dirname(entry.directory)),
  ]) {
    await rmdir(directory).catch((error) => {
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes((error as NodeJS.ErrnoException).code || ''))
        throw error;
    });
  }
}

export function removeManagedDownload(profile: string, directory: string): Promise<void> {
  return serialize(profile, async () => {
    const ledger = await readLedger(profile);
    const entry = ledger.downloads.find((item) => resolve(item.directory) === resolve(directory));
    if (!entry) throw new Error('The selected model is not managed by OpenMathpix.');
    const target = await validateTarget(entry);
    await removeTarget(target);
    ledger.downloads = ledger.downloads.filter((item) => item !== entry);
    await writeLedger(profile, ledger);
  });
}

/** Validate every registered destination before deleting any model, then remove only owned files. */
export function removeAllManagedDownloads(profile: string): Promise<void> {
  return serialize(profile, async () => {
    const ledger = await readLedger(profile);
    const targets = await Promise.all(ledger.downloads.map(validateTarget));
    for (const target of targets) await removeTarget(target);
    await writeLedger(profile, { ...ledger, downloads: [] });
  });
}
