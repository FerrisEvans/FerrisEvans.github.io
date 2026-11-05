---
locale: zh
translationKey: java_generic
title: 手撕泛型
description: 从泛型类、泛型方法讲到类型擦除与通配符边界，用代码示例对比 Java 与 C++ 的实现差异。
pubDate: 2021-07-17
category: programming-language
subcategory: java
tags: [generic]
---


**泛型（generic）**：是一种编写更通用（泛型、通用是同一个英语单词，generic）的代码的方法，意为是用或者可兼容大批的类。

**泛型（generic）**：一定程度上可以理解为标签，JDK5.0新增特性。所谓泛型，就是允许在定义类、接口时通过一个标识表示类中某个属性的类型或者是某个方法的返回值及参数类型。这个类型参数将在使用时（例如，继承或实现这个接口，用这个类型声明变量、创建对象时）确定——即传入实际的类型参数，也成为类型实参。


在Java中提起泛型，相信部分人会第一个联想到的就是集合。但是泛型的目的是为了实现更强大的表达能力，而不仅仅是为了创建类型安全的集合。类型安全的集合只是更通用的代码创建能力的副产品。

## 一些约定

|缩写|含义|使用场景|
|--:|:-:|:--|
|T（Type）|类型|Java类，调用时的指定类型，包括基本的类和我们自己定义的类|
|E（Element）|元素|集合中使用，表示在集合中存放的元素|
|K（Key）|键|类似于Map的场景中使用，表示key|
|V（Value）|值|类似于Map的场景中使用，表示value|
|N（Number）|数值|表示针对于数值类的泛型|
|?|通配符|不确定的java类型|

## 初级篇

在学习之前，让我们准备以下几个基础类，这些类都很简单，应该没有任何理解上的难度。getter、setter、等重写方法省略。可以先跳过这一部分代码，接下来用到的时候参考即可。

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

通过上述代码可以先直观的感受一下泛型的语法，下面我们来对比一下有无泛型前后的代码有何不同。

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

你可能会说，这看起来没有任何不一样，我可以完全实现与上述代码完全相同的功能。那么请看接下来的这段代码，我需要获取某种具体的食物。

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

这个时候，不带泛型的方式就会比较臃肿。`steak()`、`hamburger()`、`soup()` 是各个子类特有的方法，并非 private 方法，也没有在共同的父类中声明，因此无法通过 `Food` 引用直接进行多态调用。

使用泛型类名时不指定类型实参，得到的是原始类型。无显式上界的类型参数会被擦除为 `Object`，有上界时则按最左侧上界擦除。建议创建和引用泛型对象时明确类型实参。
1. 泛型类可能有多个参数，此时应将多个参数一起放在尖括号内，比如`<T1, T2, T3>`
2. 实例化以后，操作原来泛型位置的结构必须与指定类型的泛型一致。
3. 泛型不同的引用不能相互赋值。
4. 如果泛型结构是一个接口或抽象类，则不可创建泛型类的对象。
5. 不指定类型实参会使用原始类型，并擦除相关类型信息，但这不等价于显式指定 `Object` 类型实参。应一致使用泛型，避免混用参数化类型和原始类型。
6. 类型推断：泛型的指定中不能使用基本数据类型，可以使用包装类替换
7. 在类/接口上声明的泛型，在本类或本接口中即代表某种，可以作为非静态属性的类型，非静态方法的参数类型，非静态方法的返回值类型。 但在静态方法中不能使用类的泛型
8. 异常类不能是泛型的。
9. 不能使用 `new T[]`。对于无显式上界的 `T`，可以写 `T[] elements = (T[]) new Object[capacity]`，但这需要未经检查的转换，也不会创建运行时元素类型为实际类型实参的数组。参考 `ArrayList` 使用的 `Object[] elementData`。
10. 父类有泛型，子类可以选择保留泛型也可以选择指定泛型类型： 
    1.  子类不保留父类的泛型：按需实现。 
        1.  使用原始父类，发生擦除并失去相应类型安全保障
        2.  具体类型
    2.  子类保留父类的泛型：泛型子类 
        1.  全部保留
        2.  部分保留
    3.  结论：子类必须是富二代，子类除了指定或保留父类的泛型，还可以增加自己的泛型

