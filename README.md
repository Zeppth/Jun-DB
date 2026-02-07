

# Jun-DB

Jun-DB is a hierarchical, sharded object persistence engine for Node.js. It intercepts read and write operations through native Proxies, behaving as a persistent object graph where the in-memory structure maps isomorphically to the filesystem.

Unlike traditional embedded databases, Jun-DB uses **recursive sharding** combined with V8 binary serialization. This allows manipulation of large datasets with a minimal initial memory footprint, while ensuring write integrity through atomic file operations.

## Installation

```bash
npm install jun-db
```

Requirements: Node.js >= 18.0.0 (uses recent filesystem APIs and V8 serialization).

Zero external dependencies.

## Initialization and Configuration

The `JunDB` constructor accepts a plain configuration object. All fields are optional and have defaults.

```javascript
import { JunDB } from 'jun-db';

const db = new JunDB({
    // Base path for binary file storage.
    // Default: './data'
    folder: './data',

    // Memory limit (in MB) for the LRU cache.
    // The system evicts inactive shards when this limit is reached.
    // Default: 50
    memory: 50,

    // Enables atomic writes (write-to-temp then rename).
    // Recommended true for production, false for max throughput in volatile environments.
    // Default: true
    atomic: true,

    // Configuration for structure maps (indexes).
    maps: {
        threshold: 10,  // Write operations before forcing a flush to disk
        debounce: 5000   // Milliseconds to wait before write-back (debounce timer)
    },

    // Configuration for data nodes (values).
    nodes: {
        threshold: 5,
        debounce: 3000
    },

    // Sharding depth: length of the directory prefix derived from generated IDs.
    // Default: 2
    depth: 2
});
```

### Memory Budget Distribution

The configured `memory` value is split internally across three separate LRU caches:

| Cache       | Share | Purpose                                    |
|-------------|-------|--------------------------------------------|
| `nodesRam`  | 88%   | Data nodes (actual stored values)          |
| `mapsRam`   | 10%   | Structure maps (pointers between nodes)    |
| `flowRam`   |  2%   | Flow definitions (`$proxy` and `$call`)    |

The LRU cache (`JunRAM`) tracks size in serialized bytes, not key count. When the budget for a cache segment is exceeded, the least recently used entries are evicted. Pinned keys (the root files) are never evicted.

## Architecture

### 1. Transparent Persistence via Proxies

Jun-DB wraps the root object and its sub-objects in JavaScript `Proxy` instances. There are no explicit `insert` or `update` methods for standard data manipulation. Native language operations trigger the persistence logic directly.

```javascript
db.data.users = {};
db.data.users.admin = { id: 1, role: 'root' };

console.log(db.data.users.admin.role); // 'root'

delete db.data.users.admin;
```

When you assign a plain object to a key, the system recursively decomposes it into shards (see below). When you read a key that points to a shard, the system loads and proxies it transparently.

### 2. Recursive Sharding

When a plain object is assigned, `JunShard.forge` walks the object recursively. Every nested plain object becomes an independent shard: a pair of binary files (a map and a node) stored under a randomly generated ID with a directory prefix determined by `depth`.

The parent node stores a lightweight pointer string (`node:<id>.node.bin`) instead of the actual data. The parent map stores the corresponding map file path. On read, the proxy intercepts the access, resolves the pointer, loads only the required shard, and returns a new proxy over it.

**Physical structure for `depth: 2` and a generated ID of `A3F7BC01`:**

```
data/
├── root.map.bin        # Root structure map
├── root.node.bin       # Root data node
├── maps/
│   └── A3/
│       └── A3F7BC01.map.bin
├── nodes/
│   └── A3/
│       └── A3F7BC01.node.bin
└── flows/
    └── ...             # Flow definitions (if any)
```

- `.map.bin` files contain structure: keys mapped to child map file paths, plus a `$file` self-reference.
- `.node.bin` files contain the terminal data: primitives, arrays, dates, and pointer strings to child shards.
- `.flow.bin` files store serialized function strings for `$proxy` and `$call` definitions.

The `depth` parameter controls directory fan-out. A depth of 2 means the first 2 characters of the hex ID form a subdirectory. This prevents any single directory from accumulating too many files.

### 3. V8 Serialization

All data is serialized and deserialized using Node.js's built-in `v8.serialize` / `v8.deserialize`. This is the same mechanism Node uses internally to pass structured data between worker threads.

