import { randomUUID } from 'node:crypto';
import { lstat, readdir, rename, rm } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

interface CacheIO {
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
}

const defaultIO: CacheIO = {
  rename,
  remove: (path) => rm(path, { recursive: true, force: true }),
};

export interface StagedModelCache {
  /** After commit begins, partially deleted files can no longer be rolled back. */
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

/** Refuse linked parents: deleting a revision link itself is safe, following its parent is not. */
async function managedParent(userData: string): Promise<string | undefined> {
  let current = userData;
  for (const name of ['', 'models', 'mfr-1.5']) {
    if (name) current = join(current, name);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error('The model cache parent is not a regular application directory.');
      }
    } catch (error) {
      if (missing(error)) return undefined;
      throw error;
    }
  }
  return current;
}

/** Only the app's fixed cache revision and our own interrupted-cleanup directories are touched. */
export async function stageModelCacheRemoval(
  userData: string,
  revision: string,
  io: CacheIO = defaultIO,
): Promise<StagedModelCache> {
  if (!isAbsolute(userData) || !/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error('Invalid application model cache location.');
  }
  const parent = await managedParent(userData);
  if (!parent) return { async commit() {}, async rollback() {} };
  const target = join(parent, revision);
  const cleanupPattern = new RegExp(
    `^\\.${revision}\\.clearing-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`,
  );
  const oldRemnants = (await readdir(parent))
    .filter((name) => cleanupPattern.test(name))
    .map((name) => join(parent, name));
  let staged: string | undefined;
  try {
    // lstat deliberately includes dangling symlinks; rename/rm act on the link itself.
    await lstat(target);
    staged = join(parent, `.${revision}.clearing-${randomUUID()}`);
    await io.rename(target, staged);
  } catch (error) {
    if (!missing(error)) throw error;
    staged = undefined;
  }
  let finished = false;
  return {
    async commit() {
      if (finished) return;
      finished = true;
      const remaining: string[] = [];
      for (const path of [...oldRemnants, ...(staged ? [staged] : [])]) {
        try {
          if ((await managedParent(userData)) !== parent) {
            throw new Error('The model cache directory changed during cleanup.');
          }
          await io.remove(path);
        } catch {
          remaining.push(path);
        }
      }
      if (remaining.length) {
        throw new Error(
          `The model is disabled, but some cached files could not be removed. Remaining cache: ${remaining.join(', ')}. Close programs using these files and retry Clear Model Cache.`,
        );
      }
    },
    async rollback() {
      if (finished) return;
      if (staged) {
        if ((await managedParent(userData)) !== parent) {
          throw new Error('The model cache directory changed before cleanup could be cancelled.');
        }
        await io.rename(staged, target);
      }
      finished = true;
    },
  };
}
