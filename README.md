# Jun-DB

Jun-DB es un sistema de persistencia de datos NoSQL diseñado para Node.js que opera mediante la intercepción de operaciones de lenguaje a través de Proxies nativos. El sistema transforma estructuras de objetos de JavaScript en un grafo de datos persistente, utilizando serialización binaria V8 y una estrategia de fragmentación recursiva (*sharding*) para optimizar el uso de memoria y la velocidad de acceso.

---
### Características fundamentales

*   **Persistencia Transparente:** Sincronización automática mediante Proxies nativos.
*   **Sharding Recursivo:** Fragmentación de estructuras complejas con soporte de carga perezosa (*lazy loading*).
*   **Integridad de Datos:** Escritura atómica mediante archivos temporales y `fsync`.
*   **Gestión de Memoria:** Caché LRU gestionada por tamaño real en bytes de los objetos serializados.
*   **Implementación Nativa:** Cero dependencias externas; basado en módulos `fs`, `v8` y `crypto`.

### Documentación Técnica Avanzada
Para una comprensión profunda de la mecánica de persistencia, fragmentación recursiva y gestión de estado mediante Proxies, consulte la [Definición Ontológica y Caracterización Estructural del Sistema](./ARCHITECTURE.md).

---
### Instalación

```bash
npm install jun-db
```

---
### Limitaciones y Recomendaciones

#### Limitaciones técnicas:
*   **Portabilidad:** Datos restringidos al entorno Node.js debido a la serialización V8.
*   **Concurrencia:** Soporte exclusivo para un único proceso activo; riesgo de corrupción en accesos multiproceso.
*   **E/S Síncrona:** El acceso inicial a fragmentos puede bloquear el *event loop* brevemente en archivos extensos.
*   **Recursos de FS:** Riesgo de agotamiento de inodos ante configuraciones de fragmentación excesiva.
*   **Consultas:** Recuperación limitada a acceso por claves jerárquicas; no incluye motor de búsqueda indexada.
*   **Estado Puro:** No se persisten funciones ni prototipos, únicamente el estado de los datos.

#### Recomendaciones de uso:
*   **Estructura:** Preferir el anidamiento de objetos sobre listas planas masivas para maximizar la eficiencia de la carga perezosa.
*   **Persistencia:** Invocar siempre `await db.flush()` antes de finalizar el proceso para asegurar el vaciado de la cola de escritura.
*   **Sharding:** Mantener `depth` en niveles 2-3 para equilibrar la fragmentación y el rendimiento del sistema de archivos.
*   **Entorno:** Ejecutar sobre sistemas de archivos optimizados para grandes cantidades de archivos pequeños (Ext4, APFS).

---
### Inicialización y Configuración

```javascript
import { JunDB } from 'jun-db';

const db = new JunDB({
    folder: './data',     // Directorio base de almacenamiento
    depth: 2,             // Profundidad de subdirectorios para fragmentos
    memory: 20,           // Límite máximo de la caché RAM en MB
    index: { 
        threshold: 10,    // Mutaciones antes de forzar escritura del índice
        debounce: 5000    // Retardo (ms) para agrupamiento de operaciones del índice
    },
    nodes: { 
        threshold: 5,     // Mutaciones para forzar escritura de nodos de datos
        debounce: 3000    // Retardo (ms) para agrupamiento de operaciones de nodos
    }
});
```

---

### Estructura de Almacenamiento

Jun-DB organiza la persistencia en archivos binarios distribuidos:

```text
./data/
├── index.bin       # Mapa de fragmentos (anclado en RAM).
├── root.bin        # Objeto raíz del árbol.
└── data/           # Repositorio de fragmentos (sharding).
    └── A1/
        └── A1B2C3.bin  # Nodo de datos fragmentado.
```

---

### Interfaz y Métodos de Instancia

El acceso a los datos se realiza a través de `db.data`, que actúa como punto de entrada reactivo.

```javascript
// Escritura: Genera fragmentos y sincroniza automáticamente
db.data.user = { profile: { name: "Jun" } }; 

// Lectura: Carga perezosa desde disco al acceder a la propiedad
const name = db.data.user.profile.name;      

// Eliminación: Remueve claves y purga archivos físicos vinculados
delete db.data.user;                         
```

#### Métodos principales:
*   **`open(...path)`**: Retorna un Proxy directo a una rama específica del árbol para optimizar el acceso.
*   **`flush()`**: Retorna una Promesa que garantiza la persistencia de todas las operaciones en cola.
*   **`memory()`**: Devuelve estadísticas de la caché LRU (uso, límites e ítems cargados).

---
### Control de Flujo y Lógica Virtual

#### JunFlow (Middleware y Métodos locales)
Permite inyectar lógica de control en nodos específicos del árbol.

*   **`this.resolve(value)`**: Retorna el valor y anula la persistencia automática (Override).
*   **`this.reject(error)`**: Interrumpe la ejecución y lanza una excepción.
*   **Ejecución por defecto**: Si no se invoca control, el sistema procesa la persistencia estándar tras finalizar la función.

```javascript
db.flow.set('usuarios', {
    $proxy: {
        set(target, key, value) {
            if (key === 'edad' && value < 18) {
                this.reject(new Error('Edad inválida'));
            }
        },
        delete(target, key) {
            if (key === 'protegido') this.resolve(false); 
        }
    },
    $call: {
        total() { return Object.keys(this.data).length; }
    }
});
```

#### Shared (Métodos Globales)
Funciones accesibles desde cualquier nivel del árbol de datos con menor precedencia que `$call`.

```javascript
db.shared.info = function() {
    return { 
        keys: Object.keys(this.data).length, 
        file: this.index.$file 
    };
};
```

**Contexto de ejecución (`this`):**
Tanto en `JunFlow` como en `Shared`, el contexto provee acceso a: `this.data` (proxy actual), `this.index` (mapa de shards), `this.flow` (configuración del nodo), `this.open()` y la instancia global `this.Jun`.

---
### Inyección Jerárquica de Clases ($class)

Jun-DB permite la personalización de sus módulos internos mediante inyección de dependencias jerárquica. Para sobrescribir un componente interno, se debe seguir su ruta de acceso en la arquitectura.

**Jerarquía de dependencias:**
*   **JunDB** → `JunDrive`, `JunMap`, `JunFlow`
    *   **JunDrive** → `JunRAM`
    *   **JunMap** → `JunDoc`
    *   **JunHub** (vía Proxy) → `JunShard`, `JunDoc`

#### Ejemplo de configuración avanzada:

```javascript
const db = new JunDB({
    $class: {
        // Inyección en JunDrive y su submódulo JunRAM
        JunDrive: [{ 
            folder: './custom_data',
            $class: { JunRAM: myCustomRamInstance }
        }],
        
        // Configuración personalizada de JunHub y JunShard
        JunHub: {
            $class: { JunShard: [3] }, // Profundidad de sharding 3
            file: { limit: 50, delay: 1000 }
        }
    }
});
```

#### Formatos de inyección:
*   **Instancia:** Vinculación directa del objeto.
*   **Array (`[...]`):** Los elementos se pasan como argumentos al constructor (`new Class(...args)`).
*   **Object (`{...}`):** Se pasa como opciones al constructor. Si incluye `$class`, el proceso se aplica recursivamente.

---
### Licencia
Este proyecto está bajo la Licencia [MIT](LICENSE).
