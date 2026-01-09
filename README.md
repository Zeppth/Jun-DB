# JunDB

Base de datos embebida para Node.js. Persistencia binaria, fragmentada y jerárquica. Acceso transparente mediante proxies.

---

## Instalación

```bash
npm install https://github.com/Zeppth/Jun-DB
```

Requisitos: Node.js >= 18.0.0

---

## Inicio rápido

```javascript
import { JunDB } from 'jun-db';

const db = new JunDB({
    folder: './storage',
    memoryLimit: 20,
    depth: 2
});

// Escritura
db.data.users = {
    u001: { name: 'Ana', age: 28 },
    u002: { name: 'Luis', age: 34 }
};

// Lectura
console.log(db.data.users.u001.name); // 'Ana'

// Modificación
db.data.users.u001.age = 29;

// Eliminación
delete db.data.users.u002;

// Forzar escritura a disco
await db.flush();
```

---

## Configuración

```javascript
const db = new JunDB({
    folder: './storage',   // Directorio de almacenamiento
    memoryLimit: 20,       // Límite de caché en MB
    depth: 2,              // Profundidad de fragmentación (carpetas)
    saveLimit: 10,         // Escrituras antes de persistir
    saveDelay: 5000        // Delay máximo antes de persistir (ms)
});
```

| Opción | Tipo | Default | Descripción |
|--------|------|---------|-------------|
| `folder` | string | `'./data'` | Ruta del almacenamiento |
| `memoryLimit` | number | `20` | MB máximos en caché |
| `depth` | number | `2` | Niveles de subdirectorios para shards |
| `saveLimit` | number | `10` | Operaciones antes de flush automático |
| `saveDelay` | number | `5000` | Tiempo máximo (ms) antes de persistir |

---

## API

### Acceso a datos

```javascript
// Raíz de datos
db.data

// Lectura
const value = db.data.key;
const nested = db.data.level1.level2.key;

// Escritura
db.data.key = value;
db.data.newNode = { nested: { data: true } };

// Eliminación
delete db.data.key;

// Iteración
Object.keys(db.data.users);
for (const key in db.data.users) { ... }
```

### Métodos

```javascript
// Forzar sincronización a disco
await db.flush();

// Estado de memoria
db.memory();
// { used: "2.45 MB", limit: "20.00 MB", items: 12 }

// Abrir nodo específico (si existe)
const users = db.open('users');
if (users) {
    console.log(users.u001);
}
```

---

## Estructuras de datos

Los objetos se fragmentan automáticamente. Arrays y primitivos se almacenan inline.

```javascript
// Objeto → se fragmenta en archivo separado
db.data.config = { theme: 'dark', lang: 'es' };

// Array → se almacena completo en el nodo padre
db.data.tags = ['a', 'b', 'c'];

// Primitivos → inline
db.data.count = 42;
db.data.active = true;
```

### Estructura resultante en disco

```
storage/
├── index.bin          # Índice de referencias
├── root.bin           # Nodo raíz
└── data/
    └── A3/
        └── A3F2B1C8.bin   # Nodo 'config'
```

---

## JunFlow (Interceptores)

Sistema de middleware para interceptar operaciones.

```javascript
// Definir interceptores
db.flow.set('users', {
    $proxy: {
        get(target, key) {
            console.log(`Leyendo: ${key}`);
            // No llamar resolve/reject = comportamiento normal
        },
        set(target, key, value) {
            if (key === 'admin') {
                this.reject(new Error('No permitido'));
                return;
            }
            // Continúa normalmente
        },
        delete(target, key) {
            console.log(`Eliminando: ${key}`);
        }
    },
    $call: {
        // Métodos personalizados
        count() {
            return Object.keys(this.index).length;
        },
        find(predicate) {
            for (const k in this.data) {
                if (predicate(this.data[k])) return this.data[k];
            }
        }
    }
});

// Uso
db.data.users.count();
db.data.users.find(u => u.age > 30);
```

### Contexto de interceptores

```javascript
$proxy: {
    set(target, key, value) {
        this.resolve(value);  // Retornar valor personalizado
        this.reject(error);   // Lanzar error
        this.open('path');    // Abrir subnodo
        this.data;            // Valor recibido
        this.index;           // Índice actual
        this.flow;            // Configuración flow actual
    }
}

$call: {
    customMethod() {
        this.data;    // Proxy actual
        this.index;   // Índice
        this.flow;    // Flow
        this.open();  // Abrir subnodo
        this.Jun;     // Instancia JunDB
    }
}
```

---

## Ejemplos

### Estado de aplicación

```javascript
const db = new JunDB({ folder: './state' });

db.data.sessions = {};
db.data.settings = { maxUsers: 100 };

function createSession(userId, token) {
    db.data.sessions[userId] = {
        token,
        createdAt: Date.now()
    };
}

function getSession(userId) {
    return db.data.sessions[userId];
}
```

### Colección con métodos

```javascript
db.data.products = {};

db.flow.set('products', {
    $call: {
        add(product) {
            const id = crypto.randomUUID();
            this.data[id] = { ...product, id };
            return id;
        },
        list() {
            return Object.values(this.data);
        },
        byCategory(cat) {
            return this.list().filter(p => p.category === cat);
        }
    }
});

const id = db.data.products.add({ name: 'Item', price: 100 });
const all = db.data.products.list();
```

### Validación en escritura

```javascript
db.flow.set('users', {
    $proxy: {
        set(target, key, value) {
            if (!value.email || !value.name) {
                this.reject(new Error('email y name requeridos'));
            }
        }
    }
});

// Lanza error
db.data.users.u001 = { name: 'Test' };

// OK
db.data.users.u001 = { name: 'Test', email: 'test@x.com' };
```

---

## Arquitectura

```
JunDB
├── JunDrive      # I/O atómico, serialización v8
├── JunRAM        # Caché LRU con límite
├── JunHub        # Gestión de nodos y fragmentos
│   ├── JunDoc    # Documento individual
│   └── JunMap    # Índice raíz
├── JunShard      # Fragmentación de objetos
└── JunFlow       # Sistema de interceptores
```

- **Serialización**: `v8.serialize/deserialize`
- **Escritura atómica**: archivo temporal + rename
- **Fragmentación**: objetos anidados → archivos separados
- **Caché**: LRU con límite en bytes

---

## Limitaciones

- Proceso único (sin concurrencia multi-proceso)
- Sin lenguaje de consultas
- Sin transacciones
- Sin índices secundarios
- Dependiente de v8 (Node.js)

---

## Buenas prácticas

1. **Fragmentar datos**: estructuras profundas > objetos masivos
2. **Tamaño de nodos**: evitar nodos > 1MB
3. **Llamar `flush()`** antes de cerrar la aplicación
4. **Diseñar para acceso localizado**: agrupar datos relacionados
5. **No usar como caché de alto rendimiento**

```javascript
// Evitar
db.data.everything = { /* objeto gigante */ };

// Preferir
db.data.users = {};
db.data.orders = {};
db.data.products = {};
```

---
