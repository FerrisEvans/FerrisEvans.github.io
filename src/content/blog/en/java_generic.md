---
translationKey: java_generic
locale: en
title: "Working Through Java Generics"
description: "From generic classes and methods to type erasure and wildcard bounds, explore Java generics through code and comparisons with C++ templates."
pubDate: 2021-07-17
category: programming-language
subcategory: java
tags: [generic]
---


**Generics** are a way to write more general-purpose code: code that works with a broad range of classes rather than one particular class.

**Generics**, introduced in JDK 5.0, can also be understood as a way of labeling types. When defining a class or interface, we can use a type parameter to stand for the type of a field, a method's return value, or a method parameter. We supply the actual type argument when we use that generic declaration—for example, when extending a class, implementing an interface, declaring a variable, or creating an object.


When Java generics come up, collections are probably the first thing many people think of. But their purpose is broader: they make the language more expressive. Type-safe collections are one useful result of being able to write more general code, rather than the whole point of generics.

## Naming Conventions

| Abbreviation | Meaning | Typical use |
|--:|:-:|:--|
| T (Type) | Type | A Java reference type, including library types and our own classes |
| E (Element) | Element | The type of elements stored in a collection |
| K (Key) | Key | A key type, as in a Map |
| V (Value) | Value | A value type, as in a Map |
| N (Number) | Number | A type parameter used for numeric types |
| ? | Wildcard | An unknown Java reference type |

## The Basics

Before we begin, let's prepare a few simple classes. I have omitted routine getters, setters, and other boilerplate overrides. Feel free to skip this block for now and refer back to it when an example uses one of these classes.

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

### Generic Classes

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

This gives us a first feel for the syntax. Now let's compare the generic version with a version that does not use generics.

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

You might say that there is no real difference: the second version does exactly the same thing. Now consider the next example, in which I need to retrieve a specific kind of food.

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

The non-generic approach becomes less convenient here and requires more cumbersome code. `steak()`, `hamburger()`, and `soup()` are methods specific to individual subclasses—not private methods—and they are not declared in their common base class. We cannot call them through a `Food` reference using ordinary polymorphic dispatch.

Using the name of a generic class without type arguments gives us a raw type. An unbounded type parameter is then erased to `Object`; a bounded parameter is erased to its leftmost bound. Prefer specifying type arguments when creating and referring to generic objects.
1. A generic class can have several type parameters. Put them together inside angle brackets, as in `<T1, T2, T3>`.
2. Once the type arguments are chosen, operations involving those type parameters must respect the chosen types.
3. Different parameterizations of a generic class are not freely assignable to one another.
4. A generic interface or abstract class cannot itself be instantiated.
5. Omitting type arguments uses a raw type and erases the relevant types. This is not equivalent to explicitly using `Object` as a type argument. Use generics consistently rather than mixing parameterized and raw types.
6. Type arguments cannot be primitive types; use wrapper classes instead.
7. A type parameter declared on a class or interface can be used as the type of an instance field, an instance method parameter, or an instance method return value. A static method cannot refer to the enclosing class's type parameter.
8. Exception classes cannot be generic.
9. We cannot write `new T[]`. The expression `T[] elements = (T[]) new Object[capacity]` is possible for an unbounded `T`, but requires an unchecked cast and does not create a runtime array of the actual type argument. Notice that `ArrayList` stores its elements in `Object[] elementData`, not in an array whose runtime component type is its type parameter.
10. When a superclass is generic, a subclass can preserve its type parameters or supply specific type arguments:
    1. A subclass can stop exposing the superclass's type parameters:
        1. Use the raw superclass, with erasure and the associated loss of type safety.
        2. Supply concrete type arguments.
    2. A generic subclass can preserve the superclass's type parameters:
        1. Preserve all of them.
        2. Preserve only some of them.
    3. Think of the subclass as inheriting a fortune: as well as supplying or preserving the superclass's type parameters, it can add type parameters of its own.

### Generics in Collections

One of the main motivations for generics was to support collection classes. When we work with a group of objects, a generic collection retains their declared element type in the type system instead of treating every element as `Object`. This helps make collections some of our most reusable library components.

Problems with non-generic collections, and points to remember:
1. They are not type-safe.
2. Explicit casts may throw `ClassCastException`.
3. Collection interfaces and classes were updated to use generics in JDK 5.0.
4. We can supply a specific type argument when instantiating a collection class.
5. That argument determines the types used wherever the collection declaration refers to its type parameter, including methods, constructors, and fields.
6. Type arguments must be reference types, not primitive types. Use a wrapper when a primitive type is involved.
7. A raw collection loses its element type information; for the unbounded element parameters used here, reads are treated as returning `java.lang.Object`.

### Generic Methods

Methods can have type parameters of their own. Their enclosing class may or may not be generic; these are independent choices. A generic method can express a type relationship without tying it to the class's type parameter. A static method has no access to the enclosing class's type parameter.

> [!WARNING]
> Type arguments are checked or inferred at compile time, not chosen at runtime. A class type parameter belongs to a parameterized use of that class. A generic method's own type parameter is determined for the method invocation, independently of class instantiation. A static method that needs such a parameter must declare it itself.

