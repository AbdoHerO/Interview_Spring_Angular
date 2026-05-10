# Java 8/17 Interview

# Sommaire Java 8/17

- #1🧩 [1. Encapsulation et Modificateurs d’accès](https://www.notion.so/Java-8-17-Interview-227fafae3b63800ea158e98def373f36?pvs=21)
- #2🧩 [2. Abstraction avec Classes Abstraites](https://www.notion.so/Java-8-17-Interview-227fafae3b63800ea158e98def373f36?pvs=21)
- #3🧩 [3. Abstraction avec Interfaces (Java 8+)](https://www.notion.so/Java-8-17-Interview-227fafae3b63800ea158e98def373f36?pvs=21)
- #4🧩 [4. Méthodes Abstraites](https://www.notion.so/Java-8-17-Interview-227fafae3b63800ea158e98def373f36?pvs=21)
- #5🧩 [5. Héritage avec extends](https://www.notion.so/Java-8-17-Interview-227fafae3b63800ea158e98def373f36?pvs=21)
- #6🧩 [6. Polymorphisme](https://www.notion.so/Java-8-17-Interview-227fafae3b63800ea158e98def373f36?pvs=21)
- #7🧩 [7. Interfaces Multiples](https://www.notion.so/Java-8-17-Interview-227fafae3b63800ea158e98def373f36?pvs=21)
- #8-1🧩 [8-1. Collections API Java](https://www.notion.so/Java-8-17-Interview-227fafae3b63800ea158e98def373f36?pvs=21)
- #8-2🧩 [8-2. Collections Immuables (Java 9+)](https://www.notion.so/Java-8-17-Interview-227fafae3b63800ea158e98def373f36?pvs=21)
- #8-3🧩 [8-3. Tri & Recherche](https://www.notion.so/Java-8-17-Interview-227fafae3b63800ea158e98def373f36?pvs=21)
- #9🧩 [9. Gestion des Exceptions en Java](https://www.notion.so/Java-8-17-Interview-227fafae3b63800ea158e98def373f36?pvs=21)
- #10🧩 [10. Input/Output et Sérialisation en Java](https://www.notion.so/Java-8-17-Interview-227fafae3b63800ea158e98def373f36?pvs=21)
- #11🧩 [11. Sérialisation d’objet en Java](https://www.notion.so/Java-8-17-Interview-227fafae3b63800ea158e98def373f36?pvs=21)
- #12🧩 [12. Autres nouvelles concept en Java](https://www.notion.so/Java-8-17-Interview-227fafae3b63800ea158e98def373f36?pvs=21)

---

### ✅ Design Patterns fréquemment en Java

| attern | Catégorie | Utilité principale | Exemple clé (Java) |
| --- | --- | --- | --- |
| **Singleton** | Créationnel | Une seule instance globale | `Singleton.getInstance()` |
| **Factory Method** | Créationnel | Créer des objets sans exposer leur logique de construction | `AnimalFactory.create("dog")` |
| **Builder** | Créationnel | Construire un objet complexe étape par étape | `new User.Builder().setName("X").build()` |
| **Strategy** | Comportemental | Choisir dynamiquement un algorithme parmi plusieurs | `new Sorter(new QuickSort()).sort(data)` |
| **Observer** | Comportemental | Notifier plusieurs objets automatiquement | `publisher.addObserver(); observer.update()` |
| **Decorator** | Structurel | Ajouter des fonctionnalités sans modifier la classe d’origine | `new AuthDecorator(new Page()).render()` |
| **Adapter** | Structurel | Adapter une interface incompatible | `new Adapter(adaptee).request()` |
| **Proxy** | Structurel | Contrôler l’accès à un objet (caché, sécurisé, distant) | `Image image = new ProxyImage("img.png")` |
| **Template Method** | Comportemental | Définir une structure d’algorithme tout en laissant les étapes modifiables | `abstract class Report { generate(); }` |
| **Command** | Comportemental | Encapsuler une action dans un objet pour l’exécuter plus tard | `command.execute()` |

**1. Singleton – Une seule instance globale**

```java
public class Config {
    private static final Config instance = new Config();
    private Config() {}
    public static Config getInstance() {
        return instance;
    }
}
```

---

**2. Factory Method – Création d’objets via une méthode**

