---
locale: zh
translationKey: java_generic
title: 理解 Java 泛型
description: 从泛型类、泛型方法讲到类型擦除与通配符边界，用代码示例对比 Java 与 C++ 的实现差异。
pubDate: 2021-07-17
category: programming-language
subcategory: java
tags: [generic]
---

泛型（generics）让同一份代码适用于多种类型，同时保留编译期类型检查。

泛型从 JDK 5.0 开始引入。定义类或接口时，可以用类型参数表示字段类型、方法返回类型或方法参数类型。使用这些声明时，例如继承类、实现接口、声明变量或创建对象时，再提供实际的类型，称为类型实参。

提到 Java 泛型，很多人会先想到集合。泛型的用途更广：它可以在可复用的代码中表达类型之间的关系，类型安全的集合只是其中一种应用。本文从泛型类和方法讲起，再通过与 C++ 模板的对比解释类型擦除、边界和通配符。

## 类型参数的命名约定

| 符号 | 含义 | 使用场景 |
| --: | :-: | :-- |
| `T`（Type） | 类型 | Java 引用类型，包括库中的类型和自定义类 |
| `E`（Element） | 元素 | 集合中存储的元素类型 |
| `K`（Key） | 键 | `Map` 的键类型 |
| `V`（Value） | 值 | `Map` 的值类型 |
| `N`（Number） | 数值 | 用于数值类型的类型参数 |
| `?` | 通配符 | 未知的 Java 引用类型 |

## 初级篇

