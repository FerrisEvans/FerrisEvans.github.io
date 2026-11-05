---
translationKey: cpp_pointer02
locale: en
title: "Pointers, Part 2 | Arrays"
description: "Explore array declarations and access, the relationship between array names and pointers, and how to release free-store arrays safely."
pubDate: 2025-03-02
category: programming-language
subcategory: cpp
tags: [pointer, array]
---


## 1. Declaration and Access

Arrays are the most basic way C++ represents a sequence of objects in memory. If all we need is a sequence with a fixed size and a fixed element type, an array meets that requirement.

For a type `T`, `T[size]` means “an array containing `size` elements of type `T`.” Element indices range from `0` to `size-1`.

We can access array elements with the subscript operator or with pointers. A subscript expression and the corresponding dereference expression are equivalent.

The number of elements in a built-in array—its bound—must be a constant expression. If the size needs to vary, `vector` is usually a better choice.

> [!CAUTION]
> Accessing an array out of bounds is undefined behavior and can cause serious program errors. C++ built-in arrays do not guarantee runtime bounds checking.

```c
int main() {
    int a;
    a = 0;
    int arr[] = {1, 2, 3, 4};
    printf("%d\n", *arr); /* 1 */
    printf("%p\n", arr); /* 0x7ff7b82f8110 */
    printf("%d\n", arr[0]); /* 1 */
    printf("%d\n", *(arr + 1)); /* 2 */

    return 0;
}
```

In the example above, `a` is a scalar: it holds a single value of integer type.
By contrast, `arr` is an array, a collection of values in which an index identifies a particular element.
For example, `arr[0]` denotes the first value in `arr`, while `arr[2]` denotes the third.

`arr[0]` has integer type, but what is the type of `arr` itself?
In most C expressions, an array expression is converted to a pointer to its first element. The pointer's type depends on the element type of the array.

This does not mean that arrays and pointers are the same. A pointer is a scalar value; an array contains a fixed number of elements, even though the compiler does not generally check whether a subscript is valid.
The compiler keeps track of those array properties. When an expression requires the array-to-pointer conversion, it produces a pointer value to the first element.

> [!TIP]
> This conversion produces a pointer value, not a separate pointer variable that can be reassigned to move the array. The array's storage is determined by its storage duration and allocation. In particular, automatic and dynamically allocated arrays do not have their addresses fixed at link time.

Built-in arrays are a low-level C++ facility. They are often used to implement higher-level data structures with better-defined interfaces, such as the standard library's `vector` and `array`.
Built-in arrays cannot be assigned as a whole. Where the language requires it, an array expression is implicitly converted to a **pointer to its first element**.

> [!WARNING]
> Avoid exposing raw arrays in interfaces: implicit array-to-pointer conversion is a common source of errors in C and C-style C++.
> If an array was allocated in the <u>free store</u>[^free_store] with `new[]`, remember to release its pointer with `delete[]` after its final use.

The simplest reliable approach is to use resource handles such as `string`, `vector`, or `unique_ptr` to manage the lifetime of a free-store array.

> [!CAUTION]
> If an array has <u>static</u>[^static] storage or is allocated on the stack, do not apply `delete[]` to it.

## 2. Arrays and Pointers


[^free_store]: Objects whose lifetimes are controlled directly with `new` and `delete`. Note that the free store and the heap are not necessarily the same thing.
[^static]: Objects declared at global or namespace scope, as well as objects or data members declared `static` inside functions or classes, are created and initialized only once and remain alive until program termination.
