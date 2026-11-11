import { IPC } from '../shared/types';
import { MFR_FILES, MFR_REVISION, mfrFileUrl } from '../services/mfr-model';
import { TEXTELLER_FILES, TEXTELLER_REVISION, textellerFileUrl } from '../services/texteller-model';
import { createLocalModel } from './local-model';
export type { PreparedMfrModel, PreparedClearMfrModel } from './local-model';

export const localModels = {
  mfr: createLocalModel({
    engine: 'mfr',
    folder: 'mfr-1.5',
    label: 'MFR-1.5',
    revision: MFR_REVISION,
    files: MFR_FILES,
    channel: IPC.MFR_STATUS,
    fileUrl: mfrFileUrl,
  }),
  texteller: createLocalModel({
    engine: 'texteller',
    folder: 'texteller',
    label: 'TexTeller',
    revision: TEXTELLER_REVISION,
    files: TEXTELLER_FILES,
    channel: IPC.TEXTELLER_STATUS,
    fileUrl: textellerFileUrl,
    downloadGuide:
      'You can also download the six model files from Hugging Face and use Import Existing Model.',
  }),
};
// Keep the established MFR API available to existing callers and integrations.
export const getMfrStatus = localModels.mfr.getStatus;
export const prepareMfrModel = localModels.mfr.prepare;
export const prepareClearMfrModel = localModels.mfr.prepareClear;
export const downloadMfrModel = localModels.mfr.download;
export const recognizeMfr = localModels.mfr.recognize;
export const mfrDownloadDirectory = localModels.mfr.downloadDirectory;
export const getTextellerStatus = localModels.texteller.getStatus;
export const warmMfr = async () => {
  await Promise.all(Object.values(localModels).map((model) => model.warm()));
};
/**
 * Only the selected engine keeps a model loaded. Called after every settings change, so
 * switching engines frees the previous model at once instead of after its idle timeout.
 */
export const releaseUnusedModels = (selected: string) => {
  for (const [engine, model] of Object.entries(localModels))
    if (engine !== selected) model.release();
};
export const disposeMfr = () => {
  for (const model of Object.values(localModels)) model.dispose();
};