```java
interface Animal {
    void speak();
}
class Dog implements Animal {
    public void speak() { System.out.println("Woof"); }
}
class AnimalFactory {
    public static Animal create(String type) {
        return "dog".equals(type) ? new Dog() : null;
    }
}
```

---

**3. Builder – Construction fluide d’un objet**

```java
class User {
    private String name;
    private int age;

    public static class Builder {
        private String name;
        private int age;

        public Builder setName(String name) { this.name = name; return this; }
        public Builder setAge(int age) { this.age = age; return this; }

        public User build() {
            User u = new User();
            u.name = name;
            u.age = age;
            return u;
        }
    }
}
```

---

**4. Strategy – Algorithme interchangeable à l’exécution**

```java
interface PaymentStrategy {
    void pay();
}
class CreditCard implements PaymentStrategy {
    public void pay() { System.out.println("Pay with card"); }
}
class PaymentProcessor {
    private PaymentStrategy strategy;
    public PaymentProcessor(PaymentStrategy strategy) {
        this.strategy = strategy;
    }
    public void process() {
        strategy.pay();
    }
}
```

---

**5. Observer – Notification automatique des abonnés**

```java
interface Observer {
    void update(String msg);
}
class Client implements Observer {
    public void update(String msg) {
        System.out.println("Received: " + msg);
    }
}
class Server {
    private List<Observer> observers = new ArrayList<>();
    public void add(Observer o) { observers.add(o); }
    public void notifyAll(String msg) {
        observers.forEach(o -> o.update(msg));
    }
}
```

---

**6. Decorator – Ajouter un comportement dynamiquement**

```java
interface Notifier {
    void send();
}
class EmailNotifier implements Notifier {
    public void send() { System.out.println("Email sent"); }
}
class SMSDecorator implements Notifier {
    private Notifier notifier;
    public SMSDecorator(Notifier notifier) { this.notifier = notifier; }
    public void send() {
        notifier.send();
        System.out.println("SMS sent");
    }
}
```

---

**7. Adapter – Adapter une interface incompatible**

```java
interface Target {
    void request();
}
class Adaptee {
    public void specificRequest() {
        System.out.println("Adapted call");
    }
}
class Adapter implements Target {
    private Adaptee adaptee = new Adaptee();
    public void request() {
        adaptee.specificRequest();
    }
}
```

---

**8. Proxy – Contrôle d’accès à un objet**

```java
interface Image {
    void display();
}
class RealImage implements Image {
    public void display() { System.out.println("Displaying image"); }
}
class ProxyImage implements Image {
    private RealImage realImage;
    public void display() {
        if (realImage == null) realImage = new RealImage();
        realImage.display();
    }
}
```

---

**9. Template Method – Algorithme avec étapes fixes**

```java
abstract class Report {
    public final void generate() {
        header();
        content();
        footer();
    }
    abstract void content();
    void header() { System.out.println("Header"); }
    void footer() { System.out.println("Footer"); }
}
class PDFReport extends Report {
    void content() { System.out.println("PDF content"); }
}
```

---

**10. Command – Encapsulation d’une action**

```java
interface Command {
    void execute();
}
class PrintCommand implements Command {
    public void execute() {
        System.out.println("Printing document");
    }
}
class CommandExecutor {
    public void run(Command command) {
        command.execute();
    }
}
```

## 🧩 1. Encapsulation et Modificateurs d’accès

### Explication :

- L’**encapsulation** cache les détails internes d’une classe en rendant ses champs privés et en exposant des **getters/setters**.
- Modificateurs :
    - `private` : accessible uniquement dans la classe
    - `protected` : accessible dans le même package ou par héritage
    - `public` : accessible partout
    - (aucun mot-clé) = package-private

### Exemple :

```java
public class Person {
    private String name;  // caché

    public String getName() {  // exposé
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }
}
```

---

## 🧩 2. Abstraction avec Classes Abstraites

### Explication :

- Une classe `abstract` ne peut pas être instanciée.
- Peut contenir des méthodes abstraites (sans corps) ET des méthodes concrètes (avec corps).
- Sert de modèle à plusieurs classes.

### Exemple :

```java
abstract class Animal {
    abstract void makeSound();

    public void eat() {
        System.out.println("Eating...");
    }
}

class Dog extends Animal {
    @Override
    void makeSound() {
        System.out.println("Woof!");
    }
}
```

