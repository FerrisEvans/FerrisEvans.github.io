---
key: cpp_pointer03
title: "手撕指针第三章 | 字符串"
description: 介绍以 0 结尾的 C 风格字符串，及其指针声明方式中容易误解的初始化语义。
date: 2025-03-02
category: lang
subcategory: cpp
tags: [pointer, string]
---

以 `0` 作为终止符的 `char` 数组是应用最广泛的一种数组。
这是 C 语言存储字符串的最基本方式，因此我们常把以 `0` 作为终止符的 `char` 数组称为 C 风格字符串。

下面是一个完整的 C 程序，不是 C++ 代码。将其保存为 C 源文件，并使用 C 编译器编译。它演示字符指针的初始化和字符访问；对应的 C++ 声明方式见示例后的说明。

```c
#include <stdio.h>

int main(void) {
    /* 下面这条语句把 msg 声明为一个指向字符的指针，并用字符串中第一个字符的地址对该指针进行初始化 */
    char *msg = "Hello World!";

    /*
    与上述声明等价
    char *msg;
    msg = "Hello World!";
    */
    printf("%s\n", msg); /* Hello World! */
    printf("%c\n", *msg); /* H */
    printf("%c\n", *(msg + 1)); /* e */
    printf("%p\n", (void *)msg); /* 地址随运行而变化。 */

    return 0;
}
```

程序依次输出 `Hello World!`、`H`、`e` 和字符串的起始地址，地址不是固定值。

> [!CAUTION]
> 这种类型的声明所面临的一个危险是很容易误解其含义。看上去初始值似乎是赋值给表达式 `*msg`，而事实上它是赋值给 `msg` 本身的。

C++ 字符串字面量沿用了以空字符结尾的表示方式，部分标准库函数也接受指向这种字符串的指针。在 C++11 及后续标准中，上例的声明应写成 `const char *msg = "Hello World!";`，因为[普通字符串字面量](https://eel.is/c++draft/lex.string)是 `const char` 数组。
通常情况下，`char*` 和 `const char*` 指向以 `0` 结尾的字符串序列。
