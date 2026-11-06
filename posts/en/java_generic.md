---
translationKey: java_generic
locale: en
title: "Working through Java generics"
description: "From generic classes and methods to type erasure and wildcard bounds, explore Java generics through code and comparisons with C++ templates."
pubDate: 2021-07-17
category: programming-language
subcategory: java
tags: [generic]
---

Generics let us write reusable code that works with a range of types while preserving compile-time type safety.

Introduced in JDK 5.0, generics let us use type parameters as placeholders for types. When defining a class or interface, we can use a type parameter for a field's type, a method's return type, or a method parameter's type. We supply the actual type argument when we use that generic declaration—for example, when extending a class, implementing an interface, declaring a variable, or creating an object.

Collections are often the first thing that comes to mind when Java generics come up. But generics have a broader purpose: they let us express relationships between types in reusable code. Type-safe collections are one application of that capability.

## Naming conventions

| Symbol | Meaning | Typical use |
|--:|:-:|:--|
| `T` (Type) | Type | A Java reference type, including library types and our own classes |
| `E` (Element) | Element | The type of elements stored in a collection |
| `K` (Key) | Key | The key type in a `Map` |
| `V` (Value) | Value | The value type in a `Map` |
| `N` (Number) | Number | A type parameter used for numeric types |
| `?` | Wildcard | An unknown Java reference type |

## The basics

The Java examples are independent snippets. Use JDK 8 or later: the factory example uses `Supplier`, which was [introduced in Java 8](https://docs.oracle.com/javase/8/docs/api/java/util/function/Supplier.html). The C++ blocks are separate comparisons.

To try a Java snippet:

1. Put each public top-level class in its own file with a matching name, such as `Fruit.java`. Keep the example classes in the same package.
2. Add the imports below as needed. The snippets omit import and package declarations for brevity.
3. Put standalone `main()` methods inside a test class. Reuse the supporting food classes defined below.
4. Use only one version of a repeated class name, such as `Person`, `Shop`, or `Demo`, at a time. Lines marked as errors deliberately fail to compile; comment them out when running the other lines. Runtime-error examples are identified separately.

These are the imports used throughout the Java examples:

```java
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
```

Before we begin, let's define a few simple classes. I have omitted routine getters, setters, and other boilerplate. Feel free to skip this block for now and refer back to it when an example uses one of these classes.

```java
interface Juicy<T> {
    void juice(T t);
}

class Food {}
// Food
class Meat extends Food {
    public void cook() {
        System.out.println("Stir-fried meat");
    }
}

public class Fruit extends Food {
    public void fruit() {
        System.out.println("Got a piece of fruit");
    }
}

// Types of meat
class Pork extends Meat {
    public void hamburger() {
        System.out.println("Hamburger");
    }
}

class Beef extends Meat {
    public void steak() {
        System.out.println("Steak");
    }
}

class Fish extends Meat {
    public void soup() {
        System.out.println("Fish soup");
    }
}
// Types of fruit
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
        System.out.println(orange + " juiced");
    }
}

// Types of apple
public class YellowApple extends Apple {
    @Override
    public String toString() {
        return "Yellow apple";
    }
}

public class RedApple extends Apple {
    @Override
    public String toString() {
        return "Red apple";
    }
}

public class GreenApple extends Apple {
    @Override
    public String toString() {
        return "Green apple";
    }
}
```

### Generic classes

This first snippet defines `Person<T>` and prints the object supplied to its constructor.

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
    
    // Test code
    public static void main(String[] args) {
        Person<Meat> person = new Person<>(new Meat());
        // Prints the result of Meat.toString()
        person.eat();
    }
}
```

This introduces the basic syntax. Now let's compare it with a version that does not use generics.

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
    // Test code
    public static void main(String[] args) {
        Person person = new Person(new Meat());
        // Also prints the result of Meat.toString()
        person.eat();
    }
}
```

