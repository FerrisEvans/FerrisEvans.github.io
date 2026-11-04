#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { modelManifest } from './manifest.mjs';
const manifest = await modelManifest();
const previous = await readFile('public/island/manifest.json', 'utf8').then(JSON.parse).catch(error => {
  if (error.code === 'ENOENT') return {};
  throw error;
});
if (previous.buildId === manifest.buildId && previous.posters) manifest.posters = previous.posters;
await writeFile('public/island/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`Sealed island ${manifest.buildId}: ${manifest.model.bytes} model bytes; posters ${manifest.posters ? 'current' : 'require capture'}.`);