### 集合中的泛型

泛型最重要的初衷之一是用于创建集合类。集合可以在我们使用一组对象的时候持有这些对象的具体类型，而不是`Object`，因此集合是复用性最高的库之一。

在集合中不使用泛型的问题：
1. 类型不安全
2. 强转时，可能出现`ClassCastException`
3. 集合接口或集合类在JDK5.0时都修改为带泛型的结构。
4. 在实例化集合类时，可以指明具体的泛型类型
5. 指明之后，在集合类或接口中凡是定义类或接口时，内部结构(比如：方法，构造器，属性等)使用到类的泛型的位置，都指定为实例化的泛型类型。
6. 注意点：泛型的类型必须是类，不能是基本数据类型。需要用到基本数据类型的位置，拿包装类替换。
7. 使用原始集合会丢失元素类型信息；这里的无显式上界元素参数被擦除后，读取结果按 `java.lang.Object` 处理。

### 泛型方法

泛型可以对类内部的方法进行参数化。类自身可以是泛型的，也可以不是，他和是否存在泛型方法无关。泛型方法可以改变方法的行为而不受类的影响。如果某个方法是静态的，他没有访问类的泛型类型参数的权限

> [!WARNING]
> 类型实参在编译期检查或推断，不是在运行时决定。类的类型参数属于该类的某次参数化使用；泛型方法自己的类型参数则在方法调用处确定，与类的实例化无关。静态方法如果需要这种类型参数，就必须自己声明。

使用泛型类时，在实例化类的时候必须指定参数，而使用泛型方法的时候，通常不需要指定参数类型，因为编译器会帮你检测出来，称为参数类型推断。

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

泛型同样可用于接口

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
泛型的本质是参数化类型，提供了编译时类型的安全监测机制。该机制允许程序在编译时检测非法的类型。在不使用泛型的情况下，我们可以通过引用`Object`类来实现参数的任意化，但在具体使用时需要进行强制类型转换。强制类型转换要求开发者必须明确知道实际参数的引用类型，不然可能引起强制类型转换异常。在编译期无法识别，只能在运行期检测。使用泛型的好处就是在编译期就能检查类型是否安全，同时所有强制性类型转换都是自动和隐式进行的，提高了代码的安全性和重用性。

### 类型擦除

编译器把类型参数转换为擦除后的形式，这个过程称为类型擦除。因此，泛型类型检查主要在编译期进行。但这不表示 class 文件完全没有泛型元信息：声明签名可以保留供反射使用。普通泛型实例不会为每个实际类型实参保留一个不同的运行时类。

Java类型的擦除过程：
1. 查找类型变量的替换类型，即其最左侧上界的擦除类型；没有显式上界时为 `Object`。
2. 把类型变量的使用替换为擦除后的类型，并在必要时插入类型转换。

