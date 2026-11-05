---
locale: zh
translationKey: godot_frame
title: "Godot 移动力"
description: 解释 Godot 中 _process 的 delta 参数含义，说明用 Delta Time 实现帧率无关的移动。
pubDate: 2025-03-19
category: game-dev
subcategory: godot
tags: [godot, frame]
---


当我们开始编写脚本后，我们会遇到一个 `_process(delta: float)` 函数。游戏画面的每一帧都会调用一次这个函数。函数本身的作用很好理解，但是我想谈一下这个函数的入参 `delta`。

```gdscript
# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta: float) -> void:
    pass
```

## 1. Delta Time

在 Godot 中，**delta** 也就是 **Delta Time**，这个概念在硬件、网络以及计算机图形学中都有相对应的概念。在此我们只讨论游戏和图形编程，他表示在两个连续的帧之间经过的时间，也就是连续帧之间的时间差。他可以根据当前帧和上一帧的时间戳来计算。

在游戏渲染中，常会以 每秒帧数(FPS/Frame Per Second)来量化帧的渲染速度。如果你的游戏以 60FPS 运行，那么每帧的持续时间将是 $\frac{1}{60}$ 秒。

在实时应用程序中，特别是游戏，硬件性能和场景复杂度会使帧率变化。如果每帧都移动固定距离，高帧率设备上的角色就会移动得更快。Godot 已通过 `delta` 提供距上次 `_process()` 调用经过的秒数；用以像素/秒表示的速度乘以它，就得到这一帧的位移，不需要自己另设定时器。它用于补偿帧间隔变化，不会自动解决网络延迟或同步问题。涉及碰撞的物理运动应在 `_physics_process()` 中处理。参见[官方处理循环说明](https://docs.godotengine.org/en/stable/tutorials/scripting/idle_and_physics_processing.html)。

## 2. Movement

The movement speed of our game is determined by how fast the game runs(how many frames are generated)

当我们谈论游戏速度的时候，我们通常在谈论到底生成了多少帧。一台非常慢的电脑和一台非常快的电脑，这个差距是巨大的。

| Speed(pixels per frame) | Frames per second | Total movement(per second) |
| --- | --- | --- |
| 10px | 30 | 10 * 30 = 300 |
| 10px | 60 | 10 * 60 = 600 |
| 10px | 120 | 10 * 120 = 1200 |

Since come scenes are harder to render than others, it might even run inconsistently on the same system!

> [!TIP]
> Delta time is the elapsed time since the previous processing callback.
> For example, if the framerate is 60fps, delta time is $1s \div 60 = 0.0167$ or about 17 milliseconds.

This information we can use to keep the same at a constant speed regardless of framerate.

Multiply speed in units per second by delta time to obtain the displacement for that frame.

## 3. How frame rates influence the game

这里把速度定义为 10 像素/秒，而不是上一节的 10 像素/帧。每帧位移 = 速度 × delta；表中只对显示的小数取近似值，计算使用完整分数。

| Speed (pixels per second) | Frames per second | Delta time (seconds) | Movement per frame (pixels) | Total movement per second (pixels) |
| --- | --- | --- | --- | --- |
| 10 | 30 | 1 / 30 | 10 / 30 ≈ 0.333 | (10 / 30) * 30 = 10 |
| 10 | 60 | 1 / 60 | 10 / 60 ≈ 0.167 | (10 / 60) * 60 = 10 |
| 10 | 120 | 1 / 120 | 10 / 120 ≈ 0.083 | (10 / 120) * 120 = 10 |

With delta accounted for, this movement keeps the same speed across frame rates!
