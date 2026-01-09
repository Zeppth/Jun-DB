**JunDB** es una base de datos embebida y basada en archivos para Node.js, orientada a la persistencia estructurada de objetos. Su diseño prioriza simplicidad, control explícito de recursos y persistencia incremental, evitando modelos monolíticos y cargas completas en memoria. La información se organiza jerárquicamente en nodos independientes, permitiendo mantener estados complejos sin depender de archivos únicos de gran tamaño.

Los datos se almacenan mediante serialización binaria y se fragmentan en unidades independientes vinculadas por un índice liviano. Las escrituras son localizadas y atómicas, preservando la integridad del estado y reduciendo el impacto en disco. El acceso se realiza de forma transparente mediante proxies, tratando la base como un objeto nativo, mientras la memoria se gestiona con un caché de límite definido para evitar crecimiento descontrolado.

JunDB está pensada para estados persistentes bien organizados y no para alta concurrencia, consultas complejas ni grandes volúmenes de datos no estructurados. Su alcance es intencionalmente limitado para mantener claridad, previsibilidad y bajo nivel de complejidad.

---

## Arquitectura interna

JunDB se compone de un núcleo reducido de módulos con responsabilidades bien delimitadas. El almacenamiento físico es gestionado por un controlador de archivos que abstrae lectura, escritura atómica y eliminación, delegando el rendimiento final al sistema de archivos subyacente. Sobre este nivel se implementa un sistema de serialización binaria que permite persistir estructuras de datos complejas sin depender de formatos de texto.

La estructura lógica de los datos se mantiene mediante un índice liviano que describe la relación jerárquica entre nodos. Este índice no almacena datos en sí, sino referencias a fragmentos persistidos de forma independiente. Cada nodo puede resolverse de manera diferida, evitando cargas completas y permitiendo persistencia incremental.

La fragmentación del estado se realiza mediante un mecanismo de sharding estructural. Los objetos se dividen en unidades autónomas que se almacenan como archivos binarios separados, organizados jerárquicamente en el sistema de archivos. Este enfoque reduce el impacto de escritura y facilita la gestión de estados complejos.

El acceso a los datos se expone mediante proxies, lo que permite interceptar operaciones de lectura, escritura y eliminación sin introducir una API declarativa adicional. La base se comporta como un objeto JavaScript nativo, mientras internamente se controla la persistencia y la coherencia.

La gestión de memoria se realiza mediante un caché con política de reemplazo y límite explícito. Los datos se cargan bajo demanda y se liberan cuando exceden el presupuesto definido, evitando crecimiento no controlado del uso de RAM.

---

## Modelo mental de uso

JunDB debe entenderse como un árbol persistente de objetos. Cada nivel de la estructura representa una frontera natural de persistencia, y el diseño de los datos influye directamente en el comportamiento del sistema. Una estructura bien definida permite accesos localizados y escrituras eficientes.

El desarrollador es responsable de decidir cómo se organiza el estado. JunDB no impone esquemas ni normalización automática. En su lugar, ofrece un mecanismo flexible que recompensa estructuras claras y penaliza concentraciones excesivas de datos en un solo nodo.

El uso correcto implica pensar en términos de estado y evolución, no en consultas ni en agregaciones complejas. JunDB es adecuada para mantener información viva y mutable que debe sobrevivir reinicios, no para análisis ni procesamiento masivo.

---

## Decisiones de diseño

JunDB prioriza simplicidad y previsibilidad sobre generalidad. La ausencia de un lenguaje de consultas, transacciones complejas o ejecución distribuida es una decisión consciente para mantener un núcleo pequeño y fácil de razonar.

El uso de serialización binaria permite reducir sobrecarga y evitar conversiones innecesarias, a costa de depender del entorno de ejecución. La persistencia basada en archivos y escrituras atómicas busca maximizar la integridad de los datos sin introducir mecanismos complejos de recuperación.

El modelo de un solo proceso evita la necesidad de sincronización externa y bloqueos entre escritores, alineándose con su naturaleza embebida. Estas decisiones definen claramente el alcance del proyecto y evitan ambigüedades sobre su propósito.

---

## API y configuración

La API de JunDB es mínima y orientada al uso directo. La inicialización permite configurar la ubicación del almacenamiento, el límite de memoria y parámetros relacionados con la persistencia diferida. Una vez inicializada, la base se expone como un objeto raíz desde el cual se accede a toda la estructura de datos.

Las operaciones de lectura, escritura y eliminación se realizan mediante acceso directo a propiedades. La persistencia ocurre de forma automática y transparente, sin requerir llamadas explícitas para guardar cambios. El sistema expone utilidades básicas para forzar la sincronización con disco y consultar el estado de la memoria.

La simplicidad de la API es intencional. No existen métodos para consultas avanzadas ni abstracciones adicionales que oculten el comportamiento real del almacenamiento.

---

## Buenas prácticas

Se recomienda mantener los nodos de datos en tamaños razonables y estructurar el árbol de forma coherente. Evitar objetos excesivamente grandes mejora la eficiencia de serialización y reduce la presión sobre el sistema de archivos.

JunDB debe utilizarse como almacenamiento de estado persistente y no como caché de acceso intensivo. Diseñar la estructura pensando en accesos localizados y cambios incrementales permite aprovechar al máximo su modelo.

Comprender las limitaciones del sistema y diseñar dentro de ellas es clave para un uso correcto y sostenible de la base.
