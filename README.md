# Jun-DB

**Jun-DB** is a sharded, hierarchical object persistence engine for Node.js. It operates by intercepting read and write operations via **native Proxies**, behaving as a persistent object graph where the in-memory structure is isomorphically reflected in the file system.

Unlike traditional embedded databases, Jun-DB employs a **recursive sharding strategy** combined with V8 binary serialization. This allows for the manipulation of large datasets with a minimal initial memory footprint, while ensuring transactional integrity through atomic write operations.

## Key Features

* **Transparent Persistence:** Works just like a standard JavaScript object. No complex query languages; just `object.property = value`.
* **Recursive Sharding (JunShard):** Automatically fragments deeply nested objects into separate binary files. You can store gigabytes of data while only keeping the actively accessed fragments in RAM.
* **Real LRU Caching:** Memory management is based on the actual byte size of serialized objects, not key counts, ensuring strict adherence to memory limits.
* **Atomic I/O:** Writes utilize a generic "write-sync-rename" strategy to prevent data corruption during power failures or process crashes.

## Installation

```bash
npm install jun-db

```

## Initialization

Configuration allows you to tune memory consumption and write latency to suit your environment's resources.

```javascript
import { JunDB } from 'jun-db';

const db = new JunDB({
    folder: './data',   // Root directory for persistence
    memory: 50,         // Strict RAM limit (MB) for the LRU cache
    atomic: true,       // Enables atomic writing (prevent corruption)
    depth: 2,           // Directory depth for ID generation (sharding distribution)
    maps: {
        threshold: 10,  // Operations buffer before saving the index (map)
        debounce: 5000  // Debounce time (ms) for index saves
    },
    nodes: {
        threshold: 5,   // Operations buffer before saving data (node)
        debounce: 3000  // Debounce time (ms) for data saves
    }
});

```

## Basic Usage

Interaction is handled entirely through standard JavaScript operations on the `db.data` property.

```javascript
// Writing: Persistence is automatic (handled by triggers and debouncing)
db.data.users = {
    id: 1,
    name: "Alice",
    session: { active: true }
};

// Reading: Lazy Loading
// The system only loads the necessary fragment from disk into RAM
// when the property is accessed.
console.log(db.data.users.name); 

// Deletion
delete db.data.users;

```

### Persistence and Maintenance

While Jun-DB manages I/O asynchronously, it is recommended to ensure the write queue is empty before terminating the application.

```javascript
// Force write of all pending data to disk
await db.flush();

// Inspect memory usage statistics (Maps, Nodes, and Flows)
console.log(db.memory());

```

## Architectural Concepts

### 1. Recursive Sharding

When an object grows or becomes nested, Jun-DB extracts sub-objects and moves them to independent binary files, replacing the data in the parent node with a lightweight pointer. This prevents the need to load the entire database into memory.

### 2. V8 Serialization & LRU Cache

The system uses Node's native V8 serialization for high-performance binary storage. The internal LRU (Least Recently Used) cache evicts the least accessed fragments when the byte-size limit (configured via `memory`) is reached.

### 3. Atomic Integrity

Files are never modified directly. Updates are written to a `.tmp` file, synced to disk, and then renamed. This guarantees that the database state remains valid even if the process crashes mid-write.

## Flow Control System

Jun-DB exposes a `$flow` interface within the data object. This acts as a middleware layer, allowing you to define interceptors for operations (`get`, `set`, `delete`) or attach custom methods (`call`) to specific nodes in the tree.

### Interceptors (Proxy Middleware)

Use interceptors to validate data, transform values, or protect properties before persistence occurs.

```javascript
// Define rules for the 'products' node
db.data.$flow.set('products', {
    proxy: {
        // Intercept write operations
        set(target, key, value, receiver) {
            // 'this' context provides: resolve, reject, data, Jun
            
            if (key === 'price' && value < 0) {
                this.reject(new Error("Price cannot be negative"));
                return;
            }

            // Allow the operation (equivalent to 'return true' in a Proxy)
            this.resolve(value); 
        },
        
        // Intercept delete operations
        delete(target, key) {
            if (key === 'internal_id') {
                this.reject(new Error("Cannot delete internal ID"));
            }
        }
    }
});

// Usage example:
try {
    db.data.products = {};
    db.data.products.price = -50; // Throws Error
} catch (e) {
    console.error(e.message);
}

```

### Custom Methods (Call)

You can attach business logic functions directly to specific nodes. These functions inherit the database context.

```javascript
db.data.$flow.set('cart', {
    call: {
        calculateTotal() {
            // 'this.data' refers to the object where this flow is attached
            let total = 0;
            for (const item in this.data) {
                if (this.data[item].price) total += this.data[item].price;
            }
            return total;
        }
    }
});

// Usage (assuming 'cart' contains data):
// const total = db.data.cart.calculateTotal();

```

## Shared Methods

For logic that must be globally available across any node in the database, use `db.shared`.

```javascript
db.shared.timestamp = function() {
    // Injects a timestamp into the current node
    this.data._updatedAt = Date.now();
};

// Usage on any node:
// db.data.users.john.timestamp();

```

## API Reference

* **`db.open(...path)`**: Manually navigates to and returns a Proxy for a specific sub-node. This is useful for optimizing access in very deep structures without traversing the root.
* **`db.flush()`**: Returns a `Promise`. Resolves when all asynchronous I/O write buffers are empty and data is safely on disk.
* **`db.memory()`**: Returns an object containing detailed statistics about the memory consumption of internal subsystems (Maps, Nodes, Flows).
* **`db.shared`**: An object used to register global functions accessible from any data proxy.

---

**License:** MIT