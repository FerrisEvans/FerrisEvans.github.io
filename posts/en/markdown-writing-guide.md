---
title: "Write blog posts with Markdown"
description: A hands-on guide to writing blog posts with frontmatter, math, images, tabbed code examples, and draft previews.
date: 2026-11-04
category: writing
tags: [markdown, 写作, 代码示例]
key: markdown-writing-guide
---

This post walks through the blog’s writing workflow. The title, summary, and category go at the top of the file; the body uses standard Markdown. You can use this workflow for travel notes, baking journals, and programming tutorials.

To follow the local preview steps, use a checkout of this repository with dependencies installed and Node.js 22.23.4 or later. Run commands from the project root. For decisions about structure and formatting, see [Writing conventions](/en/about/writing/).

## Start with a Markdown file

Create `my-note.md` in `posts/en/` and set `key: my-note`; its English URL will be `/en/posts/my-note/`. Put its Chinese counterpart in `posts/zh/` and give both files the same `key`. The article language is inferred from its directory, so no `locale` field is needed.

```yaml
---
title: My new note
description: Introduce the article in one sentence.
key: my-note
date: 2026-11-04
category: writing
tags: [markdown, notes]
draft: true
---
```

`title`, `date`, `category`, and `key` are required. Categories use lowercase letters, digits, and hyphens, such as `travel-notes`; tags may contain Chinese text. Once the article is published, new categories and tags appear in their indexes automatically, without manual registration.

`draft: true` marks a draft. A draft may have only one language version. To preview and publish:

1. Run `npm run dev` from the project root.
2. Open **Drafts** in the English navigation and select the article to check its rendering.
3. Prepare both Chinese and English versions with the same `key`. Remove `draft: true` or change it to `false` in both files.
4. Push or merge the files into `main` when you are ready to publish them. This triggers the site’s deployment workflow.

Dates control display and sorting; they do not schedule publication.

## Write math directly in the text

Wrap inline math in a pair of dollar signs. For example, `$a^2+b^2=c^2$` renders as $a^2+b^2=c^2$.

Here, $a$ and $b$ are the legs of a right triangle, and $c$ is its hypotenuse; measure all three lengths in the same unit.

For an equation on its own line, put `$$` on the lines immediately before and after it:

```text
$$
\bar{x} = \frac{1}{n}\sum_{i=1}^{n}x_i
$$
```

$$
\bar{x} = \frac{1}{n}\sum_{i=1}^{n}x_i
$$

Here, $\bar{x}$ is the arithmetic mean of the values $x_1,\ldots,x_n$, and $n$ is the number of values, with $n>0$. The mean has the same unit as the input values.

Equations are detected and rendered automatically. Math inside a fenced code block stays as text and is not treated as an equation in the article.

## Use images to explain a process

You can add flowcharts, screenshots, and hand-drawn diagrams with standard Markdown image syntax. Store shared images in `posts/img/`. Articles in both language folders use a relative path beginning with `../img/`:

```markdown
![RAG workflow connecting query rewriting, retrieval, and answer generation](../img/rag.jpeg)
```

The example below shows a retrieval-augmented generation (RAG) workflow: a question is rewritten and routed to a data source, retrieved documents provide context, and a model generates the answer.

![RAG workflow connecting query rewriting, retrieval, and answer generation](../img/rag.jpeg)

The diagram is based on LangChain’s [RAG From Scratch tutorial](https://github.com/langchain-ai/rag-from-scratch/blob/main/rag_from_scratch_1_to_4.ipynb).

A caption appears below the image, and clicking it opens a larger view. When adding an image, commit the image file alongside the Markdown.

## Show code examples in multiple languages

Both Godot 4 snippets below request background scene loading when the node is ready. Use a node script in a project that contains `res://Enemy.tscn`; the C# version requires Godot’s .NET build. The snippets omit the surrounding script declarations. They request loading but do not wait for completion or instantiate the scene. Choose a language using the tabs; the copy button copies only the selected version.

::: code-group labels=[GDScript, C#]

```gdscript
# In a Node script; the extends declaration is omitted.
const ENEMY_SCENE_PATH: String = "res://Enemy.tscn"

func _ready():
    ResourceLoader.load_threaded_request(ENEMY_SCENE_PATH)
```

```csharp
// The using Godot; directive and enclosing Node-derived partial class are omitted.
private const string EnemyScenePath = "res://Enemy.tscn";

public override void _Ready()
{
    ResourceLoader.LoadThreadedRequest(EnemyScenePath);
}
```

:::

The syntax is shown below. Each entry in `labels` corresponds to a code block. Wrap the blocks in `::: code-group` and `:::`; no component import is needed.

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

Selecting a tab in one code group does not affect the others. The next examples calculate an average. Run the Python version in Python 3 or the JavaScript version in a browser console; each prints `5` (displayed as `5.0` in Python).

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

With focus on a tab, use the left and right arrow keys to switch languages. <kbd>Home</kbd> and <kbd>End</kbd> move to the first and last tabs. Without JavaScript, all versions appear in sequence, so the code remains readable.

## Where an article appears after publication

When you publish a post, the next build adds it to the blog’s home page, category and tag pages, archives, RSS feed, and full-text search index. The table of contents is generated automatically from level-two and level-three headings.

Use standard Markdown syntax for links, too: [Introduction to AI agent development](/en/posts/agent_dev_tutorial/). When linking to another article, use its published URL rather than the path to its `.md` source file.
