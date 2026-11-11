import { app, BrowserWindow, dialog, net, shell } from 'electron';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { IPC, type Language, type UpdateStatus } from '../shared/types';
import {
  LATEST_RELEASE_API,
  RELEASES_URL,
  parseChecksum,
  readLatestRelease,
  type InstallerAsset,
  type ReleaseCheck,
} from './release-version';

let checking = false;
let status: UpdateStatus = { state: 'idle' };
let release: ReleaseCheck | undefined;
let download: AbortController | undefined;
let installer: string | undefined;
let installOnQuit = false;
let lastProgress = 0;

/** Downloads are kept per user and removed by the uninstaller. */
export const updateFolder = () => join(app.getPath('temp'), 'openmathpix-update');

/**
 * Only an installed Windows copy replaces itself. Development runs and the portable build
 * (which runs from a temporary folder) open the release page instead.
 */
export const canInstallUpdates = () =>
  app.isPackaged && process.platform === 'win32' && !process.env.PORTABLE_EXECUTABLE_FILE;

/** Development runs may download (to test the flow) but never run an installer. */
const canDownloadUpdates = () => canInstallUpdates() || !app.isPackaged;

export const getUpdateStatus = (): UpdateStatus => ({ ...status });

function publish(next: UpdateStatus): void {
  status = next;
  for (const window of BrowserWindow.getAllWindows()) {
    try {
      if (window.isDestroyed()) continue;
      window.webContents.send(IPC.UPDATE_STATUS, status);
      if (window.webContents.getURL().includes('index.html')) {
        window.setProgressBar(
          next.state === 'downloading' && next.total > 0 ? next.received / next.total : -1,
        );
      }
    } catch {
      // A closing window reads the status again when it opens.
    }
  }
}

async function fetchChecksum(asset: InstallerAsset, signal: AbortSignal): Promise<string> {
  const response = await net.fetch(asset.checksumUrl, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 1024) throw new Error('The update checksum file is invalid.');
  const sha256 = parseChecksum(text, asset.name);
  if (asset.sha256 && asset.sha256 !== sha256) {
    throw new Error('The update checksum does not match GitHub’s record.');
  }
  return sha256;
}

/** Download the release's installer and verify its size and SHA-256 before offering it. */
export async function downloadUpdate(): Promise<void> {
  const asset = release?.installer;
  if (!release || !asset || download || status.state === 'ready') return;
  const version = release.version;
  const controller = new AbortController();
  download = controller;
  const folder = updateFolder();
  const target = join(folder, asset.name);
  const partial = `${target}.part`;
  publish({ state: 'downloading', version, received: 0, total: asset.size });
  try {
    await rm(folder, { recursive: true, force: true });
    await mkdir(folder, { recursive: true });
    const expected = await fetchChecksum(asset, controller.signal);
    // Abort a stalled transfer; a large installer on a slow line must still finish.
    let stall: ReturnType<typeof setTimeout> | undefined;
    const keepAlive = () => {
      clearTimeout(stall);
      stall = setTimeout(() => controller.abort(), 90_000);
    };
    keepAlive();
    try {
      const response = await net.fetch(asset.url, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok || !response.body) throw new Error(`GitHub HTTP ${response.status}`);
      const hash = createHash('sha256');
      let received = 0;
      const progress = new Transform({
        transform: (chunk: Buffer, _encoding, callback) => {
          keepAlive();
          received += chunk.length;
          if (received > asset.size)
            return callback(new Error('The update has an unexpected size.'));
          hash.update(chunk);
          if (Date.now() - lastProgress > 200) {
            lastProgress = Date.now();
            publish({ state: 'downloading', version, received, total: asset.size });
          }
          callback(null, chunk);
        },
      });
      await pipeline(
        Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
        progress,
        createWriteStream(partial),
        { signal: controller.signal },
      );
      if (received !== asset.size || hash.digest('hex') !== expected) {
        throw new Error('The downloaded update is incomplete or damaged. Please try again.');
      }
    } finally {
      clearTimeout(stall);
    }
    await rename(partial, target);
    installer = target;
    publish({ state: 'ready', version });
  } catch (error) {
    await rm(folder, { recursive: true, force: true }).catch(() => undefined);
    if (controller.signal.aborted && status.state === 'idle') return; // Cancelled by the user.
    publish({
      state: 'error',
      version,
      message: controller.signal.aborted
        ? 'The update download stalled. Check your connection and try again.'
        : error instanceof Error
          ? error.message
          : 'Could not download the update.',
    });
  } finally {
    download = undefined;
  }
}

export function cancelUpdate(): void {
  if (!download) return;
  publish({ state: 'idle' });
  download.abort();
}

