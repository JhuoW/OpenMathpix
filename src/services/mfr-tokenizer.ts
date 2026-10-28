interface ByteLevelTokenizer {
  vocabularySize: number;
  decode(ids: readonly number[]): string;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('MFR tokenizer.json 格式不正确，请重新下载模型。');
  }
  return value as Record<string, unknown>;
}

// The ByteLevel alphabet preserves printable Latin-1 characters and maps every
// remaining byte to a Unicode character starting at U+0100 (the GPT-2 mapping).
// Decode bytes only after joining tokens: a UTF-8 character can span BPE tokens.
function byteAlphabet(): Map<string, number> {
  const visible = [
    ...Array.from({ length: 94 }, (_, i) => i + 33),
    ...Array.from({ length: 12 }, (_, i) => i + 161),
    ...Array.from({ length: 82 }, (_, i) => i + 174),
  ];
  const characters = new Map(visible.map((byte) => [String.fromCodePoint(byte), byte]));
  let extra = 256;
  for (let byte = 0; byte < 256; byte++) {
    if (!visible.includes(byte)) characters.set(String.fromCodePoint(extra++), byte);
  }
  return characters;
}

export function createByteLevelTokenizer(value: unknown): ByteLevelTokenizer {
  const tokenizer = object(value);
  const model = object(tokenizer.model);
  const decoder = object(tokenizer.decoder);
  if (model.type !== 'BPE' || decoder.type !== 'ByteLevel') {
    throw new Error('MFR 需要 ByteLevel BPE tokenizer，请重新下载官方 MFR-1.5 模型。');
  }
  const specialIds = new Set<number>();
  if (Array.isArray(tokenizer.added_tokens)) {
    for (const token of tokenizer.added_tokens) {
      const added = object(token);
      if (added.special === true && Number.isInteger(added.id)) {
        specialIds.add(added.id as number);
      }
    }
  }
  const alphabet = byteAlphabet();
  const tokens = new Map<number, Buffer>();
  for (const [token, value] of Object.entries(object(model.vocab))) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || tokens.has(value)) {
      throw new Error('MFR tokenizer 的词表 ID 无效，请重新下载模型。');
    }
    if (specialIds.has(value)) {
      tokens.set(value, Buffer.alloc(0));
      continue;
    }
    const bytes: number[] = [];
    for (const character of token) {
      const byte = alphabet.get(character);
      if (byte === undefined) throw new Error('MFR tokenizer 含有无效的 ByteLevel 字符。');
      bytes.push(byte);
    }
    tokens.set(value, Buffer.from(bytes));
  }
  if (tokens.size === 0) throw new Error('MFR tokenizer 词表为空，请重新下载模型。');
  return {
    vocabularySize: tokens.size,
    decode(ids) {
      const bytes = ids.map((id) => {
        const token = tokens.get(id);
        if (!token) throw new Error(`MFR 输出了无效的词表 ID：${id}。`);
        return token;
      });
      return Buffer.concat(bytes).toString('utf8');
    },
  };
}
