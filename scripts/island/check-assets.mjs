#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { verifyManifest } from './manifest.mjs';
const manifest = JSON.parse(await readFile('public/island/manifest.json', 'utf8'));
await verifyManifest(manifest, process.cwd(), { modelOnly: process.argv.includes('--model-only') });
console.log(`Island assets verified: ${manifest.buildId}, ${manifest.model.bytes} model bytes${process.argv.includes('--model-only') ? ' (model only; not a publish check)' : ', three sealed WebGL captures'}.`);
