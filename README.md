# Jun-DB

**Jun-DB** is a sharded, hierarchical object persistence engine for Node.js. It operates by intercepting read and write operations via **native Proxies**, behaving as a persistent object graph where the in-memory structure is isomorphically reflected in the file system.

Unlike traditional embedded databases, Jun-DB employs a **recursive sharding strategy** combined with V8 binary serialization. This allows for the manipulation of large datasets with a minimal initial memory footprint, while ensuring transactional integrity through atomic write operations.

## Key Features

* **Transparent Persistence:** Works just like a standard JavaScript object. No complex query languages; just `object.property = value`.
* **Recursive Sharding (JunShard):** Automatically fragments deeply nested objects into separate binary files. You can store gigabytes of data while only keeping the actively accessed fragments in RAM.
* **Real LRU Caching:** Memory management is based on the actual byte size of serialized objects, not key counts, ensuring strict adherence to memory limits.
* **Atomic I/O:** Writes utilize a generic "write-sync-rename" strategy to prevent data corruption during power failures or process crashes.
* **Flow Control System:** Intercept and customize operations with middleware-like interceptors and attach custom methods to any node.

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
    atomic: true,       // Enables atomic writing (prevents corruption)
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

## Considerations and Limitations

### Performance and Scalability
- **I/O as a bottleneck:** Each access to deeply nested data can involve multiple disk reads. Recommended for data that is accessed in a localized manner.
- **Many small files:** Sharding generates numerous files. Filesystems like ext4 or NTFS handle this well, but it can affect backup or synchronization operations.
- **V8 Serialization:** Only serializes what V8 can serialize. Does not support custom functions, promises, sockets, etc. (except via `.toString()` in the flow system).

### Memory Usage
- **Strict LRU cache:** When the memory limit is reached, entire shards are unloaded, not parts of them. Adjust `memory` according to your access patterns.
- **Sharding overhead:** Each shard adds metadata. For small, flat data, a traditional database may be more efficient.

### Technical Limitations
- **Node.js exclusive environment:** Not portable to browsers or other runtimes.
- **No multi-operation transactions:** No automatic rollback for complex operations.
- **No indexes or advanced queries:** You must implement your own indexes if you need complex searches.
- **Basic concurrency:** Multiple processes can read, but only one process should write at a time.

### Recommended Use Cases
- **Hierarchical configurations:** Ideal for configuration-like data with moderate depth.
- **Session or cache data:** Where accesses are localized and data has limited lifespan.
- **Rapid prototyping:** When you need persistence without defining schemas.
- **Desktop/CLI applications:** Where local I/O is fast and controlled.

### Not Recommended Use Cases
- **Highly relational data:** Use SQL databases.
- **High-frequency writes:** Such as high-speed logging.
- **Complex searches:** No built-in indexes.
- **Simultaneous multi-process environments:** No sophisticated locking.

## Flow Control System

Jun-DB provides a powerful flow control system that allows you to intercept and customize operations at any node. This system is accessible through special properties on each proxy.

### Interceptors (Proxy Middleware)

Use interceptors to validate data, transform values, or protect properties before persistence occurs.

```javascript
// Define interceptors for the current node
db.data.$setProxy({
    // Intercept write operations
    set(target, key, value, receiver) {
        // 'this' context provides: resolve, reject, data, map, open, Jun
        
        if (key === 'price' && value < 0) {
            this.reject(new Error("Price cannot be negative"));
            return;
        }
        
        if (key === 'email' && !value.includes('@')) {
            this.reject(new Error("Invalid email"));
            return;
        }

        // Allow the operation
        this.resolve(value);
    },
    
    // Intercept read operations
    get(target, key, receiver) {
        if (key === 'password') {
            this.reject(new Error("Access denied"));
            return;
        }
        
        // Continue with normal operation
        this.resolve();
    },
    
    // Intercept delete operations
    delete(target, key) {
        if (key === 'id') {
            this.reject(new Error("Cannot delete ID"));
            return;
        }
        
        this.resolve();
    }
});

// Usage example:
try {
    db.data.user = {
        name: "Alice",
        email: "alice@email.com",
        password: "123456"
    };
    
    console.log(db.data.user.name);  // OK
    console.log(db.data.user.password);  // Throws Error
    
    db.data.user.email = "invalid-email";  // Throws Error
    delete db.data.user.id;  // Throws Error if 'id' exists
} catch (e) {
    console.error(e.message);
}

// Remove specific interceptors
db.data.$delProxy('set');  // Remove only the 'set' interceptor
db.data.$delProxy();       // Remove all interceptors
```

### Custom Methods (Call)

You can attach business logic functions directly to specific nodes. These functions inherit the database context.

