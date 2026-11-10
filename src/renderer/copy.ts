import type { LatexCopyStyle, OCRResult, OutputFormat } from '../shared/types';
import { copyTextFor } from '../shared/latex-copy';
import { latexToMathML } from './mathml';
import { useAppStore } from './store';

/** Clipboard text for a result in the given format, using the saved LaTeX copy style. */
export function clipboardText(
  result: Pick<OCRResult, 'latex' | 'markdown' | 'text'>,
  format: OutputFormat,
  style: LatexCopyStyle = useAppStore.getState().settings?.latexCopyStyle ?? 'plain',
): string {
  return copyTextFor(result, format, style, latexToMathML);
}

/** Copy through the main process, which also works while the window is in the background. */
export async function copyToClipboard(text: string, toast = 'Copied!'): Promise<boolean> {
  const { showToast } = useAppStore.getState();
  try {
    await window.api.copyText(text);
    showToast(toast);
    return true;
  } catch {
    showToast('Could not copy. Please try again.');
    return false;
  }
}

/** Copy a result, falling back to plain LaTeX when a style cannot be produced. */
export async function copyResult(
  result: Pick<OCRResult, 'latex' | 'markdown' | 'text'>,
  format: OutputFormat,
  style?: LatexCopyStyle,
): Promise<void> {
  let text: string;
  try {
    text = clipboardText(result, format, style);
  } catch {
    text = clipboardText(result, format, 'plain');
    await copyToClipboard(text, 'Could not apply the copy style; copied plain LaTeX instead.');
    return;
  }
  await copyToClipboard(text);
}