```java
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

根据 JDK 文档，`Class.getTypeParameters()` 返回表示泛型声明中类型变量的 `TypeVariable` 数组。输出中的 `E` 描述的是声明，不能据此恢复某个列表实例使用的 `String` 或 `Integer` 类型实参；`TypeVariable` 本身还可以提供上界等声明信息。

#### C++的实现方法

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

换成Java则无法编译以下代码

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

#### Java的妥协

类型擦除是 Java 为泛型选择的实现策略。泛型语法到 JDK 1.5 才加入，并非 Java 最初就有的能力。如果从 JDK 1.0 起设计泛型，也可以选择具体化的设计，在运行时保留类型实参并支持更直接的类型操作。我认为擦除是一种妥协，限制了泛型的部分表达能力；Java 泛型仍然有用，但需要理解这些限制。

> In programming language design, a first-class citizen (also object, entity, or value) in a given programming language is an entity which supports all the operations generally available to other entities. These operations typically include being passed as a parameter, returned from a function, and assigned to a variable.

类型擦除的核心初衷是，希望让泛化的调用方可以依赖于非泛化的库，反之亦然，称为迁移兼容性。

#### 类型擦除的补偿

```java
class Person<T> {
    // 编译失败，不会成功。
    private T food = new T();
}
```

以上Java代码编译并不会通过，原因有二
1. 类型擦除
2. 编译器无法验证T中是否存在空参构造器。

但是在C++中可以。

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

我们不能直接创建元素类型为 `T` 这样的不可具体化类型的数组。转换可以让引用具有 `T[]` 类型，但不会改变数组实际的运行时元素类型。

```java
class Person<T> {
    public void array() {
        // 报错
        T[] t = new T[10];
    }
    
    public void array() {
        // 这种方式可以通过编译，但是会产生类型转换警告。
        T[] t = (T[]) new Object[10];
    }
}
```

数组创建时就确定了运行时元素类型。把 `new Object[10]` 转换为 `T[]` 不会改变这个类型，对象仍是 `Object[]`。创建擦除类型的数组再转换可以用作内部存储，但并未创建调用方实际类型实参对应的数组。如果确实需要具体的运行时数组类型，还可以通过数组工厂或显式元素类型令牌创建。
请继续看以下代码，对比一下他们的不同，并猜猜看运行时会有什么问题。

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

由于类型擦除移除了类型信息，对于无边界的泛型参数，我们只能调用`Object`中可用的方法。不过如果能够将参数类型限制在某个类型的子集中，我们就可以调用该子集上可用的方法了。为了应用这种限制，Java复用了`extends`与`super`关键字。

先来看理解下如下概念，会有助于后续的阅读
- 协变性：能够使用比原始指定的派生类型的派生程度更大（更具体的）的类型
- 逆变性：能够使用比原始指定的派生类型的派生程度更小(不太具体的)的类型
- 不变性：对于不支持协变和逆变的情况称为不变性。
- 
协变和逆变是指宽类型和窄类型在某种情况下（如参数、泛型、返回值）替换或交换的特性。

#### extends

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

Java的数组具有协变性，我们来看如下例子，涉及到的类均在文章开头处有定义。

```java
public static void main(String[] args) {
    Apple[] apples = new RedApple[10];
    apples[0] = new RedApple();
    apples[1] = new YellowApple();
    apples[2] = new Apple();
}
```

以上代码编译均可通过。那么我们来详细看看这几行代码

- 第二行：创建了一个红苹果数组，并将其赋值给一个指向苹果数组的引用。这可以说得通，因为红苹果也是一种苹果，所以红苹果数组也应该是一种苹果数组。
- 第三行：把一个红苹果对象赋值给数组中下标为0的元素，完全合理合法。
- 第四行：把一个黄苹果对象赋值给数组中下标为1的元素。这对于编译器来说是说的通的，因为`apples`持有的是`Apple`类型的引用。编译器有什么理由不允许放入一个黄苹果呢？
- 第五行：把一个苹果对象赋值给数组中下标为2的元素。由于`apples`持有的是`Apple`类型的引用，所以这对于编译器来说也完全合理，编译的时候不会有任何错误。

以上代码说明了数组的协变性，但运行时数组仍知道自己的元素类型是 `RedApple`，存入黄苹果或普通苹果会抛出 `ArrayStoreException`。第四行首先抛出异常；如果第五行能够执行到，它也会抛出同样的异常。

这里转换的是数组引用：`RedApple[]` 引用转换成 `Apple[]` 引用，并没有复制数组，也没有改变元素类型。数组在运行时保留自己的元素类型，并检查写入操作，阻止不兼容的对象被放入。

虽说如此，这种错误在编译时却完全合法，然我们接着往下看泛型是如何处理这个问题的。

```java
public static void main(String[] args) {
    // 如下代码无法通过编译
    List<Apple> list = new ArrayList<RedApple>();
}
```

上边的代码块是无法通过编译的，这告诉我们无法将`RedApple`集合赋值给`Apple`集合。这里虽然用到的是集合类型，但是我想告诉你的并不只是集合，而是我们无法将包含`RedApple`的泛型赋值给包含`Apple`的泛型。

看上去如上代码好像应该是合法的，但是其实不难理解Java为什么这么干，如下代码会给出很好的解释。

```java
public static void main(String[] args) {
    List<RedApple> redApples = new ArrayList<>();
    redApples.add(new RedApple());
    // 如果Java允许这么写的话，则他想表达的意思是把红苹果集合赋值给另外一个苹果集合。换句话说就是让apples集合持有redApples的引用。
    List<Apple> apples = redApples;
    // 这里语义就出现了混乱。apples本是持有的红苹果引用，而如果只看这行代码的话却又完全合法，但是矛盾点就在于一个红苹果集合里却合理的添加了一个绿苹果！
    apples.add(new GreenApple());
}
```

虽然看起来奇怪，但是红苹果的集合并不是苹果的集合。苹果集合可以持有红苹果、黄苹果和青苹果对象，但是红苹果集合在类型上并不等价与苹果集合。如果不好理解可以参考《白马非马》的故事，故事大概讲的就是这个意思。大意说的是如果白马等于马，黑马也等于马，所以白马=马=黑马，但白马不是黑马，所以白马不是马。

与数组不同，Java 泛型类型本身不具有协变性；需要通过通配符表达所需的类型关系。

#### 通配符

通配符，即泛型参数表达式中的问号。引入通配符之后，我们继续看上边数组的问题。

```java
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

