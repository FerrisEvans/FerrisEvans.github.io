> 历史图片/录屏已归档到本地验收产物，不随本次发布进入 Git；请以 [当前验收](QA.md) 为准。

> 历史记录：这份文档描述用户随后否定的旧版独立小岛/静态首页方案，不能作为当前庭院首页的验收证据。当前结果见 [QA.md](QA.md)。部分旧链接的图片/JSON已被后续覆盖。

# 未尽 · 最终本地验收记录

2026-11-04，Asia/Singapore。基线 `08844b2`，工作分支 `codex/island-home-3d`。
本地交付，未提交、推送、合并或部署。当前模型、渲染源及三张 WebGL 封面的构建标识为 **`abd32699ecd808969c7d`**。首轮记录保留在 [QA-initial.md](QA-initial.md)，其中旧模型尺寸、路由和性能数据不代表当前版本。

## 当前交付

- 全站名称为“未尽”，首页、共享导航、页脚、页面标题、分享信息与图标保持一致。品牌 SVG 与衍生图标由 [品牌生成器](../../scripts/brand/build-island-brand.mjs) 维护，参考 [品牌检查图](previews/brand-weijin.webp)。
- 首页 `/`、小岛 `/island/`、笔记 `/notes/` 使用同一导航。笔记目录标题统一为“笔记”，保留真实分类、精选、文章和分页，去掉第二套欢迎首页。旧 `/room/`、`/lofi/`、`/page/N/` 保留迁移入口；JS 跳转保留查询和 hash，无 JS 提供跳转及直接链接。
- 小岛保留原创书屋、小熊和 Idle/Attention/Wave 动画，补充原创小兔与四件 Tiny Treats 野餐道具。模型、原始 vendor 文件、许可及可编辑 Blender 源都留在仓库。
- 首页、加载图与分享图来自同一实际 Three.js/WebGL 场景。阅读用户初始不下载 GLB 或场景/Three 脚本，浅深主题各只请求匹配封面。

当前画面：[首页](previews/home-desktop.webp)、[深色首页](previews/home-desktop-night.webp)、[手机首页](previews/home-mobile.webp)、[笔记桌面](previews/notes-desktop.webp)、[笔记手机](previews/notes-mobile.webp)、[小岛桌面](previews/island-desktop.webp)、[分类侧栏](previews/island-categories.webp)、[手机内容面板](previews/island-mobile-about.webp)、[实际 WebGL 动画](previews/bear-animation.webm)。`room-*` 截图属于首轮历史记录。

## 镜头与回到全景

独立复现没有发现自由视角下“回到全景”完全失效：拖动和缩放后，旧版最终能回到原位。实际问题有两处：打开内容时，投影、方向与 zoom 在插值前立即改变，产生跳帧；原生 modal 打开后，外部全景按钮被 modal 截获点击。详见 [修复前记录](camera-regression-before.json)。

当前镜头从完整相机状态开始插值；打开保留当前观察方向，关闭和重置平滑返回初始构图。面板内部提供可实际点击的“回到全景”，通过同一关闭/历史路径完成复位。减少动态模式直接到位。

生产 Chrome 对真实点击采样71帧投影位置，结果如下；此处单位是热点投影像素，不是 GPU 时间。

| 操作 | 总位移 | 第一帧位移 | 最大单帧位移 |
| --- | ---: | ---: | ---: |
| 拖动与缩放后重置 | 102.696 px | 0.016 px | 4.687 px |
| 打开内容 | 352.901 px | 0.029 px | 13.997 px |
| 面板内回到全景 | 352.901 px | 0.053 px | 15.156 px |
| 历史/刷新后的关闭 | 206.275 px | 0.061 px | 11.966 px |

重置后的最终构图误差小于1 px；减少动态重置只有前后两个投影状态，最终偏差0 px。另有五项真实 Three Camera/OrbitControls 单测覆盖零帧状态、首帧连续性、重复拖转缩放重置、未完成过渡的反向切换及竖屏减少动态。[生产回归记录](flow-evidence.json)

## 资源、来源与释放

[模型报告](../../public/island/model-report.json)：**2,791,296 bytes**，102,296三角面，104 meshes / 105 primitives，33材质，2张内嵌贴图，Idle/Attention/Wave 三个动画。模型无外部运行时资源依赖。

当时采用的四件次要道具是 Tiny Treats 的野餐垫、篮子、苹果和葡萄碗，总计2,236三角面，作者 Isa Lousberg / Tiny Treats，CC0-1.0。当时的生成器与封存检查校验了原始 glTF/BIN/PNG、许可和来源哈希；该阶段没有使用付费资产。首轮“没有外部素材”的描述只适用于历史版本。

发布前资源清理说明：旧 `tinytreats-pleasant-picnic-1.0/` 候选目录已被当前 Picnic 来源子集替代并移除。当前保留模型、许可与来源见 [SOURCE.json](../../assets/island/vendor/tinytreats-pleasant-picnic-1.0-full/SOURCE.json)，旧目录实际删除路径、大小与哈希见[清理记录](asset-cleanup.json)。本页上述数值继续记录当时版本，不代表最终场景。