---

## 🧩 3. Abstraction avec Interfaces (Java 8+)

### Explication :

- Une **interface** ne peut pas être instanciée.
- Toutes les méthodes sont abstraites par défaut (Java 8 autorise `default` et `static` avec corps).
- Une classe peut implémenter plusieurs interfaces.

### Exemple :

```java
interface Flyable {
    void fly();

    default void land() {
        System.out.println("Landing...");
    }
}

class Bird implements Flyable {
    @Override
    public void fly() {
        System.out.println("Flying...");
    }
}
```

---

## ## Différences entre **Classe Abstraite** et **Interface** en Java

Une **classe abstraite** sert à factoriser du code commun avec un état et des méthodes partiellement implémentées, tandis qu’une **interface** sert à définir un **contrat** que plusieurs classes peuvent respecter, sans partager d’état commun. Depuis Java 8, les interfaces peuvent contenir des méthodes avec une implémentation via le mot-clé `default`.

| Point | **Classe Abstraite** | **Interface** |
| --- | --- | --- |
| **Mot-clé** | `abstract class` | `interface` |
| **Héritage/Implémentation** | Une classe peut hériter d'une seule classe abstraite (`extends`) | Une classe peut implémenter plusieurs interfaces (`implements`) |
| **Constructeur** | ✅ Peut avoir un constructeur | ❌ Pas de constructeur |
| **Variables (Attributs)** | Peut contenir des **attributs d’instance** (avec état) | Les variables sont par défaut `public static final` (constantes) |
| **Méthodes** | Peut avoir :• Méthodes abstraites• Méthodes concrètes | Peut avoir :• Méthodes abstraites• Méthodes `default` (Java 8+)• Méthodes `static`• Méthodes `private` (Java 9+) |
| **Usage principal** | Sert de **modèle partiellement défini** pour plusieurs sous-classes | Sert à définir un **contrat** sans comportement concret (avant Java 8) |
| **Multiple héritage ?** | ❌ Non (1 seule classe mère) | ✅ Oui (plusieurs interfaces) |
| **Exemple d'utilisation typique** | Quand il y a un **comportement commun réutilisable** | Quand on veut **imposer un contrat sans état** |

---

## 🔑 Exemple Comparatif :

### ➤ Classe Abstraite :

```java
abstract class Animal {
    String name;

    public Animal(String name) {
        this.name = name;
    }

    abstract void makeSound();

    public void eat() {
        System.out.println(name + " is eating");
    }
}

class Dog extends Animal {
    public Dog(String name) {
        super(name);
    }

    @Override
    void makeSound() {
        System.out.println("Woof");
    }
}
```

---

### ➤ Interface (Java 8+) :

```java
interface Flyable {
    void fly();  // méthode abstraite

    default void land() {   // méthode concrète (possible depuis Java 8)
        System.out.println("Landing...");
    }
}

class Bird implements Flyable {
    public void fly() {
        System.out.println("Flying");
    }
}
```

---

## 🚀 Depuis Java 8 et 17 :

| Version | Nouveautés clés |
| --- | --- |
| **Java 8** | Interfaces peuvent avoir `default` et `static` |
| **Java 9** | Interfaces peuvent avoir des méthodes `private` |
| **Java 17** | Pas de changement majeur mais possibilité d'utiliser `sealed` pour contrôler l'héritage (applicable aux classes abstraites et interfaces) |

## 🧩 4. Méthodes Abstraites

Ce sont les méthodes déclarées sans corps qu'on retrouve dans les classes abstraites ou les interfaces.

Exemple vu plus haut avec `abstract void makeSound();`.

## 🧩 5. Héritage avec `extends`

### Explication :

- Permet à une classe d’hériter d’une autre.

### Exemple :

```java
class Animal {
    public void breathe() {
        System.out.println("Breathing...");
    }
}

class Cat extends Animal {
    public void meow() {
        System.out.println("Meow...");
    }
}
```

---

## 🧩 6. Polymorphisme

### Overloading (Surcharge) :

Plusieurs méthodes avec le même nom mais des paramètres différents :

```java
public class Calculator {
    public int add(int a, int b) {
        return a + b;
    }

    public double add(double a, double b) {
        return a + b;
    }
}
```

### Override (`@Override`)

### Explication :

