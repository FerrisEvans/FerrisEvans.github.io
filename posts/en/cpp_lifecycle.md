---
translationKey: cpp_lifecycle
locale: en
title: "Object Lifetimes"
description: "An introduction to the lifetimes of automatic, static, free-store, temporary, and thread-local objects in C++."
pubDate: 2025-02-28
category: programming-language
subcategory: cpp
tags: [lifecycle, oop]
---


**Object lifetime**: An object's lifetime begins when its initialization is complete. For a class object, it ends when its destructor call begins. Types such as `int` do not actually have constructors or destructors; their initialization and the end of their lifetime do not require these member functions.


**Automatic objects**: Unless the programmer specifies otherwise, an object declared inside a function is created at its definition and destroyed when execution leaves its scope. Most implementations allocate automatic objects on the **stack**.
Each function call obtains a new stack frame to hold its automatic objects.


**Static objects**: Objects declared at global or namespace scope, along with objects or data members declared `static` inside functions or classes, are created and initialized only once and remain alive until program termination.
A static object retains the same address throughout its lifetime.


> [!NOTE]
> Static objects can cause unexpected problems in multithreaded programs because threads share them. Concurrent access that includes a write needs appropriate synchronization, such as a lock, to avoid data races.

**Free-store objects**: Objects whose lifetimes are controlled directly with `new` and `delete`.


**Temporary objects**: Examples include intermediate results of computations and objects created to supply values to `const` reference parameters. Their lifetimes depend on how they are used. Binding a temporary to a reference can extend its lifetime, but this is subject to specific rules and exceptions; binding it to a function parameter does not extend it beyond the full expression containing the call.
Otherwise, a temporary is normally destroyed at the end of the full expression in which it was created. Its lifetime is managed automatically.


**Thread-local objects**: Each thread has its own instance. Initialization follows the rules for thread-local storage, and an initialized instance is destroyed when its thread exits.


The lifetimes of array elements and non-static data members are tied to the objects that contain them.
