# Praxis

保持好奇，慢慢来。Ferris 的个人博客，基于 [Astro](https://astro.build) 构建，部署在 GitHub Pages：<https://ferrisevans.github.io>

## 技术栈

- **Astro 7** — 静态站点生成，内容用 Markdown 内容集合管理
- **React islands** — 只为需要交互的组件提供客户端水合
- **Tailwind CSS v4** — 样式采用 CSS-first 配置，入口为 `src/styles/global.css`
- **Animal Island UI 3** — 使用原库的卡片、飘带、标签、波浪分隔，以及 `naive-icons` 彩色图标；Astro 在构建期渲染这些 React 组件。默认鼠标使用上游原始 SVG，本地字体随组件库打包。
- **Pagefind** — 构建期生成的静态全文搜索
- **KaTeX** — 自动识别正文公式，仅有公式的文章加载样式（兼容原有 `math: true`）
- **Giscus** — 评论区（GitHub Discussions 驱动）
- **GitHub Actions** — push 到 `main` 自动构建部署（`.github/workflows/pages-deploy.yml`）

## 页面结构

- `/`：交互雨玻璃首页，提供书房与博客两个入口。
- `/room/`：交互式书房，资源就绪后自动进入，电视独立控制播放。
- `/lofi/`：文章首页；后续分页位于 `/page/<n>/`。
- `/posts/<slug>/`：文章详情、目录、评论与相关阅读。
- `/categories/`、`/tags/`、`/archives/`：分类、标签与时间索引。
- `/search/`：Pagefind 全文搜索。

## 博客视觉与阅读布局

博客使用 `src/styles/island.css` 的顶部导航与卡通小岛布局，不保留左侧栏；手机端使用折叠菜单，禁用 JavaScript 时保留原生导航链接。默认浅色，尊重保存的明暗偏好。分类、标签、归档、分页、RSS、搜索与原文章 URL 保持兼容。

文章纸面最大 880px，桌面内边距 40px，正文约 798px；1440px 以下将旁侧目录折叠进正文，避免压缩阅读宽度。标题与正文使用原库自带的 Nunito / Noto Sans SC 字体，代码保留等宽与独立横向滚动，脚注使用较小字号；图片弹窗相对视口居中。Giscus 在 iframe 就绪与主题变化时同步颜色。

3D 像素字体检查只针对书房固定 UI。文章标题、摘要、标签和草稿不参与子集检查；书房中的动态文章文字使用字体回退，新文章无需维护字体文件。

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
npm run test:authoring # 在临时站点新增一篇 Markdown，验证草稿、发布索引与代码标签（需本机浏览器）
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
draft: false                     # true 时只允许本地草稿预览，不生成生产文章
---
```

分类和子分类可以直接使用新的 slug，无需先修改配置。系统会自动生成默认名称、封面、首页入口和分类页面，并在构建时提醒未注册分类。需要中文名称、定制颜色或子分类显示名时，只需在 `src/data/site.ts` 的 `CATEGORIES` 中添加定制项。

分类与标签只根据公开文章生成。删除或撤回最后一篇相关文章后，相应入口、分类/标签页面、RSS 和搜索索引随构建清理；`CATEGORIES` 中的展示配置可以保留，供以后再次使用。书房精选动画独立保留，原文不存在时自动隐藏阅读链接。

正文中可用的扩展语法：

- GitHub alert：`> [!TIP]` / `[!NOTE]` / `[!WARNING]` / `[!CAUTION]`
- 数学：行内 `$x$`，独立块 `$$ ... $$`，自动识别；代码围栏中的公式文本不会启用公式样式。
- 正文编号引用：用 `:::numbered{#label}` 包裹定义、段落或公式，后文用 `:ref[label]` 跳回该内容；编号按本篇目标顺序自动生成，脚注保持独立。完整写法见 `/about/markdown/#正文编号与交叉引用`。
- 图片放到 `public/assets/lib/`，引用 `![说明](/assets/lib/xxx.png)`；也支持 Markdown 附近的相对图片，由 Astro 处理。流程图直接作为普通图片插入。
- 多语言代码标签：使用 `rehype-code-group` 插件，将普通代码围栏放入 `::: code-group`，用 `labels` 指定标签。

````markdown
::: code-group labels=[GDScript, C#]

```gdscript
const ENEMY_SCENE_PATH: String = "res://Enemy.tscn"

func _ready():
    ResourceLoader.load_threaded_request(ENEMY_SCENE_PATH)
```

```csharp
private const string EnemyScenePath = "res://Enemy.tscn";

public override void _Ready()
{
    ResourceLoader.LoadThreadedRequest(EnemyScenePath);
}
```

:::
````

每组仅展示当前语言的代码，复制按钮复制当前标签内容。方向键、Home/End 可切换标签；没有 JavaScript 时顺序展示所有版本。每个标签对应一个代码块，数量必须一致；另一组用新的 `::: code-group` 包裹。普通代码围栏保持原来的展示方式，不需要额外配置或组件 import。

### 草稿预览与发布

设置 `draft: true`，运行 `npm run dev`，从导航的「草稿」或 `/drafts/` 打开文章。草稿详情有明确的预览提示，不进入公开文章列表、分类、标签、RSS 或搜索；`npm run build` 不生成草稿详情与草稿入口。`npm run preview` 预览的是生产产物，因此也不显示草稿。

发布时删除 `draft` 或设为 `false`，将 Markdown 和必要图片推送或合并到 `main`。GitHub Actions 自动构建文章、索引和搜索并部署；不需要登记文章、修改分类配置或重新生成书房字体。`pubDate` 是展示与排序日期，不是定时发布开关。

目录与分类自动生成。普通文章的目录标题来自二、三级标题；新分类默认使用 slug 的可读名称，需要中文名称或定制颜色时才修改 `CATEGORIES`。文章互链使用 `/posts/<slug>/`，不要链接源 `.md` 文件。

「关于作者」的三张阅读卡片分别进入 `/about/python-zen/`、`/about/writing/` 和 `/about/markdown/`。写作约定维护在 `src/content/pages/writing-guide.md`，语法与效果对照维护在 `src/content/pages/markdown-features.md`。三页共用独立阅读布局、目录和文章阅读工具，不进入博客分类或 RSS；可被站内搜索检索。可直接复用的完整文章样例是 `src/content/blog/markdown-writing-guide.md`。

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

阅读指南的浏览器回归：先启动 `npm run preview -- --port 4327`，再运行 `npm run test:guides`；可用 `BASE_URL` 指定其他预览地址。
