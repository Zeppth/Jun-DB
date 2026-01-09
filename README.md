## Jun-DB

JunDB es una base de datos embebida para Node.js orientada a la persistencia estructurada de objetos. Su diseño prioriza la simplicidad, el control de recursos y la persistencia incremental, evitando modelos monolíticos y cargas completas en memoria. La información se organiza jerárquicamente en nodos independientes, permitiendo mantener estados complejos sin depender de archivos únicos de gran tamaño.

El sistema fragmenta los datos mediante serialización binaria en unidades independientes vinculadas por un índice liviano. Las operaciones de escritura son localizadas y atómicas, reduciendo el impacto en disco y preservando la integridad. El acceso se realiza mediante proxies, tratando la base como un objeto nativo sin lenguajes de consulta. La memoria se gestiona con un caché de límite definido para evitar el crecimiento descontrolado.

No está pensada para alta concurrencia, consultas complejas o volúmenes masivos de datos no estructurados. Se recomienda para estados bien organizados, buscando un equilibrio entre funcionalidad y baja complejidad.

---

## Recomendaciones

Se recomienda diseñar estructuras jerárquicas y coherentes, evitando concentrar grandes volúmenes de información en un solo objeto. JunDB debe tratarse como almacenamiento de estado persistente y no como caché de alta frecuencia. La organización del árbol de datos es responsabilidad del desarrollador; una estructura clara optimiza el rendimiento y la mantenibilidad. Es clave controlar el tamaño de los objetos y aprovechar la fragmentación natural para evitar accesos intensivos en nodos de gran tamaño.

## Limitaciones y alcance

JunDB no soporta alta concurrencia ni cargas de escritura continua. Prioriza la simplicidad y previsibilidad en entornos embebidos frente a la escalabilidad horizontal. El rendimiento depende del sistema de archivos y el costo de serialización binaria. No incluye consultas avanzadas ni transacciones complejas. Su alcance es intencionalmente limitado para preservar la claridad, el control de recursos y un comportamiento determinista.

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
