---
key: GDScript
title: "GDScript 代码风格指南"
description: 整理 GDScript 官方代码风格指南：格式化、命名约定、代码顺序与类型声明建议。
date: 2025-03-17
category: game-dev
subcategory: godot
tags: [gdscript, code-style]
---

本文整理 GDScript 的代码风格，包括格式、命名、声明顺序和类型标注。语言语法见 [GDScript 官方文档](https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/index.html)。GDScript 的语法与 Python 相似，因此 [PEP 8](https://peps.python.org/pep-0008/) 也是有用的参考。

以下示例采用 Godot 4 的 GDScript 语法。这段类定义来自 [GDScript 官方风格指南](https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_styleguide.html)[^godot-docs]，用于展示脚本的组织方式。它不是可独立运行的状态机实现：代码所用的状态节点和 `Events` 对象属于外围项目，本文未提供它们的实现。

```gdscript
class_name StateMachine
extends Node
## Hierarchical State machine for the player.
##
## Initializes states and delegates engine callbacks ([method Node._physics_process],
## [method Node._unhandled_input]) to the state.

signal state_changed(previous, new)

@export var initial_state: Node
var is_active = true:
	set = set_is_active

@onready var _state = initial_state:
	set = set_state
@onready var _state_name = _state.name


func _init():
	add_to_group("state_machine")


func _enter_tree():
	print("this happens before the ready method!")


func _ready():
	state_changed.connect(_on_state_changed)
	_state.enter()


func _unhandled_input(event):
	_state.unhandled_input(event)


func _physics_process(delta):
	_state.physics_process(delta)


func transition_to(target_state_path, msg={}):
	if not has_node(target_state_path):
		return

	var target_state = get_node(target_state_path)
	assert(target_state.is_composite == false)

	_state.exit()
	self._state = target_state
	_state.enter(msg)
	Events.player_state_changed.emit(_state.name)


func set_is_active(value):
	is_active = value
	set_physics_process(value)
	set_process_unhandled_input(value)
	set_block_signals(not value)


func set_state(value):
	_state = value
	_state_name = _state.name


func _on_state_changed(previous, new):
	print("state changed")
	state_changed.emit()


class State:
	var foo = 0

	func _init():
		print("Hello!")
```

示例先列出声明，再列出引擎回调、其他方法和内部类 `State`。以下各节说明这些约定。

## 格式

- 使用 LF 换行符。
- 使用不带字节顺序标记的 UTF-8 编码。
- 使用制表符缩进。

## 命名约定

| 对象         | 命名风格    | 示例                     |
|:-------------|:--------------|:----------------------------|
| 文件名   | snake_case    | `yaml_parser.gd`            |
| 类名  | PascalCase    | `class_name YAMLParser`     |
| 节点名   | PascalCase    | `Camera3D`、`Player`         |
| 函数名    | snake_case    | `func load_level():`        |
| 变量名    | snake_case    | `var particle_effect`       |
| 信号名      | snake_case    | `signal door_opened`        |
| 常量名    | CONSTANT_CASE | `const MAX_SPEED = 200`     |
| 枚举名   | PascalCase    | `enum Element`              |
| 枚举成员 | CONSTANT_CASE | `{EARTH, WATER, AIR, FIRE}` |

## 代码顺序

以下提纲展示建议的声明顺序，用于查阅，不是可执行的 GDScript 代码。

```text
01. @tool, @icon, @static_unload
02. class_name
03. extends
04. ## doc comment

05. signals
06. enums
07. constants
08. static variables
09. @export variables
10. remaining regular variables
11. @onready variables

12. _static_init()
13. remaining static methods
14. overridden built-in virtual methods:
	1. _init()
	2. _enter_tree()
	3. _ready()
	4. _process()
	5. _physics_process()
	6. remaining virtual methods
15. overridden custom methods
16. remaining methods
17. inner classes
```

这份排序总体上遵循以下原则：

- 属性和信号放在最前面，随后是方法与函数。
- 公有成员在前，私有成员在后。
- 虚方法回调放在构成类公开接口的方法之前。
- 构造与初始化方法，例如 `_init()` 和 `_ready()`，放在其他方法之前，随后是 `_unhandled_input()` 和 `_physics_process()` 等回调。
- 标注 `@onready` 的变量放在其他成员变量之后、方法之前。它们的初始化发生在 `_ready()` 回调之前，不要求声明在源码中紧邻 `_ready()`。
- 局部变量的声明尽量靠近首次使用的位置。

## 类型声明

以下片段对比 GDScript 文件中的不同声明方式。每行声明应独立阅读；重复的变量名不应放在同一个作用域中。

如果读者无法从初始值判断预期类型，应显式标注类型。

```gdscript
# The type can be int or float, and thus should be stated explicitly.
var health: int = 0 # Good

# Typed as int, but it could be that float was intended.
var health := 0 # Bad
```

显式标注 `int` 可以说明预期类型。类型推断也会在这里得到 `int`，但读者无法确定这是否符合作者的意图。

如果初始值已经明确体现了类型，就可以使用类型推断，避免重复标注。以下 `complex_function()` 代表一个项目内函数，示例省略了它的实现。

```gdscript
# The type is clearly inferred as Vector3.
var direction := Vector3(1, 2, 3) # Good
# The type hint has redundant information.
var direction: Vector3 = Vector3(1, 2, 3) # Bad
# What type is this? It's not immediately clear to the reader
var value := complex_function() # Bad
```

`Vector3(...)` 能直接体现结果类型，`complex_function()` 这个名称则不能。

如果函数声明的返回类型比所需类型更宽泛，可以添加类型标注或转换。以下声明假设脚本继承自 `Node` 或其子类，且 `UI/LifeBar` 是一个 `ProgressBar` 节点的路径。

```gdscript
@onready var health_bar: ProgressBar = get_node("UI/LifeBar") # Good
@onready var health_bar := get_node("UI/LifeBar") as ProgressBar # Good
# The compiler can't infer the exact type and will use Node instead of ProgressBar
@onready var health_bar := get_node("UI/LifeBar") # Bad
```

前两种写法都明确了预期的 `ProgressBar` 类型；最后一种写法只能推断出更宽泛的 `Node` 类型。

[^godot-docs]: Godot 文档署名为 Juan Linietsky、Ariel Manzur 和 Godot Engine 社区，采用 [CC BY 3.0 许可](https://creativecommons.org/licenses/by/3.0/)，详见[文档说明](https://docs.godotengine.org/en/stable/about/introduction.html#about-this-documentation)。本文概括了其中的建议，并引用其代码示例。
