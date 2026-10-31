/** Shared character collection and build-time verification; no Python is needed to check. */
import { createHash } from 'node:crypto';
import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const codepointName = value => `U+${value.toString(16).toUpperCase().padStart(4, '0')}`;

export function collectFontCharacters(projectRoot = root, spec = json(resolve(projectRoot, 'scripts/room/font-inputs.json'))) {
  const expand = patterns => [...new Set(patterns.flatMap(pattern => {
    const files = [...globSync(pattern, { cwd: projectRoot })];
    if (!files.length && !['*', '?', '{', '['].some(char => pattern.includes(char))) throw new Error(`Missing font text source: ${pattern}`);
    return files.map(path => path.replaceAll('\\', '/'));
  }))].sort();
  const sources = expand(spec.sources), frontMatter = expand(spec.frontMatter), required = new Set(spec.extraCodepoints);
  for (let cp = spec.baseRange[0]; cp <= spec.baseRange[1]; cp++) required.add(cp);
  const add = text => { for (const char of text) if (!/\p{C}/u.test(char)) required.add(char.codePointAt(0)); };
  for (const file of sources) add(readFileSync(resolve(projectRoot, file), 'utf8'));
  for (const file of frontMatter) {
    const text = readFileSync(resolve(projectRoot, file), 'utf8');
    const front = text.match(/^---\s*\r?\n([\s\S]*?)^---\s*$/m);
    if (!front) throw new Error(`Missing article front matter: ${file}`);
    add(front[1]);
  }
  const allowedFallbacks = spec.systemFallbacks.map(item => {
    if ([...item.character].length !== 1 || item.character.codePointAt(0) !== item.codepoint || !item.reason) {
      throw new Error('Each system font fallback needs a matching codepoint, character and reason');
    }
    return item.codepoint;
  });
  return { requestedCodepoints: [...required].sort((a, b) => a - b), sourceFiles: [...new Set([...sources, ...frontMatter])].sort(), allowedFallbacks };
}

export function verifyFontCoverage(requested, coverage, fontBytes, expectedSourceHash, allowedFallbacks = []) {
  if (digest(fontBytes) !== coverage.subsetSha256 || fontBytes.length !== coverage.subsetBytes) {
    throw new Error('Pixel font bytes do not match room-pixel-zh.coverage.json; regenerate the font and its coverage report together.');
  }
  if (coverage.sourceSha256 !== expectedSourceHash) throw new Error('Pixel font was not generated from the pinned source font.');
  const values = coverage.unicodeCodepoints.map(value => {
    if (!/^U\+[0-9A-F]{4,6}$/u.test(value)) throw new Error(`Invalid font coverage codepoint: ${value}`);
    return Number.parseInt(value.slice(2), 16);
  });
  const covered = new Set(values), fallback = new Set(allowedFallbacks);
  if (covered.size !== values.length || covered.size !== coverage.supportedCodepoints) throw new Error('Pixel font coverage count is inconsistent.');
  const missing = requested.filter(cp => !covered.has(cp) && !fallback.has(cp));
  if (missing.length) throw new Error(`Pixel font is missing ${missing.length} character(s): ${missing.map(cp => `${String.fromCodePoint(cp)} (${codepointName(cp)})`).join(', ')}`);
  return { requestedCodepoints: requested.length, coveredCodepoints: requested.filter(cp => covered.has(cp)).length, systemFallbackCharacters: requested.filter(cp => !covered.has(cp) && fallback.has(cp)).map(cp => String.fromCodePoint(cp)).join(''), fontSha256: coverage.subsetSha256 };
}

export function checkFontCoverage(projectRoot = root) {
  const request = collectFontCharacters(projectRoot), metadata = json(resolve(projectRoot, 'scripts/room/font-source.json'));
  const fontPath = resolve(projectRoot, metadata.publicSubset), coverage = json(resolve(projectRoot, 'public/fonts/room-pixel-zh.coverage.json'));
  return verifyFontCoverage(request.requestedCodepoints, coverage, readFileSync(fontPath), metadata.faceSha256, request.allowedFallbacks);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const mode = process.argv[2] ?? '--check';
    if (!['--check', '--characters'].includes(mode)) throw new Error('Usage: node scripts/room/font-coverage.mjs [--check|--characters]');
    console.log(JSON.stringify(mode === '--characters' ? collectFontCharacters() : checkFontCoverage(), null, 2));
  } catch (error) {
    console.error(error.message);
    console.error('Regenerate using an existing Python/fontTools environment: npm run font:generate -- --fonttools-path /path/to/existing/site-packages');
    console.error('Alternatively run scripts/room/subset-font.py with your chosen Python. No package installation is performed automatically.');
    process.exitCode = 1;
  }
}