So far, both versions produce the same result. The difference becomes clear when we need to retrieve a specific kind of food.

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
    // Test code
    public static void main(String[] args) {
        Person<Beef> person = new Person<>(new Beef());
        Beef beef = person.get();
        // Steak
        beef.steak();
    }
}
```

The non-generic approach requires a cast here. The methods `steak()`, `hamburger()`, and `soup()` belong to individual subclasses and are not declared in their common base class. We therefore cannot call them directly through a `Food` reference.

Using the name of a generic class without type arguments gives us a raw type. An unbounded type parameter is then erased to `Object`; a bounded parameter is erased to its leftmost bound. Prefer parameterized types when creating and referring to generic objects.

- A generic class can have several type parameters. Put them together inside angle brackets, as in `<T1, T2, T3>`.
- Once the type arguments are chosen, operations involving those type parameters must respect the chosen types.
- Different parameterizations of a generic class are not freely assignable to one another.
- A generic interface or abstract class cannot itself be instantiated.
- Omitting type arguments uses a raw type and erases the relevant types. This is not equivalent to explicitly using `Object` as a type argument. Use generics consistently rather than mixing parameterized and raw types.
- Type arguments cannot be primitive types; use wrapper classes instead.
- A type parameter declared on a class or interface can be used as the type of an instance field, an instance method parameter, or an instance method return value. A static method cannot refer to the enclosing class's type parameter.
- Exception classes cannot be generic.
- We cannot write `new T[]`. The expression `T[] elements = (T[]) new Object[capacity]` is possible for an unbounded `T`, but requires an unchecked cast and does not create a runtime array of the actual type argument. Notice that `ArrayList` stores its elements in `Object[] elementData`, not in an array whose runtime component type is its type parameter.
- A subclass of a generic class can supply concrete type arguments or use its own type parameters to keep some or all of the superclass's parameters open. Extending the raw superclass loses the corresponding type-safety checks. In any of these cases, the subclass can declare additional type parameters of its own.

### Generics in collections

One of the main motivations for generics was to support collection classes. A generic collection lets us specify its element type, so we can retrieve elements without casting them from `Object`. The same collection implementation can then be reused with many different element types.

Here are the main issues with raw collections and the benefits of using generics:

- Raw collections do not enforce an element type.
- Explicit casts may throw `ClassCastException`.
- Collection interfaces and classes were updated to use generics in JDK 5.0.
- We can supply a specific type argument when instantiating a collection class.
- That argument determines the types used wherever the collection declaration refers to its type parameter, including methods, constructors, and fields.
- Type arguments must be reference types, not primitive types. Use the corresponding wrapper class for primitive values.
- A raw collection loses its element type information; for the unbounded element parameters used here, reads are treated as returning `java.lang.Object`.

### Generic methods

Methods can have type parameters of their own, whether or not their enclosing class is generic. A generic method can express a type relationship independently of any class-level type parameter. A static method cannot use the enclosing class's type parameter.

> [!WARNING]
> Type arguments are checked or inferred at compile time, not chosen at runtime. A class's type arguments are associated with a particular parameterized type. A generic method's own type arguments are determined for each invocation, independently of the class's type arguments. A static method that needs a type parameter must declare its own.

When using a generic class, we specify the type arguments or let the compiler infer them where the syntax allows. For generic methods, we usually do not need to write the type arguments explicitly: the compiler can infer them from the call. This is called type inference.

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
    // Static generic method
    public static <F> F getFood(Class<F> c) {
        try {
            return c.getDeclaredConstructor().newInstance();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
    // Test code
    public static void main(String[] args) {
        Fish fish = Person.getFood(Fish.class);
    }
}
```

### Generic interfaces

Interfaces can be generic too.

```java
class Orange extends Fruit implements Juicy<Orange> {
    @Override
    public void juice(Orange orange) {
        System.out.println(orange + " juiced");
    }
}

interface Juicy<T> {
    void juice(T t);
}
```

## Going further

