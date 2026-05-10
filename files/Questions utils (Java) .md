# Questions utils (Java)

[Question utils JAVA - detailled](https://www.notion.so/Question-utils-JAVA-detailled-231fafae3b63807cb950cec86fd669f0?pvs=21)

## **1. Plateforme & exécution**

**Q : Pourquoi Java est‑il considéré comme indépendant de la plateforme ?**

**R :** Le code source est compilé en **bytecode** (*.class*) exécuté par la **JVM**. Il suffit qu’une JVM adaptée existe pour l’OS/hardware cible ; le même bytecode s’exécute partout.

**Q : La JVM est‑elle indépendante de la plateforme ?**

**R :** Non : la JVM est spécifique à chaque plateforme (Windows, Linux, macOS, ARM…) mais toutes implémentent la même spécification.

**Q : Le JDK et le JRE sont‑ils indépendants de la plateforme ?**

**R :** Comme la JVM, ils sont fournis en distributions binaires distinctes par OS/architecture, mais la spécification reste identique.

**Q : Différence entre JDK et JRE ?**

**R :** *JDK* = JRE + outils de développement (javac, javadoc, jlink…).

*JRE* = JVM + bibliothèque standard (rt.jar / modules).

---

## **2. Distributions Java**

**Q : Quelles différences entre Oracle JDK et OpenJDK ?**

**R :** OpenJDK est l’implémentation open‑source officielle. Oracle JDK ajoute quelques binaires, installateurs et du support commercial ; depuis Java 17, le code est quasiment identique, seule la licence change (Oracle No‑Fee Terms vs GPL + classpath exception).

**Q : Qu’est‑ce qu’une version LTS ? Quelle est la dernière LTS ?**

**R :** *Long‑Term Support* : supportée 8 ans (Oracle) / 4 ans (Adoptium). Au 15 juillet 2025, la dernière LTS est **Java 21** (sept. 2023).

---

## **3. Modificateurs & mots‑clés**

**Q : Quels sont les modificateurs d’accès en Java ?**

**R :** `public`, `protected`, (package‑private) et `private`.

**Q : Expliquez `protected`.**

**R :** Accessible dans le même package **ou** dans les sous‑classes, même hors package.

**Q : Que signifie le mot‑clé `final` ?**

**R :** • Variable : valeur assignée une seule fois.

- Méthode : non redéfinissable (`override` interdit).
- Classe : non héritée.
- Référence d’objet : la *référence* immuable, pas l’état interne.

**Q : Quel mot‑clé permet de définir une méthode avec corps dans une inte** face ?

**R :** `default` (Java 8) ; `static` est aussi autorisé.

**Q : Qu’est‑ce que le type casting ?**

**R :** Conversion d’un type vers un autre. *Implicit* (widening) ou *explicit* `(Type)` (narrowing).

**Q : Qu’est‑ce que l’opérateur ternaire ?**

**R :** `condition ? exprSiVrai : exprSiFaux`. Évalue une expression selon la condition.

---

## **4. POO et concepts fondamentaux**

**Q : Quels sont les piliers de la POO ?**

**R :** Encapsulation, Abstraction, Héritage, Polymorphisme.

**Q : À quoi sert l’encapsulation ?**

**R :** Cacher l’état interne ; exposer une API stable via getters/setters → robustesse et contrôle des invariants.

**Q : Différence classe / objet ?**

**R :** Classe = plan de construction ; Objet = instance concrète en mémoire.

**Q : Qu’est‑ce qu’un constructeur ? Types ?**

**R :** Méthode spéciale qui initialise l’objet. Types : par défaut (sans paramètres), paramétré et copie.

**Q : Ordre d’exécution (blocs) en Java ?**

**R :** 1) Blocs `static`, 2) Blocs d’instanciation, 3) Constructeur.

---

## **5. Classes abstraites, interfaces & immutabilité**

