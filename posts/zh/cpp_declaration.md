---
locale: zh
translationKey: cpp_declaration
title: "声明"
description: 讲解 C++ 的声明与定义、作用域、变量隐藏、初始化方式及 auto、decltype 与类型别名。
pubDate: 2025-02-25
category: programming-language
subcategory: cpp
tags: [declaration, definition, scope, initialization]
---


在 C++ 程序中，想要使用某个名字（标识符），必须先对其进行声明。我们必须制定他的类型以便编译器知道这个名字对应的是何种实体。

```c++
char ch; // 为一个 char 类型的变量分配内存空间；具有静态存储期时会被零初始化
auto count = 1; // 为一个 int 类型的变量分配内存空间并赋初始值 1
const char *name = "Njal"; // 为一个指向 char 的指针分配内存空间；为字符串字面值常量 "Njal" 分配内存空间；用字符串字面值常量的地址初始化指针。
struct Date{int d, m, y;}; // Date 是一个 struct，包含 3 个成员。
int day(Date *p) { return p->d; } // day 是一个函数，执行某段代码。
using Point = std::complex<short>; // Point 是类型 std::complex<short> 的别名
```
大多数声明同时也是定义。我们可以把定义看成是一种特殊的声明，他提供了在程序中使用改实体所需的一切信息。

```c++
// 以下声明语句并不是定义，也就是说，如果想使用它们，必须现在其他某处进行定义。
double sqrt(double); // 函数声明
extern int error_number; // 变量声明
struct User; // 类型名字声明
```

C++ 中，同一实体可以有多个声明，但不能在同一翻译单元中有多个定义。同一实体的各个声明中，类型必须保持一致。

```c++
int count;
int count; // 错误：重定义
extern int error_number;
extern short error_number; // 错误：类型不匹配
extern int err_number;
extern int err_number; // 正确：多次声明
```

## 1. 前置修饰符

指定所声明对象的某些非类型属性。

1. `static`
2. `virtual`
3. `extern`
4. `constexpr`

## 2. 声明符

声明符由一个<u>名字</u>[^name]和一些可选的声明运算符组成。下表也列出了后置返回类型相关的声明语法。。下表也列出了后置返回类型相关的声明语法。

|    |     运算符     | 含义           |
|:--:|:-----------:|:-------------|
| 前缀 |     `*`     | 指针           |
| 前缀 |  `*const`   | 常量指针         |
| 前缀 | `*volatile` | volatile 指针 |
| 前缀 |     `&`     | 左值引用         |
| 前缀 |    `&&`     | 右值引用         |
| 前置说明符 | `auto` | 函数（使用后置返回类型） |
| 后缀 |    `[]`     | 数组           |
| 后缀 |    `()`     | 函数           |
| 后缀 |    `->`     | 从函数返回        |

## 3. 作用域

**block scope(a.k.a. local scope)**：局部作用域。在由大括号 `{}` 括起来的代码块内声明的名称仅在该代码块及其包含的代码块内可访问，并且只能在声明之后访问。
函数参数名称在函数体内可用，使用方式与局部名称类似。


**class scope**：类作用域。类成员的名称（数据成员和成员函数名称）具有类作用域。具有类作用域的名称可以在类的所有成员函数中访问。
类外的普通代码可以访问公有成员；其他访问还要遵守保护成员、私有成员和友元的规则。
此外，非静态类成员必须通过对象访问——对象名称、对象的引用或指向对象的指针都可以使用——并且需要使用适当的成员选择运算符。
**在成员函数内部声明的变量是函数内的局部变量，而不是类成员；函数参数同样是局部名称。**


**namespace scope**：名字空间作用域


**file scope(a.k.a. global scope)**：通常所说的全局作用域。位于最外层、在代码块和类之外声明的名称属于全局名字空间。在声明之后，可以在翻译单元中按可见性与访问规则使用这些名称。


**statement scope**：语句作用域


**function scope**：函数作用域


## 4. Variable Shadowing

变量隐藏（Variable shadowing）发生在给定作用域内声明的变量与外部作用域中声明的变量具有相同名称时。外部变量被称为“被隐藏”（shadowed）。
这种情况可能会导致混淆，因为后续使用该变量名时，可能不清楚到底指的是哪个变量。

> [!WARNING]
> 如果你给全局变量或者大函数中的局部变量起类似于 `i` 或者 `x` 之类的名字，无异于自找麻烦。

可以通过作用域解析运算符 `::` 反问被隐藏了的全局名字。

> [!CAUTION]
> 没有类似的作用域限定符可以直接指定被隐藏的局部变量。

