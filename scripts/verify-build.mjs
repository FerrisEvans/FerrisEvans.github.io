import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const distDir = path.resolve('dist');
const requiredFiles = [
  'index.html',
  '404.html',
  'rss.xml',
  'sitemap-index.xml',
  'pagefind/pagefind-entry.json',
  '.nojekyll',
  'lofi/index.html',
  'notes/index.html',
  'about/index.html',
  'about/python-zen/index.html',
  'about/writing/index.html',
  'about/markdown/index.html',
  'room/index.html',
  'island/index.html',
  'release.json',
  'sw.min.js',
];

for (const rel of requiredFiles) {
  const full = path.join(distDir, rel);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing required build output: dist/${rel}`);
  }
}

function walkFiles(dir, extension) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkFiles(full, extension));
    else if (entry.isFile() && entry.name.endsWith(extension)) results.push(full);
  }
  return results;
}

const htmlFiles = walkFiles(distDir, '.html');
// Models are requested by JavaScript, so href/src checks alone miss stale bytes.
const island = JSON.parse(fs.readFileSync(path.join(distDir, 'island/manifest.json'), 'utf8'));
if (!/^[a-f0-9]{20}$/.test(island.buildId) || island.posters?.buildId !== island.buildId) throw new Error('Island model/poster build identities differ');
for (const [file, asset] of [[island.model.file, island.model], ...Object.entries(island.posters.files)]) {
  if (path.basename(file) !== file) throw new Error('Island assets must be local filenames');
  const bytes = fs.readFileSync(path.join(distDir, 'island', file));
  if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`Missing or stale island resource: ${file}`);
}
if (fs.readdirSync(path.join(distDir, 'room')).some(file => file !== 'index.html')) throw new Error('Retired study assets must not enter the published room directory');
for (const file of walkFiles(path.join(distDir, '_astro'), '.js')) {
  const code = fs.readFileSync(file, 'utf8');
  if (/\/room\/(?:materials|film|window|fonts)\//.test(code)) throw new Error(`Retired study runtime dependency in ${path.relative(distDir, file)}`);
}
const homepage = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
if (!homepage.includes('href="/notes/"')) throw new Error('Homepage fallback must retain the reading destination');
for (const obsolete of ['home-enter-room', 'home-enter-blog', 'island-reset', 'island-panel-reset']) {
  if (homepage.includes(`id="${obsolete}"`)) throw new Error(`Obsolete homepage control must not return: ${obsolete}`);
}
if (/class="[^"]*island-dock/.test(homepage)) throw new Error('Fixed courtyard must not render a separate dock');
if (!homepage.includes('weijin-lettering')) throw new Error('Homepage brand must use the original SVG wordmark');
if (!homepage.includes('id="island-root"') || !homepage.includes('id="island-scene"')) throw new Error('Homepage must directly mount the interactive courtyard');
if (homepage.includes('id="home-enter-room"')) throw new Error('Homepage must not require a separate exploration entry');
for (const [file, destination] of [['lofi/index.html', '/notes/'], ['room/index.html', '/'], ['island/index.html', '/'],
  ...htmlFiles.map(file => path.relative(distDir, file).replaceAll(path.sep, '/')).filter(file => /^page\/\d+\/index\.html$/.test(file)).map(file => [file, file === 'page/1/index.html' ? '/notes/' : `/notes/${file.replace(/index\.html$/, '')}`])]) {
  const html = fs.readFileSync(path.join(distDir, file), 'utf8');
  if (!html.includes(`href="${destination}"`) || !html.includes(`rel="canonical"`)) throw new Error(`Legacy alias lacks canonical/direct destination: ${file}`);
  if (!/<meta\b[^>]*name="robots"[^>]*content="noindex,follow"/.test(html)) throw new Error(`Legacy alias must not create a competing search entry: ${file}`);
}
const sitemapUrls = fs.readdirSync(distDir).filter(file => /^sitemap.*\.xml$/.test(file)).flatMap(file =>
  [...fs.readFileSync(path.join(distDir, file), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1])));
for (const pathname of ['/', '/notes/']) if (!sitemapUrls.some(url => url.pathname === pathname)) throw new Error(`Missing canonical sitemap route: ${pathname}`);
if (sitemapUrls.some(url => ['/lofi/', '/room/', '/island/'].includes(url.pathname) || /^\/page\/\d+\/$/.test(url.pathname))) throw new Error('Legacy aliases must stay out of the canonical sitemap');
const release = JSON.parse(fs.readFileSync(path.join(distDir, 'release.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(release.version) || !/^[a-f0-9]{40}$/.test(release.revision) || !release.roomBuildId) {
  throw new Error('Invalid release provenance');
}
const packageVersion = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const roomBuildId = island.buildId;
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

// Stylesheets can exist even when their fonts/images were omitted from the
// production bundle. Validate those references as well as HTML href/src.
for (const file of walkFiles(distDir, '.css')) {
  const relative = path.relative(distDir, file).replaceAll(path.sep, '/');
  const css = fs.readFileSync(file, 'utf8');
  for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)) {
    const raw = match[2].trim();
    if (!raw || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(raw)) continue;
    const pathname = decodeURIComponent(new URL(raw, `https://build.invalid/${relative}`).pathname);
    const target = path.join(distDir, pathname);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) brokenLinks.push(`${relative} -> ${raw}`);
  }
}

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
  `Verified ${htmlFiles.length} HTML pages (${postPages.length} post pages), CSS resources and internal asset/page links.`
);