**Q : Qu’est‑ce qu’une classe abstraite ?**

**R :** Classe partiellement implémentée (peut contenir état & méthodes concrètes) qu’on ne peut pas instancier.

**Q : Différence interface / classe abstraite ?**

**R :** Interface : contrat 100 % abstrait jusqu’à Java 7 ; depuis Java 8, méthodes `default/static` possibles mais pas d’état mutable. Classe abstraite : peut avoir constructeur, champs d’instance et logique partagée.

**Q : Une interface peut‑elle être instanciée ?**

**R :** Non, mais on peut créer une *classe anonyme* qui l’implémente.

**Q : Interface *Marker* vs *Functional Interface* ?**

**R :** *Marker* : sans méthode (ex. `Serializable`). *Functional* : exactement **une** méthode abstraite (`@FunctionalInterface`), utilisable en **lambda**.

**Q : Qu’est‑ce qu’un objet immuable ? Comment créer une classe immuable ?**

**R :** État qui ne change jamais après construction.

→ déclarer tous les champs `final`, privés, initialiser dans le constructeur, ne pas exposer de setters et retourner des copies défensives pour les objets mutables.

---

## **6. Collections & Streams**

**Q : Différence `List` vs `Set` vs `Map` ?**

**R :** `List` : ordonnée, indexée, doublons autorisés.

`Set` : pas de doublons, ordre non garanti (sauf `LinkedHashSet`/`TreeSet`).

`Map` : paires clé/valeur.

**Q : Implémentations courantes de `List` et `Set` ?**

**R :** `ArrayList`, `LinkedList` ; `HashSet`, `LinkedHashSet`, `TreeSet`.

**Q : Comment parcourir une collection ?**

**R :** Boucle `for`, `Iterator`, `for‑each`, **Streams** (`collection.stream().forEach()`).

**Q : Différence Collections vs Streams ?**

**R :** Collection = structure de données **in‑memory**. Stream = **pipeline** d’opérations fonctionnelles, potentiellement paresseuses, pouvant être parallèles (`.parallel()`).

**Q : Méthodes clés des Streams ?**

**R :** `map`, `filter`, `sorted`, `distinct`, `limit`, `collect`, `reduce`, `flatMap`.

**Q : Comment garantir l’unicité dans un `Set` ?**

**R :** Fournir une implémentation correcte de `equals()` + `hashCode()`, ou utiliser un `TreeSet` avec un `Comparator`.

**Q : Différence entre `ArrayList` et `LinkedList` ? ?**

**R :** `ArrayList`: accès rapide (index), mais lent pour insertions. `LinkedList`: insertions/suppressions rapides, accès lent.

**Q : Design Patterns avec exemple (Singleton, Factory) ?**

**R :** `Singleton` = 1 seule instance `Factory` = instanciation dynamique sans exposer le constructeur.

---

## **7. Exceptions & erreurs**

**Q : Qu’est‑ce qu’une exception ? Types ?**

**R :** *Checked* (obligatoire de déclarer : `IOException`) et *Unchecked* (`RuntimeException` et ses filles).

**Q : Différence Exception / Error ?**

**R :** `Error` signale un problème JVM (OOM, StackOverflow) → généralement non récupérable. `Exception` représente des erreurs applicatives.

**Q : Règles d’override pour les exceptions ?**

**R :** Une méthode redéfinie ne peut déclarer **que** les mêmes exceptions ou des sous‑classes des exceptions de la méthode parent.

---

## **8. Méthodes statiques vs non statiques**

**Q : Différence méthode statique / non statique ?**

**R :** Statique : liée à la *classe* ; pas d’accès implicite à `this`. Non statique : liée à l’*instance*.

---

## **9. Opérations équivalence**

**Q : Différence `==` vs `.equals()` ?**

**R :** `==` compare les références mémoire (ou valeurs primitives), `.equals()` compare la *valeur logique* si redéfini.

