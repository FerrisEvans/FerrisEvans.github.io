import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The build seal is shared by HTML, binary cache and actual WebGL posters. */
export function getIslandAssets() {
  const manifest = JSON.parse(readFileSync(resolve('public/island/manifest.json'), 'utf8')) as {
    buildId: string;
    model: { file: string; bytes: number; sha256: string };
  };
  return {
    modelUrl: `/island/${manifest.model.file}?v=${manifest.model.sha256}`,
    modelBytes: manifest.model.bytes,
    modelHash: manifest.model.sha256,
    buildId: manifest.buildId,
    posterVersion: manifest.buildId,
  };
}
