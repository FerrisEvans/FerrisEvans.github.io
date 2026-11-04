# 小岛改版首轮历史验收记录

> 历史快照：本文只记录首轮构建 `472d79502b058a1cb3eb`。后续相机、路由、品牌与模型扩充的最终结果见 [QA.md](QA.md)。本文链接的部分截图和 JSON 已被后续证据更新，不能据此还原首轮完整证据集；旧版尺寸、性能与“无外部资产”等描述不代表当前版本。

2026-11-04，Asia/Singapore。基线 `08844b2`；工作分支 `codex/island-home-3d`。
本地交付，未提交、推送、合并或部署。最终模型/运行时/封面构建标识：`472d79502b058a1cb3eb`。

## 分阶段结果

| 阶段 | 实际结果 | 可查看证据 |
| --- | --- | --- |
| 1 · 核实与设计 | 核实干净基线、现有头像、LO-FI 色彩字体、16 篇文章与4个真实分类。确定原创建模、紧凑小岛和轻量首页。候选外部素材仅核对页面，未下载或使用 | [设计与预算](DESIGN.md)、[布局参考图](layout-reference.webp)；参考图不是模型截图 |
| 2 · 空间与交互 | 约束镜头支持竖屏；最近可见表面拾取；四个核心物件及标签/信箱使用同一内容适配器；原生 HTML 面板、静态回退、历史与焦点恢复 | [灰材质空间检查](previews/greybox.png)、[生产交互记录](flow-evidence.json)；灰材质视图由当前同一模型生成，用于空间检查 |
| 3 · 局部质量 | 小熊、门前书桌和公告板完成原创模型；眼镜、嫩芽、书本与站内头像一致。实际 Blender Idle/Attention/Wave clips 以短交叉淡入淡出衔接 | [挥手帧](previews/bear-wave.png)、[回到阅读](previews/bear-reading.png)、[实际 WebGL 动画](previews/bear-animation.webm) |
| 4 · 全站衔接 | 首页、深浅小岛、加载图、分享图来自同一 WebGL 场景；无自动模型/Three 下载；按探索意图预取；共享现有主题和阅读入口 | [首页](previews/home-desktop.webp)、[夜间首页](previews/home-desktop-night.webp)、[手机首页](previews/home-mobile.webp)、[手机内容面板](previews/room-mobile-about.png) |
| 5 · 回归与清理 | 构建、类型、46项单测、内容发布生命周期、LO-FI 搜索/指南及场景异常路径通过。移除329个旧专属文件、约80.13 MB；通用缓存/时序/发布契约保留 | [验证结果](validation.json)、[迁移映射](migration.md)、[UI 检查](previews/ui-checks.json) |

建模源为 [island.blend](../../assets/island/island.blend)，生成器为 [build_scene.py](../../scripts/island/build_scene.py)。模型、动画和环境没有使用下载或付费资产；详见 [来源记录](../../scripts/island/SOURCES.md)。完整建模同时保留分组与关键帧，不依赖截图作为模型源。

## 验证范围

- `npm run audit:deps`：通过，0项漏洞。
- `npm test`：46/46 通过，保留内容发布、二进制缓存、加载时序测试，新增模型与封面封存契约。
- `npm run check`、`npm run build`、`npm run verify:build`：通过；64个 HTML 页面、16篇文章，资源和内部链接检查通过。
- `test:authoring`：在隔离副本中验证草稿隐藏、开发预览、发布、自动发现分类/标签、搜索索引和删除；首页与小岛同步更新，模型/资产清单不因发文章改变。
- `test:browser`、`test:guides`：阅读入口、LO-FI 搜索、Markdown 数学/代码/图片、全部三篇指南及无 JS 阅读回归通过。
- `test:room-flow`：四个核心物件直接射线拾取、悬停提示、拖动不误点、六个 DOM 面板、Escape/焦点恢复、返回/前进/深链接、手机触摸、主题及减少动态、503后重试、无 WebGL、无 JS、上下文丢失后恢复、重复进出和加载中离开均通过。
- 后台暂停验证使用**合成 visibility 事件**覆盖事件处理与停止/恢复逻辑，不能当作所有浏览器真实后台调度证据。
- 生产截图检查：浏览器脚本错误0、HTTP错误0、重复ID 0、可见无名称按钮0、横向溢出0。首页抽样 CLS 0，手机小岛抽样 CLS约0.019。键盘/原生对话框检查通过；没有运行完整屏幕阅读器或 axe 审计，不声明全面 WCAG 合规。
- 首页初始不请求 GLB/Three；浅/深主题各只请求相应封面，无 JS 使用浅色封面。
- 旧根 worker 清退保持独立回归：不注册新 worker、不接管请求，保留其他应用的缓存/worker。

## 实测资源与帧间隔

Chrome **156.0.8078.80**，macOS arm64 / **Apple M3 Max**，ANGLE Metal，headless。
本机 HTTP，无网络/CPU限速。每个冷测使用新浏览器 context；温缓存沿用同一 context。
每组采样180个 `requestAnimationFrame` 间隔。原始记录：[browser-metrics.json](browser-metrics.json)。

| 条件 | 视口 / 实际绘图缓冲 | 冷 / 温 readyMs | 帧间隔中位数 / P95 |
| --- | --- | --- | --- |
| 桌面 | 1440×900，DPR1；场景1440×688 | 127 / 81 ms | 16.7 / 16.7 ms |
| 手机尺寸模拟 | 390×844，设备DPR2，渲染DPR1.5；场景585×861 | 91 / 70 ms | 16.7 / 16.7 ms |

`readyMs` 是**岛屿加载入口启动到首帧**的耗时，排除了此前 HTML/CSS/入口脚本下载；不是导航时间、公网加载时间或 LCP。
帧间隔约等于当前本机60 FPS，不是GPU计时，更不能推导真实手机稳定60 FPS。

- 模型 **2,355,956 bytes**，88,316三角面、94个模型绘制批次、31材质、0模型贴图。
- 模型加已传输的场景/入口脚本约 **2.53 MB**，低于最初约5 MB的核心资源目标。
- 冷测已记录资源响应体总计约 **5.20 MB**，其中共享字体约 **2.41 MB**。这个总量不等于2.53 MB核心场景，也不含主HTML；不能把全页冷加载宣传为低于5 MB。
- 浅色封面64,710 bytes；深色71,370 bytes；分享图49,368 bytes。首页不会为阅读用户加载模型。
- 实际渲染统计189 calls / 176,634 triangles，包含阴影遍历；95 geometries / 3 renderer textures。模型报告的94批次不等于包括阴影后的总绘制调用。
- 温访问成功复用2,355,956 bytes模型缓存。背景页停止持续RAF，减少动态采用按操作渲染。

## 遗留验证边界

本地功能验收通过，提供可继续修改的源文件与预览。视觉截图建立了新版初始基线；由于没有已认可的旧版同风格基线，自动视觉回归判断为 **INCONCLUSIVE**，本次采用实际画面的人工检查。

尚未验证真实手机、Safari、慢速公网和屏幕阅读器。实验角与声音未纳入首版，场景保持静音；标签采用通用目录，内容增长不新增3D物件。完整正文、公式与代码仍在现有阅读页。
