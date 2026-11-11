# Third-party notices

## Pix2Text MFR-1.5

Author: BreezeDeus / Pix2Text.
Model: https://huggingface.co/breezedeus/pix2text-mfr-1.5
Pinned revision: `1cef9f0bdcd6a4c63df7de1311fb0894593340cc`.
The model card declares the weights MIT licensed. Weights are downloaded separately
from the official repository and verified against SHA-256 hashes.
Pix2Text source: https://github.com/breezedeus/Pix2Text
License source: https://raw.githubusercontent.com/breezedeus/Pix2Text/main/LICENSE

MIT License

Copyright (c) 2022 BreezeDeus

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Native inference dependencies

ONNX Runtime is Copyright Microsoft Corporation, MIT licensed:
https://github.com/microsoft/onnxruntime

Sharp is Copyright Lovell Fuller and contributors, Apache-2.0 licensed:
https://github.com/lovell/sharp

The packaged dependencies retain their own license files, including libvips and
other transitive libraries. No PyTorch, Python runtime, or CUDA libraries are required
for the local CPU engine.

## TexTeller

Author: OleehyO and the TexTeller contributors.
Source: https://github.com/OleehyO/TexTeller
Model: https://huggingface.co/OleehyO/TexTeller (TexTeller 3.0)
ONNX files: https://huggingface.co/onnx-community/TexTeller3-ONNX, pinned revision
`ed90c6164810242882ca90863bb85697a76f4841` (int8 quantized export of the official weights).
Weights are downloaded separately and verified against SHA-256 hashes before use.

Copyright OleehyO and the TexTeller contributors.

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed
under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
CONDITIONS OF ANY KIND, either express or implied. See the License for the
specific language governing permissions and limitations under the License.

The TexTeller image preprocessing (border trimming, resizing, normalization and
padding) and output style clean-up in `src/services/texteller-engine.ts` are a
TypeScript adaptation of `texteller/utils/image.py` and `texteller/utils/latex.py`.
Changes: rewritten for Node.js with sharp and ONNX Runtime; display delimiters are
removed and `split` is converted to `aligned` for inline use.

## MathJax

Source: https://github.com/mathjax/MathJax-src (package `mathjax-full` 3.2.2)
Copyright (c) 2009-2022 The MathJax Consortium.

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed
under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
CONDITIONS OF ANY KIND, either express or implied. See the License for the
specific language governing permissions and limitations under the License.

MathJax renders formulas to SVG for **Copy Image** and **Save Image**; it is bundled unmodified.
