import sharp from 'sharp';
import { latexFormulas } from '../shared/latex-copy';

/** Pixels per em in the image: a little larger than body text, sharp at 2× for slides. */
const EM_PX = 20;
/** Margin around the formula, in MathJax units (thousandths of an em). */
const MARGIN = 200;
export const MAX_IMAGE_LATEX = 20_000;
export const RENDER_ERROR =
  'This LaTeX cannot be turned into an image. Check the source for errors.';

let convert: Promise<(latex: string) => string> | undefined;

// MathJax (about 2.5 MB of code) is loaded on first use, not at every start.
function converter(): Promise<(latex: string) => string> {
  convert ??= createConverter().catch((error: unknown) => {
    convert = undefined;
    throw error;
  });
  return convert;
}

async function createConverter(): Promise<(latex: string) => string> {
  const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }, { AllPackages }] =
    await Promise.all([
      import('mathjax-full/js/mathjax.js'),
      import('mathjax-full/js/input/tex.js'),
      import('mathjax-full/js/output/svg.js'),
      import('mathjax-full/js/adaptors/liteAdaptor.js'),
      import('mathjax-full/js/handlers/html.js'),
      import('mathjax-full/js/input/tex/AllPackages.js'),
    ]);
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const tex = new TeX({
    // No packages that load code on demand, and unknown commands are errors, not red text.
    packages: AllPackages.filter((name) => !['autoload', 'require', 'noundefined'].includes(name)),
    formatError: (_jax: unknown, error: Error) => {
      throw error;
    },
  });
  // Glyphs as paths, so the file looks the same without MathJax fonts installed.
  const document = mathjax.document('', {
    InputJax: tex,
    OutputJax: new SVG({ fontCache: 'none' }),
  });
  return (latex) => adaptor.innerHTML(document.convert(latex, { display: true }));
}

/** A standalone SVG of the formula(s): black glyphs, pixel size, small margin. */
export async function formulaSvg(latex: string): Promise<string> {
  if (typeof latex !== 'string' || latex.length > MAX_IMAGE_LATEX) throw new Error(RENDER_ERROR);
  const formulas = latexFormulas(latex);
  if (!formulas.length) throw new Error(RENDER_ERROR);
  const source =
    formulas.length === 1
      ? formulas[0]
      : `\\begin{gathered}${formulas.join('\\\\')}\\end{gathered}`;
  const render = await converter();
  let svg: string;
  try {
    svg = render(source);
  } catch {
    throw new Error(RENDER_ERROR);
  }
  const box = /viewBox="([^"]+)"/.exec(svg)?.[1].split(/\s+/).map(Number);
  if (!box || box.length !== 4 || box.some((value) => !Number.isFinite(value))) {
    throw new Error(RENDER_ERROR);
  }
  const [x, y, width, height] = [
    box[0] - MARGIN,
    box[1] - MARGIN,
    box[2] + 2 * MARGIN,
    box[3] + 2 * MARGIN,
  ];
  const px = (units: number) => `${((units / 1000) * EM_PX).toFixed(2)}px`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n${svg
    .replace(/ style="[^"]*"/, '')
    .replace(/ width="[^"]*"/, ` width="${px(width)}"`)
    .replace(/ height="[^"]*"/, ` height="${px(height)}"`)
    .replace(/viewBox="[^"]*"/, `viewBox="${x} ${y} ${width} ${height}"`)
    .replace(/currentColor/g, '#000000')}\n`;
}

/** A PNG on white (readable in dark chat themes too), rendered at `scale`× pixel density. */
export async function formulaPng(latex: string, scale = 2): Promise<Buffer> {
  return sharp(Buffer.from(await formulaSvg(latex)), { density: 96 * scale })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();
}
