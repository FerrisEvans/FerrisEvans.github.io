> 历史图片/录屏已归档到本地验收产物，不随本次发布进入 Git；请以 [当前验收](QA.md) 为准。

# 未尽 · 林间庭院首页本地验收

2026-11-04，Asia/Singapore。分支 `codex/island-home-3d`，历史基线 `08844b2`。本地修改，未提交、推送或部署。当前模型、运行源、三张真实 WebGL 封面和生产构建统一为 **`983e65e5080cacdee725`**。

用户否定的上一版“封面首页 + 独立小岛 + 原创书屋”保存为 [QA-before-garden.md](QA-before-garden.md)，不能作为本轮视觉或性能证据。更早的 [QA-initial.md](QA-initial.md) 同样是历史记录。

## 当前首页与场景

`/` 进入后直接加载真实 3D 庭院。没有独立探索按钮或普通文章列表区；六个场景物件、可访问标记和底部导航打开真实 HTML 内容：书架→全部笔记与搜索，书桌→最近更新与归档，喷泉→分类，小熊→关于与指南，植物角→标签，收音机→订阅与联系。无 WebGL、资源失败或无 JavaScript 时保留完整静态目录。

`/island/` 与 `/room/` 兼容跳转到 `/`，脚本跳转保留 query/hash。笔记目录为 `/notes/`、`/notes/page/N/`。全站共享六项导航：首页、笔记、分类、标签、归档、关于；品牌“未尽”、图标和全局原生鼠标指针保持一致。首页 h1 保留在无障碍树，不重复显示大标题。

新主体使用五个真实外部素材包搭建森林、地面、书架、书桌、座椅、灯、喷泉、植物和鸟，保留原有小熊及 Idle / Attention / Wave 三个角色动作。实际使用 **53 种源模型、138 个源模型实例**；不再是只放四件装饰道具。原始 glTF/BIN/PNG、许可和 SHA-256 记录保存在 vendor，GLB 的 `extras.vendorAssets` 与报告采用清单完全对应。

| 素材包 | 实际采用种类 | 作者 |
| --- | ---: | --- |
| Tiny Treats - Pretty Park 1.0 | 20 | Isa Lousberg / Tiny Treats |
| Tiny Treats - Pleasant Picnic 1.0 | 10 | Isa Lousberg / Tiny Treats |
| Tiny Treats - House Plants 1.0 FREE | 8 | Isa Lousberg / Tiny Treats |
| KayKit Furniture Bits 1.0 | 7 | Kay Lousberg / KayKit |
| KayKit Forest Nature Pack 1.0 FREE | 8 | Kay Lousberg / KayKit |

五包实际许可均为 CC0-1.0；未使用付费内容，也未宣称使用未取得的 Kenney 模型。详见 [来源记录](../../scripts/island/SOURCES.md) 与 [模型报告](../../public/island/model-report.json)。可编辑 [Blender 源](../../assets/island/island.blend) 和 [生成器入口](../../scripts/island/build_scene.py) 保留；所有拆分 Python 模块、vendor 文件、运行源与样式均纳入封存。[流水线](../../scripts/island/ASSET_PIPELINE.md)

最终画面入口：[浅色首页](previews/home-desktop.webp)、[深色首页](previews/home-desktop-night.webp)、[手机首页](previews/home-mobile.webp)、[植物角面板](previews/garden-plants.webp)、[实际 WebGL 画布镜头/角色录像](previews/garden-interaction.webm)。录像由 canvas.captureStream 与 MediaRecorder 生成，不包含 HTML 面板。根任务在性能采样结束后完成最终视觉检查；本轮还更新了[分类面板](previews/island-categories.webp)与[手机关于面板](previews/island-mobile-about.webp)；`room-*`及未在本轮重新生成的旧截图仅作历史记录。

## 输入与镜头回归

独立浏览器审阅实际复现了三个输入问题：首个纵向触摸滚动前镜头漂移4.153 px；从标记开始拖18 px误开面板；标记区域 Ctrl+wheel 不缩放。修复后使用真实 Chrome 触摸/鼠标事件验证：首触页面滚272 px、镜头位移 **0 px**；标记拖动改变相机约9.954 px且不打开面板；标记 Ctrl+wheel 改变投影约21.451 px，文档缩放/滚动不变。见 [修复前](input-regression-before.json) / [修复后](input-regression.json)。

扩大回归还发现触摸兼容 click 在 pointerup 打开 modal 后被重定向到背景，导致面板马上关闭。现在 pointerup 只记录通过阈值的目标，在同一次原生 click 上打开；新 pointerdown/cancel 清空待激活目标。六个标记的真实 tap、直接触摸小熊 mesh、关闭、Escape 和 Back 均通过，且打开350 ms后仍保持面板。键盘仍走原生 button 激活。

OrbitControls 覆盖整个场景区域，host 与 canvas 都允许 `pan-y`；单指方向确定前不改变镜头，纵向留给页面，明确横向才环顾。普通 wheel 滚页面，Ctrl/Meta wheel 缩放。实际离开视口停止渲染，返回恢复。滚动回归追加临时空白区域提供可滚动距离；没有伪造滚动或 IntersectionObserver。

