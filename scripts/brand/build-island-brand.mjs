#!/usr/bin/env node
/** Compose the custom Chinese logo from two original editable SVG masters;
 * derive favicon sizes from the simple book/sprout, never tiny Chinese text. */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../..', import.meta.url));
const island = join(root, 'public/brand/island');
const brandSources = join(root, 'public/assets/brand');
const source = await readFile(join(island, 'mark.svg'));
const lettering = await readFile(join(island, 'lettering.svg'));
for (const master of [source, lettering]) {
  if (/<(?:text|image|foreignObject)\b/i.test(master.toString())) throw new Error('Brand masters must remain pure, editable SVG geometry.');
}
const geometry = bytes => bytes.toString().replace(/^.*?<svg\b[^>]*>/s, '').replace(/<\/svg>\s*$/, '').replace(/<title>.*?<\/title>/s, '');
const logo = `<svg xmlns="http://www.w3.org/2000/svg" width="232" height="84" viewBox="0 0 232 84" role="img" aria-label="未尽"><title>未尽 · 书芽与原创中文字标</title><g transform="translate(1 12) rotate(-4 32 32)">${geometry(source)}</g>${geometry(lettering)}</svg>\n`.replace(/[ \t]+$/gm, '');
await writeFile(join(island, 'logo.svg'), logo);
const bearSourceFile = 'public/assets/brand/ferris-avatar.png';
const avatarPath = join(root, bearSourceFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const avatarBefore = hash(await readFile(avatarPath));
// Keep the full generated PNG as an authoring source, excluded from production output.
// The square delivery copy preserves the composition and transparent background.
const dogSourceFile = 'public/assets/brand/ferris-dog-avatar.png';
const dogSourcePath = join(root, dogSourceFile);
const dogSource = await readFile(dogSourcePath);
const dogSourceMeta = await sharp(dogSource).metadata();
const dogSourceHash = hash(dogSource);
const dogDeliveryFile = 'ferris-dog-avatar.webp';
const dogEncoding = { width: 512, height: 512, fit: 'inside', withoutEnlargement: true, quality: 88, effort: 6 };
const dogDelivery = await sharp(dogSource)
  .resize(dogEncoding.width, dogEncoding.height, { fit: dogEncoding.fit, withoutEnlargement: dogEncoding.withoutEnlargement })
  .webp({ quality: dogEncoding.quality, effort: dogEncoding.effort }).toBuffer();
const dogDeliveryMeta = await sharp(dogDelivery).metadata();
await writeFile(join(island, dogDeliveryFile), dogDelivery);
const siteSource = await readFile(join(root, 'src/data/site.ts'), 'utf8');
const currentAvatarFile = siteSource.match(/avatar:\s*`\/brand\/island\/([^?`]+)/)?.[1];
if (!currentAvatarFile || currentAvatarFile.includes('/')) throw new Error('Current author avatar must name a local brand file.');
const currentAvatar = await readFile(join(island, currentAvatarFile));
const sizes = [16, 32, 48, 96, 180, 192, 256, 512];
const png = new Map();
for (const size of sizes) png.set(size, await sharp(source, { density: 384 }).resize(size, size).png().toBuffer());
for (const size of [16, 32, 96, 192, 512]) await writeFile(join(island, `favicon-${size}x${size}.png`), png.get(size));
await writeFile(join(island, 'apple-touch-icon.png'), png.get(180));
await writeFile(join(root, 'public/favicon.svg'), source);

/** ICO supports embedded PNG frames. Width/height zero encodes 256 pixels. */
function packIco(frames) {
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  for (let i = 0; i < frames.length; i++) {
    const [size, bytes] = frames[i], p = 6 + i * 16;
    header[p] = header[p + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, p + 4); header.writeUInt16LE(32, p + 6);
    header.writeUInt32LE(bytes.length, p + 8); header.writeUInt32LE(offset, p + 12);
    offset += bytes.length;
  }
  return Buffer.concat([header, ...frames.map(([, bytes]) => bytes)]);
}
const ico = packIco([16, 32, 48, 96, 256].map(size => [size, png.get(size)]));
await writeFile(join(root, 'public/favicon.ico'), ico);
const identity = {
  name: '未尽', concept: 'round-ink-chinese-and-open-page-sprout', tagline: '保持好奇，慢慢来。',
  source: 'Original closed SVG contours for 未尽: gently leaning strokes, soft expanded terminals, unequal bar lengths and two separate ink drops. Open cream book and connected sage sprout. Drawn for this identity; no typeface outlines, third-party artwork or raster images.',
  component: 'src/components/IslandBrand.astro', faviconRoot: '/brand/island/',
  faviconFallbacks: ['/favicon.ico', '/favicon.svg'], cacheVersion: 'weijin-2',
  palette: { sage: '#8bc4a8', cream: '#fff7e7', ink: '#76543b', darkLettering: '#fff3db' },
  sourceFiles: ['public/brand/island/mark.svg', 'public/brand/island/lettering.svg'], logoFile: 'public/brand/island/logo.svg', generator: 'scripts/brand/build-island-brand.mjs',
  sourceSha256: { mark: hash(source), lettering: hash(lettering), logo: hash(logo) }, pngSizes: [16, 32, 96, 180, 192, 512], icoSizes: [16, 32, 48, 96, 256],
  avatar: {
    current: { file: `public/brand/island/${currentAvatarFile}`, role: 'Current generated cartoon dog author avatar, distinct from the site logo; follows SITE.avatar', provenance: 'Generated with image_gen on 2026-11-04 using the user-provided dog photograph for identity and the retained bear illustration for style.', sha256: hash(currentAvatar) },
    dogSource: { file: dogSourceFile, format: dogSourceMeta.format, bytes: dogSource.length, width: dogSourceMeta.width, height: dogSourceMeta.height, sha256: dogSourceHash },
    dogDelivery: { file: `public/brand/island/${dogDeliveryFile}`, format: dogDeliveryMeta.format, bytes: dogDelivery.length, width: dogDeliveryMeta.width, height: dogDeliveryMeta.height, sha256: hash(dogDelivery), encoding: dogEncoding },
    retainedBear: { file: bearSourceFile, role: 'Retained previous bear illustration and style reference', sha256: avatarBefore },
  },
};
await writeFile(join(brandSources, 'identity.json'), JSON.stringify(identity, null, 2) + '\n');
await writeFile(join(root, 'public/site.webmanifest'), JSON.stringify({
  name: '未尽', short_name: '未尽', description: '保持好奇，慢慢来。', lang: 'zh-CN',
  start_url: '/', display: 'browser', background_color: '#fff7e7', theme_color: '#8bc4a8',
  icons: [192, 512].map(size => ({ src: `/brand/island/favicon-${size}x${size}.png?v=weijin-2`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })),
}, null, 2) + '\n');

