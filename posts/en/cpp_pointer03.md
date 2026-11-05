---
translationKey: cpp_pointer03
locale: en
title: "Pointers, Part 3 | Strings"
description: "An introduction to null-terminated C-style strings and the easily misunderstood initialization syntax of character pointers."
pubDate: 2025-03-02
category: programming-language
subcategory: cpp
tags: [pointer, string]
---


A `char` array terminated by `0` is one of the most widely used kinds of array.
It is C's most basic way of storing a string, which is why we often call a `char` array terminated by `0` a C-style string.

```c
int main() {
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
    printf("%p\n", msg); /* 0x100de3f92 */

    return 0;
}
```
> [!CAUTION]
> A danger of this declaration syntax is that it is easy to misread. It may look as though the initializer is being assigned to the expression `*msg`, but it actually initializes `msg` itself.

C++ string literals preserve this convention, and some standard library functions are built around it.
In this context, `char*` and `const char*` commonly point to character sequences terminated by `0`.
