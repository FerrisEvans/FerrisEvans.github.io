---
key: agentic_dev_1
title: "[Agentic Dev] Part 1: An orientation"
description: First written in 2025, and revised as the technology changes.
date: 2025-12-22
category: ai
subcategory: agent
tags: [dev, tutorial]
---

I wrote the first version of this just before Christmas 2025, and I will keep revising it as the technology changes. A year has gone by since then. Christmas 2026 is close, and agent development has moved a long way in that time. I had planned to cover all of this in a single article. It is a series now. This opening post stays light on technical detail. If you are new to designing and building AI agents, I want it to give you a direction before the details start.

Agent development was not yet a real role on a job board when the field was younger. The implementation has grown much more complicated since then, but the overall architecture has stayed clear. The individual techniques are leaves. They grow on the architecture, which is the trunk. We are no longer looking at a simple automated system. We are looking at a complex autonomous one. If you learn it in layers, easy parts first, the path is not as steep as it looks.

> [!NOTE]
> A rough sketch of the pieces.
>
> **1. Core**
>
> An LLM is not an agent, but every agent is built around one. It can run a simple workflow, and it can work through a hard chain of reasoning. On its own it has no tools, no way to interact with the world, and no memory. It answers from the data it was trained on. Building an agent means giving that model the other components it needs, so it can do real work.
>
> **2. Tool**
>
> I am using "tool" in a wide sense: knowledge bases, web search, function calls, task orchestration. These are the components from the last section. With them, the model can do more than answer from its training data.
>
> **3. Mem**
>
> Memory is what lets an agent plan ahead, offer help without being asked, and improve on its own. Not every agent needs a Mem module. When the work calls for one, design it light or heavy for that product. Sometimes the right amount is none.

The grouping above is only a sketch. A lot of important points are missing, and later posts will take them one by one. The components also have to be strung together. The thread that does that is how the agent reasons and decides: what to do next, what a tool just returned, and when the task is finished.

At this point the resemblance is hard to miss. Designing an agent looks a lot like the way a person makes a decision. Someone asks you to do something, or you set the task yourself. You think about how to do it. Your hands pick up a tool. Your eyes stay on the work. You look at the result and choose the next move. This series walks through that process, with the agent as the one doing the work. Four topics, for now:

1. Agentic design patterns
2. Interview questions for AI agent engineers, explained in detail
3. Reading notes on work by people who know this field well
4. What I have learned from open-source projects

If you want a path from zero to actually building agents, start with Datawhale's [Hello Agent](https://github.com/datawhalechina/hello-agents). It is the best on-ramp I know.
