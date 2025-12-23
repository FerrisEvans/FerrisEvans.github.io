---
title: "Godot 移动力"
date: 2025-03-19
categories: [Game Dev, Godot]
tags: [frame]
math: true
mermaid: false
render_with_liquid: false
---

当我们开始编写脚本后，我们会遇到一个 `_process(delta: float)` 函数。游戏画面的每一帧都会调用一次这个函数。函数本身的作用很好理解，但是我想谈一下这个函数的入参 `delta`。

```gdscript
# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta: float) -> void:
    pass
```

## 1. Delta Time

在 Godot 中，**delta** 也就是 **Delta Time**，这个概念在硬件、网络以及计算机图形学中都有相对应的概念。在此我们只讨论游戏和图形编程，他表示在两个连续的帧之间经过的时间，也就是连续帧之间的时间差。他可以根据当前帧和上一帧的时间戳来计算。

在游戏渲染中，常会以 每秒帧数(FPS/Frame Per Second)来量化帧的渲染速度。如果你的游戏以 60FPS 运行，那么每帧的持续时间将是 $$\frac{1}{60}$$ 秒。

在实时应用程序中，特别是游戏，因为硬件性能不同，导致不同的机器上处理帧的速度会有不同。倘若没有这个 **Delta Time** 的概念，那么会导致一个现象，就是在性能高的机器上，程序运行的快，而在性能差的设备上，游戏运行的慢。为了确保游戏在不同的环境下都能正常的运行，通常会运用 **Delta Time** 来控制游戏中的各种运动、动画、物理效果等，使他们不受帧率变化的影响。通常的做法是每帧调用一个定时器，该定时器保存从现在到最后一次调用他之间的这段时间，这个结果就是 **Delta Time**。将用于计算游戏角色在这段时间内移动的距离。这样一来，无论之间的延迟是由硬件处理能力不足，还是网络连接速度慢导致的，角色在屏幕上移动所需的实际时间都是相同的。

## 2. Movement

The movement speed of our game is determined by how fast the game runs(how many frames are generated)

当我们谈论游戏速度的时候，我们通常在谈论到底生成了多少帧。一台非常慢的电脑和一台非常快的电脑，这个差距是巨大的。

| Speed(pixels per frame) | Frames per second | Total movement(per second) |
| --- | --- | --- |
| 10px | 30 | 10 * 30 = 300 |
| 10px | 60 | 10 * 60 = 600 |
| 10px | 120 | 10 * 120 = 1200 |

Since come scenes are harder to render than others, it might even run inconsistently on the same system!

> Delta Time measures how long it took to create one frame.
> For example, if the framerate is 60fps, delta time is $1s \div 60 = 0.0167$ or about 17 milliseconds.
{: .prompt-tip }

This information we can use to keep the same at a constant speed regardless of framerate.

We essentially multiply any movement with the delta time.

## 3. How frame rates influence the game

| Speed(pixels per frame) | Frames per second | Delta time(seconds) | Original movement(per second) | Delta movement(per second) |
| --- | --- | --- | --- | --- |
| 10px | 30 | 1 / 30 = 0.033 | 10 * 30 = 300 | 10 * 30 * 0.033 = 10 | 
| 10px | 60 | 1 / 60 = 0.017 | 10 * 60 = 600 | 10 * 60 * 0.017 = 10 |
| 10px | 120 | 1 / 120 = 0.008 | 10 * 120 = 1200 | 10 * 120 * 0.008 = 10 |

With delta accounted, the game runs at the same speed at any framerate!
