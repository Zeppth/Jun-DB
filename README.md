## Jun-DB
JunDB es una base de datos embebida y basada en archivos para Node.js, orientada a la persistencia estructurada de objetos. Su diseño prioriza simplicidad, control explícito de recursos y persistencia incremental, evitando modelos monolíticos y cargas completas de datos en memoria. La información se organiza como una estructura jerárquica, donde cada nodo puede persistirse de forma independiente, permitiendo mantener estados complejos sin depender de archivos únicos de gran tamaño ni de capas externas.

El sistema asume un modelo de uso directo y predecible, pensado para aplicaciones embebidas que requieren persistencia confiable sin la complejidad de motores completos. Los datos se almacenan mediante serialización binaria y se fragmentan en unidades independientes, mientras un índice liviano mantiene la relación estructural entre ellas. Las operaciones de escritura son localizadas y atómicas, reduciendo el impacto en disco y preservando la integridad del estado.

El acceso a los datos se realiza de forma transparente a través de proxies, permitiendo interactuar con la base como con un objeto nativo, sin introducir lenguajes de consulta ni abstracciones adicionales. La memoria se gestiona de manera explícita mediante un cache con límite definido, evitando crecimiento no controlado y cargas innecesarias. El rendimiento final depende del sistema de archivos subyacente, y el diseño favorece claridad y estabilidad por encima de optimizaciones agresivas.

JunDB no está pensada para escenarios de alta concurrencia, consultas complejas o grandes volúmenes de datos no estructurados. Su uso recomendado se centra en estados persistentes bien organizados, con objetos de tamaño razonable y una estructura clara. Es una herramienta enfocada, diseñada para ofrecer persistencia simple y controlada, manteniendo un equilibrio consciente entre funcionalidad y complejidad.
---
## Recomendaciones

JunDB está pensada para trabajar con estructuras de datos bien definidas y objetos de tamaño razonable. Su modelo favorece la fragmentación del estado en nodos independientes, por lo que se recomienda diseñar la estructura de datos de forma jerárquica y coherente, evitando concentrar grandes volúmenes de información en un solo objeto.

El uso adecuado implica tratar la base como un almacenamiento de estado persistente y no como un sistema de cache de alta frecuencia ni como un contenedor de datos masivos. La organización del árbol de datos es responsabilidad del desarrollador, y una estructura clara mejora tanto el rendimiento como la mantenibilidad del sistema.

Es recomendable mantener un control consciente sobre el tamaño de los objetos persistidos, aprovechar la fragmentación natural del almacenamiento y evitar patrones de uso que requieran accesos intensivos o modificaciones constantes sobre los mismos nodos de gran tamaño.

## Limitaciones y alcance

JunDB no está diseñada para escenarios de alta concurrencia, múltiples procesos escribiendo simultáneamente ni cargas intensivas de escritura continua. El sistema asume un entorno embebido y un modelo de ejecución controlado, donde la simplicidad y la previsibilidad son prioritarias frente a la escalabilidad horizontal o la ejecución distribuida.

El rendimiento está condicionado por el sistema de archivos subyacente y por el costo de serialización binaria de los objetos persistidos. No existen mecanismos de consulta avanzada, transacciones complejas ni optimizaciones orientadas a grandes volúmenes de datos no estructurados. Estas limitaciones forman parte del diseño y permiten mantener un núcleo reducido, estable y fácil de razonar.

JunDB no intenta abstraer ni ocultar estas decisiones. Su alcance es intencionalmente limitado para preservar claridad, control explícito de recursos y un comportamiento determinista.
---
```
npm install https://github.com/Zeppth/Jun-DB.git
```
---
```js
import { JunDB } from 'jun-db';

const db = new JunDB({
    folder: './storage',    // Directorio de persistencia
    memoryLimit: 10,        // Límite de caché en MB (LRU)
    saveDelay: 5000,        // Delay de persistencia (ms)
    saveLimit: 10,          // Límite de cambios antes de forzar guardado
    depth: 2,               // Profundidad de fragmentación de archivos
});

// Al asignar un valor, JunDB fragmenta y persiste automáticamente
db.data.network = {
    status: "online",
    users: {
        zeppth: { role: "root", admin: true },
        guest: { role: "user" }
    }
};

// Acceso directo como un objeto normal
console.log(db.data.network.users.zeppth.role); // -> "root"

// Borrado atómico de archivos
delete db.data.network.users.guest;
```
