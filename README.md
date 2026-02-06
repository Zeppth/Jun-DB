# Jun-DB

Jun-DB is a hierarchical persistent object store for Node.js that uses native JavaScript Proxies to provide transparent filesystem-backed object manipulation. It employs recursive sharding with V8 binary serialization and atomic I/O operations.

## Architecture

The database operates on these technical principles:

1. **V8 Binary Serialization** - Data is stored using Node.js's native `v8.serialize()` and `v8.deserialize()` methods, supporting JavaScript types (Date, RegExp, Map, Set, TypedArrays) that JSON cannot represent.

2. **Recursive Sharding** - Objects are automatically fragmented into separate files when nested:
   - **Maps (`.map.bin`)** store references to child nodes
   - **Nodes (`.node.bin`)** store primitive values
   - **Flows (`.flow.bin`)** store serialized functions and interceptors

3. **Atomic I/O** - Write operations use a temporary file and atomic rename strategy to prevent data corruption.

4. **LRU Caching** - A custom LRU implementation (`JunRAM`) manages memory across three categories:
   - Nodes: 88% of allocated memory
   - Maps: 10% of allocated memory
   - Flows: 2% of allocated memory

## Installation

```bash
npm install jun-db
```

## Initialization

```javascript
import { JunDB } from 'jun-db';

const db = new JunDB({
    folder: './data',     // Root storage directory
    depth: 2,             // Directory depth for shard organization
    memory: 50,           // RAM limit in megabytes
    atomic: true,         // Enable atomic write operations
    maps: {
        threshold: 10,    // Operations before forced map save
        debounce: 5000    // Debounce timer in milliseconds for maps
    },
    nodes: {
        threshold: 5,     // Operations before forced node save
        debounce: 3000    // Debounce timer in milliseconds for nodes
    }
});
```

## Basic Operations

The `db.data` property returns a Proxy that transparently handles persistence:

```javascript
// Primitives are stored in .node.bin files
db.data.version = 1;
db.data.timestamp = new Date();

// Nested objects trigger automatic sharding
db.data.users = {};
db.data.users.admin = {
    id: 1,
    role: 'admin',
    permissions: new Set(['read', 'write']),
    settings: {
        theme: 'dark',
        notifications: true
    }
};

// Reading data - only required fragments are loaded
console.log(db.data.users.admin.role); // 'admin'

// Deletion
delete db.data.version;
```

### Persistence Control

```javascript
// Force all pending writes to disk
await db.flush();

// View memory usage statistics
console.log(db.memory());
// {
//   maps: { used: '1.20 MB', limit: '5.00 MB', items: 15 },
//   nodes: { used: '12.50 MB', limit: '44.00 MB', items: 200 },
//   flow: { used: '0.05 MB', limit: '1.00 MB', items: 2 }
// }
```

## Flow System

The flow system allows attaching serializable functions and interceptors to data nodes. Functions are stored as strings in `.flow.bin` files and rehydrated when accessed.

### Node Methods

```javascript
// Initialize node structure
db.data.inventory = {};

// Attach methods to the inventory node
db.data.inventory.$setCall({
    addItem: function(itemId, count) {
        if (!this.data[itemId]) {
            this.data[itemId] = 0;
        }
        this.data[itemId] += count;
        return this.data[itemId];
    },
    
    clear: function() {
        const keys = Object.keys(this.data);
        for (let key of keys) {
            delete this.data[key];
        }
        return true;
    }
});

// Execute stored method
db.data.inventory.addItem('widget', 100);
```

### Interceptors

```javascript
db.data.settings = { theme: 'light' };

// Apply interceptors to settings node
db.data.settings.$setProxy({
    set: function(target, key, value) {
        if (key === 'theme' && value !== 'dark' && value !== 'light') {
            throw new Error('Invalid theme');
        }
        target[key] = value;
        return true;
    },

    get: function(target, key) {
        if (key === 'timestamp') {
            return Date.now();
        }
        return target[key];
    },

    delete: function(target, key) {
        if (key === 'theme') {
            return false;
        }
        delete target[key];
        return true;
    }
});
```

### Removing Flows

```javascript
db.data.inventory.$delCall('addItem');
db.data.settings.$delProxy('set');
```

## Navigation

Access nested maps directly using the `open()` method:

```javascript
// Navigate to deeply nested structure
const nestedMap = db.open('users', 'admin', 'settings');
nestedMap.theme = 'dark';
```

## Memory Management

The LRU cache evicts least recently used fragments when memory limits are reached:

```javascript
// Memory is divided between components:
// - Nodes: 88% for primitive data
// - Maps: 10% for directory structures
// - Flows: 2% for serialized functions
```

## Maintenance

```javascript
// Remove empty directories
await db.JunDrive.prune();
```

## API Reference

### JunDB Constructor

```javascript
new JunDB({
    folder: string,           // Base storage directory
    depth: number,            // Directory nesting depth for shards
    memory: number,           // Total RAM limit in MB
    atomic: boolean,          // Enable atomic writes
    maps: {
        threshold: number,    // Operations before map save
        debounce: number      // Debounce delay for map saves (ms)
    },
    nodes: {
        threshold: number,    // Operations before node save
        debounce: number      // Debounce delay for node saves (ms)
    }
})
```

### Core Methods

- `db.flush()`: Forces all pending writes to disk
- `db.memory()`: Returns memory usage statistics
- `db.open(...path)`: Navigates to nested maps
- `db.JunDrive.prune()`: Removes empty directories

### Node Methods (via Proxy)

- `$setCall(object)`: Attach methods to current node
- `$delCall(key?)`: Remove methods from current node
- `$setProxy(object)`: Attach interceptors to current node
- `$delProxy(key?)`: Remove interceptors from current node

## Technical Considerations

### Performance Characteristics

- **Sharding overhead**: Each nested object creates separate files, which may impact filesystem performance with many small files
- **Cache efficiency**: Frequently accessed fragments remain in memory, while less-used data is evicted
- **I/O patterns**: Reads trigger disk access only for uncached fragments

### Limitations

1. **Function serialization**: Only traditional `function` syntax is supported
2. **Node.js environment**: Requires Node.js 18+ for V8 serialization APIs
3. **Concurrent access**: Multiple processes can read, but writes should be coordinated
4. **No built-in queries**: Indexing and complex queries must be implemented externally

### Recommended Use Cases

- Hierarchical configuration storage
- Session data with localized access patterns
- Prototyping without schema definition
- Desktop/CLI applications with controlled I/O

## Implementation Details

### File Structure

```
data/
├── maps/          # .map.bin files (directory structures)
├── nodes/         # .node.bin files (primitive data)
├── flows/         # .flow.bin files (serialized functions)
└── root.map.bin   # Root map file
```

### Serialization Format

Data is serialized using `v8.serialize()` to binary format, supporting:
- Primitive values (string, number, boolean, null)
- Native objects (Date, RegExp, Map, Set, ArrayBuffer)
- TypedArrays (Uint8Array, Float64Array, etc.)
- Nested object structures

### Cache Eviction

When memory limits are exceeded:
1. Least recently accessed fragments are identified
2. Their binary representations are removed from RAM
3. Fragments remain on disk and can be reloaded when accessed

## License

MIT