- L’annotation @Override indique qu’on redéfinit une méthode d’une classe parent ou interface.

### Exemple :

```java
class Parent {
    public void show() {
        System.out.println("Parent show");
    }
}

class Child extends Parent {
    @Override
    public void show() {
        System.out.println("Child show");
    }
}
```

---

## 🧩 7. Interfaces Multiples

### Explication :

- Une classe peut implémenter **plusieurs interfaces**, contrairement à l’héritage classique (une seule classe parent).

### Exemple :

```java
interface Swimmable {
    void swim();
}

interface Runnable {
    void run();
}

class Frog implements Swimmable, Runnable {
    public void swim() { System.out.println("Swimming"); }
    public void run() { System.out.println("Running"); }
}
```

## 🧩 8-1. Collections API Java

| Type | Interface Principale | Caractéristiques principales | Implémentations courantes | Exemple de code |
| --- | --- | --- | --- | --- |
| **Liste** (`List`) | `List<E>` | - Ordonnée- Autorise les doublons- Accès par index | `ArrayList`, `LinkedList`, `Vector` | `java List<String> list = new ArrayList<>(); list.add("A"); list.add("B");` |
| **Ensemble** (`Set`) | `Set<E>` | - Pas de doublons- Non ordonné (HashSet) ou trié (TreeSet) | `HashSet`, `TreeSet`, `LinkedHashSet` | `java Set<String> set = new HashSet<>(); set.add("A"); set.add("B");` |
| **Map** (`Map`) | `Map<K, V>` | - Clé/Valeur- Pas de doublons sur les clés | `HashMap`, `TreeMap`, `LinkedHashMap` | `java Map<Integer, String> map = new HashMap<>(); map.put(1, "One");` |
| **Queue/Pile** (`Queue`, `Deque`) | `Queue<E>`, `Deque<E>` | - Structure FIFO (Queue) ou LIFO (Deque/Pile)- Ordonnée | `LinkedList`, `PriorityQueue`, `ArrayDeque` | `java Queue<String> queue = new LinkedList<>(); queue.add("A");` |

---

### 🔑 Explications Rapides & Différences :

### 1. **List vs Set**

| Critère | List | Set |
| --- | --- | --- |
| **Ordre** | Oui (garde l'ordre d'insertion) | Non (HashSet), Oui (LinkedHashSet) |
| **Doublons** | Autorisés | Non autorisés |
| **Accès Index** | Oui (`list.get(0)`) | Non |

✅ Exemple :

```java
java
CopyEdit
List<String> myList = new ArrayList<>();
myList.add("Apple");
myList.add("Apple"); // OK, doublon autorisé

Set<String> mySet = new HashSet<>();
mySet.add("Apple");
mySet.add("Apple"); // Doublon ignoré

```

---

### 2. **Set vs Map**

| Critère | Set | Map |
| --- | --- | --- |
| **Stocke** | Valeurs uniques | Paires Clé/Valeur |
| **Doublons** | Pas de doublons sur les valeurs | Pas de doublons sur les clés |

✅ Exemple :

```java
java
CopyEdit
Set<String> mySet = new HashSet<>();
mySet.add("Red");

Map<Integer, String> myMap = new HashMap<>();
myMap.put(1, "Red");
myMap.put(1, "Blue"); // Remplace la valeur

```

---

### 3. **List vs Map**

| Critère | List | Map |
| --- | --- | --- |
| **Type** | Collection de valeurs | Association clé → valeur |
| **Accès** | Par index (`list.get(0)`) | Par clé (`map.get(key)`) |
| **Doublons** | Autorisés | Pas sur les clés |

---

### 4. **Queue vs Deque**

| Critère | Queue (FIFO) | Deque (Double-ended) |
| --- | --- | --- |
| **Insertion** | Ajout fin, retrait début | Ajout/retrait aux deux extrémités |
| **Implémentations** | `PriorityQueue`, `LinkedList` | `ArrayDeque` |

✅ Exemple :

```java
java
CopyEdit
Queue<String> queue = new LinkedList<>();
queue.add("First");
queue.add("Second");
queue.poll();  // Retire "First"

Deque<String> stack = new ArrayDeque<>();
stack.push("Top");
stack.pop();  // Retire "Top"

```

---

✅ **Résumé visuel :**

