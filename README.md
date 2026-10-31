# Mainloop

Ferris 的个人博客，基于 [Astro](https://astro.build) 构建，部署在 GitHub Pages：<https://ferrisevans.github.io>

## 技术栈

- **Astro 7** — 静态站点生成，内容用 Markdown 内容集合管理
- **React islands** — 只为需要交互的组件提供客户端水合
- **Tailwind CSS v4** — 样式采用 CSS-first 配置，入口为 `src/styles/global.css`
- **Motion Primitives / Kokonut UI** — 标题过渡与雨玻璃交互，组件源码保存在项目内
- **Pagefind** — 构建期生成的静态全文搜索
- **KaTeX** — 数学公式（仅 `math: true` 的文章加载）
- **Giscus** — 评论区（GitHub Discussions 驱动）
- **GitHub Actions** — push 到 `main` 自动构建部署（`.github/workflows/pages-deploy.yml`）

## 页面结构

- `/`：交互式书房入口。
- `/lofi/`：文章首页；后续分页位于 `/page/<n>/`。
- `/posts/<slug>/`：文章详情、目录、评论与相关阅读。
- `/categories/`、`/tags/`、`/archives/`：分类、标签与时间索引。
- `/search/`：Pagefind 全文搜索。

## 本地开发

使用 Node.js 24（最低 22.23.4）。

```bash
npm install
npm run dev       # 开发服务器（搜索索引仅在构建后可用）
npm run check     # 内容 schema 与 TypeScript 检查
npm test          # 资源加载、播放、导航、动画与内容回归
npm run audit:deps # 完整依赖树安全检查（含开发依赖）
npm run build     # 构建到 dist/ 并生成 pagefind 搜索索引
npm run verify:build # 检查路由、静态链接和 3D 资源清单
npm run preview   # 预览构建产物
```

生产浏览器回归使用 `npm run test:browser`，默认连接 `http://127.0.0.1:4327`；
先用 `npm run preview -- --host 127.0.0.1 --port 4327` 启动预览。
可用 `BASE_URL` 指向其他环境，本机已有 Chrome 时可设置 `BROWSER_CHANNEL=chrome`。

## 发布与 3D 资源

GitHub Pages 的发布源使用 **GitHub Actions**，只发布经过检查的 `dist/`。
流水线运行依赖审计、TypeScript、完整单元测试、资源 hash 检查、链接检查和真实浏览器阅读路径回归，
不在 CI 重建 Blender 模型或依赖软件 GPU 重新烘焙。`/release.json` 可核对线上版本、提交和模型 build ID。

站点保持 Astro 静态生成。GitHub Pages 没有 SSR 服务器运行时，SSR 也不能承担客户端 WebGL 绘制。
3D 使用预烘焙光照与反射、分阶段纹理准备、独立视频流及按内容版本的浏览器缓存；
手机和能力不足的设备仍使用 LO-FI。构建会从发布产物移除源 PNG 和未压缩传输模型，
源文件留在仓库供复现。这减少发布体积，不代表增加 FPS 或减少本来就不会请求的资源下载。

Astro 7 显式使用 `@astrojs/markdown-remark` 的 Unified 处理器，保留数学、GitHub alert、
图片缩放、代码高亮及原有 HTML 空格处理。KaTeX 固定为安全版本，并用 npm override
统一 `rehype-katex` / `micromark-extension-math` 的嵌套依赖；移除此 override 前，应确认上游
已采用安全版本，并运行 Markdown 与浏览器回归。Sharp 同样使用统一的安全版本。

## 写文章

在 `src/content/blog/` 新建 `<slug>.md`（slug 决定 URL：`/posts/<slug>/`，大小写敏感）：

```yaml
---
title: 文章标题
description: 一句话摘要，用于卡片和 SEO
pubDate: 2026-10-14
category: programming-language   # 小写字母、数字和连字符组成的 slug
subcategory: cpp                 # 可选，使用相同的 slug 规则
tags: [pointer, array]
pin: false                       # 可选，置顶到首页特色位
math: false                      # 有数学公式时设 true
---
```

分类和子分类可以直接使用新的 slug，无需先修改配置。系统会自动生成默认名称、封面、首页入口和分类页面，并在构建时提醒未注册分类。需要中文名称、定制颜色或子分类显示名时，只需在 `src/data/site.ts` 的 `CATEGORIES` 中添加定制项。

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
├── components/        # Astro 组件、React islands 与第三方交互组件
│   ├── kokonutui/     # 雨玻璃组件、生命周期控制器与 WebGL 底层
│   └── motion-primitives/
├── pages/             # 路由（文章、分类、标签、归档、关于、搜索、RSS）
└── styles/            # global.css 入口、prose.css 正文、pagefind.css 搜索
```
