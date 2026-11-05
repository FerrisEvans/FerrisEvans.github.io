---
locale: zh
translationKey: markdown-writing-guide
title: Markdown 写作之旅：公式、图片与多语言代码
description: 一篇可直接参照的写作样例，包含文章头部、自动公式、普通图片、代码标签与草稿预览。
pubDate: 2026-11-04
category: writing
tags: [markdown, 写作, 代码示例]
---

这篇笔记记录博客的日常写作方式。文章的标题、摘要和分类放在文件开头，正文继续使用普通 Markdown。旅行笔记、烘焙记录或编程教程，都可以沿用同一套流程。

## 从一个 Markdown 文件开始

在 `posts/zh/` 新建 `my-note.md`，文章地址就是 `/zh/posts/my-note/`。英文版放在 `posts/en/`，两份文件使用相同的 `translationKey`。

```yaml
---
title: 我的新笔记
description: 用一句话介绍这篇文章。
pubDate: 2026-11-04
category: writing
tags: [markdown, 笔记]
locale: zh
translationKey: my-note
draft: true
---
```

`title`、`pubDate`、`category`、`locale` 和 `translationKey` 必填。分类使用小写字母、数字和连字符，例如 `travel-notes`；标签可以直接写中文。新分类和标签会自动出现在索引中，无需手动登记。

`draft: true` 表示草稿。运行 `npm run dev`，在导航的「草稿」中打开预览。草稿可以暂时只有一种语言。准备发布后，须提供相同 `translationKey` 的中英文版本，删除两份文件中的这一行或都改成 `false`，再将文件推送或合并到发布分支 `main`。日期用于展示和排序，不会自动预约发布。

## 公式直接写在正文里

行内公式用一对美元符号包围，例如 `$a^2+b^2=c^2$`：$a^2+b^2=c^2$。

独立公式写在两行 `$$` 之间：

```text
$$
\bar{x} = \frac{1}{n}\sum_{i=1}^{n}x_i
$$
```

$$
\bar{x} = \frac{1}{n}\sum_{i=1}^{n}x_i
$$

公式会自动识别并渲染。代码围栏中的公式文本保持原样，不会被当作正文公式。

## 图片也可以表达流程

流程图、截图和手绘图都可以作为普通图片插入。将图片放到 `posts/img/`，中英文文章都使用以 `../img/` 开头的相对路径：

```markdown
![RAG 流程示意图](../img/rag.jpeg)
```

![RAG 流程示意图](../img/rag.jpeg)

图片下方显示说明，点击图片可以放大查看。新增图片时，将图片文件与 Markdown 一起提交即可。

## 同一个例子，用不同语言阅读

下面两个版本都在节点就绪时请求异步加载场景。点击标签选择熟悉的语言，复制按钮只复制当前版本。

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

写法如下。`labels` 中的标签与代码块一一对应，外面用 `::: code-group` 和 `:::` 包围，不需要导入组件。

````markdown
::: code-group labels=[GDScript, C#]

```gdscript
print("Hello")
```

```csharp
GD.Print("Hello");
```

:::
````

不同代码组可以独立切换。例如，下面是另一组计算平均值的代码：

::: code-group labels=[Python, JavaScript]

```python
values = [3, 5, 7]
average = sum(values) / len(values)
print(average)
```

```javascript
const values = [3, 5, 7];
const average = values.reduce((sum, value) => sum + value, 0) / values.length;
console.log(average);
```

:::

键盘左右方向键可切换语言，Home 和 End 分别跳到首尾标签。没有启用 JavaScript 时，所有版本会顺序显示，代码仍然可以阅读。

## 发布后自动出现的入口

文章发布后，博客首页、分类、标签、归档、RSS 和全文搜索都会随构建更新。正文的二、三级标题会自动生成目录。

普通链接也使用 Markdown。例如：[Agent 开发入门指南](/zh/posts/agent_dev_tutorial/)。链接另一篇文章时，填写最终文章地址，不使用源文件的 `.md` 路径。
