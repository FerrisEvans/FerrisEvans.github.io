---
key: markdown-writing-guide
title: Markdown 写作之旅：公式、图片与多语言代码
description: 一篇可直接参照的写作样例，包含文章头部、自动公式、普通图片、代码标签与草稿预览。
date: 2026-11-04
category: writing
tags: [markdown, 写作, 代码示例]
---

这篇笔记记录博客的日常写作方式。文章的标题、摘要和分类放在文件开头，正文继续使用普通 Markdown。旅行笔记、烘焙记录或编程教程，都可以沿用同一套流程。

预览前需要已检出本仓库、安装项目依赖，并使用 Node.js 22.23.4 或更高版本。下文命令均在项目根目录运行。内容组织与格式选择见[文档格式约定](/zh/about/writing/)。

## 从一个 Markdown 文件开始

在 `posts/zh/` 新建 `my-note.md`，并设置 `key: my-note`，文章地址就是 `/zh/posts/my-note/`。英文版放在 `posts/en/`，两份文件使用相同的 `key`。文章语言由所在目录推导，无需填写 `locale`。

```yaml
---
title: 我的新笔记
description: 用一句话介绍这篇文章。
date: 2026-11-04
category: writing
tags: [markdown, 笔记]
key: my-note
draft: true
---
```

`title`、`date`、`category` 和 `key` 必填。分类使用小写字母、数字和连字符，例如 `travel-notes`；标签可以直接写中文。文章发布后，新分类和标签会自动出现在索引中，无需手动登记。

`draft: true` 表示草稿。草稿可以暂时只有一种语言。预览和发布步骤如下：

1. 在项目根目录运行 `npm run dev`。
2. 在中文导航中选择**草稿**，打开文章并检查渲染效果。
3. 准备具有相同 `key` 的中英文版本，删除两份文件中的 `draft: true`，或都改成 `false`。
4. 确认准备公开后，将文件推送或合并到 `main`。这会触发网站部署流程。

日期用于展示和排序，不会自动预约发布。

## 公式直接写在正文里

行内公式用一对美元符号包围，例如 `$a^2+b^2=c^2$`：$a^2+b^2=c^2$。

其中，$a$ 和 $b$ 是直角三角形的两条直角边长度，$c$ 是斜边长度，三者使用相同单位。

独立公式写在两行 `$$` 之间：

```text
$$
\bar{x} = \frac{1}{n}\sum_{i=1}^{n}x_i
$$
```

$$
\bar{x} = \frac{1}{n}\sum_{i=1}^{n}x_i
$$

其中，$\bar{x}$ 是数值 $x_1,\ldots,x_n$ 的算术平均数，$n$ 是数值个数，且 $n>0$。平均数与输入数值的单位相同。

公式会自动识别并渲染。代码围栏中的公式文本保持原样，不会被当作正文公式。

## 图片也可以表达流程

流程图、截图和手绘图都可以作为普通图片插入。将图片放到 `posts/img/`，中英文文章都使用以 `../img/` 开头的相对路径：

```markdown
![RAG 流程：查询改写连接检索与答案生成](../img/rag.jpeg)
```

下面以检索增强生成（retrieval-augmented generation，RAG）流程为例：问题经过改写与路由后进入数据源检索，检索到的文档提供上下文，再由模型生成回答。

![RAG 流程：查询改写连接检索与答案生成](../img/rag.jpeg)

图示基于 LangChain 的 [RAG From Scratch 教程](https://github.com/langchain-ai/rag-from-scratch/blob/main/rag_from_scratch_1_to_4.ipynb)。

图片下方显示说明，点击图片可以放大查看。新增图片时，将图片文件与 Markdown 一起提交即可。

## 同一个例子，用不同语言阅读

下面两个 Godot 4 片段都在节点就绪时请求后台加载场景。请在包含 `res://Enemy.tscn` 的项目中使用节点脚本；C# 版本需要 Godot 的 .NET 构建版。片段省略了外围脚本声明，只发起加载请求，不等待加载完成，也不创建场景实例。点击标签选择语言，复制按钮只复制当前版本。

::: code-group labels=[GDScript, C#]

```gdscript
# 放在 Node 脚本中；省略 extends 声明。
const ENEMY_SCENE_PATH: String = "res://Enemy.tscn"

func _ready():
    ResourceLoader.load_threaded_request(ENEMY_SCENE_PATH)
```

```csharp
// 省略 using Godot; 和外围继承 Node 的 partial 类声明。
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

不同代码组可以独立切换。下面的两段代码都计算平均值：Python 版本在 Python 3 中运行，JavaScript 版本在浏览器控制台运行。两者结果均为 `5`，Python 显示为 `5.0`。

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

焦点位于代码标签时，左右方向键可切换语言，<kbd>Home</kbd> 和 <kbd>End</kbd> 分别跳到首尾标签。没有启用 JavaScript 时，所有版本会顺序显示，代码仍然可以阅读。

## 发布后自动出现的入口

文章发布后，博客首页、分类、标签、归档、RSS 和全文搜索都会随构建更新。正文的二、三级标题会自动生成目录。

普通链接也使用 Markdown。例如：[Agent 开发入门指南](/zh/posts/agent_dev_tutorial/)。链接另一篇文章时，填写最终文章地址，不使用源文件的 `.md` 路径。