When using a generic class, we give or infer the type arguments for the parameterized type. For generic methods, we usually do not need to write the type arguments explicitly: the compiler can infer them from the call. This is called type inference.

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

### Generic Interfaces

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

## Going Further
Generics are fundamentally about parameterized types and compile-time type checking. They let the compiler reject incompatible types. Without generics, we can accept arbitrary objects through `Object` references, but retrieving a more specific type requires a cast. The programmer must know that the actual object has the expected type; otherwise, a cast can fail at runtime. Generics move many of these checks to compilation, and the compiler inserts the casts required by erasure. This makes code safer and more reusable.

### Type Erasure

The compiler translates type parameters into their erased forms, a process called type erasure. Generic type checking therefore takes place mainly at compile time. This does not mean that a class file contains no generic metadata: declaration signatures can be retained for reflection. What an ordinary generic instance does not retain is a distinct runtime class for each actual type argument.

The erasure process in Java:
1. Determine the replacement for each type variable: the erasure of its leftmost bound, which is `Object` when no explicit bound is given.
2. Replace uses of type variables with those erased types, inserting casts where necessary.

```java
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

According to the JDK documentation, `Class.getTypeParameters()` returns an array of `TypeVariable` objects representing the type variables in the generic declaration. As the output shows, this does not recover the actual `String` or `Integer` argument used for either list. It describes the declared variable `E`; a `TypeVariable` also exposes declaration information such as its bounds.

#### How C++ Does It

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

Java checks the generic class against the declared bounds of `T`; an unbounded `T` does not promise an `eat()` method. Unlike the C++ template, this class is not separately type-checked for each actual type argument. Java has its own way to express this requirement, which we will see in the section on bounds.

#### Java's Compromise

Type erasure is the implementation strategy chosen for Java generics, which arrived in JDK 1.5 rather than being part of the original language. Had generics been designed into JDK 1.0, a reified design could have retained type arguments at runtime and supported more direct operations on them. I see erasure as a compromise that limits some of the expressive power of generics. They are still useful in Java, but these limitations are worth understanding.

> In programming language design, a first-class citizen (also object, entity, or value) in a given programming language is an entity which supports all the operations generally available to other entities. These operations typically include being passed as a parameter, returned from a function, and assigned to a variable.

A central motivation for erasure was migration compatibility: generic callers should be able to use older, non-generic libraries, and existing callers should continue to work with libraries that adopt generics.

#### Working Around Erasure

```java
class Person<T> {
    // Compilation fails.
    private T food = new T();
}
```

This Java code does not compile for two related reasons:
1. The actual type argument is erased.
2. The compiler cannot establish that `T` has an accessible no-argument constructor.

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

One Java solution is to pass a factory object. The reflection-based factory below still requires a no-argument constructor, so it fails for a class such as `Banana`. That limitation belongs to this factory implementation, not to every possible `Supplier`.

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

#### Generic Arrays

We cannot directly create an array with a non-reifiable component type such as `T`. A cast can give an array a `T[]` reference type, but it does not change the array's actual runtime component type.

```java
class Person<T> {
    public void array() {
        // Error
        T[] t = new T[10];
    }
    
    public void array() {
        // This compiles with an unchecked-cast warning.
        T[] t = (T[]) new Object[10];
    }
}
```

Arrays know their runtime component type from the moment they are created. Casting `new Object[10]` to `T[]` does not change that component type: the object remains an `Object[]`, which can cause problems later. Allocating an array of the erased type and casting it is one internal-storage technique, but it does not create a reified array of the caller's type argument. A factory or an explicit component-type token is another approach when the actual runtime array type matters.
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

Consider `convert()`. At compile time, the call in `main()` has type `Meat[]`, so the assignment compiles. Both versions nevertheless throw a cast exception when run, because the returned object is still an `Object[]`. A cast cannot turn that object into a runtime `Meat[]`; it cannot change the underlying array type.

### Bounds

For an unbounded type parameter, we can only call methods available on `Object`. If we restrict the parameter to a narrower set of types, we can use the operations promised by that bound. Java uses `extends` for upper bounds and `super` for lower-bounded wildcards.

The following concepts will help with the examples:
- Covariance: allowing a more specific type to be used in the corresponding type relationship.
- Contravariance: allowing a less specific type to be used in the reverse type relationship.
- Invariance: neither of those substitutions is permitted.
- 
Covariance and contravariance describe how subtype relationships behave in contexts such as parameters, generic types, and return types.

#### extends

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
public static void main(String[] args) {
    Apple[] apples = new RedApple[10];
    apples[0] = new RedApple();
    apples[1] = new YellowApple();
    apples[2] = new Apple();
}
```

All of these lines compile. Let's look at them one by one.

