# Mainloop

Ferris 的个人博客，基于 [Astro](https://astro.build) 构建，部署在 GitHub Pages：<https://ferrisevans.github.io>

## 技术栈

- **Astro 5** — 静态站点生成，内容用 Markdown 内容集合管理
- **Tailwind CSS v4** — 样式（CSS-first 配置，见 `src/styles/global.css`）
- **Pagefind** — 构建期生成的静态全文搜索
- **KaTeX** — 数学公式（仅 `math: true` 的文章加载）
- **Giscus** — 评论区（GitHub Discussions 驱动）
- **GitHub Actions** — push 到 `main` 自动构建部署（`.github/workflows/pages-deploy.yml`）

## 本地开发

```bash
npm install
npm run dev       # 开发服务器（搜索索引仅在构建后可用）
npm run build     # 构建到 dist/ 并生成 pagefind 搜索索引
npm run preview   # 预览构建产物
```

## 写文章

在 `src/content/blog/` 新建 `<slug>.md`（slug 决定 URL：`/posts/<slug>/`，大小写敏感）：

```yaml
---
title: 文章标题
description: 一句话摘要，用于卡片和 SEO
pubDate: 2026-10-14
category: programming-language   # programming-language | data-structures | game-dev | ai
subcategory: cpp                 # 可选，取值见 src/data/site.ts
tags: [pointer, array]
pin: false                       # 可选，置顶到首页特色位
math: false                      # 有数学公式时设 true
---
```

正文中可用的扩展语法：

- GitHub alert：`> [!TIP]` / `[!NOTE]` / `[!WARNING]` / `[!CAUTION]`
- 数学：行内 `$x$`，独立块 `$$ ... $$`（需 `math: true`）
- 图片放到 `public/assets/lib/`，引用 `/assets/lib/xxx.png`

## 目录结构

```
src/
├── content/blog/      # 文章（Markdown）
├── data/site.ts       # 站点元数据 + 分类体系定义
├── layouts/           # 页面骨架
├── components/        # Nav / Footer / PostCard / TOC / Giscus 等
├── pages/             # 路由（首页、文章、分类、标签、归档、关于、搜索、RSS）
└── styles/global.css  # 设计系统（色板、字体、正文排版）
```
