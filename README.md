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
```