```javascript
// Attach methods to the current node
db.data.$setCall({
    calculateTotal() {
        // 'this.data' refers to the object where this flow is attached
        let total = 0;
        for (const item in this.data) {
            if (typeof this.data[item] === 'object' && this.data[item].price) {
                total += this.data[item].price;
            }
        }
        return total;
    },
    
    addProduct(name, price) {
        if (!this.data.products) {
            this.data.products = {};
        }
        this.data.products[name] = { price, date: new Date() };
        return `Product ${name} added`;
    },
    
    findByPrice(max) {
        const results = {};
        for (const [name, product] of Object.entries(this.data.products || {})) {
            if (product.price <= max) {
                results[name] = product;
            }
        }
        return results;
    }
});

// Usage:
db.data.cart = {
    apples: { price: 1.5, quantity: 2 },
    oranges: { price: 2.0, quantity: 3 }
};

const total = db.data.cart.calculateTotal();
console.log(`Total: $${total}`);

db.data.cart.addProduct("pears", 2.5);
const affordable = db.data.cart.findByPrice(2.0);

// Remove specific methods
db.data.$delCall('calculateTotal');  // Remove only this method
db.data.$delCall();                  // Remove all methods
```

### Shared Methods (Global)

For logic that must be globally available across any node in the database, use `db.shared`.

```javascript
// Register global methods
db.shared.timestamp = function() {
    // Injects a timestamp into the current node
    this.data._lastModified = new Date().toISOString();
    return this.data._lastModified;
};

db.shared.validateEmail = function(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
};

db.shared.encrypt = function(text) {
    // Simple encryption example
    return btoa(text);
};

// Usage on any node:
db.data.user = { name: "John" };
const timestamp = db.data.user.timestamp();
console.log(`Modified: ${timestamp}`);

const isValid = db.data.user.validateEmail("john@email.com");
console.log(`Valid email: ${isValid}`);

// Shared methods are available at all levels
db.data.config.timestamp();
db.data.products.category.timestamp();
```

### Navigation Between Nodes

Flow methods have access to `this.open()` for navigating to other nodes:

```javascript
db.data.$setCall({
    async getCompleteProfile() {
        // Navigate to another node from current context
        const users = this.open('users');
        const config = this.open('config', 'preferences');
        
        return {
            profile: this.data,
            allUsers: users,
            preferences: config
        };
    },
    
    moveData(destinationPath) {
        // Move data to another node
        const destination = this.open(...destinationPath.split('.'));
        Object.assign(destination, this.data);
        this.data = {};  // Clear origin
        return "Data moved successfully";
    }
});

// Usage:
const completeProfile = await db.data.user.john.getCompleteProfile();
db.data.temp.moveData('archived.2024');
```

### Complete Example: Shopping Cart System

```javascript
// Setup flow for cart
db.data.cart.$setProxy({
    set(target, key, value, receiver) {
        if (key === 'quantity' && (value < 1 || value > 100)) {
            this.reject(new Error("Quantity must be between 1 and 100"));
            return;
        }
        
        if (key === 'price' && value <= 0) {
            this.reject(new Error("Price must be positive"));
            return;
        }
        
        this.resolve(value);
    }
});

db.data.cart.$setCall({
    add(product, price, quantity = 1) {
        if (!this.data.items) this.data.items = {};
        
        this.data.items[product] = {
            price,
            quantity,
            added: new Date()
        };
        
        return `✅ ${quantity}x ${product} added`;
    },
    
    remove(product) {
        if (this.data.items && this.data.items[product]) {
            delete this.data.items[product];
            return `❌ ${product} removed`;
        }
        return "Product not found";
    },
    
    total() {
        let total = 0;
        for (const item of Object.values(this.data.items || {})) {
            total += item.price * item.quantity;
        }
        return total.toFixed(2);
    },
    
    applyDiscount(percentage) {
        if (percentage < 0 || percentage > 100) {
            throw new Error("Invalid percentage");
        }
        
        for (const [name, item] of Object.entries(this.data.items || {})) {
            item.originalPrice = item.price;
            item.price = item.price * (1 - percentage / 100);
        }
        
        return `${percentage}% discount applied`;
    }
});

// Using the cart
db.data.cart.add("Laptop", 999.99, 1);
db.data.cart.add("Mouse", 25.50, 2);
db.data.cart.add("Keyboard", 75.00, 1);

console.log(`Total: $${db.data.cart.total()}`);
db.data.cart.applyDiscount(10);
console.log(`Total with discount: $${db.data.cart.total()}`);

// Try to violate rules (will be rejected)
try {
    db.data.cart.items.Laptop.quantity = 200;  // Throws Error
} catch (e) {
    console.error(e.message);
}
```

## API Reference

* **`db.data`**: The root proxy object. All operations on this object are automatically persisted.
* **`db.open(...path)`**: Manually navigates to and returns a Proxy for a specific sub-node. This is useful for optimizing access in very deep structures without traversing the root.
* **`db.flush()`**: Returns a `Promise`. Resolves when all asynchronous I/O write buffers are empty and data is safely on disk.
* **`db.memory()`**: Returns an object containing detailed statistics about the memory consumption of internal subsystems (Maps, Nodes, Flows).
* **`db.shared`**: An object used to register global functions accessible from any data proxy.
* **`$setProxy(object)`**: Attach interceptors to the current node.
* **`$delProxy(key?)`**: Remove interceptors from the current node.
* **`$setCall(object)`**: Attach custom methods to the current node.
* **`$delCall(key?)`**: Remove custom methods from the current node.

---

**License:** MIT