而对于`ArrayList`中的`contains()`或`indexOf()`来说，参数类型是`Object`，并不包含我们定义的通配符，所以编译器允许调用。

`List<? extends Apple>` 表示元素类型为 `Apple` 或其某个未知子类型的列表，不表示能接收所有苹果。我们可以把读出的元素当作 `Apple`，但不知道实际元素类型时，不能安全地加入任意苹果，否则会重现红苹果列表被放入青苹果的问题。如果确实需要把红苹果、黄苹果等放进同一个集合，可以直接采用下面的写法。

```java
public static void main(String[] args) {
    // 这种写法就非常合理了。list中不会对任何颜色的苹果加以区分，list中的元素只能使用他们共同的苹果父类中的方法，而不能使用每个颜色的苹果的特有方法，十分合理。
    List<Apple> list = new ArrayList<>();
    list.add(new RedApple());
    list.add(new GreenApple());
    list.add(new Apple());
}
```

#### super

`super`的合理使用方式
1. `<? super Apple>`
2. 可以使用类型参数：`<? super T>`
3. 无法给泛型参数设置父类边界：`<T super Apple>`

```java
public class Shop {
    // 这里apples的意思是 由Apple的某一父类组成的list。因此我们可以安全的添加Apple或者Apple的子类
    static void apples(List<? super Apple> apples) {
        apples.add(new Apple());
        apples.add(new YellowApple());
        // 编译不通过
        apples.add(new Banana());
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

我们可以这样理解`<? super Apple>`，即`Apple`类的某一未知父类或者`Apple`类自己，他可能是`Fruit`类，可能是`Food`类，甚至可能是`Object`类。这些类都是`Apple`类的父类，但是无论传进来的是以上哪种类型的`list`，他都可以安全的添加`Apple`对象和他的子类对象，但是不能添加`Banana`对象。这时我们称`Apple`类为下界。

#### 回顾

本节我们来测试一下你对上述内容是否掌握扎实，请阅读下边代码，看看是否可以理解其中的代码为什么可以编译或者为什么不可以编译。

```java
public class Demo {
    static List<Apple> apples = Arrays.asList(new Apple());
    static List<Fruit> fruits = Arrays.asList(new Fruit());

