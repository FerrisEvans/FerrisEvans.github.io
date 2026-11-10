---
title: "GDScript style guide"
description: Notes on the official GDScript style guide, covering formatting, naming conventions, code order, and type declarations.
date: 2025-03-17
category: game-dev
subcategory: godot
tags: [gdscript, godot]
key: GDScript
---

This post covers GDScript formatting, naming conventions, declaration order, and type annotations. For language syntax, see the [official documentation](https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/index.html). Because GDScript’s syntax resembles Python’s, [PEP 8](https://peps.python.org/pep-0008/) is also a useful reference.

The examples below use Godot 4 GDScript syntax. This class example comes from the [official style guide](https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_styleguide.html)[^godot-docs] and illustrates how to organize a script. It is not a standalone state-machine implementation: the state nodes and the `Events` object it uses belong to the surrounding project and are not included here.

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

The declarations come first, followed by engine callbacks, other methods, and the inner `State` class. The next sections explain these conventions.

## Formatting

- Use LF line endings.
- Use UTF-8 encoding without a byte order mark.
- Use tabs for indentation.

## Naming conventions

| Type         | Convention    | Example                     |
|:-------------|:--------------|:----------------------------|
| File names   | snake_case    | `yaml_parser.gd`            |
| Class names  | PascalCase    | `class_name YAMLParser`     |
| Node names   | PascalCase    | `Camera3D`, `Player`         |
| Functions    | snake_case    | `func load_level():`        |
| Variables    | snake_case    | `var particle_effect`       |
| Signals      | snake_case    | `signal door_opened`        |
| Constants    | CONSTANT_CASE | `const MAX_SPEED = 200`     |
| Enum names   | PascalCase    | `enum Element`              |
| Enum members | CONSTANT_CASE | `{EARTH, WATER, AIR, FIRE}` |

## Code order

The following outline shows the recommended declaration order. It is a reference list, not executable GDScript.

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

This ordering broadly follows these principles:

- Put properties and signals first, followed by methods and functions.
- Put public members before private members.
- Put virtual callbacks before the methods that make up the class’s public interface.
- Put constructors and initialization methods, such as `_init()` and `_ready()`, before other methods. Follow them with `_unhandled_input()` and `_physics_process()`.
- Put `@onready` variables after other member variables and before methods. They are initialized before the `_ready()` callback; their declarations do not need to appear immediately above `_ready()` in the source.
- Declare local variables as close as possible to where they are first used.

## Type declarations

These snippets compare alternative declarations inside a GDScript file. Read each declaration independently; the repeated variable names are not meant to appear in one scope.

When the intended type is not obvious, declare it explicitly rather than relying on type inference.

```gdscript
# The type can be int or float, and thus should be stated explicitly.
var health: int = 0 # Good

# Typed as int, but it could be that float was intended.
var health := 0 # Bad
```

The explicit `int` annotation states the intended type. The inferred declaration also produces an `int`, but leaves the reader to guess whether that was intentional.

When the type is obvious from the initializer, use type inference to avoid a redundant type annotation. In this example, `complex_function()` stands for a project function whose implementation is omitted.

```gdscript
# The type is clearly inferred as Vector3.
var direction := Vector3(1, 2, 3) # Good
# The type hint has redundant information.
var direction: Vector3 = Vector3(1, 2, 3) # Bad
# What type is this? It's not immediately clear to the reader
var value := complex_function() # Bad
```

`Vector3(...)` makes the resulting type clear; the name `complex_function()` does not.

If a function’s declared return type is more general than the type you need, add a type annotation or a cast. The following declarations assume that the script extends `Node` or one of its subclasses and that `UI/LifeBar` is the path to a `ProgressBar` node.

```gdscript
@onready var health_bar: ProgressBar = get_node("UI/LifeBar") # Good
@onready var health_bar := get_node("UI/LifeBar") as ProgressBar # Good
# The compiler can't infer the exact type and will use Node instead of ProgressBar
@onready var health_bar := get_node("UI/LifeBar") # Bad
```

Both annotated alternatives make the expected `ProgressBar` type explicit. The final declaration infers the more general `Node` type.

[^godot-docs]: The Godot documentation credits Juan Linietsky, Ariel Manzur, and the Godot Engine community and uses the [CC BY 3.0 license](https://creativecommons.org/licenses/by/3.0/). See [About this documentation](https://docs.godotengine.org/en/stable/about/introduction.html#about-this-documentation). This post summarizes its guidance and reproduces its examples.
