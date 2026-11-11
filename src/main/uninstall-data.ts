import { cleanupAppData, assertModelsOutsideInstallDirectory } from './app-data-cleanup';

// Run only as a standalone cleanup helper, never through the application's normal entry.
// The NSIS uninstaller supplies the current user's exact profile after explicit consent.
const checking = process.argv[2] === '--check-keep-data';
const profile = process.argv[checking ? 3 : 2];
const validArguments = checking
  ? process.argv.length === 5 && !!process.argv[4]
  : process.argv.length === 3;
if (process.env.ELECTRON_RUN_AS_NODE !== '1' || !profile || !validArguments) {
  console.error('OpenMathpix data cleanup requires the uninstaller and an explicit profile.');
  process.exitCode = 1;
} else {
  void (
    checking
      ? assertModelsOutsideInstallDirectory(profile, process.argv[4])
      : cleanupAppData(profile)
  ).catch((error) => {
    console.error(error instanceof Error ? error.message : 'Could not remove application data.');
    process.exitCode = 1;
  });
}