**Supported types:** primitives, plain Objects, Arrays, Date, RegExp, Map, Set, Buffer, TypedArrays, and other types supported by the [structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm).

**Not supported:** functions (except through the Flow system as stringified source), Promises, WeakMap, WeakSet, Symbols, and any host objects (Sockets, Streams, etc.).

### 4. Write Strategy (JunDoc)

Each map and node file is managed by a `JunDoc` instance that implements a dual-trigger write-back strategy:

1. **Counter threshold:** after N mutations (configurable via `threshold`), the data is flushed to disk immediately.
2. **Debounce timer:** if the threshold is not reached, a timer (configurable via `debounce`) schedules a deferred flush. Each new mutation resets the timer.

This batches rapid successive writes into a single I/O operation while still guaranteeing that data reaches disk within a bounded time window.

### 5. Atomic Writes (JunIO)

When `atomic: true` (the default), every write follows this sequence:

1. Serialize the data with `v8.serialize`.
2. Write the buffer to a temporary file (`<path>.tmp`).
3. Rename the temporary file to the final path.

On most filesystems, `rename` is atomic within the same volume. This means a crash during step 2 leaves the original file intact, and a crash during step 3 either completes or doesn't — there's no partial write.

The async I/O layer (`AsyncIO`) also provides:

- **Per-file operation queuing:** concurrent writes to the same file are serialized through a per-key promise chain, preventing race conditions.
- **Global concurrency limit:** at most 64 concurrent I/O operations, with backpressure for anything beyond that.
- **Retry logic:** transient errors (`ENOENT`, `EMFILE`) are retried up to 3 times with a short delay.

### 6. Object Identity via `open()`

The `db.data` proxy gives you transparent traversal, but each nested access creates a new proxy. If you need to work with a specific subtree repeatedly, `open()` returns a proxy bound to a specific map node:

```javascript
const users = db.open('users');

// Equivalent to db.data.users.admin, but 'users' is resolved once.
users.admin = { id: 1, role: 'root' };
console.log(users.admin.role);
```

`open()` accepts a variable number of string arguments representing a path through the map hierarchy:

```javascript
const adminSettings = db.open('users', 'admin', 'settings');
```

It returns `false` if any segment of the path does not exist.

## Flow Control System

Jun-DB exposes two special properties on every proxied node: `$proxy` and `$call`. These allow injecting custom logic (interceptors and methods) into the data graph. Flow definitions are persisted to `.flow.bin` files; functions are stored as source strings and reconstructed via `eval` on load.

### Interceptors (`$proxy`)

Intercept `get`, `set`, and `delete` operations on a specific node. Useful for validation, transformation, or side effects.

```javascript
db.data.users.$proxy.define({
    set(target, key, value, receiver) {
        // 'this' provides:
        //   this.data     - the receiver proxy
        //   this.map      - the JunMap instance for this node
        //   this.resolve  - call to stop propagation and set a return value
        //   this.reject   - call to stop propagation and throw an error
        //   this.open     - function to open sub-paths

        if (key === 'age' && typeof value !== 'number') {
            this.reject(new Error('age must be a number'));
            return;
        }

        if (key === 'email') {
            this.resolve(value.toLowerCase());
            return;
        }

        // If neither resolve nor reject is called, the operation
        // proceeds normally with the original value.
    },

    get(target, key, receiver) {
        // Can intercept reads too.
        // Call this.resolve(val) to return a custom value.
        // Call this.reject(err) to throw.
        // Do nothing to let the default behavior run.
    },

    delete(target, key) {
        // Same pattern.
    }
});

// Remove a specific interceptor:
db.data.users.$proxy.remove('set');
```

### Custom Methods (`$call`)

Attach callable functions to a data node. These are accessible as regular properties on the proxy.

```javascript
db.data.users.$call.define({
    findByRole(role) {
        // 'this' provides:
        //   this.data  - the proxy for the current node
        //   this.index - the JunMap instance
        //   this.flow  - the full call flow object
        //   this.open  - function to open sub-paths
        //   this.Jun   - the JunDB instance

        const results = [];
        for (const key of Object.keys(this.data)) {
            const user = this.data[key];
            if (user && user.role === role) {
                results.push(user);
            }
        }
        return results;
    }
});

// Usage:
const admins = db.data.users.findByRole('root');

// Remove a specific method:
db.data.users.$call.remove('findByRole');
```

