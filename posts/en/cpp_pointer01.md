---
translationKey: cpp_pointer01
locale: en
title: "Pointers, part 1 | Declarations"
description: "An introduction to pointers, covering memory addresses, pointer declarations, dereferencing, void*, nullptr, and common pitfalls."
pubDate: 2024-06-06
category: programming-language
subcategory: cpp
tags: [pointer]
---

This article covers memory addresses, pointer declarations, dereferencing, `void*`, and `nullptr`. Code blocks labeled C use C syntax; those labeled C++ cover C++ rules. They are independent snippets with surrounding functions and unrelated declarations omitted. Intentional errors are marked in comments.

Pointers are central to C and C++: they give us direct access to objects in memory and let us build data structures such as linked lists and trees.

To understand pointers, let's start with a familiar concept: variables. We can think of a variable's value as occupying a location in memory. An address identifies that location, much as a house number identifies a house on a street. A pointer lets us refer to a location by its address.

Extending that analogy, memory is a row of houses along a long street. Each house holds data and has its own address. The contents of a house and its address are different things, even though both can be represented as data.

## Memory and addresses

Computer memory consists of billions of bits, each of which can hold either 0 or 1. A single bit represents such a limited range of values that it is not very useful on its own. We usually group several bits into a unit that can store a larger range of values.

On the common platforms discussed here, a byte contains 8 bits and can store an unsigned value from 0 to 255 or a signed value from -128 to 127. Each byte has an address. To store larger values, we combine two or more bytes into a larger unit of memory.

$$
1\text{ byte} = 8\text{ bits}
$$

> [!TIP]
> The terms 32-bit and 64-bit commonly describe the width of a machine's general-purpose registers: 32 bits is 4 bytes, and 64 bits is 8 bytes on a platform with 8-bit bytes. These terms do not set a universal limit on how much data a single instruction can process.

Many machines store integers in units called words. Depending on the architecture, a word may contain 2, 4, or more bytes. Although a word spans several bytes, the word itself is addressed by its starting location.

- Each location in memory is identified by a unique address.
- Each location in memory contains a value.

If we remember where a value is stored, we can retrieve it later using that address. Keeping track of memory locations this way would be tedious, though, so C lets us access them by name instead. Those names are the variables we use in our programs.

> [!TIP]
> The association between a name and a memory location is provided by the compiler, not the hardware. Variables give us a convenient way to refer to locations, but the hardware still accesses memory through addresses.

## Pointer declarations

The following declaration introduces a pointer to an integer:

```c
int *a;
```

This declaration tells us that the expression `*a` has type `int`. Since the `*` operator performs **indirection**, `a` must be a pointer to an `int`.

> [!WARNING]
> Whitespace around the asterisk does not change the declaration's meaning. Writing `int* p;` emphasizes that `p` has type `int*`, but this style can be misleading when several variables share a declaration.

```c
int* b, c, d;
```

> [!CAUTION]
> It is natural to read this as declaring all three variables as pointers to integers. In fact, the asterisk belongs only to the declarator `*b`: `b` is a pointer, while the other two variables are ordinary integers.

```c
/* To declare three pointers, write the following instead. */
int *b, *c, *d;
```

One fundamental pointer operation is **dereferencing**: referring to the object a pointer points to. This is also called indirection.

```c++
char c = 'a';
char *p = &c; // p holds the address of c; & is the address-of operator
char c2 = *p; // * is the dereference operator; c2 == 'a'
```

In a declaration, `*` means “pointer to.” Pointers to arrays and pointers to functions require slightly more elaborate forms.

```c++
int* pi; // pointer to int
char** pcc; // pointer to a pointer to char
int* ap[15]; // ap is an array of 15 pointers to int
int (*fp) (char*); // pointer to a function taking char* and returning int
int* f(char*); // function taking char* and returning a pointer to int
```

## The `void*` pointer type

In low-level code, we sometimes need to store or pass an object's address without specifying its type. A `void*` lets us do that: it is a pointer whose type does not identify the type of the object it points to.

We can use `void*` to pass an object's address to a function, or return it from a function, without specifying the object's type in the interface. In C++, we must explicitly convert the pointer to an appropriate type before accessing the object through it.

> [!CAUTION]
> Function pointers and pointers to class members cannot be implicitly assigned to `void*`.

```c++
void f(int* pi)
{
  void* pv = pi; // OK: implicit conversion from int* to void*
  *pv; // error: void* cannot be dereferenced
  ++pv; // error: void* cannot be incremented; the object size is unknown
  
  int* pi2 = static_cast<int*>(pv); // explicit conversion back to int*
  
  double* pd1 = pv; // error
  double* pd2 = pi; // error
  double* pd3 = static_cast<double*>(pv); // unsafe to use to access an int as a double
}
```

> [!WARNING]
> In general, if a pointer has been cast to a type unrelated to the actual object it points to, accessing the object through that converted pointer is unsafe.

Functions that use `void*` often live in the lowest layers of a system, where they deal with hardware resources.

> [!WARNING]
> `void*` is uncommon in higher-level code. When it appears there, it is worth checking whether the design is sound. If it is needed for optimization, it can be hidden behind a type-safe interface.

This declaration illustrates an allocator interface. `std::size_t` is provided by `<cstddef>`; the allocator implementation is omitted.

```c++
// Include <cstddef>; the function definition is omitted.
void* my_alloc(std::size_t n); // allocate n bytes from a particular heap
```

## The `nullptr` literal

Introduced in C++11, the literal `nullptr` represents a null pointer: a pointer that does not point to an object or function. It can be converted to any pointer type, so C++ does not need a separate null-pointer literal for each type.
Before `nullptr` was introduced, programmers used `0` to represent a null pointer.

```c++
int* pi = nullptr;
int i = nullptr; // error: int is not a pointer type
int* x = 0; // x holds a null pointer
```

> [!WARNING]
> Older code often uses the macro `NULL` for a null pointer. Its definition depends on the implementation; in C++ it may be an integer zero literal such as `0` or `0L`, or `nullptr`.
> In C, `NULL` may be defined as `(void*)0`. That definition cannot be used for an implicit conversion to `int*` in C++.

The final snippet assumes that `<cstddef>` has been included to make `NULL` available.

```c++
// Include <cstddef> for NULL; omitted here.
int* p = NULL; // valid with the NULL provided by a conforming C++ implementation
```

`nullptr` has several advantages. It is easier to read, and it avoids ambiguity when an overload set contains both pointer and integer parameters.
