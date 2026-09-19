import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const tsPath = join(repoRoot, 'src', 'font', 'sl-font.ts');
const pyPath = join(repoRoot, 'public', 'python', 'sl_font.py');

function parseTsGlyphs(text) {
  const rawStart = text.indexOf('const RAW');
  const rawEnd = text.indexOf('};', rawStart);
  const block = text.slice(rawStart, rawEnd);
  const lines = block.split('\n');
  const glyphs = new Map();
  let current = null;
  let rows = [];
  const flush = () => {
    if (current !== null) glyphs.set(current, rows);
    current = null;
    rows = [];
  };
  for (const line of lines) {
    const header = line.match(/^\s*'((?:[^'\\]|\\.)*)'\s*:\s*\[\s*$/);
    const dheader = line.match(/^ {2}"(.)":\s*\[\s*$/);
    if (header || dheader) {
      flush();
      current = header ? unescapeTs(header[1]) : dheader[1];
      continue;
    }
    const row = line.match(/^\s*'((?:[^'\\]|\\.)*)'\s*,?\s*$/);
    if (row && current !== null) rows.push(unescapeTs(row[1]));
  }
  flush();
  return glyphs;
}

function unescapeTs(value) {
  return value.replace(/\\(.)/g, (_, c) => {
    const mapping = { n: '\n', t: '\t', r: '\r', 0: '\0' };
    return mapping[c] ?? c;
  });
}

function packRows(rows) {
  const width = rows[0].length;
  const bytes = [width];
  for (const row of rows) {
    let byte = 0;
    for (let dx = 0; dx < row.length; dx += 1) {
      if (row[dx] === 'x') byte |= 0x80 >> dx;
    }
    bytes.push(byte);
  }
  return bytes;
}

function parsePyGlyphs(text) {
  const glyphs = new Map();
  const entryRe = /^ {4}'((?:[^'\\]|\\.)*)': b"((?:\\x[0-9a-f]{2})+)",$/gm;
  let match;
  while ((match = entryRe.exec(text)) !== null) {
    const char = match[1]
      .replace(/\\u([0-9a-f]{4})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      )
      .replace(/\\(.)/g, (_, c) => {
        if (c === "'") return "'";
        if (c === '\\') return '\\';
        return c;
      });
    const bytes = [];
    const hexRe = /\\x([0-9a-f]{2})/g;
    let hexMatch;
    while ((hexMatch = hexRe.exec(match[2])) !== null) {
      bytes.push(parseInt(hexMatch[1], 16));
    }
    glyphs.set(char, bytes);
  }
  return glyphs;
}

function main() {
  const tsGlyphs = parseTsGlyphs(readFileSync(tsPath, 'utf8'));
  const pyGlyphs = parsePyGlyphs(readFileSync(pyPath, 'utf8'));

  const failures = [];
  if (tsGlyphs.size !== pyGlyphs.size) {
    failures.push(
      `glyph count: TS has ${tsGlyphs.size}, Python has ${pyGlyphs.size}`,
    );
  }
  for (const [char, rows] of tsGlyphs) {
    const expected = packRows(rows);
    const actual = pyGlyphs.get(char);
    if (!actual) {
      failures.push(`missing in Python: ${JSON.stringify(char)}`);
      continue;
    }
    const same =
      actual.length === expected.length &&
      actual.every((b, i) => b === expected[i]);
    if (!same) failures.push(`bit mismatch: ${JSON.stringify(char)}`);
  }
  for (const char of pyGlyphs.keys()) {
    if (!tsGlyphs.has(char)) failures.push(`extra in Python: ${JSON.stringify(char)}`);
  }

  if (failures.length > 0) {
    console.error('font parity FAILED:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    `font parity OK: ${tsGlyphs.size} glyphs, widths and bitmap bits match`,
  );
}

main();