| Interface | Ordre | Doublons | Accès rapide | Type |
| --- | --- | --- | --- | --- |
| **List** | ✅ | ✅ | Par index | Valeurs |
| **Set** | ❌/✅ | ❌ | Pas d'index | Valeurs uniques |
| **Map** | ❌/✅ | Clés ❌ | Par clé | Clé → Valeur |
| **Queue** | ✅ | ✅ | FIFO | Valeurs |
| **Deque** | ✅ | ✅ | FIFO ou LIFO | Valeurs |

## 🧩 8-2. Collections Immuables (Java 9+):

Empêche la modification de la collection une fois créée

```java
List<String> list = List.of("A", "B", "C"); // Immuable
```

## 🧩 8-3. Tri & Recherche :

### Tri avec `Collections.sort()` et `Comparable`

- `Collections.sort()` permet de trier une liste d’objets.
- Pour trier des objets personnalisés, la classe doit implémenter l’interface `Comparable` et redéfinir la méthode `compareTo`.

**Exemple :**

```java
public class Person implements Comparable<Person> {
    private String name;
    private int age;

    public Person(String name, int age) {
        this.name = name;
        this.age = age;
    }

    public String toString() {
        return name + " (" + age + ")";
    }

    @Override
    public int compareTo(Person other) {
        return Integer.compare(this.age, other.age);  // Tri par âge croissant
    }
}
```

```java
List<Person> people = new ArrayList<>();
people.add(new Person("John", 30));
people.add(new Person("Alice", 25));
Collections.sort(people);
System.out.println(people);  // Alice (25), John (30)
```

- `compareTo` retourne :
    - Un nombre négatif si `this < other`
    - Zéro si égal
    - Un nombre positif si `this > other`

## 🧩 9. Gestion des Exceptions en Java

**1. Types d'exceptions**

- **Checked Exceptions** : vérifiées à la compilation (IOException, SQLException)
- **Unchecked Exceptions** : héritent de `RuntimeException` (NullPointerException, ArithmeticException)
- **Errors** : graves (OutOfMemoryError)

**Exemple :**

```java
// Checked Exception
throw new IOException("Fichier non trouvé");

// Unchecked Exception
throw new NullPointerException("Objet null");
```

---

**2. Bloc try-catch-finally**

- `try` : bloc où une exception peut se produire.
- `catch` : capture et traite l'exception.
- `finally` : toujours exécuté (libération de ressources).

**Exemple :**

```java
try {
    int result = 10 / 0;
} catch (ArithmeticException e) {
    System.out.println("Erreur : division par zéro");
} finally {
    System.out.println("Bloc finally exécuté");
}
```

---

**3. Propagation avec throws**

- Utilisé pour indiquer qu'une méthode peut lever une exception à gérer ailleurs.

**Exemple :**

```java
public void readFile() throws IOException {
    throw new IOException("Erreur de lecture");
}
```

---

**4. Création d’une exception personnalisée**

- Étendre `Exception` (checked) ou `RuntimeException` (unchecked).

**Exemple :**

```java
public class MyException extends Exception {
    public MyException(String message) {
        super(message);
    }
}
```

### Étape 1 : Créer l’exception personnalisée

```java
public class InvalidAgeException extends Exception {
    public InvalidAgeException(String message) {
        super(message);
    }
}
```

---

### Étape 2 : Lancer l’exception (`throw`)

```java
public class Person {
    public void setAge(int age) throws InvalidAgeException {
        if (age < 0) {
            throw new InvalidAgeException("L'âge ne peut pas être négatif");
        }
        System.out.println("Âge accepté : " + age);
    }
}
```

---

### Étape 3 : Capturer l’exception (`try-catch`)

```java
public class Main {
    public static void main(String[] args) {
        Person person = new Person();
        try {
            person.setAge(-5);
        } catch (InvalidAgeException e) {
            System.out.println("Erreur capturée : " + e.getMessage());
        }
    }
}
```

## 🧩 10. Input/Output et Sérialisation en Java

**1. Gestion de fichiers avec l’API File**

- `File` représente un fichier ou un dossier.

**Exemple :**

```java
File file = new File("test.txt");
System.out.println(file.exists());
```

---

**2. Lecture/Écriture avec FileReader et FileWriter**

- Utilisé pour lire ou écrire du texte caractère par caractère.

**Exemple :**