/**
 * Quit, then run the verified installer as an upgrade: silent, keeps all data, and starts
 * OpenMathpix again when it finishes. It is launched from `will-quit`, after settings and
 * history are saved and the windows are closed, so no file is still in use.
 */
export function installUpdate(): { started: boolean; file?: string } {
  if (status.state !== 'ready' || !installer) return { started: false };
  if (!canInstallUpdates()) return { started: false, file: installer };
  installOnQuit = true;
  app.quit();
  return { started: true };
}

export function runPendingInstaller(): void {
  if (!installOnQuit || !installer) return;
  installOnQuit = false;
  try {
    spawn(installer, ['--updated', '/S', '--force-run'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    }).unref();
  } catch (error) {
    console.warn('Could not start the update installer:', error);
  }
}

/** User initiated check only. Repeated clicks share one bounded request and one result dialog. */
export async function checkForUpdates(parent: BrowserWindow, language: Language): Promise<void> {
  if (checking || parent.isDestroyed()) return;
  const zh = language === 'zh-CN';
  if (status.state === 'downloading') return; // The banner already shows the download.
  if (status.state === 'ready') {
    const { response } = await dialog.showMessageBox(parent, {
      type: 'info',
      title: zh ? '安装更新' : 'Install Update',
      message: zh
        ? `OpenMathpix ${status.version} 已下载`
        : `OpenMathpix ${status.version} is ready to install`,
      detail: zh
        ? 'OpenMathpix 将退出并完成安装，然后自动重新打开。设置、历史记录和模型都会保留。'
        : 'OpenMathpix will close, install the update and open again. Your settings, history and models are kept.',
      buttons: [zh ? '重启并安装' : 'Restart and Install', zh ? '稍后' : 'Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (response === 0) installUpdate();
    return;
  }
  checking = true;
  const current = app.getVersion();
  try {
    const response = await net.fetch(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `OpenMathpix/${current}` },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
    const latest = readLatestRelease(await response.json(), current);
    if (parent.isDestroyed()) return;
    const installable = latest.available && !!latest.installer && canDownloadUpdates();
    const sizeMb = latest.installer ? Math.round(latest.installer.size / 1_000_000) : 0;
    const { response: choice } = await dialog.showMessageBox(parent, {
      type: 'info',
      title: zh ? '检查更新' : 'Check for Updates',
      message: latest.available
        ? zh
          ? `OpenMathpix ${latest.version} 已发布`
          : `OpenMathpix ${latest.version} is available`
        : zh
          ? '当前已是最新版本'
          : 'OpenMathpix is up to date',
      detail: installable
        ? zh
          ? `当前版本：${current}。可以在应用内下载更新（约 ${sizeMb} MB），下载完成后重启即可安装；设置、历史记录和模型都会保留。`
          : `Current version: ${current}. Download the update here (about ${sizeMb} MB), then restart to install it. Your settings, history and models are kept.`
        : latest.available
          ? zh
            ? `当前版本：${current}。打开发布页面下载安装包，安装即可更新；设置和历史记录会保留。`
            : `Current version: ${current}. Open the release page to download and install the update. Your settings and history are preserved.`
          : zh
            ? `当前版本：${current}\n最新公开版本：${latest.version}`
            : `Current version: ${current}\nLatest public release: ${latest.version}`,
      buttons: installable
        ? [
            zh ? '下载更新' : 'Download Update',
            zh ? '查看更新说明' : 'Release Notes',
            zh ? '稍后' : 'Later',
          ]
        : latest.available
          ? [zh ? '打开下载页面' : 'Open Download Page', zh ? '稍后' : 'Later']
          : [zh ? '确定' : 'OK'],
      defaultId: 0,
      cancelId: installable ? 2 : latest.available ? 1 : 0,
      noLink: true,
    });
    if (installable) {
      release = latest;
      if (choice === 0) void downloadUpdate();
      if (choice === 1) await shell.openExternal(latest.url);
    } else if (latest.available && choice === 0) await shell.openExternal(latest.url);
  } catch {
    if (parent.isDestroyed()) return;
    const { response } = await dialog.showMessageBox(parent, {
      type: 'warning',
      title: zh ? '检查更新' : 'Check for Updates',
      message: zh ? '暂时无法检查更新' : 'Could not check for updates',
      detail: zh
        ? '请检查网络连接后重试。GitHub 可能暂时不可用或请求过于频繁，也可以在浏览器中查看发布页面。'
        : 'Check your connection and try again. GitHub may be unavailable or rate limiting requests. You can also view releases in your browser.',
      buttons: [zh ? '查看发布页面' : 'View Releases', zh ? '关闭' : 'Close'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (response === 0) await shell.openExternal(RELEASES_URL).catch(() => undefined);
  } finally {
    checking = false;
  }
}
