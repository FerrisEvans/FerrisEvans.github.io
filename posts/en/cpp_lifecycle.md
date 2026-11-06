---
translationKey: cpp_lifecycle
locale: en
title: "Object lifetimes"
description: "How object lifetimes work in C++, from local and static objects to dynamically allocated objects, temporaries, and thread-local objects."
pubDate: 2025-02-28
category: programming-language
subcategory: cpp
tags: [lifecycle, oop]
---

This article compares the lifetimes of automatic, static, dynamically allocated, temporary, and thread-local objects in C++, explaining when they are created and destroyed.

**Object lifetime**: An object's lifetime begins when its initialization is complete. For a class object, it ends when the destructor call begins. Non-class types such as `int` have no constructors or destructors, so no such member functions are called when their objects are initialized or their lifetimes end.

**Automatic objects**: Unless the programmer specifies otherwise, an object declared inside a function is created at its definition and destroyed when execution leaves its scope. Most implementations allocate automatic objects on the stack.
On these implementations, each function call typically creates a stack frame for its automatic objects.

**Static objects**: Objects declared at global or namespace scope, along with objects or data members declared `static` inside functions or classes, are created and initialized only once and remain alive until program termination.
A static object retains the same address throughout its lifetime.

> [!NOTE]
> Static objects can cause unexpected problems in multithreaded programs because threads share them. Concurrent access that includes a write needs appropriate synchronization, such as a lock, to avoid data races.

**Free-store objects**: Dynamically allocated objects whose lifetimes are managed with `new` and `delete`.

**Temporary objects**: Examples include intermediate results of computations and objects created as arguments for `const` reference parameters. A temporary is normally destroyed at the end of the full expression in which it was created.
Binding a temporary to a reference can extend its lifetime, subject to specific rules and exceptions. In particular, binding it to a function parameter does not extend its lifetime beyond the full expression containing the call.

**Thread-local objects**: Each thread has its own instance. Initialization follows the rules for thread-local storage, and each initialized instance is destroyed when its thread exits.

The lifetimes of array elements and non-static data members are tied to the objects that contain them.
