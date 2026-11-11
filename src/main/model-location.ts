import path from 'node:path';

/** Setup removes its installation tree during updates and uninstall, even when data is kept. */
export function assertModelOutsideInstallation(
  directory: string,
  installationDirectory: string,
): void {
  const target = path.resolve(directory);
  const root = path.resolve(installationDirectory);
  const difference = path.relative(root, target);
  if (
    !difference ||
    (!path.isAbsolute(difference) && difference !== '..' && !difference.startsWith(`..${path.sep}`))
  ) {
    throw new Error(
      'Choose a model folder outside the OpenMathpix installation folder so updates and uninstall can preserve it.',
    );
  }
}
