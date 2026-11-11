import { lstat, readFile, realpath, rm } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve, sep } from 'node:path';
import {
  adoptLegacyManagedDownloads,
  managedDownloadDirectories,
  regularDirectory,
  removeAllManagedDownloads,
} from './managed-downloads';

type StoredModelPaths = {
  mfrDownloadDirectory?: string;
  mfrModelPath?: string;
  textellerDownloadDirectory?: string;
  textellerModelPath?: string;
};

async function readModelPaths(profile: string): Promise<StoredModelPaths> {
  try {
    const file = join(profile, 'config.json');
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Invalid settings file.');
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return {};
  }
}

/** NSIS removes its whole install tree: block Keep/upgrade if that tree contains models. */
export async function assertModelsOutsideInstallDirectory(
  profile: string,
  installDir: string,
): Promise<void> {
  if (!isAbsolute(profile) || !isAbsolute(installDir))
    throw new Error('Expected absolute application paths.');
  if (!(await regularDirectory(profile))) return;
  const settings = await readModelPaths(profile);
  const candidates = [
    profile,
    settings.mfrModelPath,
    settings.textellerModelPath,
    settings.mfrDownloadDirectory && join(settings.mfrDownloadDirectory, 'models', 'mfr-1.5'),
    settings.textellerDownloadDirectory &&
      join(settings.textellerDownloadDirectory, 'models', 'texteller'),
    ...(await managedDownloadDirectories(profile)),
  ].filter((entry): entry is string => typeof entry === 'string' && !!entry);
  const installs = [resolve(installDir).toLowerCase(), (await realpath(installDir)).toLowerCase()];
  for (const candidate of candidates) {
    if (!isAbsolute(candidate)) throw new Error('Invalid saved model path.');
    let actual: string;
    try {
      actual = await realpath(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    const targets = [resolve(candidate).toLowerCase(), actual.toLowerCase()];
    if (
      !targets.some((target) =>
        installs.some((install) => target === install || target.startsWith(`${install}${sep}`)),
      )
    )
      continue;
    throw new Error(
      'A model or application profile is inside the installation folder. Move it outside that folder and update Settings before keeping data or upgrading.\n' +
        '模型或应用数据位于安装目录中。请先将其移到安装目录外，并在设置中更新路径，再保留数据卸载或升级。\n' +
        candidate,
    );
  }
}

/** Runs after the application exits and before the installer removes its executable. */
export async function cleanupAppData(profile: string): Promise<void> {
  if (!isAbsolute(profile) || basename(resolve(profile)).toLowerCase() !== 'openmathpix') {
    throw new Error('Refusing to remove a directory that is not the OpenMathpix profile.');
  }
  if (!(await regularDirectory(profile))) return;
  const settings = await readModelPaths(profile);
  await adoptLegacyManagedDownloads(profile, {
    downloadRoot: settings.mfrDownloadDirectory,
    modelPath: settings.mfrModelPath,
    textellerDownloadRoot: settings.textellerDownloadDirectory,
    textellerModelPath: settings.textellerModelPath,
  });
  await removeAllManagedDownloads(profile);
  await regularDirectory(profile);
  // Chromium caches, history, settings and encrypted API credentials all live here.
  // Node removes links themselves rather than following nested directory junctions.
  await rm(profile, { recursive: true, force: true });
}
