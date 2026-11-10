---
key: agent_dev_tutorial
title: "Agent 开发入门指南"
description: 面向智能体开发者的入门路线图：向量数据库、RAG 优化、ReAct 架构、记忆管理与生产化工程。
date: 2025-12-22
category: ai
subcategory: agent
tags: [agent, rag, vector-db, llm]
---

本文面向已掌握 Python、调用过大语言模型（large language model，LLM）API 的开发者，梳理智能体（AI agent）的学习路线，涉及检索增强生成（retrieval-augmented generation，RAG）[^rag]、架构、记忆管理和生产化工程。Python 示例用于说明控制流程，不对应特定 SDK；模型客户端、工具实现和存储初始化等内容已省略，不能直接作为完整程序运行。

在我看来，智能体开发的学习过程可以分为三个阶段：

1. API 集成：会用 LangChain、LangGraph 等框架，能运行官方示例，并通过文档排查问题。
2. 系统设计：理解智能体架构和 ReAct、Plan-and-Execute 等模式，能设计多智能体协作系统，并优化生产环境中的性能。
3. 基础设施设计：能从零实现智能体框架，理解 LLM 推理机制，并设计大规模智能体集群的调度系统。

先来抛出几个问题：

- 记忆设计：长对话的上下文怎么处理？摘要怎么存储？何时会丢失无法恢复的细节？如何评价回答质量？
- 如何选择适合业务的嵌入模型（embedding model）？知识检索和基于嵌入的意图分类都会受到模型选择的影响。
- 当一个请求包含多个意图和命名实体时，如何确定用户的真实需求？命名实体识别（named entity recognition，NER）在其中起什么作用？
- 中途任务强行结束怎么办？如何撤销？多工具分布调用如何解决？如何规划任务流程？
- 如何构建单模态或多模态 RAG 流程？如何提高并评价检索质量？智能体可以调用多个工具时，如何进行消融实验？知识库文档应该怎样切块？
- 如何评价智能体解决问题的质量：看是否完成用户任务，还是看每个步骤的结果？
- LangGraph 的 `StateGraph` 与普通函数调用链有什么区别？
- 如何设计支持百万并发任务的智能体调度系统？

构建智能体系统既需要理解 AI 系统特有的模式，也需要以下软件工程能力：

- 可观测性
- 高并发
- 低延迟
- 成本控制

## 基础概念

以下概念需要理解，不必背诵定义。例如，理解 RAG 不能停留在“给模型提供知识库”；还要知道检索外部信息如何帮助弥补模型的知识缺口、减少缺乏依据的回答。核心挑战是找到相关性最高的上下文。

- 嵌入向量
- 为什么需要向量数据库
- 余弦相似度
- RAG 的作用
- ReAct（reasoning and acting，推理与行动）[^react] 如何让 LLM 与外部工具交互
- 函数调用（function calling）的工作流程

> [!NOTE]
> 不要只把 LLM 当成黑盒 API。需要了解它的能力、限制和大致工作方式。

