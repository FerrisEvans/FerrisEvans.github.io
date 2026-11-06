---
translationKey: cpp_pointer03
locale: en
title: "Pointers, part 3 | Strings"
description: "An introduction to null-terminated C-style strings and how character pointers are initialized."
pubDate: 2025-03-02
category: programming-language
subcategory: cpp
tags: [pointer, string]
---

A C-style string is a sequence of characters stored in a `char` array and terminated by a null character, `\0`. The terminator marks the end of the string; it is not the digit `'0'`.

The following is a complete C program, not C++ code. Save it as a C source file and compile it with a C compiler. It demonstrates pointer initialization and character access; the corresponding C++ declaration is explained afterward.

```c
#include <stdio.h>

int main(void) {
    /* This declares msg as a pointer to char and initializes it with the address of the first character in the string. */
    char *msg = "Hello World!";

    /*
    Equivalent to the declaration above:
    char *msg;
    msg = "Hello World!";
    */
    printf("%s\n", msg); /* Hello World! */
    printf("%c\n", *msg); /* H */
    printf("%c\n", *(msg + 1)); /* e */
    printf("%p\n", (void *)msg); /* The address varies between runs. */

    return 0;
}
```

The program prints `Hello World!`, `H`, `e`, and the string’s starting address. The address is not fixed.

> [!CAUTION]
> This declaration is easy to misread: the initializer applies to `msg`, the pointer, rather than to `*msg`, the character it points to.

C++ string literals use the same null-terminated representation, and many standard library functions accept pointers to such strings. In C++11 and later, the example's declaration must be `const char *msg = "Hello World!";` because an [ordinary string literal](https://eel.is/c++draft/lex.string) is an array of `const char`.

In this context, `char*` and `const char*` commonly point to null-terminated character sequences. The pointer type alone does not guarantee that a null terminator is present.
