import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { unified } from '@astrojs/markdown-remark';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeGithubAlerts from './src/plugins/rehype-github-alerts.mjs';
import rehypeReading from './src/plugins/rehype-reading.mjs';

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
  integrations: [sitemap({ filter: page => new URL(page).pathname !== '/room/' }), react()],
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
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeGithubAlerts, rehypeReading, rehypeKatex],
    }),
    shikiConfig: {
      themes: {
        light: 'github-light-default',
        dark: 'github-dark-default',
      },
    },
  },
});
