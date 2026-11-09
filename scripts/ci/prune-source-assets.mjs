import { readdir, rm } from 'node:fs/promises';

// Authoring files live beside their generated assets but are not published.
for (const path of ['island/island.blend', 'island/island.glb', 'island/model-report.json', 'island/transport.json', 'brand/ferris-avatar.png', 'brand/ferris-dog-avatar.png', 'brand/identity.json']) {
  await rm(new URL(`../../dist/${path}`, import.meta.url), { recursive: true, force: true });
}

// Publish each upstream license and notice, excluding original models,
// textures and source inventories from the delivered vendor directories.
const vendorDirectory = new URL('../../dist/island/vendor/', import.meta.url);
for (const pack of await readdir(vendorDirectory)) {
  for (const entry of await readdir(new URL(`${pack}/`, vendorDirectory))) {
    if (!['LICENSE.txt', 'NOTICE.md'].includes(entry)) {
      await rm(new URL(`${pack}/${entry}`, vendorDirectory), { recursive: true, force: true });
    }
  }
}