**Q : Différence `size` (Collections) / `length` (tableaux/String) ?**

**R :** `size()` est une méthode (collection), `length` est un champ (tableau) ou une méthode pour `String`.

---

## **10. Nouveautés du langage**

**Q : Nouveautés clés de Java 8 ?**

**R :** Lambdas, Streams, `Optional`, `default` methods, API Date/Time (`java.time`), Nashorn, `CompletableFuture`.

**Q : Nouveautés Java 11 ?**

**R :** `var` en lambda, API `HttpClient`, méthodes `String.isBlank`, `repeat`, `lines`, exécuter fichier `.java` sans `javac`, Epsilon GC.

**Q : Nouveautés Java 17 ?**

**R :** Classes *sealed*, classes *record*, switch (pattern matching preview), blocs de texte (`"""…"""`), `PatternMatcher` preview, Foreign Function & Memory API (incub.), JEP 356 (*Enhanced Pseudo‑Random*).

**Q : Nouveautés (preview) Java 21 ?**

**R :** *Record Patterns*, *Pattern Matching for switch* finalisé, *String Templates* preview, Virtual Threads (*Project Loom*), Scoped Values.

**Q : À quoi sert `Optional` ?**

**R :** Éviter `NullPointerException` en représentant de façon explicite la présence/absence d’une valeur. Ex.

```java
java
CopyEdit
userRepository.findById(id)
              .map(User::getEmail)
              .orElse("n/a");

```

**Q : `Predicate.negate()` ?**

**R :** Méthode défaut qui retourne un prédicat logique inversé : `p.negate()` ≡ `x -> !p.test(x)`.

---

## **11. Design d’applications & architecture**

**Q : Quelles architectures de projet connaissez‑vous ?**

**R :** Monolithique 3‑tiers, Hexagonale, Microservices, Serverless, Event‑Driven.

**Q : Avantages des microservices ?**

**R :** Scalabilité fine, déploiement indépendant, résilience, polyglottisme, ownership d’équipe.

**Q : Types de WebServices ?**

**R :** SOAP (WS‑*, XML), REST (HTTP JSON), GraphQL, gRPC.

---

## **12. Build & dépendances**

**Q : C’est quoi Maven ?**

**R :** Outil de build et gestion de dépendances basé sur `pom.xml`, cycle de vie (validate→package→install→deploy).

**Q : Héritage de dépendances Maven ?**

**R :** Un module peut hériter (`<parent>`) d’un `pom` parent qui définit versions & plugins partagés ; notion de *Bill Of Materials*.

---

## **13. Spring / Spring Boot**

**Q : Qu’est‑ce que Spring Boot ?**

**R :** Sur‑couche opinionée de Spring Framework ; fournit **auto‑configuration**, starter POMs, serveur embarqué, *Spring CLI* → démarrage rapide.

**Q : Avantages Spring Boot vs Spring « core » ?**

**R :** Moins de configuration XML, **démarrage prêt‑à‑l’emploi**, health‑checks, actuator, embedded tomcat.

**Q : Annotations Spring Boot courantes ?**

**R :** `@SpringBootApplication`, `@RestController`, `@Service`, `@Repository`, `@Configuration`, `@Component`, `@Autowired`, `@Value`, `@Qualifier`, `@Primary`.

**Q : Différence `@Controller` / `@RestController` ?**

**R :** `@RestController` = `@Controller` + `@ResponseBody` implicite (retour JSON). `@Controller` peut renvoyer une vue (Thymeleaf…).

**Q : Comment Spring crée un Bean ?**

**R :** Scanne les classes annotées (`@Component`, etc.) à l’initialisation, instancie et injecte via le **IoC container** selon le scope.

**Q : Scopes disponibles ?**

**R :** `singleton` (défaut), `prototype`, `request`, `session`, `application`, `websocket`.

**Q : Injection de dépendance (DI) vs Inversion of Control (IoC) ?**

