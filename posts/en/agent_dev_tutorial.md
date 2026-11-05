---
title: "Getting Started with Agent Development"
description: A roadmap for aspiring agent engineers, covering vector databases, RAG optimization, ReAct architectures, memory, and production engineering.
pubDate: 2025-12-22
category: ai
subcategory: agent
tags: [agent, rag, vector-db, llm]
locale: en
translationKey: agent_dev_tutorial
---


I think of an AI agent engineer’s development in three broad stages:
1. API integration engineer: you can use frameworks such as LangChain and LangGraph, get the official demos running, and turn to the documentation when something goes wrong.
2. Systems design engineer: you understand agent architectures and patterns such as ReAct and Plan-and-Execute, can design complex systems in which multiple agents collaborate, and know how to optimize performance in production.
3. Infrastructure architect: you can build an agent framework from scratch, understand LLM inference in depth, and design scheduling systems for large agent clusters.

Let me start with a few questions:
- Memory design: how do you manage the context of a long conversation? Where do summaries go? After how many turns can you no longer recover earlier details? How do you evaluate answer quality?
- How do you choose a semantic embedding model? How do you determine which model best fits your business? Both knowledge retrieval and intent recognition depend on this.
- When several intents appear at once, and named entity recognition (NER) is involved, how do you determine what the user actually wants?
- What happens when a task is forcibly stopped halfway through? How can its actions be undone? How do you coordinate distributed calls to multiple tools and plan the workflow?
- How do you build single-modal or multimodal RAG retrieval? How do you improve and evaluate retrieval quality? How should you run ablation studies when a prompt includes many tools? What is the right way to chunk knowledge-base documents?
- How do you evaluate an agent’s ability to solve a problem: by whether it completes the user’s task, or by the quality of each step along the way?
- Why does LangGraph use StateGraph? How is it fundamentally different from an ordinary chain of function calls?
- How would you design an agent scheduler that supports a million concurrent tasks?

An agent system is still a complex software system. It requires the following engineering skills, alongside an understanding of—and practice with—the patterns specific to AI systems:
1. Observability.
2. High concurrency.
3. Low latency.
4. Cost control.

## 1. Core concepts

Understand these concepts; you do not need to memorize their definitions. With RAG, for example, it is not enough to know that you feed the model a knowledge base. You need to understand that it addresses outdated knowledge and hallucinations in LLMs. The central challenge is retrieving the most relevant context accurately.
1. Embeddings.
2. Why vector databases are needed.
3. Cosine similarity.
4. What <u>RAG</u>[^rag]—retrieval-augmented generation—actually does.
5. How <u>ReAct (Reasoning and Acting)</u>[^react] lets an LLM interact with external tools.
6. The function-calling workflow.

> [!NOTE]
> Do not treat an LLM as a black-box API. Understand what it can and cannot do, and roughly how it does it.