// Contact sheet previews the actual SVG at display sizes, including inline use.
// The bundled licensed font renders annotation text only, never the logo.
if (process.argv.includes('--preview')) {
  const { chromium } = await import('playwright');
  const fonts = join(root, 'node_modules/animal-island-ui/dist/files');
  const fontName = (await readdir(fonts)).find(file => /^noto-sans-sc-chinese-simplified-700-normal\..*\.woff2$/.test(file));
  if (!fontName) throw new Error('Bundled Noto Sans SC 700 font not found.');
  const font = (await readFile(join(fonts, fontName))).toString('base64');
  const tiny = size => `data:image/png;base64,${png.get(size).toString('base64')}`;
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 850 }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      @font-face{font-family:BrandCJK;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:700;font-display:block}
      *{box-sizing:border-box}body{margin:0;background:#f4f0e6;color:#76543b;font-family:BrandCJK,sans-serif;font-weight:700}
      main{padding:36px 44px}.label{font:11px Arial,sans-serif;letter-spacing:1.6px;color:#74614f}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:20px}
      .card{height:590px;border:1px solid #dfd1b9;border-radius:28px;background:#fff7e7;padding:30px}
      .night{background:#303c33;color:#fff3db;border-color:#5b6e55}.night .label{color:#c9cbb9}.night .weijin-lettering{fill:#fff3db}
      .large{height:195px;display:flex;align-items:center}.large svg{width:100%;height:auto;max-height:150px}
      .sample{display:flex;align-items:center;justify-content:space-between;gap:14px;border-top:1px solid #a28d7040;padding:16px 0}
      .sample svg{width:auto;height:44px;flex-shrink:0}.sample.footer svg{height:36px}
      .inline{font-size:14px;margin:20px 0;line-height:1.8}.inline svg{width:auto;height:1.65em;vertical-align:-.38em}
      .icons{display:flex;align-items:center;gap:28px;margin-top:26px}.icon{display:flex;align-items:center;gap:8px;font:11px Arial,sans-serif}
      .foot{margin-top:26px;font-size:13px;line-height:1.9}.foot small{font:11px/1.8 Arial,sans-serif;color:#74614f}
    </style><main><div class="label">WEIJIN · ORIGINAL CHINESE LETTERFORMS / BOOK &amp; SPROUT</div><div class="grid">${['','night'].map(cls=>`<section class="card ${cls}"><div class="label">${cls?'DARK':'LIGHT'} · TRANSPARENT VECTOR</div><div class="large">${logo}</div><div class="sample">${logo}<span class="label">HEADER · 44px</span></div><div class="sample footer">${logo}<span class="label">FOOTER · 36px</span></div><p class="inline">订阅 ${lettering} 的新消息</p><div class="icons">${[16,32,48].map(size=>`<div class="icon"><img width="${size}" height="${size}" src="${tiny(size)}"><span>${size}px</span></div>`).join('')}</div></section>`).join('')}</div><div class="foot">柔软的笔画、略有起伏的字面；书页还没有合上，好奇心继续生长。<br><small>Original path geometry · No font outlines · Full logo + inline wordmark · Separate simple favicon</small></div></main>`);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    const preview = join(root, '.room-build/previews/brand-weijin.png');
    await mkdir(resolve(preview, '..'), { recursive: true });
    await page.screenshot({ path: preview });
  } finally { await browser.close(); }
}
if (hash(await readFile(avatarPath)) !== avatarBefore) throw new Error('Author avatar unexpectedly changed.');
if (hash(await readFile(dogSourcePath)) !== dogSourceHash) throw new Error('Generated dog avatar source unexpectedly changed.');
console.log(`未尽 brand regenerated: custom Chinese path lettering + book/sprout logo; 6 PNG sizes and 5-frame ICO from the simple icon; 512px dog avatar ${dogDelivery.length} bytes. Original dog source and retained bear portrait unchanged.`);
