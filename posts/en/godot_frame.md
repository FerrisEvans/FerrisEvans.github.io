---
title: "Movement and delta time in Godot"
description: What the delta parameter in Godot’s _process function means and how to use it to make movement independent of frame rate.
date: 2025-03-19
category: game-dev
subcategory: godot
tags: [godot, frame]
key: godot_frame
---

This post uses Godot 4 GDScript to explain how the `delta` parameter of `_process()` helps calculate movement per frame. It covers the calculation, rather than a complete character controller.

Godot calls `_process(delta: float)` once per rendered frame while processing is enabled. The following snippet shows the callback signature in a script that extends `Node` or one of its subclasses; `pass` means that the callback takes no action yet.

```gdscript
# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta: float) -> void:
    pass
```

This snippet does not move the node. The following sections explain how to use `delta` to calculate displacement.

## Delta time

In Godot’s `_process()` callback, `delta` is the elapsed time since the previous call, measured in seconds. More generally, delta time means the time between two updates. Here, we are concerned with the interval between rendered frames.

Rendering speed in games is commonly measured in frames per second, or FPS. If your game runs at 60 FPS, each frame lasts $\frac{1}{60}$ of a second.

In real-time applications, hardware performance and scene complexity affect the frame rate. If a character moves a fixed distance every frame, it moves faster at higher frame rates. Multiply its speed in pixels per second by `delta` to calculate its displacement for that frame. This accounts for varying frame intervals. Movement that involves physics and collisions belongs in `_physics_process()`. See the [official processing-loop documentation](https://docs.godotengine.org/en/stable/tutorials/scripting/idle_and_physics_processing.html).

## Moving a fixed distance per frame

If we move an object a fixed number of pixels each frame, its speed depends on the frame rate. The same code can produce very different movement speeds on a slow computer and a fast one.

| Movement per frame (pixels) | Frames per second | Movement per second (pixels) |
| --- | --- | --- |
| 10 | 30 | $10 \times 30 = 300$ |
| 10 | 60 | $10 \times 60 = 600$ |
| 10 | 120 | $10 \times 120 = 1200$ |

Since some scenes are more demanding to render than others, the frame rate can vary even on the same computer.

> [!NOTE]
> Delta time is the elapsed time since the previous processing callback.
> At a steady 60 FPS, delta time is $1 \div 60 \approx 0.0167$ seconds, or about 17 milliseconds.

To keep an object moving at a constant speed as the frame rate changes, multiply its speed in units per second by delta time.

## Making movement independent of frame rate

Now let’s set the speed to 10 pixels per second. The displacement for each frame is speed multiplied by `delta`, where `delta` is measured in seconds. Decimal values in the table are rounded for readability; the calculations use the exact fractions.

| Speed (pixels per second) | Frames per second | Delta time (seconds) | Movement per frame (pixels) | Total movement per second (pixels) |
| --- | --- | --- | --- | --- |
| 10 | 30 | $1 / 30$ | $10 / 30 \approx 0.333$ | $(10 / 30) \times 30 = 10$ |
| 10 | 60 | $1 / 60$ | $10 / 60 \approx 0.167$ | $(10 / 60) \times 60 = 10$ |
| 10 | 120 | $1 / 120$ | $10 / 120 \approx 0.083$ | $(10 / 120) \times 120 = 10$ |

Multiplying by `delta` keeps the object’s speed at 10 pixels per second at all three frame rates.
