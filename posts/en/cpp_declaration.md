---
translationKey: cpp_declaration
locale: en
title: "C++ declarations"
description: "A guide to C++ declarations and definitions, scope, variable shadowing, initialization, auto, decltype, and type aliases."
pubDate: 2025-02-25
category: programming-language
subcategory: cpp
tags: [declaration, definition, scope, initialization]
---

This article introduces C++ declarations, scope, initialization, and type aliases. The examples are independent snippets, not one complete program. Lines marked `error` intentionally demonstrate invalid code; supporting headers and wrapper functions are omitted unless shown.

Before we can use a name—an identifier—in a C++ program, we must declare it. A declaration introduces the name and tells the compiler what it refers to, such as a variable, function, or type.

The first examples declare variables, a class, a function, and an alias. The alias uses `std::complex`, which requires `<complex>`.

```c++
// Include <complex> before using std::complex; omitted here.
char ch; // allocate storage for a char; zero-initialized if it has static storage duration
auto count = 1; // allocate storage for an int and initialize it to 1
const char *name = "Njal"; // allocate a pointer and storage for the string literal "Njal"; initialize the pointer with the literal's address
struct Date{int d, m, y;}; // Date is a struct with three members
int day(Date *p) { return p->d; } // day is a function that executes some code
using Point = std::complex<short>; // Point is an alias for std::complex<short>
```

Most declarations are also definitions. We can think of a definition as a special kind of declaration that provides all the information needed to use the entity in a program.

```c++
// These declarations are not definitions; the entities must be defined elsewhere when their use requires a definition.
double sqrt(double); // function declaration
extern int error_number; // variable declaration
struct User; // declaration of a type name
```

An entity may have several declarations, but it cannot have multiple definitions in the same translation unit. Declarations of the same entity must agree on its type.

```c++
int count;
int count; // error: redefinition
extern int error_number;
extern short error_number; // error: conflicting types
extern int err_number;
extern int err_number; // OK: repeated declaration
```

## Leading specifiers

Specifiers such as the following describe properties other than the declared type:

- `static`
- `virtual`
- `extern`
- `constexpr`

## Declarators

A declarator consists of a name[^name] and optional declarator operators. The table also includes the related syntax for a trailing return type.

| Position | Operator | Meaning |
|:--:|:-----------:|:-------------|
| Prefix | `*` | Pointer |
| Prefix | `*const` | Const pointer |
| Prefix | `*volatile` | Volatile pointer |
| Prefix | `&` | Lvalue reference |
| Prefix | `&&` | Rvalue reference |
| Leading specifier | `auto` | Function with a trailing return type |
| Suffix | `[]` | Array |
| Suffix | `()` | Function |
| Suffix | `->` | Trailing function return type |

## Scope

**Block scope, also called local scope**: A name declared inside a block enclosed in braces `{}` is visible from its declaration onward, including in nested blocks unless it is shadowed.
Function parameter names are available within the function body, much like local names.

**Class scope**: The names of class members—data members and member functions—have class scope. They can be accessed from the class's member functions.
Code outside the class can access public members; access to other members depends on the rules for protected and private members and for friends.
A non-static member must also be accessed through an object: an object name, an object reference, or a pointer to an object, using the appropriate member-access operator.
Variables declared inside a member function are local to that function, rather than class members; its parameters are likewise local names.

**Namespace scope**: The scope of names declared in a namespace.

**File scope, commonly called global scope**: Names declared outside blocks and classes at the top level are in the global namespace. They can be referred to later in the translation unit, subject to the usual visibility and access rules.

**Statement scope**: The scope associated with declarations in statements.

**Function scope**: The scope associated with labels in a function.

## Variable shadowing

Variable shadowing occurs when a variable declared in an inner scope has the same name as a variable in an outer scope. The outer variable is said to be shadowed.
This can make it harder to tell which variable a name refers to.

> [!WARNING]
> Giving a global variable, or a local variable in a large function, a name such as `i` or `x` is asking for confusion.

We can use the scope-resolution operator `::` to access a hidden global name.

> [!CAUTION]
> There is no corresponding scope qualifier that lets us directly name a hidden local variable.

```c++
int x;

void f()
{
  int x = 1; // hide the global variable x
  ::x = 2; // assign to the global x
  x = 2; // assign to the local x
}
```

## Initialization

These declarations compare four initialization forms. `X` stands for a type, and `v` for a value accepted by that type; their definitions are omitted.

```c++
// X and v are placeholders; substitute a suitable type and value.
X a1 {v}; // direct-list-initialization: a useful general choice, though initializer-list constructors can affect its meaning
X a2 = {v};
X a3 = v;
X a4(v);
```

**List-initialization** uses `{}` and rejects narrowing conversions.

