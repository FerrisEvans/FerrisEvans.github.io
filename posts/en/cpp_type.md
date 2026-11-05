---
translationKey: cpp_type
locale: en
title: "C++ Types"
description: "A guide to fundamental C++ types—bool, characters, integers, floating-point types, and void—along with narrowing conversions and literal prefixes and suffixes."
pubDate: 2025-02-22
category: programming-language
subcategory: cpp
tags: [type]
---


## 1. Boolean Types

A Boolean variable (`bool`) holds either `true` or `false` and is commonly used for the result of a logical operation.
By definition, converting a Boolean value to an integer turns `true` into 1 and `false` into 0. Conversely, integers can be implicitly converted to Boolean values when needed: a nonzero integer becomes `true`, and zero becomes `false`.

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
If we want to use a `{}` initializer to prevent a <u>narrowing conversion</u>[^narrowing_conversion] while deliberately converting an `int` to `bool`, we can make the condition explicit:
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

## 2. Character Types

In C++, `char` occupies exactly one byte, so `sizeof(char)` is always 1. The number of bits in a byte depends on the implementation:
a byte has at least 8 bits, and 8-bit bytes are common. The size in bytes and the number of bits per byte are different measurements.
A `char` can store one byte of character data. Many implementations use a character encoding compatible with ASCII for basic characters.

```c++
unsigned char c1 = 64; // well-defined: char has at least 8 bits, enough to hold 64
unsigned char c2 = 1256; // the result depends on the width of char; with 8 bits it wraps to 232
```

**char**: The ordinary character type used for program text. It represents values in the implementation's character encoding and commonly occupies 8 bits.


**signed char**: Similar in size to `char`, but explicitly signed, so it can hold both negative and positive values.


**unsigned char**: Similar in size to `char`, but explicitly unsigned.


**wchar_t**: Used for wide characters. Its size is implementation-defined and is chosen to support the wide-character encoding used by the implementation.


**char16_t**: Used for UTF-16 code units.


**char32_t**: Used for UTF-32 code units.


> [!NOTE]
> An implementation may give `char` the same representation and range as either `signed char` or `unsigned char`. They nevertheless remain three distinct types, and pointers to them are not interchangeable.

Each character in the programming environment's character encoding corresponds to an integer value.
```c++
// Inspect the integer value associated with a character
void intval()
{
  for (char c; cin >> c; )
    std::cout << "the value of '" << c << "' is " << int{c} << '\n';
}
```

> [!WARNING]
> Avoid assuming an object's representation, especially when working with characters.

| Symbol / prefix | Meaning | Example |
|:------------:|:--------------:|:----------|
|     `'`      |     `char`     | `c`       |
|     `u'`     |   `char16_t`   | `u'c'`    |
|     `U'`     |   `char32_t`   | `U'c'`    |
|     `L'`     |   `wchar_t`    | `L'c'`    |
| `"` | String | `"mess"` |
| `R"` | Raw string | `R"(\b)"` |
| `u8"` `u8R"` | UTF-8 string | `u8"foo"` |
| `u"` `uR"` | UTF-16 string | `u"foo"` |
| `U"` `UR"` | UTF-32 string | `U"foo"` |
| `L"` `LR"` | `wchar_t` string | `L"foo"` |

<sub>*“String” in this table means a <u>string literal</u>[^string_literal], not the `std::string` type.*</sub>

## 3. Integer Types

| Symbol | Position | Meaning | Example |
|:---------:|:--:|:---------:|:----------|
| `0` | Prefix | Octal | `0776` |
| `0x` `0X` | Prefix | Hexadecimal | `0xff` |
| `u` `U` | Suffix | unsigned | `10U` |
| `l` `L` | Suffix | long | `20000L` |
| `ll` `LL` | Suffix | long long | `20000LL` |


## 4. Floating-Point Types

- `float`: single precision
- `double`: double precision
- `long double`: extended precision

| Symbol | Position | Meaning | Example |
|:-------:|:--:|:-------:|:--------|
| `f` `F` | Suffix | `float` | `10.0F` |
| `e` `E` | Infix | Floating-point exponent | `10e-4` |
| `.` | Infix | Floating-point decimal point | `1.2` |

> [!TIP]
> For most applications, we can use `bool` for Boolean values, `char` for characters, `int` for integers, and `double` for floating-point values. The other fundamental types can be thought of as variations on these,
> useful when performance, compatibility, or other requirements call for them. In many cases, those four types are enough.

## 5. void

1. As a function return type, it indicates that the function returns no value.
2. As the pointed-to type of a pointer, it indicates that the type of the object is unspecified.

```c++
void f();
void *ptr;
```

## 6. Size

$$
1 byte = 8 bit
$$

The equation above describes the common 8-bit-byte case. Under the C++ standard, many important details are implementation-defined and closely tied to the hardware on which the program runs.

C++ requires `char` to have at least 8 bits, `short` at least 16 bits, and `long` at least 32 bits.

The width of `int` is also implementation-defined. It is intended to be a natural size for integer operations on the target machine and commonly occupies 4 bytes.

> [!WARNING]
> 1. `char` commonly has 8 bits, but machines with 32-bit `char` also exist.
> 2. Never assume that `int` and a pointer have the same size. On many 64-bit architectures, a pointer is larger than an `int`.

[^narrowing_conversion]: A conversion that can lose information.
[^string_literal]: A sequence of characters enclosed in double quotes. A string literal normally contains one more character than is visible in its spelling: a terminating zero character, `\0`.