Generics are fundamentally about parameterized types and compile-time type checking. They let the compiler reject incompatible types. Without generics, we can accept arbitrary objects through `Object` references, but retrieving a more specific type requires a cast. The programmer must know that the object has the expected type; otherwise, the cast can fail at runtime. Generics move many of these checks to compile time, and the compiler inserts the casts required by erasure. This makes code safer and more reusable.

### Type erasure

The compiler replaces type parameters with their erased types, a process called type erasure. Generic type checking therefore takes place mainly at compile time. This does not mean that a class file contains no generic metadata: declaration signatures can be retained for reflection. However, different parameterizations of the same generic class share a single runtime class.

For type variables, erasure involves two steps:

1. Determine the replacement for each type variable: the erasure of its leftmost bound, which is `Object` when no explicit bound is given.
2. Replace uses of type variables with those erased types, inserting casts where necessary.

The following `main()` fragment compares the runtime classes and declared type variables of two lists:

```java
// Fragment: place this method inside a test class.
public static void main(String[] args) {
    // A concrete example
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

According to the [JDK documentation for `Class.getTypeParameters()`](https://docs.oracle.com/javase/8/docs/api/java/lang/Class.html#getTypeParameters--), the method returns an array of `TypeVariable` objects representing the type variables in the generic declaration. As the output shows, this does not recover the actual `String` or `Integer` argument used for either list. It describes the declared type variable `E`; a `TypeVariable` also provides information about its declaration, such as its bounds.

#### How C++ does it

This C++ example uses a class template to call `eat()` on the supplied object.

```cpp
#include <iostream>
using namespace std;

// A C++ template
template<class T> class Person {
// Person contains an object of type T
    T food;
public:
    Person(T x) {
        food = x;
    }
    // dinner() calls eat() on food
    void dinner() {
        food.eat();
    }
};

class Meat {
public:
    void eat() {
        cout << "Eating meat" << endl;
    }
};

int main() {
    Meat meat;
    /* 
     * The C++ compiler checks for eat() when the relevant template member is instantiated.
     * For Person<Meat>::dinner(), it finds eat() in Meat.
     * If Meat has no eat(), this use produces a compilation error, preserving type safety.
     */
    Person<Meat> person(meat);
    // Eating meat
    person.dinner();
}
```

The corresponding Java code does not compile:

```java
class Person<T> {
    private T food;
    
    Person(T food) {
        this.food = food;
    }
    
    public void dinner() {
        // Does not compile here
        food.eat();
    }
}
```

Java checks the generic class against the declared bounds of `T`; an unbounded `T` does not guarantee an `eat()` method. Unlike the C++ template, this class is not separately type-checked for each actual type argument. Java can express this requirement using bounds, which we will cover later.

#### Java's compromise

Type erasure is the implementation strategy chosen for Java generics, which arrived in JDK 1.5 rather than being part of the original language. Had generics been designed into JDK 1.0, a reified design could have retained type arguments at runtime and supported more direct operations on them. I see erasure as a compromise that limits some of the expressive power of generics. They are still useful in Java, but these limitations are worth understanding.

A central motivation for erasure was migration compatibility: generic callers should be able to use older, non-generic libraries, and existing callers should continue to work with libraries that adopt generics. The [Java Language Specification's discussion of reifiable types](https://docs.oracle.com/javase/specs/jls/se25/html/jls-4.html#jls-4.7) explains this compatibility requirement.

#### Working around erasure

This fragment deliberately attempts to instantiate a type parameter and fails to compile:

```java
class Person<T> {
    // Compilation fails.
    private T food = new T();
}
```

This Java code does not compile for two related reasons:
- The actual type argument is erased.
- The compiler cannot establish that `T` has an accessible no-argument constructor.

C++ templates can express this directly:

```cpp
template<class T> class Person {
    // A field of type T
    T food;
    // A pointer to T
    T* pointer;
public:
    // Initialize the pointer
    Person() {
        pointer = new T();
    }
};

