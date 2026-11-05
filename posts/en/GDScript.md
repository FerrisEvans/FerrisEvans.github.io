---
title: "GDScript Style Guide"
description: Notes on the official GDScript style guide, covering formatting, naming conventions, code order, and type declarations.
pubDate: 2025-03-17
category: game-dev
subcategory: godot
tags: [gdscript, godot]
locale: en
translationKey: GDScript
---


This post does not cover GDScript syntax. For questions about the language itself, see the [official documentation](https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/index.html).
Here, I want to focus on code style.
Because GDScript is quite similar to Python, [PEP 8](https://peps.python.org/pep-0008/) is also a useful reference.

Here is a complete example based on the [style guide](https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_styleguide.html).

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

## 1. Formatting

- Use LF line endings.
- Use UTF-8 encoding without a byte order mark.
- Indent with <kbd>Tab</kbd> rather than <kbd>Space</kbd>.


## 2. Naming conventions

| Type         | Convention    | Example                     |
|:-------------|:--------------|:----------------------------|
| File names   | snake_case    | `yaml_parser.gd`            |
| Class names  | PascalCase    | `class_name YAMLParser`     |
| Node names   | PascalCase    | `Camera3D` `Player`         |
| Functions    | snake_case    | `func load_level():`        |
| Variables    | snake_case    | `var particle_effect`       |
| Signals      | snake_case    | `signal door_opened`        |
| Constants    | CONSTANT_CASE | `const MAX_SPEED = 200`     |
| Enum names   | PascalCase    | `enum Element`              |
| Enum members | CONSTANT_CASE | `{EARTH, WATER, AIR, FIRE}` |

## 3. Code order

```gdscript
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
17. subclasses
```

This ordering broadly follows these principles:
1. Put properties and signals first, followed by methods and functions.
2. Put `public` members before `private` members.
3. Put virtual callbacks before the class interface.
4. Put constructors and initialization methods, such as `_init()` and `_ready()`, before other methods. Follow them with `_unhandled_input()` and `_physics_process()`.
5. Put `@onready` variables after other member variables and before methods. They are initialized before the `_ready()` callback; their declarations do not need to sit immediately above `_ready()` in the source.
6. Declare local variables as close as possible to where they are first used.

## 4. Type declarations

When the intended type is not obvious, declare it explicitly rather than relying on type inference.

```gdscript
# The type can be int or float, and thus should be stated explicitly.
var health: int = 0 # Good

# Typed as int, but it could be that float was intended.
var health := 0 # Bad
```

Conversely, when the type is already obvious, use type inference without repeating the declaration.

```gdscript
# The type is clearly inferred as Vector3.
var direction := Vector3(1, 2, 3) # Good
# The type hint has redundant information.
var direction: Vector3 = Vector3(1, 2, 3) # Bad
# What type is this? It's not immediately clear to the reader
var value := complex_function() # Bad
```

Sometimes we want a specific type, but a function’s declared return type is more general.

```gdscript
@onready var health_bar: ProgressBar = get_node("UI/LifeBar") # Good
@onready var health_bar := get_node("UI/LifeBar") as ProgressBar # Good
# The compiler can't infer the exact type and will use Node instead of ProgressBar
@onready var health_bar := get_node("UI/LifeBar") # Bad
```
