// ./library/JunDB.js

import { JunDrive } from "./JunDrive.js";
import { JunCodec, JunType, JunShard } from "./JunShard.js";
import { JunHub } from "./core/JunHub.js";
import { JunMap } from "./core/JunMap.js";

/*new JunDB({
    depth: 2,
    folder: './data',
    memory: 20,
    maps: {
        threshold: 10,
        debounce: 5000
    },
    nodes: {
        threshold: 5,
        debounce: 3000
    }
})*/

export class JunDB {
    #options = null;
    constructor(options = {}) {
        if (options?.constructor?.name !== 'Object') {
            throw new Error('Invalid options');
        }

        this.#options = options;

        this.JunDrive = new JunDrive({
            memory: options.memory || 50,
            folder: options.folder || './data',
            atomic: options.atomic === undefined
                ? true : options.atomic
        });

        this.map = new JunMap(this.JunDrive, 'root.map.bin', {
            file: {
                limit: options.maps?.threshold || 10,
                delay: options.maps?.debounce || 5000
            }
        })

        this.nodes = new WeakMap();
        this.data = this.Proxy(this.map);
        this.shared = {}
    }

    memory() {
        return {
            maps: this.JunDrive.mapsRam.stats(),
            nodes: this.JunDrive.nodesRam.stats()
        }
    }

    prune() {
        return this.JunDrive.prune()
    }

    flush() {
        return this.JunDrive.flush()
    }

    go(...path) {
        if (!path.length) return;
        let a0 = this.map.data;

        path = path.filter((o) => {
            if (typeof o == 'string') return true;
            else if (o instanceof this.map.constructor) {
                a0 = o.data; return false;
            } else return false;
        });

        for (let i = 0; i < path.length; i++) {
            if (!a0[path[i]]) return false;
            const file = a0[path[i]];
            if (typeof file !== 'string') return false;
            if (!file.endsWith('.map.bin')) return false;
            a0 = this.JunDrive.readSync(file);
        }

        if (!a0) return false;
        if (!(a0?.$file)) return false;

        let limit = this.#options?.maps?.threshold || 10;
        let delay = this.#options?.maps?.debounce || 5000;

        const mapInstance = new this.map
            .constructor(this.JunDrive, a0.$file,
                { file: { limit: limit, delay: delay } });

        return this.Proxy(mapInstance)
    }

    Proxy(map) {
        if (!map?.data) return;
        const a0 = map.data;
        if (this.nodes.has(a0)) {
            const node = this.nodes.get(a0)
            if (node?.proxy) return node.proxy
        }

        this.nodes.set(a0, {
            proxy: null,
            nodeFunctions: {},
            proxyMethods: {}
        })

        const node = this.nodes.get(a0);

        const Jun = this
        const hub = new JunHub(this.JunDrive, map, {
            shard: { depth: this.#options?.depth || 2 },
            file: {
                limit: this.#options?.nodes?.threshold || 10,
                delay: this.#options?.nodes?.debounce || 5000
            }
        });


        ////////////////////////////

        const go = (...args) => {
            const _map = this.go(...args, map);
            if (_map && _map.$file) return this.Proxy(_map)
        }

        const InterceptMap = {
            get: '$proxyMethodGet',
            set: '$proxyMethodSet',
            delete: '$proxyMethodDelete'
        }

        const proxyMethods = (method) => (o = {}) => {
            const getMethod = hub.get(InterceptMap[method]);

            if (JunCodec.is(getMethod)) {
                const { receiver, key, value, target } = o;
                node.proxyMethods[method] ||= new Function(
                    `return ${JunCodec.decode(getMethod)[2]}`)();
                let control = { end: false, value: null, error: null };

                node.proxyMethods[method].apply({
                    resolve: (value) => { control.end = true; control.value = value },
                    reject: (error) => { control.end = true; control.error = error },
                    go: (...args) => go(...args), data: receiver, hub: hub, ...o
                }, [target, key, value ?? receiver, receiver])
                return control;
            }
        }

        const proxy = new Proxy({}, {
            get(target, key, receiver) {
                if (typeof key === 'symbol') return Reflect.get(target, key);

                /* if (key === '$file') return {
                     files: () => { },
 
                     read: () => { },
                     write: (data) => { },
                     remove: () => { },
 
                     writeStream: (data) => { },
                     readStream: () => { },
                 }*/

                if (key === '$proxy') return {
                    define: (a0, a1) => {
                        if (JunShard.isObject(a0)) {
                            const typeKeys = Object
                                .keys(InterceptMap);

                            for (const key in a0) {
                                if (!typeKeys.includes(key)) continue
                                if (typeof a0[key] !== 'function') continue;
                                node.proxyMethods[key] = a0[key];
                                hub.set(InterceptMap[key], a0[key])
                            }
                        } else if (a0 && (typeof a1 === 'function')) {
                            if (!InterceptMap[a0]) return false;
                            node.proxyMethods[a0] = a1;
                            hub.set(InterceptMap[a0], a1)
                        } else return false;
                    },
                    remove: (key) => {
                        if (typeof key == 'string') {
                            if (!InterceptMap[key]) return false;
                            delete node.proxyMethods[key]
                            hub.delete(InterceptMap[key])
                            return true;
                        } else if (key === undefined) {
                            for (const key in InterceptMap) {
                                if (!InterceptMap[key]) continue
                                hub.delete(InterceptMap[key])
                                delete node.proxyMethods[key]
                            }
                            return true;
                        }
                    }
                }

                const a0 = proxyMethods('get')({ target, key, receiver })
                if (a0?.end && a0?.error) throw a0.error;
                if (a0?.end) return a0.value;

                const value = hub.get(key);
                if (!JunCodec.is(value)) return value;

                // FUNCTION
                if (value[1] === JunType.FUNCTION) {
                    node.nodeFunctions[key] ||= (new Function(
                        `return ${JunCodec.decode(value)?.[2]}`)())
                    return (...args) => node.nodeFunctions[key].apply({
                        data: receiver, hub: hub, go: (...args) =>
                            go(...args), ...{ target, key }
                    }, args)
                }

                // NODE
                else if (value[1] === JunType.NODE) {
                    const data = JunCodec.decode(value);
                    const node = new JunMap(
                        Jun.JunDrive, data[2]);
                    return Jun.Proxy(node);
                } else return value;

            },
            set(target, key, value, receiver) {
                const a0 = proxyMethods('set')(
                    { target, key, value, receiver })
                if (a0?.end && a0?.error) throw a0.error;
                value = (a0?.end) ? a0.value : value;

                if ((Object.values(
                    InterceptMap).includes(key))
                    && typeof value === 'function') {
                    node.proxyMethods[key] = value;
                } else if (typeof value === 'function') {
                    node.nodeFunctions[key] = value;
                }

                hub.set(key, value);
                return true;
            },
            deleteProperty(target, key) {
                const a0 = proxyMethods('delete')({ target, key })
                if (a0?.end && a0?.error) throw a0.error;
                if (a0?.end) return a0.value;

                if (node.proxyMethods?.[key]) {
                    delete node.proxyMethods[key]
                } else if (node.nodeFunctions?.[key]) {
                    delete node.nodeFunctions[key]
                }

                hub.delete(key);
                return true;
            },
            ownKeys(target) {
                return hub.keys();
            },
            getOwnPropertyDescriptor(_, key) {
                return {
                    enumerable: true,
                    configurable: true,
                    value: hub.get(key)
                };
            }
        })

        node.proxy = proxy
        return proxy;
    }
}