class Meat {};

int main() {
    Person<Meat> p1;
    // Fundamental types work too
    Person<int> p2;
}
```

One Java solution is to pass a factory object. The reflection-based factory below still requires a no-argument constructor, so it fails for a class such as `Banana`. This is a limitation of this particular factory implementation; other implementations of `Supplier` can use constructors with arguments.

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
        // Fails at runtime because Banana has no no-argument constructor
        Banana banana = new FoodFactory<Banana>(Banana.class).get();
    }
}
```

#### Generic arrays

We cannot directly create an array with a non-reifiable component type such as `T`. We can cast an array reference to `T[]`, but the cast does not change the array's runtime component type. The two versions of `array()` below illustrate these approaches and should be considered separately.

```java
class Person<T> {
    public void array() {
        // Error
        T[] t = new T[10];
    }
}
```

The alternative below compiles with an unchecked-cast warning:

```java
class Person<T> {
    public void array() {
        // This compiles with an unchecked-cast warning.
        T[] t = (T[]) new Object[10];
    }
}
```

An array's runtime component type is fixed when the array is created. Casting `new Object[10]` to `T[]` does not change that component type: the object remains an `Object[]`, which can cause problems later. Allocating an array of the erased type and casting it can work for internal storage, but it does not create an array whose runtime component type matches the caller's type argument. A factory or an explicit component-type token is another approach when the runtime array type matters.

Compare the next two versions and consider what can go wrong at runtime.

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

The second version stores the elements in an `Object[]`:

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

Consider `convert()`. At compile time, the call in `main()` has type `Meat[]`, so the assignment compiles. Both versions nevertheless throw `ClassCastException` at runtime because the returned object is still an `Object[]`. A cast cannot turn that object into a `Meat[]`; it cannot change the underlying array type.

### Bounds

For an unbounded type parameter, we can only call methods available on `Object`. If we restrict the parameter to a narrower set of types, we can use the operations promised by that bound. Java uses `extends` for upper bounds and `super` for lower-bounded wildcards.

The following concepts describe how a subtype relationship carries over to related types:

- Covariance preserves the direction of the relationship. Because `RedApple` is a subtype of `Apple`, for example, `RedApple[]` is a subtype of `Apple[]`.
- Contravariance reverses the direction. For example, `List<? super Apple>` is a subtype of `List<? super RedApple>`.
- Invariance means neither relationship follows from the element types: `List<RedApple>` and `List<Apple>` are not subtypes of one another.

We will see how arrays and wildcards use these relationships in the examples below. Oracle's guide to [wildcards and subtyping](https://docs.oracle.com/javase/tutorial/java/generics/subtyping.html) illustrates the relationships between upper- and lower-bounded wildcards.

#### Upper bounds with `extends`

This snippet bounds `T` by `Fruit`. The second class adds the `Juicy<T>` interface as another bound, making its methods available too.

```java
class FruitShop<T extends Fruit> {
    T fruit;

    FruitShop(T fruit) {
        this.fruit = fruit;
    }

    public void getFruit() {
        // Call a method provided by the bound
        fruit.fruit();
    }
}
// If a bound includes both a class and interfaces, put the class first and separate the bounds with &. There can be at most one class bound, but several interface bounds.
class DrinkBar<T extends Fruit & Juicy<T>> {
    T fruit;

    DrinkBar(T fruit) {
        this.fruit = fruit;
    }
    
    public void juice(T t) {
        // Methods of the interface bound are available too.
        fruit.juice(t);
    }
    
    public void fruit() {
        fruit.fruit();
    }
}
```

#### Covariance

Java arrays are covariant. The classes in the following example were defined at the beginning of this article.

```java
// Fragment: place this method inside a test class.
public static void main(String[] args) {
    Apple[] apples = new RedApple[10];
    apples[0] = new RedApple();
    apples[1] = new YellowApple();
    apples[2] = new Apple();
}
```

