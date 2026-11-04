#!/usr/bin/env node
/** The old scene remains in Git history/source until acceptance, never in delivery. */
import { readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const dist = resolve(process.argv[2] ?? 'dist');
const room = resolve(dist, 'room');
for (const entry of await readdir(room)) {
  if (entry !== 'index.html') await rm(resolve(room, entry), { recursive: true, force: true });
}
// These fonts only painted the retired CRT/VHS UI. Reading uses the shared fonts.
for (const file of ['room-pixel-zh.woff2', 'room-pixel-zh.coverage.json']) {
  await rm(resolve(dist, 'fonts', file), { force: true });
}
console.log('Island delivery excludes the retired study models, textures, film and pixel font.');
