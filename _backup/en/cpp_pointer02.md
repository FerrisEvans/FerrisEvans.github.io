---
key: cpp_pointer02
title: "Pointers, part 2 | Arrays"
description: "How to declare arrays, access their elements, understand array-to-pointer conversion, and manage dynamically allocated arrays safely."
date: 2025-03-02
category: lang
subcategory: cpp
tags: [pointer, array]
---

This article explains built-in arrays, array-to-pointer conversion, and array lifetime management. The complete C example demonstrates element access; the surrounding discussion explains where the same ideas apply to C++.

## Declaration and access

Arrays are a basic way to represent a sequence of objects in C++. An array holds a fixed number of elements, all of the same type.

For a type `T`, `T[size]` means “an array containing `size` elements of type `T`.” Element indices range from `0` to `size-1`.

We can access array elements with the subscript operator or with pointers. A subscript expression and the corresponding dereference expression are equivalent.

The number of elements in a built-in array—its bound—must be a constant expression. If the size needs to vary, `vector` is usually a better choice.

> [!CAUTION]
> Accessing an array out of bounds is undefined behavior and can cause serious program errors. C++ built-in arrays do not guarantee runtime bounds checking.

Save the following as a C source file and compile it with a C compiler. It prints the first element, the array’s starting address, the first element again, and then the second element. The numeric output is `1`, `1`, and `2`; the address depends on the run.

```c
#include <stdio.h>

int main(void) {
    int a;
    a = 0;
    int arr[] = {1, 2, 3, 4};
    printf("%d\n", *arr); /* 1 */
    printf("%p\n", (void *)arr); /* The address varies between runs. */
    printf("%d\n", arr[0]); /* 1 */
    printf("%d\n", *(arr + 1)); /* 2 */

    return 0;
}
```

In the example above, `a` is a scalar: it holds a single integer.
By contrast, `arr` holds multiple integers, and we use an index to select an element.
For example, `arr[0]` denotes the first value in `arr`, while `arr[2]` denotes the third.

`arr[0]` has integer type, but what is the type of `arr` itself?
In most C expressions, an array expression is converted to a pointer to its first element. The pointer's type depends on the element type of the array.

This does not mean that arrays and pointers are the same. A pointer holds a single address; an array contains a fixed number of elements. The compiler knows the array's element type and size, although it does not generally check whether a subscript is within bounds.
When an expression requires array-to-pointer conversion, the result is a pointer to the array's first element.

> [!TIP]
> This conversion produces a pointer value, not a separate pointer variable that can be reassigned to move the array. The array's storage is determined by its storage duration and allocation. In particular, automatic and dynamically allocated arrays do not have their addresses fixed at link time.

Built-in arrays are a low-level C++ facility. They are often used to implement higher-level data structures with better-defined interfaces, such as the standard library's `vector` and `array`.
Built-in arrays cannot be assigned as a whole. Where the language requires it, an array expression is implicitly converted to a **pointer to its first element**.

> [!WARNING]
> Avoid exposing raw arrays in interfaces: implicit array-to-pointer conversion is a common source of errors in C and C-style C++.
> If an array was allocated in the free store[^free_store] with `new[]`, pass the pointer returned by `new[]` to `delete[]` when the array is no longer needed.

For simpler, more reliable lifetime management, use an owning type such as `std::string`, `std::vector`, or `std::unique_ptr<T[]>`.

> [!CAUTION]
> If an array has static[^static] storage or is allocated on the stack, do not apply `delete[]` to it.

[^free_store]: Objects whose lifetimes are controlled directly with `new` and `delete`. Note that the free store and the heap are not necessarily the same thing.
[^static]: Objects declared at global or namespace scope, as well as objects or data members declared `static` inside functions or classes, are created and initialized only once and remain alive until program termination.