- Line 2 creates a red-apple array and assigns it to an apple-array reference. This works because `RedApple` extends `Apple`, and Java arrays preserve that subtype relationship.
- Line 3 puts a red apple at index 0. This is valid both at compile time and at runtime.
- Line 4 puts a yellow apple at index 1. The compiler accepts it because the declared component type of `apples` is `Apple`. A yellow apple is an apple, so the assignment passes that check.
- Line 5 puts an ordinary apple at index 2. For the same reason, it also passes compilation.

This illustrates array covariance, but it also reveals a runtime problem. The actual array was created as `RedApple[]`, so storing a yellow apple or an ordinary apple throws `ArrayStoreException`. Line 4 throws first; line 5 would throw as well if it were reached.

The assignment converts a reference from `RedApple[]` to `Apple[]`; it does not copy the array or turn its contents into a different kind of array. The runtime array retains its component type and checks stores against it, preventing an incompatible object from being inserted.

The compiler still accepts those invalid stores. Now let's see how generics handle a similar situation.

```java
public static void main(String[] args) {
    // The following does not compile.
    List<Apple> list = new ArrayList<RedApple>();
}
```

This does not compile: we cannot assign a collection of `RedApple` to a `List<Apple>` reference. Although the example uses collections, the broader point is that a generic type parameterized with `RedApple` is not automatically a subtype of the same generic type parameterized with `Apple`.

It may initially look as if that assignment ought to be legal, but the reason for Java's rule becomes clear in the next example.

```java
public static void main(String[] args) {
    List<RedApple> redApples = new ArrayList<>();
    redApples.add(new RedApple());
    // If this were allowed, apples would refer to the same collection as redApples.
    List<Apple> apples = redApples;
    // This would appear valid through apples, yet insert a green apple into a list restricted to red apples!
    apples.add(new GreenApple());
}
```

It may sound strange, but a list of red apples is not a `List<Apple>`. A `List<Apple>` can accept red, yellow, and green apples, while a `List<RedApple>` cannot. I find the Chinese philosophical debate “a white horse is not a horse” a useful analogy here: treating the categories “white horse,” “horse,” and “black horse” as identical would incorrectly make white horses and black horses interchangeable. The point is the distinction between those categories, not that a white horse ceases to be an individual horse.

Unlike arrays, Java generic types are invariant unless a wildcard introduces the required relationship.

#### Wildcards

A wildcard is the question mark in a type argument. With that notation available, let's return to the issue we encountered with arrays.

```java
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
public static void main(String[] args) {
    // This list accepts apples of any color. Through its Apple element type, we use the methods common to all apples, not methods specific to one color.
    List<Apple> list = new ArrayList<>();
    list.add(new RedApple());
    list.add(new GreenApple());
    list.add(new Apple());
}
```

#### super

Valid and invalid uses of `super`:
1. `<? super Apple>`
2. A type parameter can be used in the wildcard bound: `<? super T>`.
3. A type parameter declaration cannot have a lower bound: `<T super Apple>` is invalid.

```java
public class Shop {
    // The element type is Apple or one of its supertypes, so adding an Apple or an Apple subtype is safe.
    static void apples(List<? super Apple> apples) {
        apples.add(new Apple());
        apples.add(new YellowApple());
        // Does not compile
        apples.add(new Banana());
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

#### Unbounded Wildcards

The unbounded wildcard `<?>` can look like “any type,” which makes it tempting to equate it with a raw type. They are different, even though many calls accept either form. `<?>` says that I have considered generics and am deliberately leaving the actual type argument unknown. It does not mean `Object`, nor does it disable generic type checking. The next example shows an important use of that distinction.

```java
public class Demo {
    // Initialize the parameter with a particular type.
    Map<?, ?> map;
    Map<Fruit, ?> fruitMap;
    
    public Demo() {
        map = new HashMap<String, String>(16);
        fruitMap = new HashMap<Fruit, String>(16);
    }
}
```

Let's look at another set of examples. These calls can all run, although the compiler warns about some of them.

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

The compiler accepts both `List` and `List<?>` in several of these situations, which can make them look interchangeable. They are not. A useful distinction is:
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
- `func3`: This uses the same `T` consistently for the holder, the inserted value, and the result, so it should now be straightforward.
- `func4` relaxes the accepted `Shop` type, but that introduces a restriction. Let's break it down:
  - The method accepts a `Shop` of an unknown subtype of `T`, along with a value of type `T`. If `T` is `Fruit`, the holder might be a `Shop<Apple>`, `Shop<Orange>`, or `Shop<Banana>`.
  - Inside the method, we do not know which one the caller supplied. Calling `set(t)` might put an orange into an apple shop, so the compiler rejects it.
  - Reading is safe: whatever the particular subtype, the result of `get()` can be treated as `T`, or `Fruit` in this example.
- `func5` reverses that relationship. The shop's type argument can be `Fruit` or a supertype of `Fruit`, so inserting a `Fruit` through `set()` is safe. A value returned by `get()`, however, is only guaranteed to be an `Object`.

These examples show the limitation of `<?>`: there is no named `T` available to the caller. We can read an `Object`, and we can write `null`, but we cannot safely read an arbitrary chosen `T` or write an arbitrary non-null value.

#### Capture Conversion

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
