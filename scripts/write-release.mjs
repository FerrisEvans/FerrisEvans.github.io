import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const { buildId: roomBuildId } = JSON.parse(await readFile('public/room/materials/manifest.json', 'utf8'));
const revision = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
await writeFile('dist/release.json', JSON.stringify({ version, revision, roomBuildId }, null, 2) + '\n');