相机从完整当前状态平滑过渡，打开、关闭、自由拖转缩放后的重置和面板内“回到全景”均验证。以下为真实投影位置连续71帧采样，不是 GPU 时间：

| 操作 | 总位移 | 第一帧位移 | 最大单帧位移 |
| --- | ---: | ---: | ---: |
| orbit/zoom reset | 100.384 px | 0.016 px | 4.679 px |
| open content | 295.563 px | 0.027 px | 11.732 px |
| in-panel overview reset | 295.563 px | 0.06 px | 12.708 px |
| close after history/reload | 425.792 px | 0.07 px | 18.278 px |

重置终点与原构图误差小于1 px；减少动态终点偏差0 px。七项真实 Three Camera/OrbitControls 单测覆盖相机过渡和首触方向分类。完整生产交互记录见 [flow-evidence.json](flow-evidence.json)。

## 资源与测试

GLB **2,706,068 bytes**，72,488个唯一 mesh 三角面，41 meshes / 42唯一 primitives，21材质，6张内嵌贴图。报告字段 `drawCalls` 是唯一 primitive 数，不能当实际 renderer 调用数。浏览器实际89 calls / 147,586 triangles（包含实例与阴影遍历），43 geometries / 9 renderer textures。

三张封面来自同一实际浏览器场景：浅色100,876 bytes、深色97,762 bytes（均1440×1200），分享图69,474 bytes（1200×630）。昼夜只请求匹配的一个封面；首页现在会自动下载模型与 renderer。模型缓存按内容哈希校验并在温访问复用。

- **58/58单测通过**：内容与Markdown、独立源哈希失效、模型实际来源、相机/触摸、资源释放、缓存及加载时序。
- 类型检查、完整构建、资源封存校验、内部链接校验通过：**68个HTML、16篇文章、19个Pagefind索引页**。
- 生产 flow 10个状态全部通过，未处理脚本错误0：六 mesh 实点、六marker键盘与真实tap、拖动/滚轮/首触/离屏、相机/焦点/历史、深浅主题、减少动态、503重试、WebGL丢失恢复、重复访问、加载中离开、无 WebGL及无 JS。
- 隔离 authoring 草稿→发布→删除完整通过；新 Markdown 自动出现于首页真实场景面板、笔记/分类/标签/归档/RSS/站点地图/Pagefind；模型、manifest与分类配置未改变。首轮开发草稿即时查询未就绪，加入明确元素等待后最终完整运行通过，失败轮未记为通过。
- 生产 reading / guides 全部通过：共享导航、全局cursor、旧入口迁移、分页、移动菜单、标签、图片、代码复制、数学、搜索与三篇指南。它们在最终 touch click 时序小修前运行，相关页面/样式/路由未改变；受影响输入在最终生产构建重新完整验证。
- 资源释放测试覆盖共享 geometry/material/texture/decoded bitmap 去重释放、hover克隆前原材质、取消后晚到glTF；浏览器恢复与反复进出通过，不等同于跨浏览器长期堆内存测试。旧worker退役与其他应用缓存保留仍独立通过。

结果：[validation.json](validation.json)，[命令摘要](test-output.txt)。最终 [9 组 UI 检查](previews/ui-checks.json) 于2026-11-04T12:12:00Z生成：记录到的脚本错误、横向溢出、重复ID均为0；桌面深色、手机内容面板已人工目视。本轮未采集CLS、HTTP失败或可见无名称按钮统计，未沿用上一版数值。

## 本机性能边界

Chrome **156.0.8078.80**，Apple M3 Max / macOS arm64，ANGLE Metal，headless。所有功能浏览器关闭后独占采样；本地 HTTP，无网络/CPU限速，每组180个 requestAnimationFrame 间隔。冷测新建context，温测复用context。[原始结果](browser-metrics.json)

| 条件 | 视口 / 实际绘图缓冲 | 冷 / 温 readyMs | 中位数 / P95 |
| --- | --- | ---: | ---: |
| 桌面 | 1440×900，DPR1；1392×616 | 159 / 103 ms | 16.7 / 16.8 ms |
| 手机视口模拟 | 390×844，设备DPR2、绘图DPR1.5；585×670 | 124 / 97 ms | 16.7 / 16.8 ms |

`readyMs` 从运行入口至首帧，排除之前HTML/CSS/入口脚本下载，不是导航耗时或LCP。rAF间隔是调度采样，不是GPU计时；一组本地样本不能外推为真实手机或公网性能。

已记录冷测响应体 **5,582,364 bytes**（不含主HTML），其中共享字体 **2,407,444 bytes**；GLB与脚本合计 **2,876,854 bytes**。核心场景低于初始约5 MB预算，但不能把整页冷加载宣传为低于5 MB。温访问复用2,706,068 bytes模型。

真实离屏暂停已验证；后台visibility处理另用合成事件验证，未声称真实OS后台测量。未验证物理手机、Safari、慢网、完整屏幕阅读器/axe。缺少已认可的同风格历史基线，像素视觉回归结论为 **INCONCLUSIVE**。首轮雨夜资产清理与通用契约保留是历史事项，见[迁移映射](migration.md)；恢复点`08844b2`，`.room-build`未改动。
