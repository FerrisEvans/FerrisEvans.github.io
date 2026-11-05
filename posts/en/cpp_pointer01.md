---
translationKey: cpp_pointer01
locale: en
title: "Pointers, Part 1 | Declarations"
description: "Starting with memory and addresses, explore pointer declarations, dereferencing, void*, nullptr, and common pitfalls."
pubDate: 2024-06-06
category: programming-language
subcategory: cpp
tags: [pointer]
---


Pointers are an important reason for C's popularity: they let us implement advanced data structures such as trees and lists efficiently. C can be used to write programs that are more compact and efficient than their counterparts in other languages.

To talk about pointers, let's start with variables, which should already be familiar. A variable's value is stored in computer memory, where it occupies a particular location. An address identifies and refers to that location, much as a house number identifies a house on a street. A pointer stores a memory address.

We can think of memory as a row of houses along a long street. Each house can hold data and is identified by a house number. The data inside a house and the address of that house are separate, distinct things, even though both are data.

## 1. Memory and Addresses

Computer memory consists of billions of bits, each of which can hold either 0 or 1. A single bit represents such a limited range of values that it is not very useful on its own. We usually group several bits into a unit that can store a larger range of values.

On the common platforms discussed here, a byte contains 8 bits and can store an unsigned value from 0 to 255 or a signed value from -128 to 127. Each byte has an address. To store larger values, we combine two or more bytes into a larger unit of memory.


$$
1 byte = 8 bit
$$

> [!TIP]
> As an aside, the terms 32-bit and 64-bit commonly describe the width of a machine's general-purpose registers: 32 bits is 4 bytes, and 64 bits is 8 bytes on an 8-bit-byte platform. They do not impose a universal maximum on the amount of data a single instruction can process.

Many machines store integers in units called words. Depending on the architecture, a word may contain 2, 4, or more bytes. Although a word spans several bytes, the word itself is addressed by its starting location.

1. Each location in memory is identified by a unique address.
2. Each location in memory contains a value.

If we remember where a value is stored, we can retrieve it later using that address. Keeping track of memory locations this way would be tedious, though, so C lets us access them by name instead. Those names are the variables we use in our programs.

> [!TIP]
> The association between a name and a memory location is provided by the compiler, not the hardware. Variables give us a convenient way to refer to locations, but the hardware still accesses memory through addresses.

## 2. Pointer Declarations

```c
int *a;
```

This statement says that the expression `*a` has type `int`. Once we know that the `*` operator performs **indirection**, we can infer that `a` must be a pointer to an `int`.

> [!WARNING]
> C is essentially a free-form language, so it is tempting to put the asterisk next to the type, as in `int* p;`. This means the same thing as the preceding declaration and may look clearer: `p` is declared as a pointer of type `int*`. However, this style can be misleading when several variables share a declaration.

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

## 3. void*

In some low-level code, we need to store or pass an object's address without knowing its exact type. This is where `void*` comes in:
it means “pointer to an object of unknown type.”

The main use of `void*` is to pass a pointer to a function when we cannot assume the object's type. It is also used to return pointers to objects of an unspecified type. Before using such an object, we must explicitly convert the pointer to an appropriate type.

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

```c++
void* my_alloc(size_t n); // allocate n bytes from a particular heap
```

## 4. nullptr

The literal `nullptr` represents a null pointer: a pointer that does not point to an object. A single `nullptr` literal can be converted to any pointer type; C++ does not need a different null-pointer literal for each type.
Before `nullptr` was introduced, programmers used `0` to represent a null pointer.

```c++
int* pi = nullptr;
int i = nullptr; // error: int is not a pointer type
int* x = 0; // x holds a null pointer
```

> [!WARNING]
> Older code often uses the macro `NULL` for a null pointer. Its definition depends on the implementation; in C++ it may be an integer zero literal such as `0` or `0L`, or `nullptr`.
> In C, `NULL` may be defined as `(void*)0`. That definition cannot be used for an implicit conversion to `int*` in C++.

```c++
int* p = NULL; // valid with the NULL provided by a conforming C++ implementation
```

`nullptr` has several advantages. It is easier to read, and it avoids ambiguity when an overload set contains both pointer and integer parameters.