本文的 Java 示例是独立片段。请使用 JDK 8 或更高版本：工厂示例使用了[从 Java 8 开始提供的 `Supplier` 接口](https://docs.oracle.com/javase/8/docs/api/java/util/function/Supplier.html)。C++ 代码块用于单独对比实现方式。

尝试 Java 示例时，按以下方式准备：

1. 将每个公开的顶层类放入与类名一致的文件，例如 `Fruit.java`。示例中的类使用同一个包。
2. 按需添加下方导入语句。为突出相关逻辑，后续片段省略了导入语句和包声明。
3. 将单独展示的 `main()` 方法放入测试类，并复用下方定义的食物类。
4. 对于 `Person`、`Shop`、`Demo` 等重复出现的类名，每次只使用其中一种定义。标记为错误的语句用于演示编译失败；运行其他语句时，请先将其注释掉。运行时错误会在对应示例附近说明。

Java 示例涉及以下导入语句：

```java
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
```

先定义后续示例会用到的基础类。代码省略了常规的 getter、setter 等样板方法。可以先跳过这部分，遇到相关类时再回来查看。

```java
interface Juicy<T> {
    void juice(T t);
}

class Food {}
// 食物
class Meat extends Food {
    public void cook() {
        System.out.println("炒肉");
    }
}

public class Fruit extends Food {
    public void fruit() {
        System.out.println("得到了一个水果");
    }
}

// 肉类
class Pork extends Meat {
    public void hamburger() {
        System.out.println("汉堡");
    }
}

class Beef extends Meat {
    public void steak() {
        System.out.println("牛排");
    }
}

class Fish extends Meat {
    public void soup() {
        System.out.println("鱼汤");
    }
}
// 水果类
class Apple extends Fruit {}

class Banana extends Fruit {
    public String color;
    public Banana(String color) {
        this.color = color;
    }
}

class Orange extends Fruit implements Juicy<Orange> {
    @Override
    public void juice(Orange orange) {
        System.out.println(orange + "榨汁");
    }
}

// 苹果类
public class YellowApple extends Apple {
    @Override
    public String toString() {
        return "黄苹果";
    }
}

public class RedApple extends Apple {
    @Override
    public String toString() {
        return "红苹果";
    }
}

public class GreenApple extends Apple {
    @Override
    public String toString() {
        return "青苹果";
    }
}
```

### 泛型类

第一个片段定义 `Person<T>`，并打印传入构造器的对象。

```java
public class Person<T> {
    private T food;

    public Person() {}
    public Person(T food) {
        this.food = food;
    }
    
    public void eat() {
        System.out.println(food);
    }
    
    // 测试代码
    public static void main(String[] args) {
        Person<Meat> person = new Person<>(new Meat());
        // 会输出Meat.toString();
        person.eat();
    }
}
```

上面的代码展示了泛型的基本语法。下面与不使用泛型的写法进行对比。

```java
public class Person {
    private Food food;

    public Person() {}
    public Person(Food food) {
        this.food = food;
    }

    public void eat() {
        System.out.println(food);
    }
    // 测试代码
    public static void main(String[] args) {
        Person person = new Person(new Meat());
        // 同样会输出Meat.toString();
        person.eat();
    }
}
```

目前两种写法的结果相同。如果需要取回某种具体的食物，区别就显现出来了。

```java
public class Person<T> {

    private T meat;

    public Person() {}
    public Person(T meat) {
        this.meat = meat;
    }

    public T get() {
        return meat;
    }
    // 测试代码
    public static void main(String[] args) {
        Person<Beef> person = new Person<>(new Beef());
        Beef beef = person.get();
        // 牛排
        beef.steak();
    }
}
```

不使用泛型时，这里需要显式类型转换。`steak()`、`hamburger()`、`soup()` 是各个子类特有的方法，没有在共同的父类中声明，因此无法通过 `Food` 引用直接调用。

使用泛型类名时不指定类型实参，得到的是原始类型。无显式上界的类型参数会被擦除为 `Object`，有上界时则按最左侧上界擦除。建议创建和引用泛型对象时明确类型实参。

- 泛型类可以有多个类型参数，将它们一起放在尖括号内，例如 `<T1, T2, T3>`。
- 确定类型实参后，涉及这些类型参数的操作必须满足相应的类型约束。
- 同一个泛型类的不同参数化类型不能随意相互赋值。
- 泛型接口和泛型抽象类本身不能直接实例化。
- 不指定类型实参会使用原始类型，并擦除相关类型信息，但这不等价于显式指定 `Object` 类型实参。应一致使用泛型，避免混用参数化类型和原始类型。
- 类型实参不能是基本类型，可以使用对应的包装类。
- 类或接口声明的类型参数可以用于实例字段、实例方法的参数和返回值；静态方法不能使用所属类的类型参数。
- 异常类不能是泛型的。
- 不能使用 `new T[]`。对于无显式上界的 `T`，可以写 `T[] elements = (T[]) new Object[capacity]`，但这需要未经检查的转换，也不会创建运行时元素类型为实际类型实参的数组。参考 `ArrayList` 使用的 `Object[] elementData`。
- 继承泛型父类时，子类可以指定具体类型实参，也可以通过自己的类型参数保留父类的全部或部分参数化能力。使用原始父类会发生擦除，并失去相应的类型安全保障。无论采用哪种方式，子类都可以声明额外的类型参数。

### 集合中的泛型

支持集合类是引入泛型的重要动机之一。泛型集合让我们指定元素类型，读取元素时不必再从 `Object` 显式转换。同一个集合实现可以复用于多种元素类型。

使用原始集合的问题，以及使用泛型时需要注意的事项：

- 原始集合不会约束元素类型。
- 显式类型转换可能抛出 `ClassCastException`。
- 集合接口和类从 JDK 5.0 开始支持泛型。
- 实例化集合类时，可以指定具体的类型实参。
- 类型实参决定了集合声明中使用类型参数的位置所对应的类型，包括方法、构造器和字段。
- 类型实参必须是引用类型，不能是基本类型；需要存储基本类型的值时，使用对应的包装类。
- 使用原始集合会丢失元素类型信息；这里的无显式上界元素参数被擦除后，读取结果按 `java.lang.Object` 处理。

### 泛型方法

方法可以声明自己的类型参数，无论所属类是否为泛型类。泛型方法可以独立于类的类型参数表达类型关系。静态方法不能使用所属类的类型参数。

> [!WARNING]
> 类型实参在编译期检查或推断，不是在运行时决定。类的类型实参与该类的某个参数化类型关联；泛型方法自己的类型实参则在每次调用处确定，与类的类型实参相互独立。静态方法如果需要类型参数，就必须自己声明。

使用泛型类时，可以显式指定类型实参，也可以在语法允许的位置交给编译器推断。调用泛型方法时，通常不必显式写出类型实参，编译器可以根据调用推断它们，这称为类型推断。

```java
public class Person<T> {

    private T meat;

    public Person() {}
    public Person(T meat) {
        this.meat = meat;
    }

    public T get() {
        return meat;
    }
    // 静态泛型方法
    public static <F> F getFood(Class<F> c) {
        try {
            return c.getDeclaredConstructor().newInstance();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
    // 测试代码
    public static void main(String[] args) {
        Fish fish = Person.getFood(Fish.class);
    }
}
```

### 泛型接口

接口也可以声明类型参数。

```java
class Orange extends Fruit implements Juicy<Orange> {
    @Override
    public void juice(Orange orange) {
        System.out.println(orange + "榨汁");
    }
}

interface Juicy<T> {
    void juice(T t);
}
```

## 高级篇

泛型通过参数化类型提供编译期类型检查，让编译器拒绝不兼容的类型。不使用泛型时，可以通过 `Object` 引用接收任意对象，但取回更具体的类型时需要显式转换。如果对象的实际类型不符合预期，转换就可能在运行时失败。泛型把许多检查提前到编译期，并由编译器插入类型擦除所需的转换，从而提高代码的类型安全性和复用性。

### 类型擦除

编译器把类型参数转换为擦除后的形式，这个过程称为类型擦除。因此，泛型类型检查主要在编译期进行。但这不表示 `.class` 文件完全没有泛型元信息：声明签名可以保留供反射使用。普通泛型实例不会为每个实际类型实参保留一个不同的运行时类。

类型变量的擦除过程如下：

1. 查找类型变量的替换类型，即其最左侧上界的擦除类型；没有显式上界时为 `Object`。
2. 把类型变量的使用替换为擦除后的类型，并在必要时插入类型转换。

下面的 `main()` 片段比较两个列表的运行时类，以及类声明中的类型变量：

```java
// 片段：将此方法放入测试类中。
public static void main(String[] args) {
    // 来看一个具体的例子
    ArrayList<String> strings = new ArrayList<>();
    ArrayList<Integer> integers = new ArrayList<>();
    
    // class java.util.ArrayList
    System.out.println(strings.getClass());
    // class java.util.ArrayList
    System.out.println(integers.getClass());
    // true
    System.out.println(strings.getClass() == integers.getClass());
    // [E]
    System.out.println(Arrays.toString(strings.getClass().getTypeParameters()));
    // [E]
    System.out.println(Arrays.toString(integers.getClass().getTypeParameters()));
}
```

根据 [`Class.getTypeParameters()` 的 JDK 文档](https://docs.oracle.com/javase/8/docs/api/java/lang/Class.html#getTypeParameters--)，该方法返回表示泛型声明中类型变量的 `TypeVariable` 数组。输出中的 `E` 描述的是声明，不能据此恢复某个列表实例使用的 `String` 或 `Integer` 类型实参；`TypeVariable` 本身还可以提供上界等声明信息。

#### C++ 的实现方法

下面的 C++ 示例通过类模板调用传入对象的 `eat()` 方法。

```cpp
#include <iostream>
using namespace std;

// C++模板
template<class T> class Person {
// Person类中存放了一个T类型对象
    T food;
public:
    Person(T x) {
        food = x;
    }
    // dinner()调用了food中的eat()
    void dinner() {
        food.eat();
    }
};

class Meat {
public:
    void eat() {
        cout << "吃肉" << endl;
    }
};

int main() {
    Meat meat;
    /* 
     * C++ 编译器会在相关模板成员实例化时检查 T 中是否有 eat()。
     * 实例化 Person<Meat>::dinner() 时，会看到 Meat 中的 eat()。
     * 如果 Meat 没有 eat()，这种使用会产生编译错误，从而保证类型安全。
     */
    Person<Meat> person(meat);
    // 吃肉
    person.dinner();
}
```

对应的 Java 片段无法通过编译：

```java
class Person<T> {
    private T food;
    
    Person(T food) {
        this.food = food;
    }
    
    public void dinner() {
        // 此处无法编译
        food.eat();
    }
}
```

Java 根据 `T` 声明的上界检查泛型类，无显式上界的 `T` 并没有承诺提供 `eat()`。与 C++ 模板不同，Java 不会针对每个实际类型实参重新检查这段类代码。Java 可以通过后文介绍的边界来表达这个要求。

#### Java 的妥协

类型擦除是 Java 为泛型选择的实现策略。泛型语法到 JDK 1.5 才加入，并非 Java 最初就有的能力。如果从 JDK 1.0 起设计泛型，也可以选择具体化的设计，在运行时保留类型实参并支持更直接的类型操作。我认为擦除是一种妥协，限制了泛型的部分表达能力；Java 泛型仍然有用，但需要理解这些限制。

类型擦除的重要动机是迁移兼容性：使用泛型的调用方仍能使用旧的非泛型库，已有调用方也能继续使用改为支持泛型的库。[Java 语言规范中关于可具体化类型的说明](https://docs.oracle.com/javase/specs/jls/se25/html/jls-4.html#jls-4.7)解释了这一兼容性要求。

#### 类型擦除的补偿

下面的片段故意尝试实例化类型参数，用于演示编译错误：

```java
class Person<T> {
    // 编译失败，不会成功。
    private T food = new T();
}
```

这段 Java 代码无法通过编译，原因包括：

- 实际类型实参会被擦除。
- 编译器无法保证 `T` 具有可访问的无参构造器。

下面的 C++ 模板可以直接表达这一操作：

```cpp
template<class T> class Person {
    // T类型的字段
    T food;
    // 指向T的指针
    T* pointer;
public:
    // 初始化指针
    Person() {
        pointer = new T();
    }
};

class Meat {};

int main() {
    Person<Meat> p1;
    // 并且可以使用基本数据类型
    Person<int> p2;
}
```

Java 的一种解决方案是传入工厂对象。下方通过反射构造对象的工厂仍要求无参构造器，因此遇到 `Banana` 会报错；这是该工厂实现的限制，并非所有 `Supplier` 都有这个限制。

```java
public class FoodFactory<T> implements Supplier<T> {
    Class<T> food;

    public FoodFactory(Class<T> food) {
        this.food = food;
    }

    @Override
    public T get() {
        try {
            return food.getDeclaredConstructor().newInstance();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
    
    public static void main(String[] args) {
        // 运行时报错，因为Banana类没有空参构造器
        Banana banana = new FoodFactory<Banana>(Banana.class).get();
    }
}
```

#### 泛型数组

我们不能直接创建元素类型为 `T` 这样的不可具体化类型的数组。转换可以让引用具有 `T[]` 类型，但不会改变数组实际的运行时元素类型。下面两种 `array()` 写法应分别查看；第一种用于演示编译错误。

```java
class Person<T> {
    public void array() {
        // 报错
        T[] t = new T[10];
    }
}
```

第二种写法可以编译，但会产生未经检查的类型转换警告：

```java
class Person<T> {
    public void array() {
        // 这种方式可以通过编译，但是会产生类型转换警告。
        T[] t = (T[]) new Object[10];
    }
}
```

数组创建时就确定了运行时元素类型。把 `new Object[10]` 转换为 `T[]` 不会改变这个类型，对象仍是 `Object[]`。创建擦除类型的数组再转换可以用作内部存储，但并未创建调用方实际类型实参对应的数组。如果确实需要具体的运行时数组类型，还可以通过数组工厂或显式元素类型令牌创建。

下面分别展示两种 `Canteen<T>` 定义。对比它们，并考虑调用 `convert()` 时会发生什么。

```java
public class Canteen<T> {

    public T[] foods;

    public Canteen() {
        foods = (T[]) new Object[10];
    }

    public void put(int index, T t) {
        foods[index] = t;
    }

    public T get(int index) {
        return foods[index];
    }

    public T[] convert() {
        return foods;
    }

    public static void main(String[] args) {
        Canteen<Meat> canteen = new Canteen<>();
        canteen.put(0, new Pork());
        Meat[] meats = canteen.convert();
        System.out.println(Arrays.toString(meats));
    }
}
```

第二种写法使用 `Object[]` 存储元素：

```java
public class Canteen<T> {

    public Object[] foods;

    public Canteen() {
        foods = new Object[10];
    }

    public void put(int index, T t) {
        foods[index] = t;
    }

    public T get(int index) {
        return (T) foods[index];
    }

    public T[] convert() {
        return (T[]) foods;
    }

    public static void main(String[] args) {
        Canteen<Meat> canteen = new Canteen<>();
        canteen.put(0, new Pork());
        Meat[] meats = canteen.convert();
        System.out.println(Arrays.toString(meats));
    }
}
```

在 `main()` 中，`convert()` 调用的编译期类型是 `Meat[]`，所以赋值可以通过编译。但运行时，两种写法都会产生转换异常，因为返回的实际对象仍是 `Object[]`。类型转换无法把它变成运行时的 `Meat[]`，也不能改变底层数组类型。

### 边界

对于无显式上界的类型参数，我们只能调用 `Object` 中可用的方法。如果通过上界限制类型参数，就能使用该上界提供的操作。Java 使用 `extends` 声明上界，使用 `super` 声明通配符的下界。

以下概念描述了子类型关系如何传递到相关类型：

- 协变性保留关系的方向。例如，`RedApple` 是 `Apple` 的子类型，而 `RedApple[]` 也是 `Apple[]` 的子类型。
- 逆变性反转关系的方向。例如，`List<? super Apple>` 是 `List<? super RedApple>` 的子类型。
- 不变性表示不能仅凭元素类型的关系推导出上述关系：`List<RedApple>` 和 `List<Apple>` 互相都不是对方的子类型。

下文将通过数组和通配符展示这些关系。Oracle 的[通配符与子类型指南](https://docs.oracle.com/javase/tutorial/java/generics/subtyping.html)也给出了上下界通配符之间的关系图。

#### 使用 `extends` 声明上界

此片段将 `T` 的上界设为 `Fruit`。第二个类还将 `Juicy<T>` 接口加入边界，因此可以使用该接口提供的方法。

```java
class FruitShop<T extends Fruit> {
    T fruit;

    FruitShop(T fruit) {
        this.fruit = fruit;
    }

    public void getFruit() {
        // 可以调用边界的方法
        fruit.fruit();
    }
}
// 如果边界要同时确定类和接口，那么类要写在接口前边，并用&连接。和继承一样，只能继承一个具体类，但是可以实现多个接口
class DrinkBar<T extends Fruit & Juicy<T>> {
    T fruit;

    DrinkBar(T fruit) {
        this.fruit = fruit;
    }
    
    public void juice(T t) {
        // 同样可以使用边界接口的方法 
        fruit.juice(t);
    }
    
    public void fruit() {
        fruit.fruit();
    }
}
```

#### 协变性

Java 的数组具有协变性，我们来看如下例子，涉及到的类均在文章开头处有定义。

```java
// 片段：将此方法放入测试类中。
public static void main(String[] args) {
    Apple[] apples = new RedApple[10];
    apples[0] = new RedApple();
    apples[1] = new YellowApple();
    apples[2] = new Apple();
}
```

这些语句均能通过编译。下面逐行说明原因：

- 数组声明：创建 `RedApple[]` 数组，并赋值给 `Apple[]` 引用。`RedApple` 是 `Apple` 的子类，Java 数组保留了这一子类型关系。
- 第一次写入：把红苹果对象放入下标为 0 的位置，编译期和运行时均允许这一操作。
- 第二次写入：把黄苹果对象放入下标为 1 的位置。编译器根据 `apples` 声明的元素类型 `Apple` 进行检查，因此接受这一操作。
- 第三次写入：把普通苹果对象放入下标为 2 的位置。基于同样的原因，这一操作也能通过编译。

以上代码说明了数组的协变性，但运行时数组仍知道自己的元素类型是 `RedApple`，存入黄苹果或普通苹果会抛出 `ArrayStoreException`。下标为 1 的赋值首先抛出异常；如果下标为 2 的赋值能够执行到，也会抛出同样的异常。

这里转换的是数组引用：`RedApple[]` 引用转换成 `Apple[]` 引用，并没有复制数组，也没有改变元素类型。数组在运行时保留自己的元素类型，并检查写入操作，阻止不兼容的对象被放入。

编译器接受了这些会在运行时报错的写入。下面看看泛型如何处理类似情况。

```java
// 片段：将此方法放入测试类中。
public static void main(String[] args) {
    // 如下代码无法通过编译
    List<Apple> list = new ArrayList<RedApple>();
}
```

这段代码无法通过编译：不能将 `ArrayList<RedApple>` 赋值给 `List<Apple>` 引用。虽然示例使用了集合，但这里的规则适用于泛型类型：以 `RedApple` 为类型实参的泛型类型，不会自动成为以 `Apple` 为类型实参的同一泛型类型的子类型。

如果允许这种赋值，就会出现下面的问题：

```java
// 片段：将此方法放入测试类中。
public static void main(String[] args) {
    List<RedApple> redApples = new ArrayList<>();
    redApples.add(new RedApple());
    // 如果Java允许这么写的话，则他想表达的意思是把红苹果集合赋值给另外一个苹果集合。换句话说就是让apples集合持有redApples的引用。
    List<Apple> apples = redApples;
    // 这里语义就出现了混乱。apples本是持有的红苹果引用，而如果只看这行代码的话却又完全合法，但是矛盾点就在于一个红苹果集合里却合理的添加了一个绿苹果！
    apples.add(new GreenApple());
}
```

`List<Apple>` 可以接受红苹果、黄苹果和青苹果，而 `List<RedApple>` 只能接受红苹果。这让我想到“白马非马”的讨论，但这里的类比有局限：白马当然是马，只是“白马”这一类别比“马”更窄。同样，每个红苹果都是苹果，但限制为红苹果的集合不能接受任意苹果。

与数组不同，Java 泛型类型本身不具有协变性；需要通过通配符表达所需的类型关系。

#### 通配符

通配符是在类型实参中使用的 `?`。引入这一写法后，再来看前面遇到的问题。

```java
// 片段：将此方法放入测试类中。
public static void main(String[] args) {
    List<? extends Apple> list = new ArrayList<>();
    // 编译不通过
    list.add(new RedApple());
    // 编译不通过
    list.add(new Apple());
    // 写法合法，但是没有任何意义
    list.add(null);
}
```

`ArrayList.add()` 的参数使用列表的类型参数。对于 `List<? extends Apple>`，它是某个未知的、被捕获的 `Apple` 子类型。编译器无法证明任意 `Apple` 或 `RedApple` 与这个具体类型兼容，因此拒绝这些插入操作；`null` 仍然可以传入。

而对于 `ArrayList` 中的 `contains()` 或 `indexOf()` 来说，参数类型是 `Object`，并不包含我们定义的通配符，所以编译器允许调用。

`List<? extends Apple>` 表示元素类型为 `Apple` 或其某个未知子类型的列表，不表示能接收所有苹果。我们可以把读出的元素当作 `Apple`，但不知道实际元素类型时，不能安全地加入任意苹果，否则会重现红苹果列表被放入青苹果的问题。如果确实需要把红苹果、黄苹果等放进同一个集合，可以直接采用下面的写法。

```java
// 片段：将此方法放入测试类中。
public static void main(String[] args) {
    // 这种写法就非常合理了。list中不会对任何颜色的苹果加以区分，list中的元素只能使用他们共同的苹果父类中的方法，而不能使用每个颜色的苹果的特有方法，十分合理。
    List<Apple> list = new ArrayList<>();
    list.add(new RedApple());
    list.add(new GreenApple());
    list.add(new Apple());
}
```

#### 使用 `super` 声明下界

`super` 可以用于声明通配符的下界：

- `<? super Apple>` 将 `Apple` 指定为下界。
- 通配符的边界可以使用类型参数，例如 `<? super T>`。
- 类型参数声明不能指定下界，因此 `<T super Apple>` 不合法。

```java
public class Shop {
    // 元素类型为 Apple 或其某个超类型，因此可以安全地添加 Apple 或其子类对象。
    static void apples(List<? super Apple> apples) {
        apples.add(new Apple());
        apples.add(new YellowApple());
        // 编译不通过：Banana 不是 Apple。
        apples.add(new Banana("yellow"));
    }
    // 测试代码
    public static void main(String[] args) {
        List<Apple> apples = new ArrayList<>();
        Shop.apples(apples);
        
        List<RedApple> redApples = new ArrayList<>();
        // 编译不通过
        Shop.apples(redApples);
        
        List<Fruit> fruits = new ArrayList<>();
        Shop.apples(fruits);
    }
}
```

`<? super Apple>` 表示 `Apple` 自身或它的某个未知超类型，例如 `Fruit`、`Food` 或 `Object`。无论列表实际使用哪种元素类型，都能安全地添加 `Apple` 或其子类对象。不能添加 `Banana`，因为实际传入的列表可能是 `List<Apple>`。这里的 `Apple` 称为下界。

#### 回顾

本节我们来测试一下你对上述内容是否掌握扎实，请阅读下边代码，看看是否可以理解其中的代码为什么可以编译或者为什么不可以编译。

```java
public class Demo {
    static List<Apple> apples = Arrays.asList(new Apple());
    static List<Fruit> fruits = Arrays.asList(new Fruit());

    static <T> T func1(List<T> list) {
        return list.get(0);
    }
    
    // 类型实参由该类的参数化使用方式确定。
    static class C2<T> {
        T func2(List<T> list) {
            return list.get(0);
        }
    }
    
    static class C3<T> {
        T func3(List<? extends T> list) {
            return list.get(0);
        }
    }
    
    public static void main(String[] args) {
        // func1
        Apple a1 = func1(apples);
        Fruit f1 = func1(fruits);
        f1 = func1(apples);
        
        // func2
        C2<Fruit> c2 = new C2<>();
        // 不可编译
        Fruit a2 = c2.func2(apples);
        Fruit f2 = c2.func2(fruits);
        
        // func3
        C3<Fruit> c3 = new C3<>();
        Fruit a3 = c3.func3(apples);
        Fruit f3 = c3.func3(fruits);
    }
}
```

- `func1()`：列表的元素类型与返回类型通过 `T` 关联。传入苹果列表时，返回 `Apple`；传入水果列表时，返回 `Fruit`。返回的 `Apple` 也可以赋值给 `Fruit` 引用。
- `func2()`：`c2` 的类型是 `C2<Fruit>`，所以 `T` 为 `Fruit`，方法返回 `Fruit`，参数为 `List<Fruit>`。前面讨论过，`List<Apple>` 不是 `List<Fruit>` 的子类型，因此 `c2.func2(apples)` 不合法。
- `func3()`：`c3` 的类型是 `C3<Fruit>`，所以方法返回 `Fruit`，并接受 `List<? extends Fruit>`。列表的元素类型是 `Fruit` 或其某个子类型，因此两种列表的元素都可以作为 `Fruit` 读取。

#### 无界通配符

无界通配符 `<?>` 看起来像“任意类型”，容易让人把它与原始类型等同，但它们不同。许多调用确实都能接受两者；`<?>` 表示我考虑到了泛型，只是有意不指定当前的实际类型实参。它不表示 `Object`，也不会关闭泛型类型检查。下面演示这个区别的一种重要用途。

```java
public class Demo {
    // 将参数初始化为某种具体类型
    Map<?, ?> map;
    Map<Fruit, ?> fruitMap;
    
    public Demo() {
        map = new HashMap<String, String>(16);
        fruitMap = new HashMap<Fruit, String>(16);
    }
}
```

下面这些调用都可以编译，不过使用原始类型可能产生编译器警告。

```java
public class Demo {

    static List l1;
    static List<?> l2;
    static List<? extends Object> l3;

    static void func1(List list) {
        l1 = list;
        l2 = list;
        l3 = list;
    }

    static void func2(List<?> list) {
        l1 = list;
        l2 = list;
        l3 = list;
    }

    static void func3(List<? extends Object> list) {
        l1 = list;
        l2 = list;
        l3 = list;
    }
    
    public static void main(String[] args) {
        ArrayList l4 = new ArrayList();
        ArrayList<Object> l5 = new ArrayList<>();
        ArrayList<String> l6 = new ArrayList<>();
        // func1
        func1(l4);
        func1(l5);
        func1(l6);
        // func2
        func2(l4);
        func2(l5);
        func2(l6);
        // func3
        func3(l4);
        func3(l5);
        func3(l6);

    }
}
```

编译器在上述多种场景中都接受 `List` 和 `List<?>`，但它们对写入操作的处理不同：

- `List`：原始列表，泛型元素检查被擦除；读取返回 `Object`，写入可能产生未经检查的警告。
- `List<?>`：元素类型未知的参数化列表，编译器保留这种不确定性并限制不安全的写入。

下面用一个作为持有器的 `Shop<T>` 类，比较原始类型与带有无界通配符的类型。

```java
class Shop<T> {
    private T fruit;
    
    public Shop() {}
    public Shop(T t) {
        fruit = t;
    }
    
    public void set(T t) {
        fruit = t;
    }

    public T get() {
        return fruit;
    }
}

public class Demo {
    static void func1(Shop shop, Object obj) {
        // 会产生警告
        shop.set(obj);
        // 报错：当前方法没有声明类型变量 T。
        T t = shop.get();
        // 这样可以，但是丢失了类型信息
        Object o = shop.get();
    }
    
    static void func2(Shop<?> shop, Object obj) {
        // 报错。编译器不允许我们这么操作
        shop.set(obj);
        // 报错：当前方法没有声明类型变量 T。
        T t = shop.get();
        // 这样可以，但是丢失了类型信息
        Object o = shop.get();
    }
    // 没有问题
    static <T> T func3(Shop<T> shop, T t) {
        shop.set(t);
        return shop.get();
    }
    
    static <T> T func4(Shop<? extends T> shop, T t) {
        // 报错
        shop.set(t);
        return shop.get();
    }
    
    static <T> void func5(Shop<? super T> shop, T t) {
        shop.set(t);
        // 报错
        T t1 = shop.get();
        Object obj = shop.get();
    }
    
    // 测试代码：需要注释掉上方和下方标记为报错的语句。
    public static void main(String[] args) {
        Shop s1 = new Shop();
        Shop<?> s2 = new Shop<>();
        Shop<? extends Fruit> s3 = new Shop<>();
        Shop<Fruit> fruitShop = new Shop<>();
        Fruit fruit = new Fruit();

        func1(s1, fruit);
        func1(s2, fruit);
        func1(s3, fruit);
        func1(fruitShop, fruit);

        func2(s1, fruit);
        func2(s2, fruit);
        func2(s3, fruit);
        func2(fruitShop, fruit);

        // 编译器产生警告
        func3(s1, fruit);
        // 报错
        func3(s2, fruit);
        // 报错
        func3(s3, fruit);
        func3(fruitShop, fruit);

        // 编译器产生警告
        func4(s1, fruit);
        func4(s2, fruit);
        func4(s3, fruit);
        func4(fruitShop, fruit);
        
        // 编译器产生警告
        func5(s1, fruit);
        // 报错
        func5(s2, fruit);
        // 报错
        func5(s3, fruit);
        func5(fruitShop, fruit);
    }
}
```

逐个分析这些方法：

- `func1()`：即使使用原始类型，编译器仍知道 `Shop` 是泛型类，因此调用 `set()` 会产生未经检查的警告。`get()` 擦除后的返回类型为 `Object`，不能保证返回更具体的类型。
- `func2()`：这里体现了原始 `Shop` 与 `Shop<?>` 的区别。`func1()` 中的写入只有警告，而这里直接编译失败。原始 `Shop` 允许未经检查地写入任意对象；`Shop<?>` 有一个未知类型实参，不能假定任意 `Object` 都与它兼容。
- `func3()`：同一个 `T` 关联了持有器的类型实参、写入值的类型和返回类型，因此读取和写入都安全。
- `func4()`：方法接受的 `Shop` 范围更广，但写入受到限制。
  - 方法接受类型实参为某个未知 `T` 子类型的 `Shop`，以及一个 `T` 值。如果 `T` 是 `Fruit`，商店可能是 `Shop<Apple>`、`Shop<Orange>` 或 `Shop<Banana>`。
  - 方法内部不知道调用方传入的是哪种商店。调用 `set(t)` 可能把橘子放入苹果商店，所以编译器拒绝这一操作。
  - 读取是安全的：无论具体子类型是什么，`get()` 的返回值都可以当作 `T`，也就是此例中的 `Fruit`。
- `func5()`：这里的关系与 `func4()` 相反。类型实参可以是 `Fruit` 或其超类型，因此可以通过 `set()` 写入 `Fruit`。但读取时，`get()` 的返回值只能保证为 `Object`。

这些例子展示了 `<?>` 的限制：调用方没有可用的具名 `T`。我们可以读取 `Object`、写入 `null`，但不能安全地读取任意指定的 `T` 或写入任意非空对象。

#### 捕获转换

此例复用上一节的 `Shop<T>`。辅助方法捕获未知类型实参，`main()` 中的注释标出了预期输出。

```java
public class Demo {

    static <T> void func1(Shop<T> shop) {
        T t = shop.get();
        System.out.println(t.getClass().getSimpleName());
    }

    static <T> void func2(Shop<?> shop) {
        // 用捕获的类型来调用方法
        func1(shop);
    }

    public static void main(String[] args) {
        Shop<Apple> appleShop = new Shop<>(new Apple());
        Shop shop = new Shop();
        shop.set(new Object());

        // Apple
        func1(appleShop);
        // Apple
        func2(appleShop);

        // Object
        func1(shop);
        // Object
        func2(shop);
    }
}
```

`func2()` 中的通配符让类型实参保持未知。调用 `func1()` 时，捕获转换为这个未知类型引入一个新的类型变量，使辅助方法可以在本次调用中一致地使用它；这不是在运行时发现某个具体类型实参。
