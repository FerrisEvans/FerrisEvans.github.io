import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectFontCharacters, verifyFontCoverage } from './font-coverage.mjs';

test('one collector includes UI, JSON and nested article front matter without copying long article bodies', t => {
  const dir = mkdtempSync(join(tmpdir(), 'room-font-coverage-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'posts/nested'), { recursive: true });
  writeFileSync(join(dir, 'ui.ts'), "const title = '你好';\u0007\n");
  writeFileSync(join(dir, 'data.json'), JSON.stringify({ label: '文章' }));
  writeFileSync(join(dir, 'posts/nested/test.md'), '---\ntitle: 新标题\ndescription: 简介\n---\n正文稀有字龘不需要加入字体。\n');
  const result = collectFontCharacters(dir, { sources: ['ui.ts', '*.json'], frontMatter: ['posts/**/*.md'], baseRange: [32, 126], extraCodepoints: [160], systemFallbacks: [] });
  const chars = new Set(result.requestedCodepoints.map(cp => String.fromCodePoint(cp)));
  for (const char of '你好文章新标题简介') assert(chars.has(char));
  assert(!chars.has('龘')); assert(!chars.has('\u0007')); assert(!chars.has('\n'));
  assert.deepEqual(result.sourceFiles, ['data.json', 'posts/nested/test.md', 'ui.ts']);
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
