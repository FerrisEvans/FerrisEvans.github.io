---
title: "Writing with Markdown: Math, Images, and Code in Multiple Languages"
description: A practical writing example covering frontmatter, automatic math rendering, ordinary images, code tabs, and draft previews.
pubDate: 2026-11-04
category: writing
tags: [markdown, 写作, 代码示例]
locale: en
translationKey: markdown-writing-guide
---

This note documents the everyday writing workflow for the blog. The title, summary, and category go at the top of the file; the body uses ordinary Markdown. Travel notes, baking journals, and programming tutorials can all follow the same process.

## Start with a Markdown file

Create `my-note.md` in `posts/en/`; its English URL will be `/en/posts/my-note/`. Put its Chinese counterpart in `posts/zh/` and give both files the same `translationKey`.

```yaml
---
title: My New Note
description: Introduce the article in one sentence.
locale: en
translationKey: my-note
pubDate: 2026-11-04
category: writing
tags: [markdown, notes]
draft: true
---
```

`title`, `pubDate`, `category`, `locale`, and `translationKey` are required. Categories use lowercase letters, digits, and hyphens, such as `travel-notes`; tags may contain Chinese text. New categories and tags appear in their indexes automatically, without manual registration.

`draft: true` marks a draft. Run `npm run dev` and open **Drafts** in the navigation to preview it. A draft may have only one language version. To publish, prepare both Chinese and English versions with the same `translationKey`, remove `draft: true` or change it to `false` in both, and push or merge the files into the publishing branch, `main`. Dates control display and sorting; they do not schedule publication.

## Write math directly in the text

Wrap inline math in a pair of dollar signs. For example, `$a^2+b^2=c^2$` renders as $a^2+b^2=c^2$.

For a display equation, place it between two lines containing `$$`:

```text
$$
\bar{x} = \frac{1}{n}\sum_{i=1}^{n}x_i
$$
```

$$
\bar{x} = \frac{1}{n}\sum_{i=1}^{n}x_i
$$

Equations are detected and rendered automatically. Math inside a fenced code block stays as text and is not treated as an equation in the article.

## Use images to explain a process

Flowcharts, screenshots, and hand-drawn diagrams can all be inserted as ordinary images. Store shared images in `posts/img/`. Articles in both language folders use a relative path beginning with `../img/`:

```markdown
![RAG workflow diagram](../img/rag.jpeg)
```

![RAG workflow diagram](../img/rag.jpeg)

A caption appears below the image, and clicking it opens a larger view. When adding an image, commit the image file alongside the Markdown.

## Read the same example in different languages

Both versions below request asynchronous scene loading when the node is ready. Choose the language you prefer using the tabs; the copy button copies only the selected version.

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

Each code group can be switched independently. Here is another group, this time calculating an average:

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

Use the left and right arrow keys to switch languages. Home and End move to the first and last tabs. Without JavaScript, all versions appear in sequence, so the code remains readable.

## Where an article appears after publication

After publication, the blog home, categories, tags, archives, RSS, and full-text search update with the next build. Second- and third-level headings in the body automatically form the table of contents.

Ordinary links also use Markdown. For example: [Getting Started with Agent Development](/en/posts/agent_dev_tutorial/). When linking to another article, use its final URL, not the `.md` path of its source file.