**R :** DI est un *pattern* ; IoC est le principe global où le conteneur contrôle la création des objets.

**Q : Rôle de `@Primary` & `@Qualifier` ?**

**R :** `@Primary` marque le bean préféré lors d’un type multiple ; `@Qualifier("nom")` choisit explicitement un bean particulier.

**Q : `@ComponentScan` ?**

**R :** Indique les packages à scanner pour détecter les composants Spring.

**Q : `@Transactional` ?**

**R :** Gère les transactions JDBC/JPA ; crée un proxy ; commit/rollback automatique.

**Q : Spring AOP ?**

**R :** Programmation orientée aspects ; séparer cross‑cutting concerns (logging, sécurité) via proxys et *join points*.

**Q : Clients REST Spring Boot ?**

**R :** `RestTemplate` (legacy), **`WebClient`** (réactif), *Feign*.

---

## **14. Hibernate / JPA**

**Q : Qu’est‑ce qu’Hibernate ?**

**R :** Framework ORM implémentant JPA ; mappe objets ↔ tables, gère cache, transactions.

**Q : HQL vs SQL ?**

**R :** HQL est orienté *objet* (entités, noms d’attributs) et indépendant de la base.

**Q : États d’un objet Hibernate ?**

**R :** *Transient*, *Persistent*, *Detached*, *Removed*.

**Q : Stratégies de fetch ?**

**R :** *Eager* (immédiat) et *Lazy* (à la demande).

**Q : Méthodes de récupération ?**

**R :** `session.find`, `get`, `load`, `createQuery`.

**Q : Annotations JPA courantes ?**

**R :** `@Entity`, `@Id`, `@GeneratedValue`, `@Table`, `@Column`, `@ManyToOne`, `@OneToMany`, `@ManyToMany`, `@JoinColumn`, `@Inheritance`.

**Q : Différence JPA / Hibernate ?**

**R :** JPA est la *spécification* ; Hibernate est une *implémentation* (comme EclipseLink).

**Q : Propagation transactionnelle ?**

**R :** Définit comment une méthode `@Transactional` délègue ou crée une transaction (`REQUIRED`, `REQUIRES_NEW`, `NESTED`…).

---

## **15. Lambda & interfaces fonctionnelles**

**Q : Lien `Functional Interface` / Lambda ?**

**R :** Une lambda est l’implémentation concise d’une FI. Ex. :

```java
java
CopyEdit
Predicate<String> p = s -> s.isBlank();

```

**Q : `@FunctionalInterface` est‑elle obligatoire ?**

**R :** Non, mais elle active une vérification du compilateur.

**Q : Exemples de FI standard ?**

**R :** `Runnable`, `Callable`, `Supplier<T>`, `Function<T,R>`, `Predicate<T>`, `Consumer<T>`.

---

## **16. Sérialisation**

**Q : Qu’est‑ce que la sérialisation ?**

**R :** Processus de conversion d’un objet en flux d’octets pour stockage ou transmission ; l’objet doit implémenter `java.io.Serializable`.

---

## **17. Divers**

**Q : Qu’est‑ce qu’une *marker interface* ?**

**R :** Interface sans méthodes utilisée pour apporter une *métadonnée* au type (`Cloneable`, `Serializable`).

**Q : Qu’est‑ce que le profiling ?**

**R :** Analyse de l’exécution (CPU, mémoire) pour identifier goulots d’étranglement via outils (JDK Mission Control, VisualVM).

**Q : Différence `inner class` / `subclass` ?**

**R :** *Inner* = classe déclarée à l’intérieur d’une autre, non visible hors portée ; *Subclass* = héritage.

[Question Utils in Spring boot (Microservice / Spring Batch)](https://www.notion.so/Question-Utils-in-Spring-boot-Microservice-Spring-Batch-231fafae3b6380d18047ff5cad7c46df?pvs=21)