- An integer conversion is narrowing if the destination cannot represent every source value, unless the initializer is a constant expression whose value fits. For example, `char` to `int` is normally safe, while an arbitrary `int` to `char` is not.
- Conversion from a floating-point type to a lower-ranked floating-point type can be narrowing. The rules allow certain constant-expression exceptions; `float` to `double` is not narrowing, while an arbitrary `double` to `float` is.
- A floating-point value cannot be converted to an integer in list-initialization.
- An integer-to-floating-point conversion is narrowing unless the initializer is a constant expression whose value is exactly representable in the destination type.

```c++
void f(double d, int i)
{
  int x2 = d; // if d == 7.9, x2 becomes 7
  char c2 = i; // if i == 1025 and char has 8 bits, the converted value is 1
  
  int x3{d}; // error: possible truncation
  char c3{i}; // error: possible narrowing
  
  char c4{24}; // OK: 24 is exactly representable as a char
  char c5{264}; // error if char has 8 bits: 264 is not representable
  
  int x4{2.0}; // error: double-to-int conversion is not allowed here
}
```

For the following types, an empty initializer list `{}` initializes the object to its default value. The container examples require `<vector>` and `<string>`.

```c++
// Include <vector> and <string> for the standard library types; omitted here.
int x4{}; // initialized to 0
double d4{}; // initialized to 0.0
char *p{}; // initialized to nullptr
std::vector<int> v4{}; // initialized as an empty vector
std::string s4{}; // initialized as an empty string
```

### Type deduction with `auto`

When using `auto` to deduce a variable's type, `=` is often a clear choice. Braces require us to distinguish direct-list-initialization from copy-list-initialization.
Under the [standard rules for `auto` deduction](https://eel.is/c++draft/dcl.type.auto.deduct), `auto z1{99}` deduces `int`, whereas `auto z3 = {99}` deduces `std::initializer_list<int>`. Braces do not invariably produce an unwanted type.

> [!TIP]
> When using `auto`, choose the initializer form deliberately rather than treating `=` and `{}` as interchangeable.

```c++
auto z1{99}; // type is int
auto z2 = 99; // type is int
```

> [!NOTE]
> Objects with static storage duration—including global, namespace-scope, and local `static` objects—undergo static initialization. When constant initialization does not apply, they are zero-initialized before any dynamic initialization; this is not the same as inserting a `{}` initializer into every declaration.

### Type deduction with `decltype`

When we want to deduce a type without defining and initializing a new variable, we can use the type specifier `decltype(expr)`.
For an unparenthesized name, `decltype` yields the declared type. For other expressions, the result also depends on the expression's value category. This is especially useful in generic programming.

The following sketch illustrates return-type deduction for a matrix addition operator. `Matrix` is an application-defined class, not a standard library type. Its definition, dimension checks, and result allocation are omitted; the sketch assumes compatible dimensions and a correctly sized, zero-initialized result.

```c++
// Matrix, dimension checks, and result allocation are omitted.
// Add two matrices whose element types may differ. The result's element type is the type produced by adding corresponding elements.
template<class T, class U>
auto operator+(const Matrix<T>& a, const Matrix<U>& b) -> Matrix<decltype(T{}+U{})>
{
  Matrix<decltype(T{}+U{})> res;
  for(int i = 0; i != a.rows(); ++i)
    for(int j = 0; j != a.cols(); ++j)
      res(i, j) += a(i, j) + b(i, j);
  return res;
}
```

## Type aliases

A type alias gives an existing type another name; it does not create a new type. Aliases are useful for several reasons:

- The original name may be too long, complicated, or awkward.
- Generic code may need a consistent name for a type that varies between implementations.
- Defining an alias in one place can make future type changes easier to manage.

Here, `My_allocator` stands for an application-defined allocator template. The vector alias requires `<vector>` and that allocator definition.

```c++
// Include <vector> and define My_allocator before using Vector; omitted here.
using Pchar = char*; // pointer to char
using PF = int(*)(double); // pointer to a function taking double and returning int
template<class T> using Vector = std::vector<T, My_allocator<T>>; // alias template
```

> [!CAUTION]
> Type modifiers cannot be applied to an alias name to build a different fundamental type.

```c++
using Char = char;
using Uchar = unsigned Char; // error
using Uchar = unsigned char; // OK
```

The suffix `_t` is commonly used for type aliases. The following examples demonstrate `typedef` syntax; their names do not guarantee the widths of `int` or `short`. Use `<cstdint>` when you need the standard fixed-width integer types.

```c++
typedef int int32_t; // equivalent to using int32_t = int;
typedef short int16_t; // equivalent to using int16_t = short;
typedef void(*PtoF)(int); // equivalent to using PtoF = void(*)(int);
```

[^name]: [Google C++ Style Guide: Naming](https://google.github.io/styleguide/cppguide.html#Naming)
