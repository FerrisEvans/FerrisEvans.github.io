---
key: agentic_dev_1
title: "[Agentic Dev] Part 1: Getting Started"
description: Originally written in 2025, and updated periodically as the technology evolves.
date: 2025-12-22
category: ai
subcategory: agent
tags: [dev, tutorial]
---

I wrote the first version of this post just before Christmas 2025, with plans to keep updating it as the technology evolves. A year has already gone by, and with Christmas 2026 right around the corner, AI agent development has come a long way. So I've decided to expand what was originally a single post into a full series. As the opening installment, this post stays light on technical details. Instead, it's meant to give newcomers to AI agent design and development a clear sense of direction before we dive deeper.

From the days before "agent developer" was even a real role on job boards to where we are today, the implementation details have grown much more complex, yet the overall architecture has stayed remarkably clear. All the specific techniques are like branches and leaves growing out of that architectural trunk. We're no longer dealing with simple automation, but full-fledged autonomous systems. Even so, if you take a gradual approach and build from the fundamentals up, the learning curve isn't all that steep.

> [!NOTE]
> Let's take a quick, high-level look at the core pieces.
>
> **1. Core**
>
> An LLM isn't an agent on its own, but it sits at the heart of every agent. It can handle everything from simple orchestration to complex reasoning. By itself, though, an LLM has no tools, no way to interact with the outside world, and no memory; it only responds based on its vast training data. Building an agent means equipping the LLM with the surrounding components it needs to unlock its full potential.
>
> **2. Tool**
>
> I'm using "tool" in a broad sense here: knowledge bases, web search, function calling, task orchestration, and the like. These are the surrounding components mentioned above. With them, the LLM is no longer confined to its static training data and can take real action across a range of tasks.
>
> **3. Mem**
>
> If you want an agent to advance toward strategic planning, proactive assistance, and self-improvement, memory is indispensable. That said, depending on the type of agent, a Mem module isn't always strictly necessary. Instead, design it to be as lightweight or heavyweight as your use case requires.

The overview above only scratches the surface of how an agent's components break down; there are plenty of key points we haven't touched on yet, and we'll cover them one by one in later posts. Of course, all these pieces need a single thread tying them together, and that thread is the agent's reasoning and decision-making loop: choosing the next step, interpreting tool outputs, and judging when a task is done.

By now, the resemblance is hard to miss: agent design mirrors how humans operate. Isn't this essentially how we make decisions ourselves? Someone hands us a task (or we set one ourselves), our brain figures out how to tackle it, our hands use tools, our eyes monitor the progress, and our brain evaluates the outcome to decide the next move. This series walks through that process with an AI agent taking center stage. Here are the topics I have planned so far:

1. Agentic design patterns
2. Deep dives into AI agent engineer interview questions
3. Reading notes on articles by leaders in the field
4. Personal takeaways from open-source projects

Finally, I highly recommend Datawhale's [Hello Agent](https://github.com/datawhalechina/hello-agents) project. It's a great hands-on guide to take you from zero to one in AI agent development.
