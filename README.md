# JunDB

Motor de persistencia de objetos jerárquicos fragmentados diseñado para el entorno de ejecución Node.js. El sistema opera mediante la intercepción transparente de operaciones a través de Proxies nativos y serialización binaria V8, permitiendo que la estructura de datos en memoria se refleje de forma isomórfica en el sistema de archivos.

Para un análisis detallado de la lógica de persistencia, la gestión de inodos y la mecánica de fragmentación recursiva, consulte el archivo [ARCHITECTURE.md](./ARCHITECTURE.md).

## Arquitectura de Datos

### 1. Persistencia Fragmentada (Sharding)
JunDB implementa una estrategia de fragmentación incremental donde los sub-objetos se extraen y almacenan en archivos binarios individuales (`.bin`). Un índice raíz gestiona los punteros referenciales, permitiendo escrituras localizadas: la modificación de un nodo específico solo requiere la re-serialización de su fragmento correspondiente, optimizando el ancho de banda de E/S.

### 2. Serialización V8
El motor utiliza el formato de serialización nativo de V8 en lugar de JSON. Esto garantiza:
* Soporte nativo para tipos de datos complejos: `Buffer`, `Date`, `Map`, `Set` y referencias circulares.
* Mayor velocidad de procesamiento en la hidratación de objetos.
* Integridad transaccional mediante escrituras atómicas (archivos temporales, sincronización de descriptores y renombramiento atómico).

### 3. Gestión de Memoria (JunRAM)
El control de recursos se gestiona a través de una caché LRU (Least Recently Used) que monitoriza el tamaño real en bytes de los objetos serializados. Al superar el umbral configurado, el sistema desaloja los fragmentos menos utilizados de la memoria volátil para mantener una huella de memoria controlada.

---

## Instalación

```bash
npm install https://github.com/Zeppth/Jun-DB
```

---

## Inicialización y Configuración

El constructor permite configurar los límites de fragmentación y de memoria heap.

```javascript
import { JunDB } from 'jun-db';

const db = new JunDB({
    folder: './storage',   // Directorio de persistencia
    memory: 20,            // Límite de caché en MB
    depth: 2,              // Profundidad de subdirectorios para shards
    index: {
        threshold: 10,     // Mutaciones antes de persistir índice
        debounce: 5000     // Retardo de persistencia en ms
    },
    nodes: {
        threshold: 5,      // Mutaciones antes de persistir nodos
        debounce: 3000     // Retardo de persistencia en ms
    }
});
```

---

## Interfaz de Acceso

La manipulación de datos se realiza de forma directa sobre el objeto `data`. El sistema resuelve las lecturas y escrituras en disco de forma reactiva.

```javascript
// Escritura: El sistema genera los fragmentos necesarios de forma automática
db.data.servicios = {
    web: { puerto: 80, estado: 'activo' },
    db: { puerto: 5432, estado: 'standby' }
};

// Lectura: Carga perezosa (lazy loading) desde disco al acceder a la propiedad
console.log(db.data.servicios.web.estado);

// Modificación: El Proxy detecta el cambio y programa la escritura atómica
db.data.servicios.web.estado = 'mantenimiento';

// Eliminación: Se eliminan los archivos físicos asociados al fragmento
delete db.data.servicios.db;

// Sincronización: Fuerza el vaciado de la cola de escritura
await db.flush();
```

---

## Control de Flujo (JunFlow)

JunFlow permite superponer lógica de middleware y métodos personalizados sobre la estructura de datos estática.

### Interceptores ($proxy)
Permite validar o transformar datos antes de la persistencia.
```javascript
db.flow.set('configuracion', {
    $proxy: {
        set(target, key, value) {
            if (typeof value !== 'number') {
                this.reject(new Error("Se requiere un valor numérico"));
            }
        }
    }
});
```

### Métodos inyectados ($call)
Permite definir lógica procedimental accesible desde el grafo de objetos.
```javascript
db.flow.set('servicios', {
    $call: {
        obtenerActivos() {
            return Object.keys(this.data).filter(k => this.data[k].estado === 'activo');
        }
    }
});

const activos = db.data.servicios.obtenerActivos();
```

---

## Limitaciones Técnicas

* Dependencia estricta de Node.js: El uso de los módulos nativos `v8`, `fs` y `path` impide su ejecución en entornos de navegador o Deno/Bun sin compatibilidad completa.
* Concurrencia: El sistema está diseñado para acceso desde un único proceso. No implementa bloqueos de archivos (file locking) para entornos multiproceso.
* Portabilidad: Los datos se almacenan en formato binario de V8, lo que requiere herramientas de deserialización específicas fuera del ecosistema JavaScript.

---

## Buenas Prácticas de Diseño

1. Jerarquía de Nodos: Diseñe la estructura de datos para evitar nodos raíz excesivamente pesados. La fragmentación es más eficiente cuando el acceso es granular.
2. Tipos de Datos: Aproveche el soporte de V8 para almacenar `Buffers` directamente en lugar de codificarlos en Base64.
3. Ciclo de Vida: En procesos críticos, asegúrese de invocar el método `flush()` antes de la finalización del proceso para garantizar que todas las mutaciones en cola se han sincronizado con el almacenamiento físico.
