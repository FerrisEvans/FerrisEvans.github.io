# 未尽

Ferris 的个人博客，使用 Astro 构建，发布到 [GitHub Pages](https://ferrisevans.github.io)。

## 写博客

日常编辑集中在根目录 **[posts/](posts/)**：

- **[posts/zh/](posts/zh/)**：中文博文；**[posts/en/](posts/en/)**：英文博文。
- **[posts/img/](posts/img/)**：中英文共用的博文配图。Markdown 都写 `![说明](../img/文件名.png)`。

相对图片由 Astro 构建处理，编辑器也能直接预览。博文和写作指南共用 `posts/img/`，不再保留旧的 `/assets/lib/` 图片地址。

Markdown 写作指南：[中文源文件](src/content/pages/markdown-writing-guide.md) / [English source](src/content/pages/en/markdown-writing-guide.md)。指南位于关于页面的阅读资料区，不计入博文、分类或标签。
新文章的文件头：

```yaml
---
key: my-note                    # 两种语言共用，决定文章网址
title: 文章标题
description: 一句话摘要
date: 2026-11-05
category: lang
tags: [notes]
draft: true
---
```

文章语言由 `posts/zh/` 或 `posts/en/` 目录推导，无需填写 `locale`。文章网址为 `/zh/posts/my-note/` 和 `/en/posts/my-note/`，由目录和 `key` 共同决定，发布后不要随意修改 `key`。两份文章的标题、正文、图片说明分别使用对应语言。

运行 `npm run dev`，从 `/zh/drafts/` 或 `/en/drafts/` 预览草稿。发布时将两份文章的 `draft` 同时设为 `false` 或删除该字段；缺少另一语言的正式译文会阻止构建。生产站点不发布草稿。`date` 用于展示和排序，不是定时发布开关。

分类、标签、目录、RSS 和搜索索引随文章自动生成，不需要手工登记。分类显示名可在 `src/data/site.ts` 定制。文章之间使用 `/posts/<key>/` 链接，构建时自动加当前语言前缀。

`category` 和 `subcategory` 表达文章的目录归属；`tags` 只标注正文实际讨论的主题，使用通行叫法，不重复分类或子分类。中英文版本保持相同的子分类和标签。

支持数学公式、代码高亮、代码标签组、提示块、脚注、编号引用和图片放大。发布流程见 [Markdown 写作指南](https://ferrisevans.github.io/zh/about/markdown-writing/)；语法与格式见 [Markdown 指南](https://ferrisevans.github.io/zh/about/markdown/) 与 [写作约定](https://ferrisevans.github.io/zh/about/writing/)。

## 本地开发

使用 Node.js 24（最低 22.23.4）。

```sh
npm install
npm run dev                 # 编辑和预览文章
npm run check               # 类型与内容检查
npm test                    # 单元测试
npm run build               # 构建网站与搜索索引
npm run verify:build        # 检查生成页面、链接和资源
npm run preview             # 预览 dist/ 中的生产版本
```

开发环境的搜索使用最近一次构建生成的索引。浏览器测试先运行 `npm run preview -- --host 127.0.0.1 --port 4327`，再运行 `npm run test:browser`、`npm run test:i18n-browser` 或 `npm run test:guides`；`npm run test:authoring` 在临时项目中验证草稿和双语发布流程。

## 目录

```text
posts/      博文和配图：zh/ 中文、en/ 英文、img/ 共用图片
src/        页面、组件、样式、站点配置和浏览器代码
public/     网站资源；brand/ 和 island/ 同时保存原稿与交付文件
scripts/    素材工具、构建校验和测试
├── brand/  品牌素材生成
├── island/ 3D 素材生成、打包和封面工具
├── ci/     构建校验、翻译完整性检查和发布记录
└── tests/  单元测试、浏览器测试和模型验证工具
```

`src/content/pages/` 是网站的写作指南，不是博文。`src/data/site.ts` 管理标题、简介、头像和分类；`src/i18n/` 管理界面翻译。

## 发布与网站维护

推送或合并到 `main` 后，`.github/workflows/pages-deploy.yml` 自动校验、构建并发布 `dist/`。网页语言由 `/en/`、`/zh/` 路径决定，根网址默认进入英语；语言按钮直接切换中英文。旧文章网址保留跳转，两种语言共用原文章的 Giscus 评论。

首页使用 Three.js 小岛，文章页、目录和搜索不加载 3D。无法运行 JavaScript 或 WebGL 时仍保留静态阅读入口。写文章和添加配图不需要重新生成模型。

修改模型几何或材质时，先运行 `npm run assets:build`。模型、渲染代码或纳入校验的样式发生变化后，运行 `npm run assets:model`、`npm run assets:posters` 和 `npm run assets:check`；仅修改渲染代码无需重新运行 Blender。详细命令见 [素材流程](scripts/island/ASSET_PIPELINE.md)，模型来源与许可见 [素材记录](scripts/island/SOURCES.md)。本地预览和性能报告放在被 Git 忽略的 `.room-build/`。

品牌原图、图标、首页小狗头像和身份记录保存在 `public/brand/`。`npm run assets:brand` 从 SVG 和 PNG 原图生成网站使用的图标与小狗 WebP 头像；构建时排除两张原始头像 PNG 和 `identity.json`。关于页单独使用 `src/assets/about-avatar.png`，由 Astro 生成适合不同像素密度的 WebP 图片。

小岛的 Blender 原稿、原始模型和网站使用的模型、封面统一保存在 `public/island/`。第三方模型素材与 UI 组件许可统一放在 `public/island/vendor/`，按上游项目保留独立目录。构建时排除原稿、未压缩模型和第三方原始素材，保留网站资源以及各项目的 `LICENSE.txt`、`NOTICE.md`。
