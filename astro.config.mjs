import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { unified } from '@astrojs/markdown-remark';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import remarkDirective from 'remark-directive';
import remarkCrossReferences from './src/plugins/remark-cross-references.mjs';
import rehypeCrossReferenceTargets from './src/plugins/rehype-cross-reference-targets.mjs';
import rehypeKatex from 'rehype-katex';
import rehypeGithubAlerts from './src/plugins/rehype-github-alerts.mjs';
import rehypeReading from './src/plugins/rehype-reading.mjs';
import rehypeLocalizedLinks from './src/plugins/rehype-localized-links.mjs';
import rehypeMathMetadata from './src/plugins/rehype-math-metadata.mjs';
import rehypeCodeGroup from 'rehype-code-group';
import { codeLineNumbers } from './src/plugins/code-line-numbers.mjs';

import react from '@astrojs/react';

// Pagefind is generated after Astro's production build. Reuse that index in
// development without copying generated files into the public source tree.
const pagefindDirectory = resolve(fileURLToPath(new URL('./dist/pagefind/', import.meta.url)));
const pagefindTypes = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
};
const pagefindDevelopment = {
  name: 'pagefind-development-index',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const pathname = (request.url ?? '').split('?')[0];
      if (!pathname.startsWith('/pagefind/')) return next();
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
      }
      try {
        const file = resolve(pagefindDirectory, decodeURIComponent(pathname.slice('/pagefind/'.length)));
        if (!file.startsWith(pagefindDirectory + sep)) {
          response.writeHead(403); response.end(); return;
        }
        const [directory, canonicalFile] = await Promise.all([realpath(pagefindDirectory), realpath(file)]);
        if (!canonicalFile.startsWith(directory + sep)) {
          response.writeHead(403); response.end(); return;
        }
        const content = await readFile(canonicalFile);
        response.writeHead(200, {
          'Content-Type': pagefindTypes[extname(canonicalFile)] ?? 'application/octet-stream',
          'Content-Length': content.length,
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(request.method === 'HEAD' ? undefined : content);
      } catch (error) {
        response.writeHead(error instanceof URIError ? 400 : 404); response.end();
      }
    });
  },
};

export default defineConfig({
  site: 'https://ferrisevans.github.io',
  compressHTML: true,
  i18n: { locales: ['en', 'zh'], defaultLocale: 'en', routing: 'manual' },
  integrations: [sitemap({ filter: page => /^\/(en|zh)\//.test(new URL(page).pathname) && !/\/(drafts|page)\//.test(new URL(page).pathname) }), react()],
  vite: {
    // The component library imports CSS modules that Astro must bundle for SSR.
    resolve: { noExternal: ['animal-island-ui'] },
    // Asset candidates share node_modules, but must not overwrite a running
    // checkout's optimized dependency hashes through that shared directory.
    cacheDir: fileURLToPath(new URL('./.astro/vite', import.meta.url)),
    // A private asset candidate contains its own Astro/TS configs. Creating
    // or building it must not restart the live development server.
    server: { watch: { ignored: ['**/.room-build/**'] } },
    plugins: [tailwindcss(), pagefindDevelopment],
  },
  markdown: {
    processor: unified({
      gfm: true,
      remarkPlugins: [remarkMath, remarkDirective, remarkCrossReferences],
      rehypePlugins: [rehypeLocalizedLinks, rehypeGithubAlerts, rehypeReading, rehypeKatex, rehypeMathMetadata, [rehypeCodeGroup, { assets: 'none', diagnostics: 'error' }], rehypeCrossReferenceTargets],
    }),
    shikiConfig: {
      transformers: [codeLineNumbers],
      themes: {
        light: 'github-light-default',
        dark: 'github-dark-default',
      },
    },
  },
});