可编辑源：[island.blend](../../assets/island/island.blend)；生成器：[build_scene.py](../../scripts/island/build_scene.py)；流水线：[ASSET_PIPELINE.md](../../scripts/island/ASSET_PIPELINE.md)。封存包含模型、Blender、生成器、vendor、渲染代码、场景样式和 Three 版本。浅色封面68,310 bytes，深色75,172 bytes，分享图50,695 bytes，均带当前构建的哈希记录。

新贴图同时补齐释放逻辑：共享 geometry/material/texture/decoded bitmap 只释放一次，保留悬停克隆前的原始材质，取消后晚到的 glTF 结果也会清理。两项真实 Three disposal 测试通过；浏览器上下文丢失、重试、重复进出和加载中离开回归通过。这验证了已覆盖的释放路径，不等同于所有浏览器长时间堆内存分析。

## 验证结果

- `npm test`：**54/54通过**，包含内容、Markdown、模型/封存、相机、资源释放及复用的缓存/加载时序契约。
- `npm run check`、`npm run build`、`npm run verify:build`：通过，**68个HTML、16篇文章、19个Pagefind索引页**，内部链接和资源检查通过。
- `test:authoring`：隔离副本中草稿隐藏、开发预览、单 Markdown 发布、首页/小岛/笔记同步、分类/标签、RSS、站点地图、搜索和删除通过；模型、manifest、分类配置未改变。等待已设明确超时。
- `test:browser`、`test:guides`：生产预览上统一导航、规范分页、旧入口查询/hash、无 JS、手机导航、标签、文章阅读、代码复制、数学字体、图片预览、搜索和三篇指南通过。
- `test:room-flow`：生产 `/island/` 上四个核心物件直接拾取、悬停、拖动不误点、镜头/重置、六个面板、键盘焦点、Escape、历史/深链接、手机触摸模拟、主题、减少动态、503重试、WebGL丢失恢复、重复进出、初始加载中离开、无 WebGL及无 JS通过。10个状态记录，未处理脚本错误0。
- [九组UI检查](previews/ui-checks.json)：脚本/HTTP错误、横向溢出、重复ID、可见无名称按钮均为0；首页与笔记抽样CLS为0，手机小岛约0.01185。最终截图已人工检查。未运行完整屏幕阅读器或 axe 审计，不声明全面WCAG合规。
- 旧 worker 的退役仍单独回归：新访问不注册worker、不接管请求，旧根缓存迁移保留其他应用的数据。

机器可读结果：[validation.json](validation.json)；命令摘要：[test-output.txt](test-output.txt)。初次 authoring 检查曾停滞，关闭其测试进程后增加明确超时，以最终源重跑成功；该未完成运行没有记为通过。首次最终封面捕获遇到开发热刷新，随后完整三张捕获成功，发布校验验证最终字节与源一致。

## 本机性能与边界

Chrome **156.0.8078.80**，macOS arm64 / **Apple M3 Max**，ANGLE Metal，headless。测量时没有其他本任务浏览器并行工作。本机HTTP，没有网络/CPU限速；每组180个 requestAnimationFrame 间隔。冷测新建context，温测复用同一context。[原始记录](browser-metrics.json)

| 条件 | 视口 / 实际绘图缓冲 | 冷 / 温 readyMs | 中位数 / P95 |
| --- | --- | ---: | ---: |
| 桌面 | 1440×900，DPR1；1440×688 | 120 / 92 ms | 16.7 / 16.7 ms |
| 手机视口模拟 | 390×844，设备DPR2、渲染DPR1.5；585×861 | 112 / 95 ms | 16.7 / 16.8 ms |

`readyMs` 是岛屿运行入口启动至首帧，排除之前HTML/CSS/入口脚本下载，不是导航耗时或LCP。帧间隔是浏览器调度采样，不是GPU计时；每组只做一次本地测量，不能推导公网或真实手机稳定帧率。

- 模型与已传输场景/入口脚本合计 **2,961,598 bytes**，低于初始约5 MB核心场景目标。
- 已记录冷测响应体合计 **5,634,911 bytes**，包含共享字体 **2,407,444 bytes**，不含主HTML。不能把整页冷加载宣传为低于5 MB。
- 实际渲染211 calls / 204,594 triangles，包含阴影遍历；106 geometries / 5 renderer textures。它们与模型报告的105 primitives / 2张贴图含义不同。
- 温访问从校验后的缓存复用2,791,296 bytes模型。减少动态按操作渲染。后台暂停使用合成visibility事件验证处理逻辑，未验证真实操作系统后台调度。

未验证真实手机、Safari、慢速公网和屏幕阅读器。当前视觉经过人工检查；没有已认可的同风格历史基线，自动像素视觉回归结论仍为 **INCONCLUSIVE**。场景静音，实验角与声音不在当前范围；正文、公式与代码仍通过阅读页提供。

原雨夜场景专属文件清理与通用契约保留见 [迁移映射](migration.md)。首轮移除329个旧专属文件、约80.13 MB；历史可从 `08844b2` 恢复，忽略目录 `.room-build` 未改动。
