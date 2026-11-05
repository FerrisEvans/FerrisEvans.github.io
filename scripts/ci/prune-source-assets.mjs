import { rm } from 'node:fs/promises';

// Keep authoring originals in public/assets for repository organization, while
// publishing only the generated files in /island/ and /brand/island/.
for (const directory of ['brand', 'island']) {
  await rm(new URL(`../../dist/assets/${directory}/`, import.meta.url), { recursive: true, force: true });
}
