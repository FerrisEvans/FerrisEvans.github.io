---
key: cpp_pointer04
title: "Pointers, part 4 | Lvalues and rvalues"
description: "Understand lvalues and rvalues, and why some expressions can appear on the left side of an assignment."
date: 2025-03-02
category: lang
subcategory: cpp
tags: [pointer, reference, lvalue, rvalue]
---

## Lvalues and rvalues

The examples in this article use C expressions to explain lvalues and rvalues; they do not cover the full C++ value-category model. The code blocks are snippets intended to appear inside a function.

To understand pointers, it helps to understand lvalues and rvalues. These long-established terms originally referred to the left and right sides of an assignment, but that distinction does not fully capture how they are used in C today.

As a starting point, an lvalue identifies an object, and a modifiable lvalue can appear on the left side of an assignment. The right side can be either an lvalue or an rvalue, with any required conversions applied.

Assume that `a` and `b` have already been declared as integers and `b` has been initialized:

```c
/* Declarations and the surrounding function are omitted. */
a = b + 25;
```

`a` is an lvalue, and `b + 25` is an rvalue.

If we reverse the assignment, `a` can appear on the right side, but `b + 25` cannot appear on the left: it does not identify an object we can assign to.

> [!TIP]
> Evaluating `b + 25` produces a value, but that does not make the expression an lvalue: it computes a result rather than identifying an object. Numeric literals are not lvalues either. String literals, however, are lvalues because they identify arrays.

This does not mean that only variable names can be lvalues. In the following examples, the subscript expression `a[b + 10]` and the dereference expression `*p` are both lvalues:

In this independent snippet, `b` is initialized so that `b + 10` is a valid index. The assignments set `a[10]` to `0` and then `a[0]` to `10`.

```c
/* Place these statements inside a function; the wrapper is omitted. */
int b = 0;
int a[30];
a[b + 10] = 0;

int *p;
p = a;
*p = 10;
```
