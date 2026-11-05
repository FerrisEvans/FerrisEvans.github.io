# 未尽

保持好奇，慢慢来。Ferris 的个人博客，基于 [Astro](https://astro.build) 构建，部署在 GitHub Pages：<https://ferrisevans.github.io>

## 技术栈

- **Astro 7** — 静态站点生成，内容用 Markdown 内容集合管理
- **原生 Three.js** — 加载可编辑 Blender 小岛，场景发现内容，HTML 面板提供文章入口
- **React islands** — 只为需要交互的阅读组件提供客户端水合
- **Tailwind CSS v4** — 样式采用 CSS-first 配置，入口为 `src/styles/global.css`
- **Animal Island UI 3** — 使用原库的卡片、飘带、标签、波浪分隔，以及 `naive-icons` 彩色图标；Astro 在构建期渲染这些 React 组件。默认鼠标使用上游原始 SVG，本地字体随组件库打包。
- **Pagefind** — 构建期生成的静态全文搜索
- **KaTeX** — 自动识别正文公式，仅有公式的文章加载样式（兼容原有 `math: true`）
- **Giscus** — 评论区（GitHub Discussions 驱动）
- **GitHub Actions** — push 到 `main` 自动构建部署（`.github/workflows/pages-deploy.yml`）

## 页面结构

- `/`：默认进入 `/en/`；英语和中文分别使用 `/en/`、`/zh/`，路径决定语言。
- `/<locale>/`：交互式林间阅读庭院；物件使用通用图标，悬浮/键盘提示按当前语言显示。书架提供笔记目录与搜索，书桌提供最近更新与归档。
- `/<locale>/notes/`：笔记目录、分类和精选；分页位于 `/<locale>/notes/page/<n>/`。
- `/<locale>/posts/<translationKey>/`：文章详情、目录、评论与相关阅读。中英文通过稳定的 `translationKey` 配对。
- `/<locale>/categories/`、`tags/`、`archives/`：按当前语言生成的分类、标签和时间索引。
- `/<locale>/search/`：只搜索当前语言；`/<locale>/rss.xml` 提供独立订阅。
- 旧的无语言前缀 URL 跳转到对应中文页面；旧 `/rss.xml` 保留中文订阅。旧 `/island/`、`/room/` 进入 `/zh/`，`/lofi/` 进入 `/zh/notes/`。跳转保留查询参数与片段，并提供无 JavaScript 的静态跳转和链接。

页面提供自指 canonical、互相对应的 `hreflang` 和指向英文的 `x-default`。两种语言的文章共用原 URL 对应的 Giscus Discussion，不拆分评论。语言切换保留当前文章、查询参数与片段；翻译后的标题锚点可能不同，切换语言后以目标文章为准。

## 博客视觉与阅读布局

博客使用 `src/styles/island.css` 的顶部导航与卡通小岛布局，不保留左侧栏；手机端使用折叠菜单，禁用 JavaScript 时保留原生导航链接。默认浅色，尊重保存的明暗偏好。分类、标签、归档、分页、RSS、搜索与原文章 URL 保持兼容。

文章纸面最大 880px，桌面内边距 40px，正文约 798px；1440px 以下将旁侧目录折叠进正文，避免压缩阅读宽度。标题与正文使用原库自带的 Nunito / Noto Sans SC 字体，代码保留等宽与独立横向滚动，脚注使用较小字号；图片弹窗相对视口居中。Giscus 在 iframe 就绪与主题变化时同步颜色。

首页与阅读页共用同一导航、页脚、品牌、Nunito / Noto Sans SC 字体及明暗主题。桌面导航只显示图标，悬浮和键盘聚焦时显示当前语言的 tooltip；手机展开菜单显示文字。品牌标志始终返回当前语言首页。3D 直接置于首页并自动加载，先用当前主题封面展示场景，再平滑切换为交互画面；无需另点“探索”或进入独立场景页。`/notes/` 与文章页仍不加载 3D。标题、简介、分类和标签保持为 HTML，新增中文标题无需修改模型或字体。正常首页以场景和可访问物件导航为主体；完整静态目录只作为加载中、无 JS 或失败时的阅读退路。

「未尽」标识为原创的翻页书本与嫩芽，和作者小狗头像分别使用。`public/brand/island/mark.svg` 是可编辑的单一源文件；修改后运行 `npm run assets:brand`，统一生成各尺寸 PNG、ICO、旧路径 favicon、站点 manifest 和身份记录，避免手工维护多份图标。导航与页脚保留共用书本嫩芽标志，中文使用「未尽」SVG 字标，英文使用 Weijin 字标，首页只保留小号介绍和无障碍标题。鼠标样式从共用 `global.css` 引入：全站普通与可点击状态使用原库 SVG，拖动、文本、缩放、尺寸调整和禁用状态保留原生语义；无跟随鼠标的 DOM 动画。

首页庭院支持桌面与窄屏触控，提供可聚焦的物件入口、内容面板、关闭与返回行为。普通滚轮用于继续阅读页面，Ctrl/⌘ + 滚轮用于场景缩放；手机左右拖动环顾，向下滑动阅读。减少动态效果时停用角色循环和大幅镜头过渡；页面隐藏时暂停绘制，离开时释放资源。禁用 JavaScript、无法创建 WebGL 或模型加载失败时，仍可使用静态内容入口。

## 本地开发

使用 Node.js 24（最低 22.23.4）。

```bash
npm install
npm run dev       # 开发服务器（搜索索引仅在构建后可用）
npm run check     # 内容 schema 与 TypeScript 检查
npm run check:translations # 检查正式文章的中英文配对
npm test          # 内容、资源缓存、小岛模型和交付契约回归
npm run audit:deps # 完整依赖树安全检查（含开发依赖）
npm run build     # 构建到 dist/ 并生成 pagefind 搜索索引
npm run verify:build # 检查路由、静态链接和 3D 资源清单
npm run assets:brand # 从 mark.svg 生成全部 favicon、manifest 与品牌记录
npm run test:authoring # 临时站点验证草稿、缺失译文阻断、双语发布/删除及阅读工具
npm run test:i18n-browser # 双语路由、切换、搜索、SEO、共享评论、窄屏与无 JS 回归
npm run preview   # 预览构建产物
```

生产浏览器回归使用 `npm run test:browser`，默认连接 `http://127.0.0.1:4327`；
先用 `npm run preview -- --host 127.0.0.1 --port 4327` 启动预览。
可用 `BASE_URL` 指向其他环境，本机已有 Chrome 时可设置 `BROWSER_CHANNEL=chrome`。

## 发布与 3D 资源

GitHub Pages 的发布源使用 **GitHub Actions**，只发布经过检查的 `dist/`。
流水线运行中英文配对检查、依赖审计、TypeScript、完整单元测试、资源 hash 检查、链接检查和真实浏览器阅读路径回归，
不在 CI 重建 Blender 模型或依赖软件 GPU 重新烘焙。`/release.json` 可核对线上版本、提交和模型 build ID。

站点保持 Astro 静态生成。GitHub Pages 没有 SSR 服务器运行时，SSR 也不能承担客户端 WebGL 绘制。
3D 使用低面数模型、共享哑光材质、有限实时灯光和按内容哈希验证的浏览器缓存。
模型及封面在开发阶段生成并校验，CI 只检查已准备好的交付物，不启动 Blender。
旧写实书房的模型、烘焙贴图、电影和像素字体不随新版交付。

可编辑源文件位于 `assets/island/island.blend`，重复生成脚本是 `scripts/island/build_scene.py`。
小熊沿用现有头像的圆框眼镜、嫩芽和绿色书本，具有 `Idle`、`Attention`、`Wave` 三段完整分件动画；
头、躯干、手臂和眼睛各有动画枢轴。原创小熊与角色动画配合已核验来源的 CC0 环境素材，组成开放的林间阅读庭院；采用清单、包内许可、来源与文件哈希见 [素材记录](scripts/island/SOURCES.md)。首轮原型没有外部模型、第二轮仅加入四个野餐道具，这些是历史阶段，不代表当前素材范围。

模型导出后，按以下顺序准备资产。封面必须来自同一版本场景的实际网页渲染：

```bash
npm run assets:build   # 独立 Blender 后台进程生成 .blend / GLB（默认 macOS Blender 路径）
npm run assets:model   # 记录模型、生成源、运行时代码和 Three.js 版本
npm run dev -- --host 127.0.0.1 --port 4327
# 另一个终端运行：
BASE_URL=http://127.0.0.1:4327 npm run assets:posters
npm run assets:check   # 验证模型与封面一致、哈希和资源预算
```

完整命令、源文件范围和测试迁移见 [资产流程](scripts/island/ASSET_PIPELINE.md)；
布局、内容映射和验收目标见 [设计记录](docs/island/DESIGN.md)；
实际浏览器结果及尚未覆盖的设备见 [验证记录](docs/island/QA.md)。
核心场景资源 5 MB、桌面 60 FPS、目标移动设备 30 FPS 是设计目标，实际结果以验证记录为准；
浏览器移动模拟不等于真实手机测试。本分支的本地验证不会自动推送、合并或部署。

Astro 7 显式使用 `@astrojs/markdown-remark` 的 Unified 处理器，保留数学、GitHub alert、
图片缩放、代码高亮及原有 HTML 空格处理。KaTeX 固定为安全版本，并用 npm override
统一 `rehype-katex` / `micromark-extension-math` 的嵌套依赖；移除此 override 前，应确认上游
已采用安全版本，并运行 Markdown 与浏览器回归。Sharp 同样使用统一的安全版本。

## 写文章

同一篇文章分别保存在 `src/content/blog/zh/<key>.md` 和 `src/content/blog/en/<key>.md`。文件名仅用于组织，稳定的 `translationKey` 决定 URL（大小写敏感），两份文件必须相同；`locale` 分别为 `zh` 和 `en`。

```yaml
---
locale: zh                       # 英文文件使用 en
translationKey: cpp_pointer01    # 中英文共用，发布后保持稳定
title: 文章标题
description: 一句话摘要，用于卡片和 SEO
pubDate: 2026-10-14
category: programming-language   # 使用语言无关的分类 ID
subcategory: cpp                 # 可选
tags: [pointer, array]            # 两语言使用相同标签 ID
pin: false                       # 可选，置顶到笔记目录精选位
draft: true                      # 先写草稿，两份都准备好后同时改为 false
---
```

英文稿翻译标题、摘要、正文、图片说明和必要的代码注释，保留技术标识、代码语义和外部来源。中英文正文是否同步由作者维护，不做语义或版本一致性拦截。

分类和子分类可以直接使用新的 slug，无需先修改配置。系统会自动生成默认名称、封面、首页入口和分类页面，并在构建时提醒未注册分类。需要中文名称、定制颜色或子分类显示名时，只需在 `src/data/site.ts` 的 `CATEGORIES` 中添加定制项。

分类与标签只根据公开文章生成。删除或撤回最后一篇相关文章后，相应入口、分类/标签页面、RSS 和搜索索引随构建清理；`CATEGORIES` 中的展示配置可以保留，供以后再次使用。小岛面板也从同一组公开文章生成；内容增加使用通用目录与分页，不通过堆积模型或手工登记目录扩展。

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

设置 `draft: true`，运行 `npm run dev`，从导航的「草稿」或 `/zh/drafts/`、`/en/drafts/` 打开文章。草稿详情有明确的预览提示，不进入公开文章列表、分类、标签、RSS 或搜索；`npm run build` 不生成草稿详情与草稿入口。`npm run preview` 预览的是生产产物，因此也不显示草稿。

发布时将两份文章的 `draft` 同时删除或设为 `false`，运行 `npm run check:translations`。任意非草稿文章必须有且只有一个已发布的另一语言版本；缺失译文、重复配对或另一版本仍为草稿都会阻止测试、构建和 CI。两份都是草稿时可以暂缺其中一份。检查通过后将 Markdown 和必要图片推送或合并到 `main`。GitHub Actions 自动构建文章、索引和搜索并部署；不需要登记文章、修改分类配置或重新生成 3D 模型与字体。`pubDate` 是展示与排序日期，不是定时发布开关。

目录与分类自动生成。普通文章的目录标题来自二、三级标题；新分类默认使用 slug 的可读名称，需要中文名称或定制颜色时才修改 `CATEGORIES`。文章互链可以使用 `/posts/<translationKey>/`，构建时自动加上当前语言前缀；不要链接源 `.md` 文件。图片与共享资源不加语言前缀。

「关于作者」的三张阅读卡片分别进入 `/about/python-zen/`、`/about/writing/` 和 `/about/markdown/`。写作约定维护在 `src/content/pages/writing-guide.md`，语法与效果对照维护在 `src/content/pages/markdown-features.md`。三页共用独立阅读布局、目录和文章阅读工具，不进入博客分类或 RSS；可被站内搜索检索。英文指南维护在 `src/content/pages/en/`。可直接复用的完整文章样例是 `src/content/blog/zh/markdown-writing-guide.md` 与 `src/content/blog/en/markdown-writing-guide.md`。

## 目录结构

```
src/
├── content/blog/      # zh/ 与 en/ 配对文章（Markdown）
├── i18n/              # 语言、文案、链接与标签显示名
├── data/site.ts       # 站点元数据 + 分类体系定义
├── layouts/           # 页面骨架
├── components/        # Astro 组件、共享品牌与 React 阅读组件
├── scripts/island/    # 场景、镜头、角色动画、拾取、HTML 面板与生命周期
├── utils/             # 共用文章数据、小岛内容适配与资源清单
├── pages/[locale]/    # 两种语言的页面与 RSS；pages/ 另保留旧 URL 跳转
└── styles/            # global.css / island.css 共用主题、world.css 首页与场景界面
```

阅读指南的浏览器回归：先启动 `npm run preview -- --port 4327`，再运行 `npm run test:guides`；可用 `BASE_URL` 指定其他预览地址。
