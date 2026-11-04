import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { collectFontCharacters, root, verifyFontCoverage } from './font-coverage.mjs';

test('one collector includes fixed UI and JSON without control characters', t => {
  const dir = mkdtempSync(join(tmpdir(), 'room-font-coverage-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'ui.ts'), "const title = '你好';\u0007\n");
  writeFileSync(join(dir, 'data.json'), JSON.stringify({ label: '文章' }));
  const result = collectFontCharacters(dir, { sources: ['ui.ts', '*.json'], baseRange: [32, 126], extraCodepoints: [160], systemFallbacks: [] });
  const chars = new Set(result.requestedCodepoints.map(cp => String.fromCodePoint(cp)));
  for (const char of '你好文章') assert(chars.has(char));
  assert(!chars.has('\u0007')); assert(!chars.has('\n'));
  assert.deepEqual(result.sourceFiles, ['data.json', 'ui.ts']);
});

test('real font inputs allow publishing, editing and renaming articles without changing the installed subset', t => {
  const dir = mkdtempSync(join(tmpdir(), 'room-article-font-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const spec = JSON.parse(readFileSync(new URL('./font-inputs.json', import.meta.url), 'utf8'));
  // Mirror required fixed sources so this exercises the production input rules,
  // including any future change that accidentally scans blog content again.
  for (const source of spec.sources.filter(pattern => !/[*?{[]/u.test(pattern))) {
    const path = join(dir, source);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'ROOM UI');
  }
  const baseline = collectFontCharacters(dir, spec);
  const metadata = JSON.parse(readFileSync(join(root, 'scripts/room/font-source.json'), 'utf8'));
  const coverage = JSON.parse(readFileSync(join(root, 'public/fonts/room-pixel-zh.coverage.json'), 'utf8'));
  const fontBytes = readFileSync(join(root, metadata.publicSubset));
  const verifyUnchanged = () => {
    const current = collectFontCharacters(dir, spec);
    assert.deepEqual(current, baseline);
    verifyFontCoverage(current.requestedCodepoints, coverage, fontBytes, metadata.faceSha256, current.allowedFallbacks);
  };
  const article = join(dir, 'src/content/blog/travel.md');
  mkdirSync(dirname(article), { recursive: true });
  writeFileSync(article, '---\ntitle: 旅行与摄影\ndescription: 烘焙美食\npubDate: 2026-01-01\ncategory: travel\ntags: [哲学, 睡眠]\n---\n龘\n');
  verifyUnchanged();
  writeFileSync(article, '---\ntitle: 鲸与熵\ndescription: 锚与韧\npubDate: 2026-01-01\ncategory: travel\ntags: [金融]\ndraft: true\n# 草稿注释也不影响字体\n---\n旅行\n');
  verifyUnchanged();
  const renamed = join(dir, 'src/content/blog/nested/renamed.md');
  mkdirSync(dirname(renamed), { recursive: true });
  renameSync(article, renamed);
  verifyUnchanged();
  rmSync(renamed);
  verifyUnchanged();
});

const bytes = Buffer.from('font fixture bytes');
const fixture = () => ({ subsetSha256: createHash('sha256').update(bytes).digest('hex'), subsetBytes: bytes.length, sourceSha256: 'pinned-source', supportedCodepoints: 2, unicodeCodepoints: ['U+0041', 'U+5B57'] });

test('font verification checks both source provenance and exact paired font bytes', () => {
  const required = [65, 0x5b57];
  assert.equal(verifyFontCoverage(required, fixture(), bytes, 'pinned-source').coveredCodepoints, 2);
  assert.throws(() => verifyFontCoverage(required, fixture(), Buffer.from('changed'), 'pinned-source'), /bytes do not match/u);
  assert.throws(() => verifyFontCoverage(required, fixture(), bytes, 'different-source'), /pinned source/u);
  assert.throws(() => verifyFontCoverage(required, { ...fixture(), supportedCodepoints: 3 }, bytes, 'pinned-source'), /count is inconsistent/u);
});

test('new Chinese UI characters fail until regenerated; only explicit documented fallbacks are allowed', () => {
  assert.throws(() => verifyFontCoverage([65, 0x65b0], fixture(), bytes, 'pinned-source'), /新 \(U\+65B0\)/u);
  assert.throws(() => verifyFontCoverage([65, 0x2211], fixture(), bytes, 'pinned-source'), /U\+2211/u);
  assert.equal(verifyFontCoverage([65, 0x2211], fixture(), bytes, 'pinned-source', [0x2211]).systemFallbackCharacters, '∑');
});