```java
FileWriter writer = new FileWriter("test.txt");
writer.write("Bonjour");
writer.close();

FileReader reader = new FileReader("test.txt");
int c;
while ((c = reader.read()) != -1) {
    System.out.print((char)c);
}
reader.close();
```

---

**3. Streams binaires : InputStream et OutputStream**

- Permet de lire/écrire des données binaires (images, PDF).

**Exemple :**

```java
FileInputStream fis = new FileInputStream("image.png");
FileOutputStream fos = new FileOutputStream("copy.png");

int b;
while ((b = fis.read()) != -1) {
    fos.write(b);
}
fis.close();
fos.close();
```

---

**4. BufferedReader / BufferedWriter : plus performant**

- Lecture/écriture ligne par ligne avec buffer pour de meilleures performances.

**Exemple :**

```java
BufferedReader reader = new BufferedReader(new FileReader("test.txt"));
String line;
while ((line = reader.readLine()) != null) {
    System.out.println(line);
}
reader.close();

BufferedWriter writer = new BufferedWriter(new FileWriter("test.txt"));
writer.write("Ligne rapide");
writer.newLine();
writer.close();
```

---

## 🧩 11. Sérialisation d’objet en Java

- Sauvegarder/restaurer un objet en binaire avec `Serializable`.

**Exemple :**

```java
public class Person implements Serializable {
    private String name;
}

ObjectOutputStream oos = new ObjectOutputStream(new FileOutputStream("person.ser"));
oos.writeObject(new Person());
oos.close();

ObjectInputStream ois = new ObjectInputStream(new FileInputStream("person.ser"));
Person p = (Person) ois.readObject();
ois.close();
```

| Cas d’usage | Type de sérialisation | Exemple |
| --- | --- | --- |
| JPA cache/session | Java native (`Serializable`) | `implements Serializable` |
| REST API (Spring) | JSON | Utilise Jackson ou Gson |
| Sauvegarde en fichier | Java binaire | `ObjectOutputStream` |
| Transmission réseau brut | Java binaire | `Serializable` + Sockets |

## 🧩 12. Autres nouvelles concept en Java

### 1. **Lambda Expressions (Java 8)**

**Définition :** Syntaxe concise pour les fonctions anonymes (sans `new`, sans classe anonyme).

**Exemple :**

```java
Runnable r = () -> System.out.println("Hello");
r.run();
```

---

### 2. **Functional Interfaces**

**Définition :** Interface avec une seule méthode abstraite, utilisée avec les lambdas. Marquée avec `@FunctionalInterface`.

**Exemple :**

```java
@FunctionalInterface
interface Calculator {
    int compute(int a, int b);
}

Calculator add = (a, b) -> a + b;
System.out.println(add.compute(5, 3)); // 8
```

---

### 3.1. **Stream API (Java 8)**

**Définition :** Permet de traiter des collections de manière fonctionnelle (map, filter, reduce…).

**Exemple :**

```java
List<String> names = List.of("Ali", "Amine", "Zineb");
names.stream()
     .filter(n -> n.startsWith("A"))
     .map(String::toUpperCase)
     .forEach(System.out::println);
```

---

### 3.2. **Parallel Stream**

**Définition :**

Exécute les opérations stream en parallèle (multi-thread) pour **gagner en performance** sur de grandes collections.

**Exemple :**

```java
java
CopyEdit
List<Integer> numbers = IntStream.range(1, 1_000_000).boxed().toList();

long start = System.currentTimeMillis();
numbers.parallelStream().filter(n -> n % 2 == 0).count();
System.out.println("Parallel took: " + (System.currentTimeMillis() - start) + " ms");

```

**Remarques :**

- Peut améliorer ou **dégrader les performances** selon la tâche.
- À utiliser pour des traitements lourds (CPU-bound).

### 3.3. **Collectors (java.util.stream.Collectors)**

**Définition :**

API pour collecter les résultats d’un stream (liste, map, groupement…).

**Exemples :**

```java
java
CopyEdit
List<String> names = List.of("Ali", "Amine", "Zineb");

List<String> upperNames = names.stream()
    .map(String::toUpperCase)
    .collect(Collectors.toList());

```

Autres cas :

```java
java
CopyEdit
String joined = names.stream().collect(Collectors.joining(", ")); // Ali, Amine, Zine

```