```c++
int x;

void f()
{
  int x = 1; // 隐藏全局变量 x
  ::x = 2; // 为全局变量x赋值
  x = 2; // 为局部变量 x 赋值
}
```

## 5. 初始化

```c++
X a1 {v}; // 直接列表初始化：通常是一个清晰的选择，但要注意 initializer_list 构造函数可能影响其含义。
X a2 = {v};
X a3 = v;
X a4(v);
```

**列表初始化**：通过 `{}` 进行初始化的方式，可以防止窄化转换。


- 如果目标整型不能表示源类型的所有值，通常属于窄化转换；但初始化器是常量表达式且其值可由目标类型表示时例外。例如，通常允许 `char` 到 `int`，但不允许任意 `int` 值到 `char`。
- 从浮点类型转换到等级更低的浮点类型可能属于窄化转换，规则对部分常量表达式提供例外。`float` 到 `double` 不是窄化转换，而任意 `double` 值到 `float` 可能是。
- 浮点型的值不能转换成整型值。
- 整型到浮点型通常属于窄化转换；如果初始化器是常量表达式且其值能由目标类型精确表示，则允许转换。

```c++
void f(double d, int i)
{
  int x2 = d; // 如果 d == 7.9，则 x2 的值变为7
  char c2 = i; // 如果 i == 1025 且 char 占 8 位，则转换后的值为 1
  
  int x3{d}; // 错误：可能发生截断
  char c3{i}; // 错误：可能发生窄化转换
  
  char c4{24}; // OK：24 能精确的表达一个 char
  char c5{264}; // 错误：假定 char 占 8 位，那么 264 不能表示成一个 char
  
  int x4{2.0}; // 错误：不允许 double 到 int 的转换
}
```

对于下面这些类型，空初始化器列表 `{}` 将对象初始化为相应的默认值。

```c++
int x4{}; // x4 被赋值为 0
double d4{}; // d4 被赋值为 0.0
char *p{}; // p 被赋值为 nullptr
vector<int> v4{}; // v4被赋值为一个空向量
string s4{}; // s4 被赋值为 ""
```
### 5.1 auto

**使用 `auto` 推断变量类型时，`=` 通常是清晰的选择；使用花括号时，需要区分直接列表初始化与复制列表初始化。**
现代 C++ 中，`auto z1{99}` 推断为 `int`，而 `auto z3 = {99}` 推断为 `std::initializer_list<int>`。不能认为使用花括号就一定会推断出不符合预期的类型。

> [!TIP]
> 使用 `auto` 时，应根据预期类型选择初始化形式，不要把 `=` 和 `{}` 当作完全等价的写法。

```c++
auto z1{99}; // 现代 C++ 中类型是 int
auto z2 = 99; // 类型是 int
```

> [!NOTE]
> 具有静态存储期的对象，包括全局对象、名字空间对象和局部 `static` 对象，会进行静态初始化。如果不满足常量初始化条件，则会先零初始化，再进行所需的动态初始化；这不等同于给所有声明补上 `{}`。

### 5.2 decltype

当我们既想要推断类型，又不想为此定义并初始化一个变量时，可以使用类型说明符 `decltype(expr)`。
其结果遵循 `decltype` 的规则：未加括号的名称得到被声明的类型，其他表达式还要考虑值类别。**这种做法在泛型编程中很有效。**

```c++
// 编写一个函数令其执行两个矩阵的加法运算，但是两个矩阵的元素类型可能不同。那么这个结果矩阵的元素类型应该是对应元素求和后的类型
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

## 6. 类型别名

类型别名绝不代表一种新类型，他只是某种已知类型的同义词。别名就是类型的另外一个名字。

- 原来的名字太长、太复杂或者太难看
- 某项程序设计技术要求在同一段上下文中，不同类型有相同的名字
- 在某处提及某种类型仅仅是为了便于后期维护

```c++
using Pchar = char*; // 字符串指针
using PF = int(*)(double); // 函数指针，该函数接受一个 double 且返回一个 int
template<class T> using Vector = std::vector<T, My_allocator<T>>; // 引入一个别名模板
```

> [!CAUTION]
> 不允许在类型别名前加修饰符

```c++
using Char = char;
using Uchar = unsigned Char; // 错误
using Uchar = unsigned char; // 正确
```

后缀 `_t` 通常用于表示类型别名

```c++
typedef int int32_t; // 等价于 using int32_t = int;
typedef short int16_t; // 等价于 using int16_t = short;
typedef void(*PtoF)(int); // 等价于 using PtoF = void(*)(int);
```

[^name]: [Google开源项目命名约定](https://zh-google-styleguide.readthedocs.io/en/latest/google-cpp-styleguide/naming.html)
