/**
 * Conservative, structure-aware cleanup for tokenized model LaTeX such as
 * `x = \frac { - b } { 2 a }`. Only transformations that keep the rendered
 * formula unchanged are applied; any input this parser does not fully
 * understand is returned unchanged.
 */

type Node =
  | { kind: 'word'; value: string }
  | { kind: 'symbol'; value: string }
  | { kind: 'char'; value: string }
  | { kind: 'group'; children: Node[] }
  | { kind: 'verbatim'; value: string }
  | { kind: 'env'; name: string; options: string; args: Node[][]; body: Node[] };

class ParseError extends Error {}

// Spaces inside text-mode arguments are significant and are preserved verbatim.
const TEXT_COMMANDS = new Set([
  '\\text',
  '\\textrm',
  '\\textit',
  '\\textbf',
  '\\textsf',
  '\\texttt',
  '\\textup',
  '\\textnormal',
  '\\textmd',
  '\\textsl',
  '\\mbox',
  '\\hbox',
  '\\tag',
  '\\label',
]);
const ENV_ARGUMENTS: Record<string, number> = {
  array: 1,
  subarray: 1,
  darray: 1,
  alignedat: 1,
  alignat: 1,
  'alignat*': 1,
};
const ENV_OPTIONS = new Set(['array', 'darray', 'aligned', 'gathered', 'alignedat']);
const ROW_PREFIXES = new Set(['\\hline', '\\hdashline']);
const LETTER = /[a-zA-Z]/;

class Parser {
  private index = 0;
  private readonly source: string;

  constructor(source: string) {
    this.source = source;
  }

  parse(): Node[] {
    return this.sequence();
  }

  private skipSpace(): void {
    while (this.index < this.source.length && /\s/.test(this.source[this.index])) this.index++;
  }

  private sequence(environment?: string, inGroup = false): Node[] {
    const nodes: Node[] = [];
    for (;;) {
      this.skipSpace();
      if (this.index >= this.source.length) {
        if (inGroup || environment) throw new ParseError('Unterminated group');
        return nodes;
      }
      const character = this.source[this.index];
      if (character === '}') {
        if (!inGroup) throw new ParseError('Unbalanced brace');
        this.index++;
        return nodes;
      }
      if (character === '{') {
        this.index++;
        nodes.push({ kind: 'group', children: this.sequence(undefined, true) });
        continue;
      }
      // Comments and parameters cannot be reformatted safely.
      if (character === '%' || character === '#') throw new ParseError('Unsupported syntax');
      if (character === '\\') {
        const command = this.command();
        if (command === '\\begin') {
          nodes.push(this.environment());
          continue;
        }
        if (command === '\\end') {
          if (this.name() !== environment) throw new ParseError('Mismatched environment');
          return nodes;
        }
        if (TEXT_COMMANDS.has(command)) {
          nodes.push(this.textCommand(command));
          continue;
        }
        nodes.push(
          /^\\[a-zA-Z]+$/.test(command)
            ? { kind: 'word', value: command }
            : { kind: 'symbol', value: /^\\\s$/.test(command) ? '\\ ' : command },
        );
        continue;
      }
      const value = String.fromCodePoint(this.source.codePointAt(this.index)!);
      this.index += value.length;
      nodes.push({ kind: 'char', value });
    }
  }

  private command(): string {
    const start = this.index++;
    if (this.index >= this.source.length) throw new ParseError('Trailing backslash');
    if (LETTER.test(this.source[this.index])) {
      while (this.index < this.source.length && LETTER.test(this.source[this.index])) this.index++;
    } else {
      this.index += String.fromCodePoint(this.source.codePointAt(this.index)!).length;
    }
    return this.source.slice(start, this.index);
  }

  private name(): string {
    this.skipSpace();
    if (this.source[this.index] !== '{') throw new ParseError('Missing environment name');
    const close = this.source.indexOf('}', this.index);
    if (close === -1) throw new ParseError('Unterminated environment name');
    const name = this.source.slice(this.index + 1, close).replace(/\s+/g, '');
    if (!/^[a-zA-Z]+\*?$/.test(name)) throw new ParseError('Invalid environment name');
    this.index = close + 1;
    return name;
  }

  private environment(): Node {
    const name = this.name();
    let options = '';
    if (ENV_OPTIONS.has(name) || /matrix\*$/.test(name)) {
      this.skipSpace();
      if (this.source[this.index] === '[') {
        const close = this.source.indexOf(']', this.index);
        if (close === -1) throw new ParseError('Unterminated option');
        options = `[${this.source.slice(this.index + 1, close).replace(/\s+/g, '')}]`;
        this.index = close + 1;
      }
    }
    const args: Node[][] = [];
    for (let count = 0; count < (ENV_ARGUMENTS[name] ?? 0); count++) {
      this.skipSpace();
      if (this.source[this.index] !== '{') throw new ParseError('Missing environment argument');
      this.index++;
      args.push(this.sequence(undefined, true));
    }
    return { kind: 'env', name, options, args, body: this.sequence(name) };
  }

  private textCommand(command: string): Node {
    const start = this.index;
    this.skipSpace();
    if (this.source[this.index] !== '{') {
      this.index = start;
      return { kind: 'word', value: command };
    }
    let depth = 0;
    for (let cursor = this.index; cursor < this.source.length; cursor++) {
      const character = this.source[cursor];
      if (character === '\\') {
        cursor++;
      } else if (character === '{') {
        depth++;
      } else if (character === '}' && --depth === 0) {
        const content = this.source.slice(this.index + 1, cursor);
        this.index = cursor + 1;
        return { kind: 'verbatim', value: `${command}{${content}}` };
      }
    }
    throw new ParseError('Unterminated text argument');
  }
}

