// ./library/JunDB.js

import { JunIO } from "./JunIO.js";
import { Index, Root } from "./JunIR.js";

export class JunDB {
    constructor(o = {
        folder: './data',
        memoryLimit: 20
    }) {
        if (o?.constructor?.name !== 'Object') {
            return new Error('Invalid options');
        }

        this.JunIO = new JunIO({
            folder: './data',
            memoryLimit: 20,
            ...o
        });

        this.index = new Index(this.JunIO);
        this.proxies = new WeakMap();
    }

    get data() {
        return this.Proxy()
    }

    Proxy(index) {
        const Jun = this
        if (!index) index = this.index.data;
        if (this.proxies.has(index))
            return this.proxies.get(index);

        const root = new Root(this.JunIO, index);
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
                return Reflect.ownKeys(target);
            },
            getOwnPropertyDescriptor(target, key) {
                return {
                    enumerable: true,
                    configurable: true
                };
            }
        })

        this.proxies.set(
            index, proxy);
        return proxy;
    }
}