[Attention Is All You Need](https://arxiv.org/html/1706.03762v7) 这篇论文可以啃一遍，然后可以用 PyTorch 实现一个简单的 Transformer，过程也许会很痛苦，但是会对 LLM 底层原理有一个比较深刻的理解。

**提示词设计：** 学习少样本提示（few-shot prompting）、思维链（chain-of-thought，CoT）等技巧，设计自己的提示词模板库，并记录有效的示例。

## 向量数据库

一开始我以为，向量数据库无非是“存储嵌入向量，再做相似度搜索”。后来面试官问到为什么选择图索引、Milvus 为什么支持多种索引，以及不同场景该如何选择。

对向量数据库的理解最好不要停留在会用的层面，也要懂其中的原理。需要花点时间搞明白向量检索的核心算法。

- [HNSW（hierarchical navigable small world）](https://milvus.io/docs/hnsw.md)：使用分层图进行搜索，查询速度快，但图结构需要较多内存。
- [IVF（inverted file index，倒排文件索引）](https://milvus.io/docs/ivf-flat.md)：将向量划分为多个簇，搜索时选择部分簇，在速度与召回率之间取舍。
- [Annoy（随机投影树）](https://github.com/spotify/annoy)：支持可由多个进程共享的静态索引；准确率、查询速度与索引大小取决于参数设置。

可以尝试用 Milvus 搭建支持千万级向量的检索系统，重点研究以下问题：

- 新数据索引：如何让新文档的嵌入向量尽快可检索？
- 增量更新：怎么在不重建索引的情况下更新向量？
- 多租户隔离：怎么在共享集群里做租户级别的数据隔离？

## 改进基础 RAG 流程

以下 Python 片段展示一次检索与生成过程，假定 `vector_db.search()` 返回文本列表，`llm.generate()` 返回回答。

```python
# 省略模型和向量存储客户端；这里使用示意接口。
def naive_rag(query):
    docs = vector_db.search(query, top_k=5)
    context = "\n".join(docs)
    response = llm.generate(f"Context: {context}\nQuery: {query}")
    return response
```

这个基础实现可能检索到无关内容、浪费上下文空间，也可能难以回答需要综合多个来源的问题。它还缺少解释答案来源的机制。可以把它作为基线，先评估实际表现，再决定上线前需要哪些改进。

作为练习，可以搭建从文档上传、生成向量到问答的完整 RAG 系统：

- 对比 OpenAI、Cohere 和 BGE 系列的嵌入模型。
- 实现混合检索与重排序。

### 查询优化

- 查询改写：把用户的问题改写成更适合检索的形式。
- 查询分解：把复杂问题拆成几个子问题。
- 假设性文档嵌入（Hypothetical Document Embeddings，HyDE）：先让 LLM 生成假设性答案，再用它的嵌入向量进行检索。

### 检索优化

- 混合检索：将向量检索与 BM25 等关键词排序方法结合，并融合结果。
- 重排序：用交叉编码器（cross-encoder）重新排列结果。
- 上下文压缩：从检索结果中移除无关内容。

### 生成优化

- 自反思检索增强生成（self-reflective retrieval-augmented generation，Self-RAG）：让模型判断是否需要检索。
- 纠正性检索增强生成（corrective retrieval-augmented generation，CRAG）：评估检索结果的质量，结果不足时补充网络搜索。

## 智能体架构

构建智能体还需要设计决策过程：如何选择下一步、利用工具结果，以及判断任务何时完成。

### ReAct：推理与行动循环

ReAct 就是让 LLM 交替进行推理和行动。

可以从零实现一个 ReAct 智能体，练习状态管理。以下 Python 片段只展示循环结构；模型客户端、动作解析器、工具执行器、停止条件和最终回答逻辑需要另行实现。

```python
# 省略模型初始化、辅助函数和最终回答的生成逻辑。
def react_agent(task):
    history = []
    while not is_finished():
        # 推理：下一步该做什么
        thought = llm.generate(f"Task: {task}\nHistory: {history}\nThought:")
        # 行动：执行工具
        action = parse_action(thought)
        observation = execute_tool(action)
        history.append({"thought": thought, "action": action, "observation": observation})
    return final_answer
```

这里的问题是：

- 推理出错时，可以尝试 Reflexion[^reflexion] 等反馈机制，帮助智能体从错误中学习。
- 推理步骤过多时，可以尝试提供少样本示例。
- 任务过大时，可以拆成多个子任务，分别交给较小的 ReAct 循环处理。

### Plan-and-Execute：复杂任务

这个模式先让 LLM 生成计划，再逐步执行。以下 Python 片段约定 `replan()` 返回尚待执行的步骤，重规划后从新计划的第一步继续。规划器、执行器和失败判断函数的实现已省略。

```python
# 省略规划器、执行器和 need_replan() 的实现。
def plan_and_execute(task):
    # 生成计划
    plan = planner.generate_plan(task)
    # 执行计划
    results = []
    step_index = 0
    while step_index < len(plan):
        result = executor.execute(plan[step_index], context=results)
        results.append(result)
        # 如果执行失败，重新规划
        if need_replan(result):
            plan = planner.replan(task, results)
            step_index = 0
        else:
            step_index += 1
    return results
```

这个模式的难点在于：

- 生成计划：使用结构化输出，必要时用 JSON Schema 约束。
- 触发重规划：考虑执行失败、发现新信息和用户需求变更等情况。
- 并行执行：分析步骤间的依赖关系，判断哪些步骤可以同时进行。

作为练习，可以构建一个 Plan-and-Execute 智能体：

- 学习 LangGraph 的 [`StateGraph` API](https://docs.langchain.com/oss/python/langgraph/graph-api)。
- 实现带有条件分支、循环和并行执行的工作流。

### 多智能体协作

怎么让多个智能体协作完成任务？

- 设计智能体之间的通信协议。
- 实现智能体编排系统。
- 处理冲突与失败。

## 记忆管理

记忆系统的设计会影响智能体可利用的信息。以下三个 Python 片段展示一种组织方式；分词计数、模型调用、嵌入生成和数据库初始化需要由应用补齐。

### 工作记忆

将当前对话保存在缓冲区。示例中的 `count_tokens()` 应统计所有已保存消息的词元数；超过上限时，缓冲区删除最早的消息。

```python
# 省略 count_tokens()；具体实现取决于模型的分词器。
class ConversationBuffer:
    def __init__(self, max_tokens=2000):
        self.max_tokens = max_tokens
        self.messages = []
    
    def add_message(self, message):
        self.messages.append(message)
        # 超出词元数上限时，删除最早的消息。
        while self.count_tokens() > self.max_tokens:
            self.messages.pop(0)
```

### 短期记忆

定期将较早的消息压缩成摘要。这里的 `llm.summarize()` 应合并旧摘要与新消息，并返回更新后的摘要。

```python
# 省略模型客户端和 summarize() 的实现。
class SummaryMemory:
    def __init__(self):
        self.summary = ""
        self.recent_messages = []
    
    def add_message(self, message):
        self.recent_messages.append(message)
        
        # 累积超过 10 条消息后，更新一次摘要。
        if len(self.recent_messages) > 10:
            self.summary = llm.summarize(self.summary, self.recent_messages)
            self.recent_messages = []
```

### 长期记忆

将信息保存到向量数据库，按相关性检索。片段假定 `embed()` 返回数据库要求的向量格式，`memory_item` 提供代码中使用的字段。

```python
# 省略数据库初始化、embed() 和记忆条目类型的定义。
class VectorMemory:
    def store(self, memory_item):
        self.vector_db.insert({
            "text": memory_item.text,
            "embedding": embed(memory_item.text),
            "timestamp": memory_item.timestamp,
            "importance": memory_item.importance
        })
    
    def retrieve(self, query):
        return self.vector_db.search(query, top_k=5)
```

## 动手构建智能体

### 构建基础 RAG 系统

下图将查询改写、路由、检索和生成连接起来。索引阶段为文档检索做准备，生成后的反馈还可以触发新一轮检索。

![RAG 流程：查询改写和路由连接索引、检索与答案生成](../img/rag.jpeg)

图示基于 LangChain 的 [RAG From Scratch 教程](https://github.com/langchain-ai/rag-from-scratch/blob/main/rag_from_scratch_1_to_4.ipynb)。

可以先不用 LangChain：自行把文档切块，用 Sentence Transformers 生成嵌入向量，再存入本地的 Faiss 索引或 Chroma 数据库。用户提问后，查询向量存储，将检索到的文本加入提示词，再调用模型 API。过程中需要考虑：

- 文档怎么切分效果最好？
- 每次检索返回多少条结果（top-k）合适？
- 搜出来的东西不相关怎么办？

这些都是智能体开发需要解决的实际问题。

### 以真实场景驱动，构建一个代表作

选择一个范围有限、功能完整，能体现综合能力的项目。不要只设定“AI 聊天机器人”这样笼统的目标；可以将任务具体化，例如分析被投企业报告的智能助手。

业务场景：你所在的公司投资了很多初创企业，每个季度都会收到这些企业的 PDF 格式的财报和业务进展报告。目标是构建一个智能体，帮助阅读报告并回答关键问题，例如：

- A 公司这个季度的营收环比增长了多少？
- B 公司的主要风险是什么？
- 把 C 和 D 公司的用户增长数据做个对比。

要实现这个需求，就需要折腾以下这些事儿：

- 文档处理：如何提取 PDF 中的表格和图片文字？可以研究 Unstructured 等文档处理库。
- RAG 流程：如果基础检索效果不足，可以比较 HyDE、多查询检索等策略，也可以研究从报告中提取实体与关系、构建知识图谱的方法。
- 工具调用：计算环比增长时，不应依赖 LLM 直接给出准确的算术结果。可以定义计算工具，让模型调用工具并根据结果回答。

以上这个过程要怎么调试？LLM 为什么不按我们的意愿调用工具？也许需要用 LangGraph 或者自己实现一个 ReAct 循环来管理这个复杂的执行逻辑。

最后需要评估：智能体能多可靠地回答报告中的问题？可以先找 20 份报告，设计 100 个问题及参考答案，形成评估集。再使用 Ragas 等框架，评估回答对检索内容的忠实度和回答相关性。如果要声称效果优于人工阅读，还需要设置人工基线进行比较。没有评估，优化就缺少依据。

评估集也可能存在盲区。例如，用户换一种问法，系统就返回无关回答。评估集如果太小或过于理想化，就可能无法覆盖真实使用场景，需要补充这些情况。

完成项目后，可以在简历和面试中介绍：

- 如何解析 PDF，以及遇到的问题。
- 对比了哪些 RAG 策略，以及选择最终方案的原因。
- 如何设计和调试工具。
- 如何通过评估改进准确率，并给出项目中实际测得的结果。

## 生产化工程

安全和可靠性：

- 输入输出验证。
- 工具访问控制。
- 错误处理和重试机制。

### 成本和延迟意识

采用按词元（token）计费的 API 时，调用次数和上下文长度都会影响成本。设计不当的智能体可能为一个请求调用模型十几次，因此需要考虑：

- 怎么设计缓存策略？
- 能否用更小的模型，例如经过微调的本地模型，处理重复任务？
- 如何改进提示词以减少词元消耗？
- 哪些步骤适合并发或异步处理？

### 可观测性

智能体的执行过程可能难以追踪。LangSmith、Weights & Biases（W&B）等工具可以记录提示词、返回结果、中间步骤和词元用量，帮助定位生产环境中的失败环节。

作为练习，可以构建智能体追踪系统：

- 实现指标收集与监控。
- 构建可视化面板。

### 模型和工具链

除了 OpenAI，也可以了解 Llama、Mistral 等开放权重模型，以及 vLLM、Ollama 等部署工具。向量数据库除了 Chroma，还可以研究 Milvus、Weaviate 等方案的部署和运维要求。

## 信息源

保持技术敏感度，每周看看 [cs.AI](https://arxiv.org/list/cs.AI/recent) 和 [cs.CL](https://arxiv.org/list/cs.CL/recent) 的最新论文。

### GitHub 优质项目

- [Open Manus](https://github.com/FoundationAgents/OpenManus)
- [Agent Universe](https://github.com/agentuniverse-ai/agentUniverse)
- [Gemini CLI](https://github.com/google-gemini/gemini-cli)
- [Kode](https://github.com/shareAI-lab/Kode-cli)

### 实践教程

- [Happy LLM](https://datawhalechina.github.io/happy-llm/)：从零开始的大语言模型原理与实践
- [Easy VectorDB](https://datawhalechina.github.io/easy-vectordb/)：从零开始的向量数据库原理与实践
- [All in RAG](https://datawhalechina.github.io/all-in-rag/)：大模型应用开发实战：RAG 技术全栈指南
- [Hello Agents](https://datawhalechina.github.io/hello-agents/)：从零开始构建智能体
- [Base NLP](https://datawhalechina.github.io/base-nlp/)：从 NLP 到 LLM
- [Tiny Universe](https://github.com/datawhalechina/tiny-universe)：通过手动实现核心组件理解大语言模型
- [Handy Ollama](https://datawhalechina.github.io/handy-ollama/)：动手学习 Ollama，包括在 CPU 上运行大模型

---

[^rag]: [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/pdf/2005.11401)
[^react]: [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/pdf/2210.03629)
[^reflexion]: [Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/pdf/2303.11366)