    static <T> T func1(List<T> list) {
        return list.get(0);
    }
    
    // 类被实例化后，其类型即被确定
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

- func1：使用了精确类型，因此传入对象的类型参数是`Apple`，即可返回一个`Apple`对象。如果是`Fruit`，即可返回一个`Fruit`对象。并且`Apple`对象可以向上转型成`Fruit`对象。
- func2：`c2` 的类型是 `C2<Fruit>`，所以 `T` 为 `Fruit`，方法返回 `Fruit`，参数为 `List<Fruit>`。前面讨论过，`List<Apple>` 不是 `List<Fruit>` 的子类型，因此 `c2.func2(apples)` 不合法。
- func3：在我们实例化`C3`的时候，确定了`func3()`的返回值为`Fruit`类型，入参为`List<? extends Fruit>`类型，也就是说，这个`list`中的元素，至少都是个`Fruit`，也可能是`Fruit`的某个子类。所以我们可以从`List<? extends Fruit>`中读取一个`Fruit`。

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

让我们再看一组例子，下面这组例子都会成功运行。只不过我们会发现，编译器会在一些地方给我们一些警告。

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

从以上代码可以看出，编译器并不总是关心`List`和`List<?>`的区别，因此他们看起来可以是同一类事物，但事实上并不是这样，通常我们可以这么理解
- `List`：原始列表，泛型元素检查被擦除；读取返回 `Object`，写入可能产生未经检查的警告。
- `List<?>`：元素类型未知的参数化列表，编译器保留这种不确定性并限制不安全的写入。

下面我们具体说说编译器会在什么时候关心原始类型和带有无界通配符的类型之间的区别。我们可以先定义如下一个`Shop`类，作为Holder（持有器）存在。

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

我们继续来看上述代码的几种情况

- func1：编译器知道`Shop`是泛型类，所以即使这里被表示为原始类型，编译器也会知道`set()`是不安全的。而编译器为了安全起见，不论传进来的对象究竟是什么类型，统一都会当做`Object`类型处理，所以`get()`中无法返回除了`Object`类型之外的任何类型。
- func2：这里体现了原始 `Shop` 与 `Shop<?>` 的区别。`func1()` 中的写入只有警告，而这里直接编译失败。原始 `Shop` 允许未经检查地写入任意对象；`Shop<?>` 有一个未知类型实参，不能假定任意 `Object` 都与它兼容。
- func3：这个应该比较容易想得明白，略。
- func4：对`Shop`类型的限制放宽了，但是会有一些个别问题。我们再一次来慢慢说一下。 
  - func4 允许传入某个 `T` 子类型的 `Shop`，以及一个 `T` 值。如果 `T` 是 `Fruit`，商店可能是 `Shop<Apple>`、`Shop<Orange>` 或 `Shop<Banana>`。
  - 在方法内部，我们并不知道将来调用方法时会被传进来什么，有可能是苹果商店、也有可能是橘子商店。所以我们为了防止向苹果商店中放入一个橘子，所以编译器不允许我们调用`set()`。
  - 但无论如何，我们知道`get()`返回的一定是一个`T`，即`Fruit`，因为传入进来的`shop`的类型参数最小也是个`Fruit`，所以我们可以返回一个`Fruit`对象。
- func5：可以理解为与`func4()`相反，`Shop`的类型参数可以为`Fruit`的任何父类，因此我们可以使用`set()`向`shop`中插入一个`Fruit`。但是我们在调用`get()`的时候，只能获取到一个`Object`。

这些例子展示了 `<?>` 的限制：调用方没有可用的具名 `T`。我们可以读取 `Object`、写入 `null`，但不能安全地读取任意指定的 `T` 或写入任意非空对象。

#### 捕获转换

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
