import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');
const requiredFiles = [
  'index.html',
  '404.html',
  'rss.xml',
  'sitemap-index.xml',
  'pagefind/pagefind-entry.json',
  '.nojekyll',
  'lofi/index.html',
  'room/index.html',
  'release.json',
];

for (const rel of requiredFiles) {
  const full = path.join(distDir, rel);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing required build output: dist/${rel}`);
  }
}

function walkHtml(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkHtml(full));
    else if (entry.isFile() && entry.name.endsWith('.html')) results.push(full);
  }
  return results;
}

const htmlFiles = walkHtml(distDir);
// Room resources live in JSON rather than href/src, so HTML link checks alone
// cannot detect a missing texture, stale size, or an accidentally pruned model.
for (const entry of ['index.html', 'room/index.html']) {
  const html = fs.readFileSync(path.join(distDir, entry), 'utf8');
  const manifest = html.match(/<script\b[^>]*id="room-assets"[^>]*>([\s\S]*?)<\/script>/);
  if (!manifest || !/data-asset-version="[a-f0-9]{20}"/.test(html)) {
    throw new Error(`Missing versioned room resource manifest in ${entry}`);
  }
  for (const asset of JSON.parse(manifest[1])) {
    const target = path.join(distDir, asset.url);
    if (!fs.existsSync(target) || fs.statSync(target).size !== asset.bytes) {
      throw new Error(`Missing or stale room resource in ${entry}: ${asset.url}`);
    }
  }
}
const release = JSON.parse(fs.readFileSync(path.join(distDir, 'release.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(release.version) || !/^[a-f0-9]{40}$/.test(release.revision) || !release.roomBuildId) {
  throw new Error('Invalid release provenance');
}
const packageVersion = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const roomBuildId = JSON.parse(fs.readFileSync(path.join(distDir, 'room/materials/manifest.json'), 'utf8')).buildId;
if (release.version !== packageVersion || release.roomBuildId !== roomBuildId || (process.env.GITHUB_SHA && release.revision !== process.env.GITHUB_SHA)) {
  throw new Error('Release provenance does not match the build inputs');
}
const postPages = htmlFiles.filter((f) =>
  path.relative(distDir, f).replaceAll(path.sep, '/').startsWith('posts/')
);
if (postPages.length === 0) {
  throw new Error('No blog post pages were generated under dist/posts/');
}

const attrRegex = /\b(?:href|src)="([^"]+)"/g;
const brokenLinks = [];

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const relFile = path.relative(distDir, file);
  for (const match of html.matchAll(attrRegex)) {
    const raw = match[1];
    if (
      !raw.startsWith('/') ||
      raw.startsWith('//') ||
      raw.startsWith('/cdn-cgi/')
    ) {
      continue;
    }
    const cleanPath = decodeURIComponent(raw.split('#')[0].split('?')[0]);
    const target = path.join(distDir, cleanPath);
    const exists =
      (fs.existsSync(target) && fs.statSync(target).isFile()) ||
      fs.existsSync(path.join(target, 'index.html')) ||
      fs.existsSync(`${target}.html`);
    if (!exists) {
      brokenLinks.push(`${relFile} -> ${raw}`);
    }
  }
}

if (brokenLinks.length > 0) {
  throw new Error(
    `Found ${brokenLinks.length} broken internal link(s):\n` +
      brokenLinks.slice(0, 20).join('\n')
  );
}

console.log(
  `Verified ${htmlFiles.length} HTML pages (${postPages.length} post pages) and all internal asset/page links.`
);
