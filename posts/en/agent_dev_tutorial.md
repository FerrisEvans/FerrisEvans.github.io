---
title: "Introduction to AI agent development"
description: A roadmap for aspiring agent engineers, covering vector databases, RAG optimization, ReAct architectures, memory, and production engineering.
date: 2025-12-22
category: ai
subcategory: agent
tags: [agent, rag, vector-db, llm]
key: agent_dev_tutorial
---

This roadmap is for developers who know Python and have called a large language model (LLM) API. It covers retrieval-augmented generation (RAG)[^rag], agent architectures, memory, and production concerns. The Python snippets illustrate control flow rather than a particular SDK: model clients, tool implementations, and storage setup are omitted, so the snippets are not standalone programs.

I think of learning to build AI agents in three broad stages:

1. API integration: you can use frameworks such as LangChain and LangGraph, get the official demos running, and troubleshoot problems using the documentation.
2. System design: you understand agent architectures and patterns such as ReAct and Plan-and-Execute, can design complex systems in which multiple agents collaborate, and know how to optimize performance in production.
3. Infrastructure architecture: you can build an agent framework from scratch, understand LLM inference in depth, and design scheduling systems for large agent clusters.

Let me start with a few questions:

- Memory design: how do you manage context in a long conversation? How do you store summaries? At what point do earlier details become unrecoverable? How do you evaluate answer quality?
- How do you choose an embedding model that suits your use case? The choice matters for both knowledge retrieval and embedding-based intent classification.
- When a request contains multiple intents and named entities, how do you determine what the user actually wants? Where does named entity recognition (NER) fit in?
- What happens when a task is forcibly stopped halfway through? How can its actions be undone? How do you coordinate distributed calls to multiple tools and plan the workflow?
- How do you build RAG pipelines for a single modality or multiple modalities? How do you improve and evaluate retrieval quality? How should you run ablation studies when an agent has access to many tools? How should you split knowledge-base documents into chunks?
- How do you evaluate an agent’s ability to solve a problem: by whether it completes the user’s task, or by the quality of each step along the way?
- How does LangGraph’s `StateGraph` differ from a simple sequence of function calls?
- How would you design an agent scheduler that supports a million concurrent tasks?

Building an agent requires software engineering skills as well as experience with patterns specific to AI systems. You need to know how to:

- Make system behavior observable.
- Handle many concurrent requests.
- Keep latency low.
- Control costs.

## Core concepts

Understand these concepts; you do not need to memorize their definitions. With RAG, for example, it is not enough to know that you provide the model with information from a knowledge base. You need to understand how retrieving external information can help address gaps in the model’s knowledge and reduce unsupported answers. The central challenge is finding the most relevant context.

- Embeddings.
- Why vector databases are needed.
- Cosine similarity.
- What RAG actually does.
- How ReAct (Reasoning and Acting)[^react] lets an LLM interact with external tools.
- The function-calling workflow.

> [!NOTE]
> Do not treat an LLM as a black-box API. Understand what it can and cannot do, and roughly how it does it.

