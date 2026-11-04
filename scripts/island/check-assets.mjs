#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { verifyManifest, fileRecord } from './manifest.mjs';
const manifest = JSON.parse(await readFile('public/island/manifest.json', 'utf8'));
const transport = JSON.parse(await readFile('public/island/transport.json', 'utf8'));
assert.equal(transport.sourceSha256, (await fileRecord('assets/island/island.glb')).sha256, 'Repack the changed source model.');
assert.equal(transport.packerSha256, (await fileRecord('scripts/island/pack-model.mjs')).sha256, 'Repack with the current model packer.');
assert.equal(transport.sha256, manifest.model.sha256, 'Model transport and manifest must match.');
assert.equal(transport.bytes, manifest.model.bytes, 'Model transport byte count must match.');
await verifyManifest(manifest, process.cwd(), { modelOnly: process.argv.includes('--model-only') });
console.log(`Island assets verified: ${manifest.buildId}, ${manifest.model.bytes} model bytes${process.argv.includes('--model-only') ? ' (model only; not a publish check)' : ', three sealed WebGL captures'}.`);