const isRowBreak = (node: Node) => node.kind === 'symbol' && node.value === '\\\\';
const isCellBreak = (node: Node) => node.kind === 'char' && node.value === '&';
const isRowPrefix = (node: Node) => node.kind === 'word' && ROW_PREFIXES.has(node.value);

function split(nodes: Node[], separator: (node: Node) => boolean): Node[][] {
  const parts: Node[][] = [[]];
  for (const node of nodes) {
    if (separator(node)) parts.push([]);
    else parts[parts.length - 1].push(node);
  }
  return parts;
}

/** `{ a }` as a whole cell is the same as `a`: alignment templates group each cell. */
function unwrapCell(cell: Node[]): Node[] {
  let prefix = 0;
  while (prefix < cell.length && isRowPrefix(cell[prefix])) prefix++;
  const rest = cell.slice(prefix);
  if (rest.length !== 1 || rest[0].kind !== 'group') return cell;
  const children = rest[0].children;
  if (children.some((node) => isRowBreak(node) || isCellBreak(node))) return cell;
  return [...cell.slice(0, prefix), ...children];
}

function cleanEnvironmentBody(body: Node[]): Node[] {
  const rows = split(body, isRowBreak).map((row) =>
    split(row, isCellBreak).map((cell) => unwrapCell(cell)),
  );
  // A trailing `\\` before `\end{...}` only adds an empty row.
  if (rows.length > 1 && rows[rows.length - 1].every((cell) => cell.length === 0)) rows.pop();
  const result: Node[] = [];
  rows.forEach((row, rowIndex) => {
    if (rowIndex) result.push({ kind: 'symbol', value: '\\\\' });
    row.forEach((cell, cellIndex) => {
      if (cellIndex) result.push({ kind: 'char', value: '&' });
      result.push(...cell);
    });
  });
  return result;
}

const MATRIX_DELIMITERS: [string[], string[], string][] = [
  [['('], [')'], 'pmatrix'],
  [['['], [']'], 'bmatrix'],
  [['\\{', '\\lbrace'], ['\\}', '\\rbrace'], 'Bmatrix'],
  [['|', '\\vert', '\\lvert'], ['|', '\\vert', '\\rvert'], 'vmatrix'],
  [['\\|', '\\Vert', '\\lVert'], ['\\|', '\\Vert', '\\rVert'], 'Vmatrix'],
];

const delimiter = (node: Node | undefined): string | undefined =>
  node && node.kind !== 'group' && node.kind !== 'env' && node.kind !== 'verbatim'
    ? node.value
    : undefined;

/** `\left( \begin{matrix} … \end{matrix} \right)` is exactly `\begin{pmatrix} … \end{pmatrix}`. */
function convertDelimitedMatrices(nodes: Node[]): Node[] {
  const result: Node[] = [];
  for (let index = 0; index < nodes.length; index++) {
    const [left, open, matrix, right, close] = nodes.slice(index, index + 5);
    if (
      left?.kind === 'word' &&
      left.value === '\\left' &&
      matrix?.kind === 'env' &&
      matrix.name === 'matrix' &&
      right?.kind === 'word' &&
      right.value === '\\right'
    ) {
      const opening = delimiter(open);
      const closing = delimiter(close);
      const match = MATRIX_DELIMITERS.find(
        ([openers, closers]) =>
          opening !== undefined &&
          closing !== undefined &&
          openers.includes(opening) &&
          closers.includes(closing),
      );
      if (match) {
        result.push({ ...matrix, name: match[2] });
        index += 4;
        continue;
      }
    }
    result.push(nodes[index]);
  }
  return result;
}

function transform(nodes: Node[]): Node[] {
  return convertDelimitedMatrices(
    nodes.map((node): Node => {
      if (node.kind === 'group') {
        let children = node.children;
        // `{{x}}` is the same group as `{x}`.
        while (children.length === 1 && children[0].kind === 'group') {
          children = children[0].children;
        }
        return { kind: 'group', children: transform(children) };
      }
      if (node.kind === 'env') {
        return {
          ...node,
          args: node.args.map((arg) => transform(arg)),
          body: cleanEnvironmentBody(transform(node.body)),
        };
      }
      return node;
    }),
  );
}

interface Piece {
  text: string;
  padded: boolean;
}

function piece(node: Node): Piece {
  switch (node.kind) {
    case 'group':
      return { text: `{${serialize(node.children)}}`, padded: false };
    case 'env':
      return {
        text:
          `\\begin{${node.name}}${node.options}` +
          node.args.map((arg) => `{${serialize(arg)}}`).join('') +
          serialize(node.body) +
          `\\end{${node.name}}`,
        padded: false,
      };
    default:
      return { text: node.value, padded: isRowBreak(node) || isCellBreak(node) };
  }
}

function serialize(nodes: Node[]): string {
  let output = '';
  let padNext = false;
  for (const { text, padded } of nodes.map(piece)) {
    // A control word must stay separated from a following letter (`\pm b`, not `\pmb`);
    // digits are separated only for readability (`\to 0`).
    const needsSpace = /\\[a-zA-Z]+$/.test(output) && /^[a-zA-Z0-9]/.test(text);
    if (output && (padNext || padded || needsSpace)) output += ' ';
    output += text;
    padNext = padded;
  }
  return output;
}

export function cleanLatex(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return trimmed;
  try {
    const cleaned = serialize(transform(new Parser(trimmed).parse()));
    return cleaned || trimmed;
  } catch (error) {
    if (error instanceof ParseError) return trimmed;
    throw error;
  }
}
