---
translationKey: cpp_pointer04
locale: en
title: "Pointers, Part 4 | References"
description: "Explore lvalues and rvalues, including why variables and some expressions can appear on the left side of an assignment."
pubDate: 2025-03-02
category: programming-language
subcategory: cpp
tags: [pointer, reference, lvalue, rvalue]
---


## Lvalues and Rvalues

To explain pointers more clearly, we also need to understand lvalues and rvalues. Compiler designers introduced these terms many years ago, and they are still in use, although their historical meanings do not precisely describe all the rules of C.

As an initial intuition, an lvalue identifies an object, and a modifiable lvalue can appear on the left side of an assignment. The right side can use either an lvalue or an rvalue, subject to the required conversions.

```c
a = b + 25;
```

`a` is an lvalue, and `b + 25` is an rvalue.

Can we swap them? The lvalue `a` can be used on the right side, but `b + 25` cannot be used on the left: it does not designate an object that can be assigned to. Such an assignment is invalid.

> [!TIP]
> When the computer evaluates `b + 25`, its result must be represented somewhere. That does not make the expression an lvalue: the expression computes a value rather than designating an object. Numeric literals are likewise not lvalues; string literals are an exception to a blanket claim about all literals, because they designate arrays.

We might conclude that variables can be lvalues but expressions cannot. That is not correct: the left sides of the following assignments are expressions.

```c
int a[30];
a[b + 10] = 0;

int *p;
p = a;
*p = 10;
```
