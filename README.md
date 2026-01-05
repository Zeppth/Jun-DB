# Jun-DB
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
