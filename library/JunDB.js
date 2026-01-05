// ./library/JunDB.js

import { JunIO } from "./JunIO.js";
import { Index, Root } from "./JunIR.js";

export class JunDB {
    constructor(options = {}) {
        if (options?.constructor?.name !== 'Object') {
            return new Error('Invalid options');
        }

        this.JunIO = new JunIO({
            folder: options.folder || './data',
            memoryLimit: options.memoryLimit || 20,
        });

        this.index = new Index(this.JunIO, {
            limit: options.saveLimit || 10,
            delay: options.saveDelay || 5000
        });

        this.depth = options.depth || 2;
        this.proxies = new WeakMap();

        this.memory = () => this.JunIO.RAM.stats()
        this.flush = () => this.JunIO.flush()
    }

    get data() {
        return this.Proxy()
    }

    Proxy(index) {
        const Jun = this
        if (!index) index = this.index.data;
        if (this.proxies.has(index))
            return this.proxies.get(index);

        const root = new Root(this.JunIO,
            index, this.depth);

        const proxy = new Proxy({}, {
            get(target, key) {
                if (typeof key === 'symbol')
                    return Reflect.get(target, key);
                if (key === 'toJSON')
                    return () => root.data;

                const rootGet = root.get(key);

                if (rootGet?.constructor?.name === 'Object') {
                    return Jun.Proxy(index[key]);
                } else {
                    return rootGet;
                }
            },
            set(target, key, value) {
                root.set(key, value);
                Jun.index.save();
                return true;
            },
            deleteProperty(target, key) {
                root.delete(key);
                Jun.index.save();
                return true;
            },
            ownKeys(target) {
                return root.keys();
            },

            getOwnPropertyDescriptor(_, key) {
                return {
                    enumerable: true,
                    configurable: true,
                    value: root.get(key)
                };
            }
        })

        this.proxies.set(
            index, proxy);
        return proxy;
    }
}