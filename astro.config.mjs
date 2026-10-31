import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeGithubAlerts from './src/plugins/rehype-github-alerts.mjs';
import rehypeReading from './src/plugins/rehype-reading.mjs';

import react from '@astrojs/react';

export default defineConfig({
  site: 'https://ferrisevans.github.io',
  integrations: [sitemap({ filter: page => new URL(page).pathname !== '/room/' }), react()],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeGithubAlerts, rehypeReading, rehypeKatex],
    shikiConfig: {
      themes: {
        light: 'github-light-default',
        dark: 'github-dark-default',
      },
    },
  },
});