Work your way through [`Attention Is All You Need`](https://arxiv.org/html/1706.03762v7), then try implementing a simple Transformer in PyTorch. The process may be painful, but it will give you a much deeper understanding of the foundations of LLMs.

> [!TIP]
> **Prompt engineering**
>
> Learn techniques such as few-shot prompting and chain-of-thought (CoT). Build your own prompt template library and collect prompts that work well.

## 2. Vector databases

At first, I thought a vector database was just a place to “store embeddings and run similarity searches.” Then an interviewer asked me: “Why does Pinecone use HNSW? Why does Milvus support multiple indexes? Which index should you choose for which situation?”

Try to understand vector databases beyond the level of simply using them. Spend some time on the <span style="color: red;">core algorithms behind vector retrieval</span>.
- *HNSW (a hierarchical graph structure)*: fast queries, but high memory usage. Suitable for high-QPS workloads.
- *IVF (an inverted index with clustering)*: suitable for large-scale offline retrieval.
- *Annoy (random projection trees)*: lower memory usage, with somewhat lower recall.

A useful small project is to build a retrieval system in Milvus that handles tens of millions of vectors. Be ready to work through problems such as:
- Cold starts: how do you index embeddings for new documents quickly?
- Incremental updates: how do you update vectors without rebuilding the index?
- Tenant isolation: how do you isolate each tenant’s data in a shared cluster?

## 3. Move beyond naive RAG

```python
def naive_rag(query):
    docs = vector_db.search(query, top_k=5)
    context = "\n".join(docs)
    response = llm.generate(f"Context: {context}\nQuery: {query}")
    return response
```

The weaknesses of this RAG implementation are poor retrieval quality, wasted context space, an inability to handle multi-hop reasoning, and limited explainability. Naive RAG is a starting point; for production, you need to learn how to improve it.

> [!TIP]
> **Build a complete RAG system, from document uploads and embedding generation to question answering.**
>
> - Compare embedding models from OpenAI, Cohere, and BGE.
> - Implement hybrid search and reranking.

### 3.1. Query optimization

- *Query rewriting*: rewrite the user’s question into a form better suited to retrieval.
- *Query decomposition*: split a complex question into several smaller questions.
- *HyDE*: have the LLM generate a hypothetical answer, then use that answer for retrieval.

### 3.2. Retrieval optimization

- *Hybrid search*: combine vector retrieval with BM25 and fuse the two result sets.
- *Reranking*: reorder results with a cross-encoder.
- *Contextual compression*: remove irrelevant content from the retrieved context.

### 3.3. Generation optimization

- *Self-RAG*: let the model decide whether retrieval is needed.
- *CRAG*: assess the quality of retrieved results and fall back to web search when they are inadequate.

## 4. Agent architectures

An agent is more than “LLM + tools,” with a few tool calls added on. The central challenge is designing the reasoning process.

### 4.1. ReAct: fundamental and essential

ReAct alternates between reasoning and acting.

> [!TIP]
> Implement a ReAct agent from scratch. The process will teach you how agent state management works.

```python
def react_agent(task):
    history = []
    while not is_finished():
        # Reason: decide what to do next.
        thought = llm.generate(f"Task: {task}\nHistory: {history}\nThought:")
        # Act: execute a tool.
        action = parse_action(thought)
        observation = execute_tool(action)
        history.append({"thought": thought, "action": action, "observation": observation})
    return final_answer
```

This raises a few questions:
1. *What if the reasoning is wrong?* You need a mechanism such as <u>Reflexion</u>[^reflexion], so the agent can reflect on its mistakes.
2. *What if reasoning is inefficient?* Provide high-quality reasoning examples through few-shot prompting.
3. *What if the task is too long?* Use hierarchical ReAct to break it into subtasks.

### 4.2. Plan-and-Execute: complex tasks

In this pattern, the LLM first generates a complete plan and then executes it step by step. This simplified example assumes that `replan()` returns the remaining steps; execution then resumes at the start of the new plan.

```python
def plan_and_execute(task):
    # Generate the plan.
    plan = planner.generate_plan(task)
    # Execute the plan.
    results = []
    step_index = 0
    while step_index < len(plan):
        result = executor.execute(plan[step_index], context=results)
        results.append(result)
        # Replan if execution fails.
        if need_replan(result):
            plan = planner.replan(task, results)
            step_index = 0
        else:
            step_index += 1
    return results
```

The difficult parts are:
- *Generating a high-quality plan*: use structured output, perhaps constrained by JSON Schema.
- *Deciding when to replan*: execution failures, newly discovered information, or changes in the user’s requirements.
- *Identifying steps that can run in parallel*: analyze the dependencies between them.

> [!TIP]
> Build a Plan-and-Execute agent.
>
> - Learn the StateGraph design pattern.
> - Implement complex agent workflows with conditional branches, loops, and parallel execution.

### 4.3. Multi-agent collaboration: the most complex case

How do you get several agents to complete a task together?
- Design a communication protocol between agents.
- Implement an orchestration system.
- Handle conflicts and failures.

## 5. Memory

The design of a memory system directly affects an agent’s capabilities.

Layer one: working memory, or the context of the current conversation.

```python
class ConversationBuffer:
    def __init__(self, max_tokens=2000):
        self.max_tokens = max_tokens
        self.messages = []
    
    def add_message(self, message):
        self.messages.append(message)
        # Remove the oldest messages when the token limit is exceeded.
        while self.count_tokens() > self.max_tokens:
            self.messages.pop(0)
```

Layer two: short-term memory, summarized periodically.

```python
class SummaryMemory:
    def __init__(self):
        self.summary = ""
        self.recent_messages = []
    
    def add_message(self, message):
        self.recent_messages.append(message)
        
        # Summarize once more than 10 messages have accumulated.
        if len(self.recent_messages) > 10:
            self.summary = llm.summarize(self.summary, self.recent_messages)
            self.recent_messages = []
```

Layer three: long-term memory in a vector database.

```python
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

## 6. Building an agent

### 6.1. Build a bare-bones RAG system

![RAG process diagram](../img/rag.jpeg)

Do not reach for LangChain immediately. Start by chunking documents, generating embeddings with sentence-transformers, and storing the vectors in a local Faiss or ChromaDB instance. When a user asks a question, query the vector store yourself, append the retrieved text to the prompt, and call the OpenAI API. Along the way, you will face questions such as:
- How should the documents be chunked?
- What is a suitable top-K value?
- What do you do when the retrieved content is irrelevant?

These are the real challenges of agent engineering.

### 6.2. Build a representative project around a real use case

You need a project that demonstrates your skills as a whole: small in scope, but complete. Avoid a vague, oversized goal such as “an AI chatbot.” A more useful target might be an assistant that analyzes portfolio-company reports.

Imagine that your company has invested in many startups. Every quarter, it receives their financial statements and business updates as PDFs. The goal is to build an agent that can read these reports quickly and answer questions such as:
- How much did Company A’s revenue grow quarter over quarter?
- What are Company B’s main risks?
- How does user growth at Company C compare with Company D?

To make this work, you will need to tackle the following:
- *Complex data processing*: how do you extract tables from PDFs? What about text inside images? Take a look at the unstructured.io library.
- *The core RAG pipeline*: simple chunk retrieval may perform poorly, so you will need to investigate more advanced strategies, such as *HyDE (Hypothetical Document Embeddings)* or a *Multi-Query Retriever*. You might even consider *Graph RAG*, extracting entities and relationships from the reports to build a knowledge graph.
- *Agent logic and tool use*: when the task requires calculating quarter-over-quarter growth, you should not depend on the LLM to get the arithmetic right. Introduce *tool use/function calling*. Define a calculation tool that the LLM can call when it recognizes a calculation request, then use the returned result in its answer.

How do you debug all this? Why is the LLM not calling tools as you expect? You may need LangGraph, or your own ReAct loop, to manage the execution logic.

Finally, evaluate it. Once the agent is built, how do you verify that it does a better job than a person reading the reports? You need an evaluation framework. A simple starting point is to collect 20 reports, write 100 questions with reference answers, and turn them into an evaluation set. Run the agent against that set and use a framework such as Ragas to measure *faithfulness* and *answer_relevancy*. <span style="color: red;">Without evaluation, optimization is guesswork.</span> Evaluation has its own traps: a user may rephrase a question and suddenly get a completely irrelevant report. Your evaluation set might be too small or too clean to cover the messy situations that appear in production. You will need to work through those problems yourself.

Once you have completed this project, you have concrete material for your résumé and interviews. You can discuss:
- How you parsed PDFs and what problems you encountered.
- Which RAG strategies you compared and why you chose the final approach.
- How you designed and debugged tools.
- Most importantly, how quantitative evaluation helped you improve the agent’s accuracy—for example, from 60% to 85%.

## 7. Production engineering

Security and reliability:
- Input and output validation.
- Access controls for tools.
- Error handling and retry mechanisms.

### 7.1. Cost and latency awareness

LLM APIs charge by the token. A poorly designed agent workflow might make a dozen or more LLM calls for a single request, sending costs through the roof. Consider:
- How should caching work?
- Can smaller models, perhaps a fine-tuned local model, handle specific recurring tasks?
- How can prompts be improved to reduce token usage?
- Where can concurrency and asynchronous processing help?

### 7.2. Observability

An agent’s execution can be a complex black box. Tools such as LangSmith or W&B help track the prompt, response, intermediate steps, and token usage for every call. When something fails in production, you can quickly locate the stage responsible.

> [!TIP]
> Build an agent tracing system.
>
> - Implement metrics collection and monitoring.
> - Build a visual dashboard.

### 7.3. Models and tools

Look beyond OpenAI and get to know open models such as the Llama and Mistral families. Learn how to deploy them with vLLM or Ollama. For vector databases, explore production-oriented options such as Milvus and Weaviate as well as Chroma.

## 8. Information sources

Keep up with developments by checking the latest papers in [cs.AI](https://arxiv.org/list/cs.AI/recent) and [cs.CL](https://arxiv.org/list/cs.CL/recent) each week.

### 8.1. GitHub projects

- [Open Manus](https://github.com/FoundationAgents/OpenManus)
- [Agent Universe](https://github.com/agentuniverse-ai/agentUniverse)
- [Gemini CLI](https://github.com/google-gemini/gemini-cli)
- [Kode](https://github.com/shareAI-lab/Kode-cli)

### 8.2. Cookbooks

- [Happy LLM](https://datawhalechina.github.io/happy-llm/): large language model principles and practice, starting from scratch.
- [Easy VectorDB](https://datawhalechina.github.io/easy-vectordb/): vector database principles and practice, starting from scratch.
- [All in RAG](https://datawhalechina.github.io/all-in-rag/): a full-stack guide to RAG for practical LLM application development.
- [Hello Agents](https://datawhalechina.github.io/hello-agents/): building agents from scratch.
- [Base NLP](https://datawhalechina.github.io/base-nlp/): from NLP to LLMs.
- [Tiny Universe](https://github.com/datawhalechina/tiny-universe): a guide to understanding LLMs by building a tiny universe of implementations from scratch.
- [Handy Ollama](https://datawhalechina.github.io/handy-ollama/): hands-on Ollama, including deploying LLMs on CPUs.

---

[^rag]: [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/pdf/2005.11401)
[^react]: [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/pdf/2210.03629)
[^reflexion]: [Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/pdf/2303.11366)