All of these lines compile. Let's look at them one by one.

- The array declaration creates a `RedApple[]` array and assigns it to an `Apple[]` reference. This works because `RedApple` extends `Apple`, and Java arrays preserve that subtype relationship.
- The first assignment puts a red apple at index 0. This is valid both at compile time and at runtime.
- The second assignment puts a yellow apple at index 1. The compiler accepts it because the declared component type of `apples` is `Apple`. A yellow apple is an apple, so the assignment passes that check.
- The third assignment puts an ordinary apple at index 2. For the same reason, it also compiles.

This illustrates array covariance, but it also reveals a runtime problem. The actual array was created as `RedApple[]`, so storing a yellow apple or an ordinary apple throws `ArrayStoreException`. The assignment at index 1 throws first; the assignment at index 2 would also throw if it were reached.

The assignment lets us refer to a `RedApple[]` through an `Apple[]` variable; it does not copy or change the array. The array retains its runtime component type, which is checked on every write to prevent incompatible objects from being inserted.

The compiler still accepts those invalid stores. Now let's see how generics handle a similar situation.

```java
// Fragment: place this method inside a test class.
public static void main(String[] args) {
    // The following does not compile.
    List<Apple> list = new ArrayList<RedApple>();
}
```

This does not compile: we cannot assign a collection of `RedApple` to a `List<Apple>` reference. Although the example uses collections, the broader point is that a generic type parameterized with `RedApple` is not automatically a subtype of the same generic type parameterized with `Apple`.

It may initially look as if that assignment ought to be legal, but the reason for Java's rule becomes clear in the next example.

```java
// Fragment: place this method inside a test class.
public static void main(String[] args) {
    List<RedApple> redApples = new ArrayList<>();
    redApples.add(new RedApple());
    // If this were allowed, apples would refer to the same collection as redApples.
    List<Apple> apples = redApples;
    // This would appear valid through apples, yet insert a green apple into a list restricted to red apples!
    apples.add(new GreenApple());
}
```

It may sound strange, but a list of red apples is not a `List<Apple>`. A `List<Apple>` can accept red, yellow, and green apples, while a `List<RedApple>` cannot. This reminds me of the Chinese philosophical argument “a white horse is not a horse.” The analogy has limits: a white horse is certainly a horse, but the category “white horses” is narrower than “horses.” Similarly, every red apple is an apple, but a collection restricted to red apples cannot accept every apple.

Unlike arrays, Java generic types are invariant unless a wildcard introduces the required relationship.

#### Wildcards

A wildcard is written as `?` in a type argument. Let's use it to revisit the problem we encountered with arrays.

```java
// Fragment: place this method inside a test class.
public static void main(String[] args) {
    List<? extends Apple> list = new ArrayList<>();
    // Does not compile
    list.add(new RedApple());
    // Does not compile
    list.add(new Apple());
    // Legal, although adding null is not useful for this example
    list.add(null);
}
```

`ArrayList.add()` accepts an element of the list's type parameter. With `List<? extends Apple>`, that parameter is an unknown captured subtype of `Apple`. The compiler cannot prove that an `Apple` or a `RedApple` is of that specific type, so it rejects those insertions. `null` remains permitted.

By contrast, `contains()` and `indexOf()` accept `Object`, not the collection's type parameter. Our wildcard does not prevent calling those methods.

`List<? extends Apple>` means a list of some particular, unknown type that is `Apple` or one of its subtypes. It does not mean a list that accepts every kind of apple. We can read elements as `Apple`, but we cannot safely add an arbitrary apple when we do not know the list's exact element type. Allowing that would recreate the red-apple/green-apple problem. If we really want a collection that accepts red apples, yellow apples, and other apples together, we can write the following.

```java
// Fragment: place this method inside a test class.
public static void main(String[] args) {
    // This list accepts apples of any color. Through its Apple element type, we use the methods common to all apples, not methods specific to one color.
    List<Apple> list = new ArrayList<>();
    list.add(new RedApple());
    list.add(new GreenApple());
    list.add(new Apple());
}
```

