# Question Utils in Spring boot (Microservice / Spring Batch)

## ✅ Partie 1 : Spring Boot Microservices

### 1. **C’est quoi une architecture microservices ?**

Une architecture où l'application est divisée en petits services indépendants, déployables et développables séparément. Chaque service a sa propre base de données et communique avec les autres via des API REST ou des messages.

---

### 2. **Avantages des microservices ?**

- Scalabilité indépendante
- Déploiement rapide et isolé
- Résilience accrue
- Meilleure organisation par domaine métier
- Adapté aux équipes distribuées

---

### 3. **Inconvénients des microservices ?**

- Complexité accrue
- Problèmes de cohérence des données
- Débogage et traçabilité plus difficiles
- Nécessité de gestion du réseau et sécurité

---

### 4. **C’est quoi Eureka ?**

Eureka est un service de découverte (Service Discovery) de Netflix utilisé pour enregistrer et localiser automatiquement les microservices dans une architecture distribuée.

---

### 5. **C’est quoi Spring Cloud Gateway ?**

C’est une passerelle API (API Gateway) qui permet de centraliser les appels aux microservices, gérer les routes, les filtres, les règles de sécurité, etc.

---

### 6. **C’est quoi Feign Client ?**

Un client HTTP déclaratif intégré à Spring Cloud. Il permet de faire des appels REST à d’autres services avec une simple interface Java annotée.

---

### 7. **Différence entre Feign Client et RestTemplate ?**

- `RestTemplate` est plus bas niveau, nécessite de coder les appels manuellement.
- `FeignClient` est déclaratif et plus lisible, idéal pour les microservices.

---

### 8. **C’est quoi Circuit Breaker (Hystrix / Resilience4j) ?**

Un mécanisme qui évite la propagation des pannes en arrêtant les appels vers un service en erreur. Il permet de renvoyer une valeur de secours (`fallback`).

---

### 9. **Comment gérer la configuration centralisée ?**

Avec **Spring Cloud Config Server**, qui permet de centraliser les fichiers `application.yml` ou `application.properties` sur un dépôt Git ou local.

---

### 10. **Comment gérer la communication asynchrone ?**

En utilisant un **broker de messages** comme **Kafka** ou **RabbitMQ** pour échanger des événements entre microservices de façon asynchrone.

---

### 11. **C’est quoi Kafka ?**

Un système de messagerie distribué orienté **événements**, utilisé pour la communication asynchrone entre microservices, le traitement en temps réel, ou les architectures Event-Driven.

---

### 12. **C’est quoi un Producer et un Consumer Kafka ?**

- **Producer** : envoie des messages à un topic.
- **Consumer** : lit les messages depuis un topic.
    
    Chaque message est persisté dans une partition du topic.
    

---

### 13. **C’est quoi un topic Kafka ?**

Un canal de communication logique dans lequel les messages sont publiés. Les consommateurs peuvent lire les messages selon le groupe auquel ils appartiennent.

---

### 14. **Comment faire du Load Balancing entre microservices ?**

- Avec **Spring Cloud LoadBalancer**
- Ou en utilisant **Ribbon** (obsolète)
- Ou intégré à **Eureka** avec `@LoadBalanced` sur `RestTemplate`.

---

### 15. **Comment sécuriser les microservices ?**

- Avec **Spring Security + JWT** pour authentification stateless
- OAuth2 avec un serveur d’autorisation (Keycloak, Auth0…)
- Filtres à la Gateway pour vérifier les tokens

---

### 16. **C’est quoi un API Gateway ?**

C’est un point d’entrée unique pour toutes les requêtes clients. Il gère :

- l’authentification,
- le routage,
- la limitation de débit,
- le logging, etc.

---

## ✅ Partie 2 : Spring Batch

### 17. **C’est quoi Spring Batch ?**

Un framework pour le **traitement par lots**, idéal pour lire, transformer, et écrire de grandes quantités de données. Il gère la répétition, la reprise en cas d’échec, les logs, et le monitoring.

---

### 18. **Composants principaux de Spring Batch ?**

- **Job** : tâche globale
- **Step** : étape d’un job (lecture, traitement, écriture)
- **ItemReader** : lit les données
- **ItemProcessor** : traite les données
- **ItemWriter** : écrit les données

---

### 19. **Types d’ItemReader ?**

- `FlatFileItemReader` (CSV, TXT…)
- `JdbcCursorItemReader` (base de données)
- `JpaPagingItemReader`
- `KafkaItemReader` (via integration)

---

### 20. **Comment exécuter un Job Spring Batch ?**

- Au démarrage (`@EnableBatchProcessing`)
- Par une commande manuelle ou scheduler
- Par une API REST via `JobLauncher`

---

### 21. **C’est quoi le JobRepository ?**

Un composant Spring Batch qui stocke les métadonnées du job (état, timestamp, logs) dans une base de données.

---

### 22. **Qu’est-ce qu’un JobInstance et un JobExecution ?**

- **JobInstance** : un même job avec les mêmes paramètres
- **JobExecution** : une exécution particulière de ce JobInstance

---

### 23. **Comment faire une reprise après échec (Restartability) ?**

Spring Batch garde l’état dans la BDD. Lors d’une relance, il reprend à partir du dernier `Step` réussi.

---

### 24. **Qu’est-ce qu’un Listener dans Spring Batch ?**

Composant permettant d’intervenir avant ou après :

- un Job (`JobExecutionListener`)
- un Step (`StepExecutionListener`)
- un Item (`ItemReadListener`, `ItemWriteListener`…)

---

### 25. **Comment déclencher un job Spring Batch depuis un Kafka event ?**

Créer un `@KafkaListener` qui appelle un `JobLauncher` pour exécuter le job avec des paramètres extraits du message Kafka.

---

### 26. **Différence entre chunk-oriented processing et tasklet ?**

- **Chunk** : pour lire par lot (`ItemReader`, `ItemWriter`, etc.)
- **Tasklet** : pour une logique simple (script, purge, appel d’API…)