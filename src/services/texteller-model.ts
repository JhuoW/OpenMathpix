import type { ModelSource } from '../shared/types';
import { MODEL_HOSTS, type ModelFile } from './mfr-model';

// TexTeller 3.0 (OleehyO/TexTeller, Apache-2.0) in the int8 ONNX export published by
// onnx-community. Its base model's model.safetensors is byte-identical to the official
// OleehyO/TexTeller weights (SHA-256 6d535b29f94de294f6d82cb777285379480672cbe396bbd645840eda56b2c407).
// Every file is pinned by revision, size and SHA-256, so a mirror cannot change what is installed.
export const TEXTELLER_REPOSITORY = 'onnx-community/TexTeller3-ONNX';
export const TEXTELLER_REVISION = 'ed90c6164810242882ca90863bb85697a76f4841';
export const TEXTELLER_DOWNLOAD_PAGE = `https://huggingface.co/${TEXTELLER_REPOSITORY}/tree/${TEXTELLER_REVISION}`;
export const TEXTELLER_FILES: readonly ModelFile[] = [
  {
    name: 'encoder_model_int8.onnx',
    remotePath: 'onnx/encoder_model_int8.onnx',
    size: 88188694,
    sha256: '4b478e6dbc05b83615e1760b625b20a42648c36ace766682a247dacba8ceab27',
  },
  {
    name: 'decoder_model_merged_int8.onnx',
    remotePath: 'onnx/decoder_model_merged_int8.onnx',
    size: 229140257,
    sha256: '1e26574671fdbff033c1e213b23a4ad2f9afef24e1b227709fd6daf3ccd67aa1',
  },
  {
    name: 'config.json',
    size: 4667,
    sha256: 'd94417e62061a944f002c9d838ef5428df99fca2b8b54b089e30a1d5964cab65',
  },
  {
    name: 'generation_config.json',
    size: 132,
    sha256: '6bf3790b65ff35b3f2e745c4ea71d236e3a44e23af5fb6ed3003a814871b22f1',
  },
  {
    name: 'preprocessor_config.json',
    size: 352,
    sha256: '9e30687f05b936e9f74915206a5425d0a19517910514bca7b348e619d7ec9349',
  },
  {
    name: 'tokenizer.json',
    size: 1370259,
    sha256: 'ec4ca954798a092faf6fefcfa47fb5f85d76cdf6ab170b624ae1a683d53dae14',
  },
];

export function textellerFileUrl(file: ModelFile, source: ModelSource = 'huggingface'): string {
  const known = TEXTELLER_FILES.find((item) => item.name === file.name);
  if (!known) throw new Error('Unknown TexTeller model file.');
  return `${MODEL_HOSTS[source]}/${TEXTELLER_REPOSITORY}/resolve/${TEXTELLER_REVISION}/${known.remotePath ?? known.name}?download=true`;
}