#### Lower bounds with `super`

Here is how `super` can be used in a wildcard bound:

- `<? super Apple>` specifies `Apple` as the lower bound.
- A type parameter can be used in the wildcard bound: `<? super T>`.
- A type parameter declaration cannot have a lower bound: `<T super Apple>` is invalid.

```java
public class Shop {
    // The element type is Apple or one of its supertypes, so adding an Apple or an Apple subtype is safe.
    static void apples(List<? super Apple> apples) {
        apples.add(new Apple());
        apples.add(new YellowApple());
        // Does not compile: Banana is not an Apple.
        apples.add(new Banana("yellow"));
    }
    // Test code
    public static void main(String[] args) {
        List<Apple> apples = new ArrayList<>();
        Shop.apples(apples);
        
        List<RedApple> redApples = new ArrayList<>();
        // Does not compile
        Shop.apples(redApples);
        
        List<Fruit> fruits = new ArrayList<>();
        Shop.apples(fruits);
    }
}
```

We can read `<? super Apple>` as an unknown supertype of `Apple`, or `Apple` itself. It might be `Fruit`, `Food`, or even `Object`. Regardless of which of these element types the caller's list uses, adding an `Apple` or any subtype of `Apple` is safe. Adding a `Banana` is not: the actual list could be a `List<Apple>`. Here, `Apple` is the lower bound.

#### Review

Let's test our understanding. Read the following code and try to explain why each call does or does not compile.

```java
public class Demo {
    static List<Apple> apples = Arrays.asList(new Apple());
    static List<Fruit> fruits = Arrays.asList(new Fruit());

    static <T> T func1(List<T> list) {
        return list.get(0);
    }
    
    // The type argument is fixed for this parameterized use of the class.
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
        // Does not compile
        Fruit a2 = c2.func2(apples);
        Fruit f2 = c2.func2(fruits);
        
        // func3
        C3<Fruit> c3 = new C3<>();
        Fruit a3 = c3.func3(apples);
        Fruit f3 = c3.func3(fruits);
    }
}
```

- `func1` relates the element type of the input list to its return type. With an apple list it can return an `Apple`; with a fruit list it can return a `Fruit`. The returned `Apple` can also be assigned to a `Fruit` reference.
- `func2`: `c2` has type `C2<Fruit>`, so `T` is `Fruit`. Its method therefore returns `Fruit` and accepts `List<Fruit>`. As discussed earlier, `List<Apple>` is not a subtype of `List<Fruit>`, so `c2.func2(apples)` is invalid.
- `func3`: `c3` has type `C3<Fruit>`, so the method returns `Fruit` and accepts `List<? extends Fruit>`. Every element is a `Fruit` or a subtype of `Fruit`, allowing us to read a `Fruit` from either list.

#### Unbounded wildcards

The unbounded wildcard `<?>` can look like “any type,” which makes it tempting to equate it with a raw type. They are different, even though many calls accept either form. `<?>` explicitly leaves the type argument unknown while retaining generic type checking. It does not mean `Object`. The next example shows how wildcard types can refer to objects created with specific type arguments.

```java
public class Demo {
    // Wildcards leave some of the type arguments unspecified.
    Map<?, ?> map;
    Map<Fruit, ?> fruitMap;
    
    public Demo() {
        map = new HashMap<String, String>(16);
        fruitMap = new HashMap<Fruit, String>(16);
    }
}
```

Let's look at another set of examples. All of these calls compile, although raw types can produce compiler warnings.

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

The compiler accepts both `List` and `List<?>` in several of these situations, which can make them look interchangeable. The key difference is how they handle writes:

- `List`: a raw list, with its generic element-type checks erased; reads return `Object`, and unchecked writes are possible.
- `List<?>`: a parameterized list with an unknown element type. The compiler preserves that uncertainty and restricts unsafe writes.

