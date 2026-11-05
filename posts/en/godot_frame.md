---
title: "Movement and Delta Time in Godot"
description: What the delta parameter of Godot’s _process function means, and how delta time makes movement independent of frame rate.
pubDate: 2025-03-19
category: game-dev
subcategory: godot
tags: [godot, frame]
locale: en
translationKey: godot_frame
---


Once we start writing scripts, we encounter a function called `_process(delta: float)`. It is called once for every rendered frame. The purpose of the function is straightforward, but I want to take a closer look at its `delta` parameter.

```gdscript
# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta: float) -> void:
    pass
```

## 1. Delta Time

In Godot, **delta** means **delta time**. Related concepts appear in hardware, networking, and computer graphics. Here, we are only discussing games and graphics programming: delta time is the elapsed time between two consecutive frames. It can be calculated from the timestamps of the current and previous frames.

Rendering speed in games is commonly measured in frames per second, or FPS. If your game runs at 60 FPS, each frame lasts $\frac{1}{60}$ of a second.

In real-time applications, hardware and scene complexity can change the frame rate. Moving a fixed distance every frame makes a character faster at higher frame rates. Godot already supplies `delta` as the seconds since the previous `_process()` call. Multiply a speed in pixels per second by it to obtain the displacement for that frame; no separate timer is needed. This compensates for frame intervals, not network latency or synchronization. Handle physics movement involving collisions in `_physics_process()`. See the [official processing-loop documentation](https://docs.godotengine.org/en/stable/tutorials/scripting/idle_and_physics_processing.html).

## 2. Movement

The movement speed of our game is determined by how fast the game runs: how many frames it generates.

When we talk about game speed here, we mean how many frames are generated. The difference between a very slow computer and a very fast one can be enormous.

| Speed(pixels per frame) | Frames per second | Total movement(per second) |
| --- | --- | --- |
| 10px | 30 | 10 * 30 = 300 |
| 10px | 60 | 10 * 60 = 600 |
| 10px | 120 | 10 * 120 = 1200 |

Since some scenes are harder to render than others, performance can even vary on the same system!

> [!TIP]
> Delta time is the elapsed time since the previous processing callback.
> For example, if the framerate is 60fps, delta time is $1s \div 60 = 0.0167$ or about 17 milliseconds.

We can use this information to keep the game moving at a constant speed regardless of frame rate.

Multiply speed in units per second by delta time to obtain the displacement for that frame.

## 3. How frame rates influence the game

Here, speed means 10 pixels per second, rather than the 10 pixels per frame in the previous section. Displacement per frame = speed × delta. Decimal values are rounded for display; calculations use the full fractions.

| Speed (pixels per second) | Frames per second | Delta time (seconds) | Movement per frame (pixels) | Total movement per second (pixels) |
| --- | --- | --- | --- | --- |
| 10 | 30 | 1 / 30 | 10 / 30 ≈ 0.333 | (10 / 30) * 30 = 10 |
| 10 | 60 | 1 / 60 | 10 / 60 ≈ 0.167 | (10 / 60) * 60 = 10 |
| 10 | 120 | 1 / 120 | 10 / 120 ≈ 0.083 | (10 / 120) * 120 = 10 |

With delta accounted for, this movement keeps the same speed across frame rates!