### Shared Methods

The `db.shared` object allows defining methods that are available on every proxied node, without storing anything per-node:

```javascript
db.shared.toJSON = function () {
    const out = {};
    for (const key of Object.keys(this.data)) {
        out[key] = this.data[key];
    }
    return out;
};

// Now available on any node:
const snapshot = db.data.users.toJSON();
```

Shared methods receive the same `this` context as `$call` methods.

## Lifecycle and Shutdown

Jun-DB uses debounced and threshold-triggered writes. When shutting down, pending timers may not have fired yet. Always call `flush()` before exiting:

```javascript
process.on('SIGINT', async () => {
    await db.flush();
    process.exit(0);
});
```

`flush()` waits for all queued async I/O operations to complete. It resolves once every pending write has been committed to disk.

### Pruning Empty Directories

After extensive deletions, the shard directory tree may contain empty folders. Call `prune()` to clean them up:

```javascript
await db.JunDrive.prune();
```

This walks the `maps/`, `nodes/`, and `flows/` directories and removes any empty subdirectories.

## Memory Inspection

```javascript
const stats = db.memory();

// Returns:
// {
//   maps:  { used: '0.12 MB', limit: '5.00 MB', items: 14 },
//   nodes: { used: '3.40 MB', limit: '44.00 MB', items: 230 },
//   flow:  { used: '0.00 KB', limit: '1.00 MB', items: 0 }
// }
```

## Internal Module Reference

| Module     | Role |
|------------|------|
| `JunDB`    | Entry point. Creates the root map, sets up `JunDrive`, builds the root proxy. |
| `JunDrive` | Storage layer. Routes filenames to the correct subdirectory and LRU cache segment. Exposes sync and async read/write/remove/exists. |
| `JunIO`    | `SyncIO` and `AsyncIO` classes. Handle actual filesystem operations, atomic write logic, concurrency limiting, and retry. |
| `JunRAM`   | LRU cache sized by serialized byte count. Supports pinned keys that are never evicted. |
| `JunShard` | Recursive decomposition (`forge`) and recursive deletion (`purge`) of object trees into independent file pairs. |
| `JunMap`   | Represents a structure map file. Holds key-to-child-map-path mappings. |
| `JunNode`  | Represents a data node file. Holds terminal values and shard pointer strings. |
| `JunHub`   | Coordinates a map and its node. Routes `get`, `set`, `delete` through shard logic. |
| `JunDoc`   | Write-back controller for a single file. Implements threshold + debounce flushing. |
| `JunFlow`  | Manages `$proxy` and `$call` definitions. Stores functions as strings, reconstructs them on read. |

## Limitations and Caveats

### Single-Writer Process

Jun-DB is designed for a single writing process. Multiple processes can read from the same data directory, but there is no inter-process locking mechanism. Concurrent writes from separate processes will corrupt data.

### I/O Bound on Deep Access

Accessing a deeply nested path that is not cached requires loading each intermediate shard from disk sequentially. If your access patterns are uniformly deep and cache-cold, latency will be dominated by filesystem reads.

### Many Small Files

Recursive sharding produces a large number of small binary files. Modern filesystems (ext4, APFS, NTFS) handle this without issue for typical workloads. It may affect backup tools or synchronization systems that enumerate files.

### Function Storage via `eval`

Flow functions (`$proxy`, `$call`) are stored as stringified source and reconstructed with `eval`. This has the usual security implications: do not store or load flow definitions from untrusted sources.

### No Query Engine

There are no indexes, query planners, or aggregation pipelines. Searching requires walking the object graph through proxied access. For complex queries over large datasets, this is not the right tool.

### Overhead for Small Data

Each shard adds metadata (a map file, a node file, cache entries). If your total dataset is small (under a few MB), a single JSON file or SQLite would be simpler and more efficient.

## When to Use It

- Persistent state for bots, CLI tools, or desktop apps where local I/O is fast and controlled.
- Hierarchical configuration systems with deep nesting and inheritance.
- Rapid prototyping where you need persistence without schema definitions.
- Local caching layers with bounded memory and automatic eviction.

## When Not to Use It

- Data with complex relational structure that demands joins.
- High-frequency write workloads (logging, telemetry, event streams).
- Anything requiring full-text search or indexed queries.
- Multi-process or distributed write scenarios.

---

**License:** MIT