To see when the distinction matters, let's define a `Shop` class that acts as a holder.

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
        // Produces an unchecked warning
        shop.set(obj);
        // Error: no type variable T is declared in this method.
        T t = shop.get();
        // Valid, but the result is only known to be Object.
        Object o = shop.get();
    }
    
    static void func2(Shop<?> shop, Object obj) {
        // Error: Object cannot be stored through an unknown type argument.
        shop.set(obj);
        // Error: no type variable T is declared in this method.
        T t = shop.get();
        // Valid, but the result is only known to be Object.
        Object o = shop.get();
    }
    // No problem
    static <T> T func3(Shop<T> shop, T t) {
        shop.set(t);
        return shop.get();
    }
    
    static <T> T func4(Shop<? extends T> shop, T t) {
        // Error
        shop.set(t);
        return shop.get();
    }
    
    static <T> void func5(Shop<? super T> shop, T t) {
        shop.set(t);
        // Error
        T t1 = shop.get();
        Object obj = shop.get();
    }
    
    // Test code: comment out the lines marked as errors above and below.
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

        // Produces an unchecked warning
        func3(s1, fruit);
        // Error
        func3(s2, fruit);
        // Error
        func3(s3, fruit);
        func3(fruitShop, fruit);

        // Produces an unchecked warning
        func4(s1, fruit);
        func4(s2, fruit);
        func4(s3, fruit);
        func4(fruitShop, fruit);
        
        // Produces an unchecked warning
        func5(s1, fruit);
        // Error
        func5(s2, fruit);
        // Error
        func5(s3, fruit);
        func5(fruitShop, fruit);
    }
}
```

Let's work through these cases.

- `func1`: The compiler knows that `Shop` is generic, even when used as a raw type, so calling `set()` generates an unchecked warning. The erased return type of `get()` is `Object`; the method cannot safely promise a more specific result.
- `func2`: This shows the difference between raw `Shop` and `Shop<?>`. The write in `func1()` produces a warning, while the write here is a compilation error. A raw `Shop` allows an unchecked write of any object. A `Shop<?>` has some unknown type argument, and we cannot assume that an arbitrary `Object` is compatible with it.
- `func3`: The same `T` links the holder's type argument, the inserted value's type, and the return type, so both writing and reading are safe.
- `func4` relaxes the accepted `Shop` type, but that introduces a restriction. Let's break it down:
  - The method accepts a `Shop` of an unknown subtype of `T`, along with a value of type `T`. If `T` is `Fruit`, the holder might be a `Shop<Apple>`, `Shop<Orange>`, or `Shop<Banana>`.
  - Inside the method, we do not know which one the caller supplied. Calling `set(t)` might put an orange into an apple shop, so the compiler rejects it.
  - Reading is safe: whatever the particular subtype, the result of `get()` can be treated as `T`, or `Fruit` in this example.
- `func5` reverses that relationship. The shop's type argument can be `Fruit` or a supertype of `Fruit`, so inserting a `Fruit` through `set()` is safe. A value returned by `get()`, however, is only guaranteed to be an `Object`.

These examples show the limitation of `Shop<?>`: its type argument is unknown to the caller. We can read an `Object` and write `null`, but we cannot assume that a value we read has a more specific type or that an arbitrary non-null value is safe to write.

#### Capture conversion

This example reuses `Shop<T>` from the preceding section. The helper method captures the unknown type argument, and the comments in `main()` show the expected output.

```java
public class Demo {

    static <T> void func1(Shop<T> shop) {
        T t = shop.get();
        System.out.println(t.getClass().getSimpleName());
    }

    static <T> void func2(Shop<?> shop) {
        // Call the method using the captured type.
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

In `func2()`, the wildcard makes the type argument unknown. When it calls `func1()`, capture conversion gives that unknown argument a fresh type variable, which can be used consistently for this invocation. This lets the helper work with the captured type without discovering a concrete runtime type argument.
