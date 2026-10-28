const { access, readdir, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { Arch } = require('builder-util');

// onnxruntime-node ships binaries for every OS/architecture. Keep only this build's
// native libraries in the generated package, never touching development modules.
module.exports = async function afterPack(context) {
  const platform = context.electronPlatformName;
  const resources =
    platform === 'darwin'
      ? join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources',
        )
      : join(context.appOutDir, 'resources');
  const root = join(
    resources,
    'app.asar.unpacked',
    'node_modules',
    'onnxruntime-node',
    'bin',
    'napi-v6',
  );
  const targetArch = Arch[context.arch];
  try {
    await access(join(root, platform, targetArch, 'onnxruntime_binding.node'));
  } catch {
    throw new Error(
      `MFR native runtime is unavailable for ${platform}/${targetArch}. Install dependencies for a supported target; this ONNX Runtime release does not ship an Intel Mac binding.`,
    );
  }
  for (const entry of await readdir(root)) {
    if (entry !== platform) await rm(join(root, entry), { recursive: true, force: true });
    else
      for (const arch of await readdir(join(root, entry))) {
        if (arch !== targetArch)
          await rm(join(root, entry, arch), { recursive: true, force: true });
      }
  }
};
