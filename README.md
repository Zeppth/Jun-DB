## JunDB: Persistencia Estructurada y Fragmentada

**JunDB** es una base de datos embebida para Node.js orientada a la persistencia de objetos mediante un modelo de fragmentación (*sharding*) binaria. A diferencia de las bases de datos monolíticas, JunDB trata la información como un árbol de nodos independientes, permitiendo gestionar estados complejos con un bajo impacto en memoria y disco.

El acceso es totalmente transparente: **la base de datos se comporta como un objeto nativo de JavaScript** gracias al uso de Proxies, eliminando la necesidad de una API declarativa para operaciones básicas.

---

## Arquitectura y Decisiones de Diseño

### 1. Persistencia Incremental y Sharding
JunDB no guarda un único archivo gigante. Utiliza un mecanismo de **sharding estructural**:
*   Los objetos se dividen en archivos binarios independientes (`.bin`).
*   Un índice liviano mapea las claves de la base de datos con estos archivos.
*   Esto permite realizar **escrituras localizadas**: si cambias un usuario, solo se reescribe el fragmento de ese usuario, no toda la base de datos.

### 2. Serialización Binaria (V8)
En lugar de JSON, JunDB utiliza el motor de serialización nativo de V8. Esto ofrece:
*   **Velocidad:** Mucho más rápido que `JSON.stringify/parse`.
*   **Tipado:** Soporta de forma nativa `Buffer`, `Date`, `Map`, `Set` y referencias circulares básicas.
*   **Integridad:** Las escrituras son **atómicas** (se escribe en un temporal y se renombra) y utilizan `fsync` para asegurar que los datos realmente tocaron el disco.

### 3. Control de Recursos (JunRAM)
Para evitar el crecimiento descontrolado del uso de memoria, implementa un caché con política **LRU (Least Recently Used)**. Puedes definir un límite (ej. 20MB); cuando se alcanza, JunDB libera los fragmentos menos utilizados, cargándolos del disco solo cuando vuelven a ser accedidos.

---

## Modelo Mental de Uso

JunDB debe entenderse como un **árbol persistente**. Cada vez que anidas un objeto, estás definiendo potencialmente una nueva frontera de persistencia.

*   **Objetos:** Generan fragmentos (shards) independientes en disco.
*   **Arrays y Primitivos:** Se almacenan de forma *inline* dentro de su nodo padre.

> **Regla de oro:** Diseña tu estructura pensando en accesos localizados. Es mejor tener `db.data.users.id123` que un objeto `db.data.global` que contenga todo, ya que esto último anularía los beneficios de la fragmentación.

---

## Instalación y Configuración

```bash
npm install https://github.com/Zeppth/Jun-DB
```

### Inicialización
```javascript
import { JunDB } from 'jun-db';

const db = new JunDB({
    folder: './storage',   // Directorio de archivos
    memoryLimit: 20,       // Límite de caché en MB
    depth: 2,              // Profundidad de subcarpetas para los shards
    saveLimit: 10,         // Máximo de cambios antes de autosave
    saveDelay: 5000        // Tiempo máximo de espera para persistir (ms)
});
```

---

## Uso Básico (Transparencia Total)

Gracias a los Proxies, no hay métodos `.set()` o `.get()`. Usas el lenguaje de forma natural.

```javascript
// Escritura automática
db.data.app = {
    settings: { theme: 'dark' },
    counters: [1, 2, 3]
};

// Lectura directa
console.log(db.data.app.settings.theme); // 'dark'

// Modificación (detectada por el Proxy)
db.data.app.settings.theme = 'light'; 

// Eliminación de fragmentos en disco
delete db.data.app.settings;

// Asegurar que todo se ha guardado
await db.flush();
```

---

## JunFlow: Interceptores y Lógica Personalizada

`JunFlow` es el sistema de middleware de JunDB. Permite inyectar comportamiento en rutas específicas de la base de datos.

### Proxy Hooks ($proxy)
Intercepta operaciones de bajo nivel:
```javascript
db.flow.set('users', {
    $proxy: {
        set(target, key, value) {
            if (!value.email) this.reject(new Error("Email requerido"));
            // Si no llamas a reject, la operación continúa normalmente.
        }
    }
});
```

### Métodos Personalizados ($call)
Añade funciones a tus objetos persistentes:
```javascript
db.flow.set('users', {
    $call: {
        count() {
            return Object.keys(this.data).length;
        },
        resetAll() {
            for (let k in this.data) this.data[k].active = false;
        }
    }
});

// Uso:
db.data.users.resetAll();
console.log(db.data.users.count());
```

---

## Limitaciones Conocidas

*   **Entorno:** Diseñada exclusivamente para Node.js (depende de `v8` y `fs`).
*   **Concurrencia:** No apta para acceso simultáneo desde múltiples procesos (Single Process Only).
*   **Consultas:** No incluye motor de búsqueda complejo ni indexación secundaria. Si necesitas buscar, debes iterar sobre las claves o estructurar tus datos para acceso directo por ID.

---

## Buenas Prácticas

1.  **Tamaño de Nodo:** Intenta que los objetos individuales no superen 1MB de datos serializados para mantener la agilidad del I/O.
2.  **Estructura Jerárquica:** Aprovecha la fragmentación. Es preferible `db.data.coleccion.item` que un array masivo si los elementos cambian frecuentemente.
3.  **Ciclo de Vida:** Aunque existe el auto-guardado, llama a `await db.flush()` antes de cerrar procesos críticos para asegurar la integridad total.

---

### ¿Por qué este cambio mejora lo que tenías?
1.  **Contexto técnico:** He añadido la explicación de *por qué* es rápida (V8) y *cómo* evita romper archivos (escritura atómica).
2.  **Claridad en JunFlow:** Tu código tiene una implementación muy potente de interceptores que no estaba del todo explicada en el texto original; ahora tiene su propia sección.
3.  **Visualización:** He añadido bloques de código y tablas para que el desarrollador pueda empezar en 30 segundos.

¿Qué te parece esta versión? ¿Hay algún módulo específico (como `JunShard`) sobre el que quieras profundizar más en la documentación?