### 4. **Optional (Java 8)**

**Définition :** Conteneur pour éviter les `null`, utilisé pour gérer l’absence de valeur sans `NullPointerException`.

**Exemple :**

```java
Optional<String> name = Optional.ofNullable(null);
System.out.println(name.orElse("Inconnu")); // Inconnu
```

---

### 5. **Date/Time API (Java 8)**

**Définition :** Nouvelle API (`java.time`) pour gérer les dates et heures sans bugs de `Date`/`Calendar`.

**Exemple :**

```java
LocalDate date = LocalDate.now();
LocalDate tomorrow = date.plusDays(1);
System.out.println(tomorrow);
```

---

### 6. **Switch Expressions (Java 17)**

**Définition :** Syntaxe simplifiée du switch, retourne une valeur.

**Exemple :**

```java
int day = 2;
String result = switch (day) {
    case 1 -> "Lundi";
    case 2 -> "Mardi";
    default -> "Autre";
};
System.out.println(result);
```

---

### **7. Records (Java 16/17)**

**Définition :**

Un record est une classe spéciale immuable, utile pour représenter des "données pures" (DTO, réponses d’API, etc.).

Il génère automatiquement :

- le constructeur
- les accesseurs (`get`)
- `toString()`, `equals()`, `hashCode()`

**Syntaxe :**

```java
public record Person(String name, int age) {}
```

**Utilisation :**

```java
Person p = new Person("Ali", 30);
System.out.println(p.name());  // Ali
System.out.println(p.age());   // 30
```

**Avantages :**

- Code très court pour des objets de données
- Immédiatement immuable
- Idéal pour REST APIs, projections JPA, etc.

**Limites :**

- Tous les champs sont `final`
- Pas de logique métier complexe dans le record
- Pas de support direct pour l’héritage classique

---

### 8. **Sealed Classes (Java 17)**

**Définition :**

Une classe `sealed` restreint les classes qui peuvent en hériter. Cela permet de mieux contrôler la hiérarchie d'héritage.

**Syntaxe :**

```java
public sealed class Shape permits Circle, Square {}

final class Circle extends Shape {}
final class Square extends Shape {}
```

**Règles :**

- Une classe `sealed` doit déclarer explicitement les sous-classes permises avec `permits`
- Les sous-classes doivent être soit `final`, soit `sealed`, soit `non-sealed`

**Utilité :**

- Renforce la sécurité et la maintenabilité du code
- Facilite l’exhaustivité dans les `switch` avec `instanceof`

**Cas d’usage :**

- API publique stable avec des sous-types bien définis
- Moteurs de règles, modèles de données fermés, etc.

---

### 9. **var Keyword (Java 10+)**

**Définition :** Inférence de type automatique (uniquement pour variables locales).

**Exemple :**

```java
var message = "Bonjour";  // déduit comme String
System.out.println(message.length());
```

---

### 10. **Pattern Matching for `instanceof` (Java 16 preview, stabilisé Java 17)**

**Définition :**

Permet de combiner `instanceof` et cast dans une seule instruction, ce qui rend le code plus concis et lisible.

**Avant (Java <16) :**

```java
if (obj instanceof String) {
    String s = (String) obj;
    System.out.println(s.toLowerCase());
}
```

**Depuis Java 16+ :**

```java
if (obj instanceof String s) {
    System.out.println(s.toLowerCase());
}
```

**Avantages :**

- Réduit le code répétitif (pas besoin de cast)
- Plus clair, plus sûr (moins d’erreurs de cast)

**Utilisation avancée :**

Combine bien avec `switch` exhaustif et `sealed classes` pour construire des blocs de contrôle clairs.

### 10. **Method References (`::`)**

**Définition :**

Syntaxe raccourcie pour appeler une méthode existante au lieu d’écrire une lambda.

**Types :**

- `object::instanceMethod`
- `Class::staticMethod`
- `Class::instanceMethod` (pour chaque élément)

**Exemples :**

```java
java
CopyEdit
List<String> list = List.of("Java", "Spring", "Angular");

// Lambda
list.forEach(s -> System.out.println(s));

// Method Reference
list.forEach(System.out::println);

```

Autre exemple :

```java
java
CopyEdit
list.sort(String::compareToIgnoreCase);  // équivalent à (a, b) -> a.compareToIgnor

```