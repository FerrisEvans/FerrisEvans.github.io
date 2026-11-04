# 未尽：首页庭院与笔记

`/` 直接展示交互式林间阅读庭院，没有独立场景入口或“探索小岛”按钮。
紧凑品牌介绍、阅读入口和全景按钮放在场景上方，画面不再被左侧大幅欢迎区挤压。
先展示当前主题封面，再自动加载真实 3D 并平滑渐显。首页就是这座小岛：正常状态下
只展示场景、轻量工具栏和可访问物件导航，不在下方再叠一套文章列表与分类区。
桌面 Header、轻量栏、舞台和物件导航约占一屏，页脚在其后正常排列。

Header 直接列出首页、笔记、分类、标签、归档、关于，没有“更多”菜单；手机收起为
同一套完整导航。品牌始终返回首页。页面共用页脚、字体、主题和原库鼠标 SVG，
拖动、文本、缩放、尺寸调整与禁用状态仍使用相应原生鼠标，不使用跟随 DOM 动画。

`/notes/` 使用简洁的笔记标题、文章总数、搜索和归档入口；分类、精选和文章列表均
来自公开内容。后续分页位于 `/notes/page/<n>/`。笔记目录与文章页不加载 3D。

庭院的书架、书桌、喷泉、小熊、植物角与收音机分别打开全部笔记、最近更新、分类、
关于与指南、标签、订阅与联系。书架面板另含搜索入口，书桌面板含归档入口，
笔记、分类、标签、归档和关于均能通过场景内容到达。物件和对应 DOM 链接打开同一个原生 HTML dialog，
正文进入既有文章页。面板内的“回到全景”、关闭、Escape 与浏览器历史保留返回语义。
桌面侧边面板、手机底部面板为场景保留可见区域。普通滚轮继续阅读页面，Ctrl/⌘ +
滚轮缩放场景；手机左右拖动环顾、向下滑动阅读。无 JS、无 WebGL 或加载失败时，
完整静态目录照常可读；该目录在正常场景就绪后隐藏，同一组内容移入打开的面板。

旧 `/island/` 与 `/room/` 跳转到 `/`；`/lofi/` 与 `/page/<n>/` 跳转到笔记目录。
JavaScript 跳转保留查询参数和片段；无 JavaScript 时提供静态跳转与普通链接，
不承诺保留查询参数和片段。文章 URL 不变，面包屑返回笔记目录；别名使用目标
canonical 并从 sitemap 排除。

文章、分类和标签只来自公开 Markdown。新增、撤回或删除内容后，由同一构建更新
首页面板、阅读索引和搜索，不需要登记模型、文字贴图或字体子集。

站点标识以 `public/brand/island/mark.svg` 为单一可编辑源；`npm run assets:brand`
生成 favicon、ICO、manifest 与兼容路径，作者小熊头像保持独立。当前环境由已核验
来源的 CC0 素材组合，配合原创小熊与动画；精确采用清单见素材记录。早期纯原创
原型与第二轮四个野餐道具均为历史阶段，不能替代当前素材声明。

设计与验收见 [`island/DESIGN.md`](island/DESIGN.md)，资产流程见
[`../scripts/island/ASSET_PIPELINE.md`](../scripts/island/ASSET_PIPELINE.md)，
旧实现的恢复位置及测试迁移见 [`island/migration.md`](island/migration.md)。

```sh
npm test
npm run check
npm run build
npm run verify:build
BASE_URL=http://127.0.0.1:4327 BROWSER_CHANNEL=chrome npm run test:room-flow
BASE_URL=http://127.0.0.1:4327 BROWSER_CHANNEL=chrome npm run test:browser
BASE_URL=http://127.0.0.1:4327 BROWSER_CHANNEL=chrome npm run test:guides
BROWSER_CHANNEL=chrome npm run test:authoring
```

`test:room-flow` 保留兼容脚本名，当前验证的是首页交互场景与统一博客阅读路径。封面捕获使用 `/?capture=1`。
浏览器自动化中的移动端是尺寸与触摸模拟；实际手机与 Safari 的验证需单独记录。
