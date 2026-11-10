---
key: cpp_type
title: "C++ types"
description: "A guide to fundamental C++ types—bool, characters, integers, floating-point types, and void—along with narrowing conversions and literal prefixes and suffixes."
date: 2025-02-22
category: lang
subcategory: cpp
tags: [type]
---

This article introduces fundamental C++ types, literal notation, and conversions. Examples are independent snippets, with intentionally invalid lines marked `error`. Except where shown, headers and surrounding functions are omitted; the examples are not a single program.

## Boolean types

A Boolean variable (`bool`) holds either `true` or `false` and often stores the result of a logical operation.
Converting a Boolean value to an integer produces 1 for `true` and 0 for `false`. Conversely, integers can be implicitly converted to Boolean values: a nonzero integer becomes `true`, and zero becomes `false`.

```c++
bool b1 = 7;
bool b2{7}; // error: narrowing conversion

int i1 = true;
int i2{true};

bool a = true;
bool b = true;

bool x = a + b; // true
bool y = a || b; // true
bool z = a - b; // false
```

To convert an `int` to `bool` in a `{}` initializer without a narrowing conversion[^narrowing_conversion], make the comparison explicit:

```c++
void f(int i)
{
  bool b{i != 0};
}
```

Pointers can also be implicitly converted to `bool` when needed. A non-null pointer becomes `true`, while a null pointer becomes `false`.

```c++
void g(int *p)
{
  bool b = p; // convert to true or false
  bool b2{p != nullptr}; // explicitly test whether the pointer is null
  
  if (p) // equivalent to p != nullptr
  {}
}
```

> [!TIP]
> I prefer `if (p)` to `if (p != nullptr)`: it is concise and directly expresses whether `p` is non-null. Neither form proves that the pointed-to object is still valid.

## Character types

In C++, `char` occupies exactly one byte, so `sizeof(char)` is always 1. The number of bits in a byte depends on the implementation:
a byte has at least 8 bits, and 8-bit bytes are common. The size in bytes and the number of bits per byte are different measurements.
A `char` can store one byte of character data. Many implementations use a character encoding compatible with ASCII for basic characters.

```c++
unsigned char c1 = 64; // well-defined: char has at least 8 bits, enough to hold 64
unsigned char c2 = 1256; // the result depends on the width of char; with 8 bits it wraps to 232
```

`char`: The ordinary character type used for program text. It represents values in the implementation's character encoding and commonly occupies 8 bits.

`signed char`: The same size as `char`, but explicitly signed, so it can hold negative, zero, and positive values.

`unsigned char`: The same size as `char`, but explicitly unsigned.

`wchar_t`: Used for wide characters. Its size is implementation-defined and is chosen to support the wide-character encoding used by the implementation.

`char16_t`: Used for UTF-16 code units.

`char32_t`: Used for UTF-32 code units.

> [!NOTE]
> An implementation may give `char` the same representation and range as either `signed char` or `unsigned char`. They nevertheless remain three distinct types, and pointers to them are not interchangeable.

We can inspect the integer value of a `char` in the implementation's character encoding:
The following function reads characters from standard input and prints their integer values. It requires `<iostream>`; the caller is omitted.

```c++
#include <iostream>

// A main() function that calls intval() is omitted.
// Inspect the integer value associated with a character
void intval()
{
  for (char c; std::cin >> c; )
    std::cout << "the value of '" << c << "' is " << int{c} << '\n';
}
```

> [!WARNING]
> Avoid making assumptions about how objects are represented in memory, especially when working with characters.

| Symbol / prefix | Meaning | Example |
|:------------:|:--------------:|:----------|
|     `'`      |     `char`     | `'c'`     |
|     `u'`     |   `char16_t`   | `u'c'`    |
|     `U'`     |   `char32_t`   | `U'c'`    |
|     `L'`     |   `wchar_t`    | `L'c'`    |
| `"` | String | `"mess"` |
| `R"` | Raw string | `R"(\b)"` |
| `u8"` `u8R"` | UTF-8 string | `u8"foo"` |
| `u"` `uR"` | UTF-16 string | `u"foo"` |
| `U"` `UR"` | UTF-32 string | `U"foo"` |
| `L"` `LR"` | `wchar_t` string | `L"foo"` |

In this table, “string” means a string literal[^string_literal], not the `std::string` type.

## Integer types

| Symbol | Position | Meaning | Example |
|:---------:|:--:|:---------:|:----------|
| `0` | Prefix | Octal | `0776` |
| `0x` `0X` | Prefix | Hexadecimal | `0xff` |
| `u` `U` | Suffix | `unsigned` | `10U` |
| `l` `L` | Suffix | `long` | `20000L` |
| `ll` `LL` | Suffix | `long long` | `20000LL` |

## Floating-point types

- `float`: typically single precision
- `double`: typically double precision, with at least as much precision as `float`
- `long double`: at least as much precision as `double`; the actual format depends on the implementation

| Symbol | Position | Meaning | Example |
|:-------:|:--:|:-------:|:--------|
| `f` `F` | Suffix | `float` | `10.0F` |
| `e` `E` | Infix | Floating-point exponent | `10e-4` |
| `.` | Infix | Floating-point decimal point | `1.2` |

> [!TIP]
> For many applications, `bool`, `char`, `int`, and `double` are good starting points for Boolean values, characters, integers, and floating-point values. Choose other fundamental types when range, precision, performance, or compatibility requirements call for them.

## The `void` type

- As a function return type, it indicates that the function returns no value.
- In a pointer type (`void*`), it lets the pointer refer to an object without specifying the object's type.

```c++
void f();
void *ptr;
```

## Size

$$
1\text{ byte} = 8\text{ bits}
$$

The equation above describes the common 8-bit-byte case. Under the [C++ standard's rules for fundamental types](https://eel.is/c++draft/basic.fundamental), many important details are implementation-defined and closely tied to the hardware on which the program runs.

C++ requires `char` to have at least 8 bits, `short` at least 16 bits, and `long` at least 32 bits.

The width of `int` is also implementation-defined. It is intended to be a natural size for integer operations on the target machine and commonly occupies 4 bytes.

> [!WARNING]
> - `char` commonly has 8 bits, but machines with 32-bit `char` also exist.
> - Never assume that `int` and a pointer have the same size. On many 64-bit architectures, a pointer is larger than an `int`.

[^narrowing_conversion]: A conversion that can lose information.
[^string_literal]: A sequence of characters enclosed in double quotes. The resulting array includes a terminating null character, `\0`.