Work your way through [Attention Is All You Need](https://arxiv.org/html/1706.03762v7), then try implementing a simple Transformer in PyTorch. The process may be painful, but it will give you a much deeper understanding of the foundations of LLMs.

**Prompt engineering:** Learn techniques such as few-shot prompting and chain-of-thought (CoT). Build your own prompt template library and collect prompts that work well.

## Vector databases

At first, I thought a vector database was just a place to “store embeddings and run similarity searches.” Then an interviewer asked me about the reasons for choosing a graph-based index, why Milvus supports multiple indexes, and how to choose an index for a given workload.

Go beyond calling vector database APIs: learn how the databases work. Spend some time on the core algorithms behind vector search.

- *[HNSW (Hierarchical Navigable Small World)](https://milvus.io/docs/hnsw.md)*: a graph-based approach that offers fast searches at the cost of substantial memory use.
- *[IVF (inverted file index)](https://milvus.io/docs/ivf-flat.md)*: groups vectors into clusters and searches selected clusters, with a trade-off between search speed and recall.
- *[Annoy (random projection trees)](https://github.com/spotify/annoy)*: supports compact, static indexes that can be shared across processes; accuracy, search speed, and index size depend on its settings.

A useful hands-on project is to build a retrieval system in Milvus that handles tens of millions of vectors. Be ready to work through problems such as:

- Indexing new data: how do you make embeddings for new documents searchable quickly?
- Incremental updates: how do you update vectors without rebuilding the index?
- Tenant isolation: how do you isolate each tenant’s data in a shared cluster?

## Move beyond naive RAG

The following Python fragment shows a single retrieval-and-generation pass. It assumes that `vector_db.search()` returns a list of text strings and that `llm.generate()` returns the answer.

```python
# Model and vector-store clients are omitted; these are illustrative interfaces.
def naive_rag(query):
    docs = vector_db.search(query, top_k=5)
    context = "\n".join(docs)
    response = llm.generate(f"Context: {context}\nQuery: {query}")
    return response
```

This simple RAG implementation can retrieve irrelevant passages, waste context space, and struggle with questions that require combining information from multiple sources. It also does little to explain how an answer was derived. Treat it as a baseline, then evaluate where it needs improvement before using it in production.

For practice, build a complete RAG system, from document uploads and embedding generation to question answering:

- Compare embedding models from OpenAI, Cohere, and the BGE family.
- Implement hybrid search and reranking.

### Query optimization

- *Query rewriting*: rewrite the user’s question into a form better suited to retrieval.
- *Query decomposition*: split a complex question into several smaller questions.
- *Hypothetical Document Embeddings (HyDE)*: have the LLM generate a hypothetical answer, then use its embedding for retrieval.

### Retrieval optimization

- *Hybrid search*: combine vector retrieval with a keyword ranking method such as BM25 and fuse the two result sets.
- *Reranking*: reorder results with a cross-encoder.
- *Contextual compression*: remove irrelevant content from the retrieved context.

### Generation optimization

- *Self-reflective retrieval-augmented generation (Self-RAG)*: let the model decide whether retrieval is needed.
- *Corrective retrieval-augmented generation (CRAG)*: assess the quality of retrieved results and fall back to web search when they are inadequate.

## Agent architectures

Building an agent involves more than giving an LLM access to tools. You also need to design how it decides what to do, uses the results, and determines when the task is complete.

### ReAct: a foundational pattern

ReAct alternates between reasoning and acting.

Implement a ReAct agent from scratch to practice state management. This Python fragment shows the loop; you must supply the model client, action parser, tool executor, stopping condition, and final-answer logic.

```python
# Model setup, helper functions, and final-answer assembly are omitted.
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

- *What if the agent makes a reasoning error?* Consider a feedback mechanism such as Reflexion[^reflexion] to help it learn from mistakes.
- *What if the agent takes too many steps?* Try few-shot prompting with examples of effective reasoning.
- *What if the task is too large?* Break it into subtasks that smaller ReAct loops can handle.

### Plan-and-Execute: complex tasks

In this pattern, the LLM first generates a complete plan and then executes it step by step. This Python fragment assumes that `replan()` returns the remaining steps; execution then resumes at the start of the new plan. It omits the planner, executor, and failure-detection implementations.

```python
# Planner, executor, and need_replan() implementations are omitted.
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

To put this pattern into practice, build a Plan-and-Execute agent:

- Learn to use LangGraph’s [`StateGraph` API](https://docs.langchain.com/oss/python/langgraph/graph-api).
- Implement workflows with conditional branches, loops, and parallel execution.

### Multi-agent coordination

How do you get several agents to complete a task together?

- Design a communication protocol between agents.
- Implement an orchestration system.
- Handle conflicts and failures.

## Memory

The design of a memory system directly affects an agent’s capabilities.

The three examples below illustrate one way to organize memory. They are Python fragments; token counting, model setup, embedding generation, and database initialization must be supplied by the application.

### Working memory

Keep the current conversation in a buffer. In this example, `count_tokens()` must count tokens across the stored messages; when the limit is exceeded, the buffer drops the oldest messages.

```python
# count_tokens() is omitted; its implementation depends on the model's tokenizer.
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

### Short-term memory

Summarize older messages periodically. Here, `llm.summarize()` combines the previous summary with new messages and returns an updated summary.

```python
# The model client and summarize() implementation are omitted.
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

### Long-term memory

Store information in a vector database and retrieve it by relevance. This fragment assumes that `embed()` produces the configured vector format and `memory_item` provides the fields shown below.

```python
# Database initialization, embed(), and the memory-item type are omitted.
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

## Build an agent

### Build a bare-bones RAG system

The diagram connects query rewriting and routing to retrieval, then generation. Indexing prepares the documents for search; feedback can trigger another retrieval pass.

![RAG workflow connecting query rewriting, routing, indexing, retrieval, and answer generation](../img/rag.jpeg)

The diagram is based on LangChain’s [RAG From Scratch tutorial](https://github.com/langchain-ai/rag-from-scratch/blob/main/rag_from_scratch_1_to_4.ipynb).

Do not reach for LangChain immediately. Start by chunking documents, generating embeddings with Sentence Transformers, and storing the vectors in a local Faiss index or Chroma database. When a user asks a question, query the vector store yourself, append the retrieved text to the prompt, and call the model API. Along the way, you will face questions such as:

- How should the documents be chunked?
- How many results should each search return (top-k)?
- What do you do when the retrieved content is irrelevant?

These are the real challenges of agent engineering.

### Build a portfolio project around a real use case

Choose a project that brings your skills together: limited in scope, but complete from end to end. Avoid a vague goal such as “an AI chatbot.” A more useful target might be an assistant that analyzes reports from companies in an investment portfolio.

Imagine that your company has invested in many startups. Every quarter, it receives their financial statements and business updates as PDFs. The goal is to build an agent that can read these reports quickly and answer questions such as:

- How much did Company A’s revenue grow quarter over quarter?
- What are Company B’s main risks?
- How does user growth at Company C compare with Company D?

To make this work, you will need to tackle the following:

- *Document processing*: how do you extract tables from PDFs? What about text inside images? Take a look at the Unstructured library.
- *The core RAG pipeline*: simple chunk retrieval may perform poorly, so you will need to investigate more advanced strategies, such as *HyDE (Hypothetical Document Embeddings)* or a *Multi-Query Retriever*. You might even consider *Graph RAG*, extracting entities and relationships from the reports to build a knowledge graph.
- *Agent logic and tool use*: when the task requires calculating quarter-over-quarter growth, you should not depend on the LLM to get the arithmetic right. Use *function calling* to give it access to a calculation tool, then have it use the returned result in its answer.

How do you debug all this? Why is the LLM not calling tools as you expect? You may need LangGraph, or your own ReAct loop, to manage the execution logic.

Finally, evaluate it. How reliably can the agent answer questions about the reports? A simple starting point is to collect 20 reports and write 100 questions with reference answers. Run the agent against that evaluation set and use a framework such as Ragas to assess faithfulness to the retrieved context and answer relevance. If you want to claim that it outperforms a person reading the reports, you also need a human baseline for comparison. Without evaluation, optimization is guesswork.

Evaluation has its own traps: a user may rephrase a question and suddenly get an irrelevant answer. Your evaluation set might be too small or too clean to reflect real production use. Test those cases as well.

Once you have completed this project, you have concrete material for your résumé and interviews. You can discuss:

- How you parsed PDFs and what problems you encountered.
- Which RAG strategies you compared and why you chose the final approach.
- How you designed and debugged tools.
- How evaluation helped you improve the agent’s accuracy, using measured results from your project.

## Production engineering

Security and reliability:

- Input and output validation.
- Access controls for tools.
- Error handling and retry mechanisms.

### Cost and latency awareness

With token-based API pricing, a poorly designed agent workflow can become expensive: a single request might trigger a dozen or more LLM calls. Consider:

- How should caching work?
- Can smaller models, perhaps a fine-tuned local model, handle specific recurring tasks?
- How can prompts be improved to reduce token usage?
- Where can concurrency and asynchronous processing help?

### Observability

An agent’s execution can be difficult to follow. Tools such as LangSmith or Weights & Biases (W&B) help track prompts, responses, intermediate steps, and token usage. These traces help you pinpoint failures in production.

For practice, build an agent tracing system:

- Implement metrics collection and monitoring.
- Build a visual dashboard.

### Models and tools

Look beyond OpenAI and get to know open models such as the Llama and Mistral families. Learn how to deploy them with vLLM or Ollama. For vector databases, explore production-oriented options such as Milvus and Weaviate as well as Chroma.

## Information sources

Keep up with developments by checking the latest papers in [cs.AI](https://arxiv.org/list/cs.AI/recent) and [cs.CL](https://arxiv.org/list/cs.CL/recent) each week.

### GitHub projects

- [Open Manus](https://github.com/FoundationAgents/OpenManus)
- [Agent Universe](https://github.com/agentuniverse-ai/agentUniverse)
- [Gemini CLI](https://github.com/google-gemini/gemini-cli)
- [Kode](https://github.com/shareAI-lab/Kode-cli)

### Cookbooks

- [Happy LLM](https://datawhalechina.github.io/happy-llm/): an introduction to LLM concepts and practical applications.
- [Easy VectorDB](https://datawhalechina.github.io/easy-vectordb/): vector database fundamentals and hands-on examples.
- [All in RAG](https://datawhalechina.github.io/all-in-rag/): a full-stack guide to RAG for practical LLM application development.
- [Hello Agents](https://datawhalechina.github.io/hello-agents/): building agents from scratch.
- [Base NLP](https://datawhalechina.github.io/base-nlp/): from NLP to LLMs.
- [Tiny Universe](https://github.com/datawhalechina/tiny-universe): a guide to understanding LLMs by implementing their components from scratch.
- [Handy Ollama](https://datawhalechina.github.io/handy-ollama/): a hands-on guide to Ollama, including running LLMs on CPUs.

---

[^rag]: [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/pdf/2005.11401)
[^react]: [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/pdf/2210.03629)
[^reflexion]: [Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/pdf/2303.11366)
